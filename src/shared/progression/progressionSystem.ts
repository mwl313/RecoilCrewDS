import type { MatchRules } from '../rules/matchRules';
import type { SystemContext } from '../sim/systems/systemContext';
import type { EnemyState, MatchState } from '../types';
import type { ProgressionRewardEvent, ProgressionSelectionState, ProgressionXpSource, RelicRewardOffer, RelicRollResult, TreasureChestSource, TreasureChestState, UpgradeCard } from './progressionTypes';
import type { SelectionRole } from './upgradeSelectionController';
import { ProgressionRng } from './progressionRng';
import { TeamExperienceSystem } from './teamExperienceSystem';
import { TreasureChestSystem } from './treasureChestSystem';
import { RelicInventory } from './relicInventory';
import { RelicStatProjector, type RelicDamageModifiers } from './relicStatProjector';
import { RelicEffectRegistry, createRelicEffectRegistry, type RelicTriggerEvent } from './relicEffectRegistry';
import { UpgradeSelectionController } from './upgradeSelectionController';
import { generateUpgradeOffer } from './upgradeOfferGenerator';
import { applyUpgradeCard } from './upgradeEffectApplier';
import { createProgressionTelemetry, type ProgressionTelemetry } from './progressionTelemetry';
import type { DamageSource } from '../damage/damageTypes';
import { hash32 } from '../mapgen/seed';
import type { LevelCurveDefinition, ProgressionDefinition } from '../content/schemas/progression';
import type { RelicChestSpawnPolicyDefinition } from '../content/schemas/progression';
import { RelicChestSpawnDirector } from './relicChestSpawnDirector';
import { resolveRelicEffectParameters } from './relicEffectParameters';
import { isCannonSelfDamage, isGunnerWeaponDamage } from '../damage/damageTypes';
import { isWaveLeader, normalizedEnemyClass } from '../enemies/enemyClassification';
import type { StageEvent } from '../stage/stageTypes';

export interface ProgressionDebugState {
  flow: string;
  stagePhase: string;
  team: {
    level: number;
    currentXp: number;
    xpForNextLevel: number;
    pendingLevelUps: number;
  };
  activeOfferId: string | null;
  driverReady: boolean;
  gunnerReady: boolean;
  timeoutMs: number;
  chestsOpened: number;
  relicStacks: Record<string, number>;
  damageModifiers: RelicDamageModifiers;
  roadkill: { capability: boolean; speed: number; maxSpeed: number; ratio: number; threshold: number; lastDamage: number };
  capabilitySources: Record<string, string[]>;
  movement: {
    grounded: boolean;
    extraJumpsRemaining: number;
    airDashReuseRemaining: number;
    dashState: string;
    phaseDashInvulnerable: boolean;
  };
  triggers: {
    phoenixConsumed: boolean;
    safeHavenLastWaveId: number | null;
    activeEnemyDebuffs: number;
    aerialMasterEligible: boolean;
  };
  lastRelicResult: { acquisitionSequence: number; relicId: string; duplicateConverted: boolean; replacementXp: number } | null;
}

/**
 * Authoritative progression orchestrator: team XP, queued level-ups,
 * deterministic offers, selection pause/timeout, treasure chests, relic
 * inventory/projection, triggers, and reward routing. Disabled (no-op) when
 * the match content pack has no progression definition.
 */
export class ProgressionSystem {
  readonly telemetry: ProgressionTelemetry = createProgressionTelemetry();
  readonly registry: RelicEffectRegistry = createRelicEffectRegistry();
  private readonly rng: ProgressionRng;
  private readonly teamXp: TeamExperienceSystem;
  private readonly chests: TreasureChestSystem;
  private readonly inventory: RelicInventory;
  private readonly projector: RelicStatProjector;
  private readonly selection: UpgradeSelectionController;
  private readonly chestPolicy: RelicChestSpawnPolicyDefinition | null;
  private readonly chestSpawnDirector: RelicChestSpawnDirector | null;
  private readonly worldChestSpawningEnabled: boolean;
  private enemyChestRandom: () => number;
  private periodicSpawnRemaining = 0;
  private mapChestsSpawned = 0;
  private terminalTelemetryCaptured = false;
  private readonly clearedWaveTriggerIds = new Set<number>();
  private readonly leaderChestRewardedWaveIds = new Set<number>();
  private lastSafeHavenWaveId: number | null = null;
  private lastRoadkill: { speed: number; maxSpeed: number; ratio: number; damage: number } = { speed: 0, maxSpeed: 0, ratio: 0, damage: 0 };

  constructor(private readonly ctx: SystemContext) {
    const s = ctx.state;
    const rules = ctx.rules;
    this.rng = new ProgressionRng(hash32('progression', s.matchId));
    this.enemyChestRandom = this.rng.stream('progression.enemyChestDrop');
    const curve = rules.levelCurveContent;
    const def = rules.progressionContent;
    const xpMult = () => {
      if (!rules.progressionEnabled) return 1;
      const policy = this.modePolicy();
      return (policy?.xpMultiplier ?? 1) * rules.resolver.resolve('progression.xpMultiplier');
    };
    this.teamXp = new TeamExperienceSystem(s, curve ?? emptyCurve(), xpMult, this.telemetry);
    this.chests = new TreasureChestSystem(
      () => s.teamProgression.treasureChestsOpened,
      () => {
        s.teamProgression.treasureChestsOpened++;
        this.telemetry.chestsPerStage++;
      },
    );
    this.inventory = new RelicInventory(s, def ?? emptyDefinition(), (capabilityId, sourceId) =>
      ctx.capabilities.grant(capabilityId, sourceId),
    );
    this.chestPolicy = rules.relicChestSpawnPolicy;
    this.worldChestSpawningEnabled =
      ctx.world.metadata !== null &&
      (rules.modeId === 'mode.mainStage' || rules.modeId === 'mode.singlePlayerMainStage');
    this.chestSpawnDirector = this.chestPolicy
      ? new RelicChestSpawnDirector(
          ctx.world,
          this.chestPolicy,
          this.rng.stream('progression.chestPlacement.initial'),
          this.rng.stream('progression.chestPlacement.periodic'),
          this.rng.stream('progression.chestPlacement.enemyDrop'),
          {
            attempt: () => this.telemetry.mapSpawnAttempts++,
            failure: () => this.telemetry.mapSpawnCandidateFailures++,
          },
        )
      : null;
    this.projector = new RelicStatProjector(rules, rules.relicsById, rules.relicEffectTemplatesById);
    const policy = this.modePolicy();
    this.selection = new UpgradeSelectionController(
      this.rng,
      this.telemetry,
      policy?.levelUpSelection === 'roleSeparated',
    );
    if (curve) s.teamProgression.xpForNextLevel = curve.thresholds[0] ?? 1;
    if (rules.progressionEnabled) {
      ctx.eventBus.subscribe('entity.killed', (payload) => this.onEntityKilled(payload as { enemy: { id: number; x: number; y: number; z: number }; source: DamageSource; weaponId?: string }));
      ctx.eventBus.subscribe('damage.applied', (payload) => this.onDamageApplied(payload as { targetId: number | string; targetKind: string; amount: number; source: DamageSource; weaponId?: string }));
      ctx.eventBus.subscribe('waveEvent', (payload) => this.onWaveEvent(payload as { type: string; waveId: number }));
      ctx.eventBus.subscribe('stageEvent', (payload) => this.onStageEvent(payload as StageEvent));
      if (this.worldChestSpawningEnabled) this.initializeMapChests();
    }
  }

  /** Deterministic reward-roll injection for focused tests only. */
  setEnemyChestRandomForTest(random: () => number): void {
    this.enemyChestRandom = random;
  }

  get isEnabled(): boolean {
    return this.ctx.rules.progressionEnabled;
  }

  private modePolicy() {
    const rules = this.ctx.rules;
    return this.ctx.sessionKind === 'singlePlayer'
      ? rules.singlePlayerProgressionPolicy
      : rules.multiplayerProgressionPolicy;
  }

  // ------------------------------------------------------------ XP / flow
  addXp(value: number, x?: number, y?: number, z?: number): void {
    this.grantXp(value, 'direct', x !== undefined && y !== undefined && z !== undefined ? { x, y, z } : undefined);
  }

  noteMissedShard(value: number): void {
    if (!this.isEnabled) return;
    this.telemetry.xpMissed += value;
  }

  /**
   * Authoritative internal XP grant. Every XP source (shards, leader/elite,
   * boss, and direct rewards) routes through here:
   * multiplier policy, team XP, telemetry, event emission, level-up
   * queueing, and a single serialized flow advance.
   */
  private grantXp(
    value: number,
    source: ProgressionXpSource,
    position?: { x: number; y: number; z: number },
  ): void {
    if (!this.isEnabled || value <= 0) return;
    const result = this.teamXp.addXp(value);
    this.ctx.eventBus.emit('progressionEvent', {
      type: 'xpCollected',
      value: result.gained,
      source,
      x: position?.x,
      y: position?.y,
      z: position?.z,
    });
    this.advanceProgressionFlow(Date.now());
  }

  tryStartLevelUp(nowMs: number): boolean {
    const s = this.ctx.state;
    if (!this.isEnabled || s.matchFlow !== 'playing' || s.phase !== 'running') return false;
    if (s.teamProgression.pendingLevelUps <= 0) return false;
    const policy = this.modePolicy();
    const rules = this.ctx.rules;
    const roleSeparated = policy?.levelUpSelection === 'roleSeparated';
    const categories = [...rules.upgradeCategories.values()];
    const ctx = {
      rarityRoll: this.rng.stream('progression.upgradeOffer'),
      valueRoll: this.rng.stream('progression.upgradeValue'),
      categoryRoll: this.rng.stream('progression.upgradeCategory'),
      isFirstOffer: s.teamProgression.levelUpOffersCompleted === 0,
      firstExperience: rules.upgradeFirstExperienceContent!,
      rarityTable: rules.upgradeRarityTableContent!,
      categories,
    };
    const driverOffer = generateUpgradeOffer({ ...ctx, role: 'driver' });
    const gunnerOffer = generateUpgradeOffer({ ...ctx, role: 'gunner' });
    const singleOffer = generateUpgradeOffer({ ...ctx, role: 'single' });
    const offerId = `offer-${s.teamProgression.levelUpOffersCompleted + 1}-${s.teamProgression.pendingLevelUps}`;
    s.teamProgression.activeSelection = {
      offerId,
      kind: 'upgrade',
      level: s.teamProgression.level,
      expiresAtWallMs: nowMs + (policy?.selectionTimeoutSeconds ?? 10) * 1000,
      offerStartedAtWallMs: nowMs,
      driverOffer: roleSeparated ? driverOffer : undefined,
      gunnerOffer: roleSeparated ? gunnerOffer : undefined,
      singlePlayerOffer: roleSeparated ? undefined : singleOffer,
      resolved: false,
    };
    s.matchFlow = 'upgradeSelection';
    this.ctx.eventBus.emit('progressionEvent', { type: 'upgradeOfferStarted', offerId });
    return true;
  }

  submitSelection(role: SelectionRole, offerId: string, cardIndex: number): { accepted: boolean; reason?: string } {
    const s = this.ctx.state;
    if (s.matchFlow === 'clear' || s.matchFlow === 'gameOver' || s.phase === 'results') {
      this.captureTerminalChestTelemetry();
      return { accepted: false, reason: 'terminal' };
    }
    const active = s.teamProgression.activeSelection;
    if (!active || active.kind !== 'upgrade' || s.matchFlow !== 'upgradeSelection') {
      return { accepted: false, reason: 'no_active_offer' };
    }
    const result = this.selection.submit(active, role, offerId, cardIndex);
    if (!result.accepted) return result;
    this.ctx.eventBus.emit('progressionEvent', { type: 'upgradeSelectionSubmitted', offerId, role, cardIndex });
    if (this.selection.isComplete(active)) this.resolveLevelUp();
    return result;
  }

  checkSelectionTimeout(nowMs: number): boolean {
    const s = this.ctx.state;
    if (!this.isEnabled) return false;
    if (s.matchFlow === 'clear' || s.matchFlow === 'gameOver' || s.phase === 'results') {
      this.captureTerminalChestTelemetry();
      // Terminal wins: cancel unshown presentation and queued reveals; a
      // stale selection must never resurrect play.
      s.teamProgression.activeSelection = null;
      s.teamProgression.pendingRelicResults = [];
      return false;
    }
    if (s.matchFlow === 'relicOpening') {
      const chest = s.chests
        .filter((candidate) => candidate.lifecycle === 'opening')
        .sort((a, b) => a.id - b.id)[0];
      if (!chest || nowMs < (chest.fullyOpenAtWallMs ?? Number.POSITIVE_INFINITY)) return false;
      return this.resolveChestOffer(chest, nowMs) !== null;
    }
    const active = s.teamProgression.activeSelection;
    if (!active || active.resolved) return false;
    if (active.kind === 'upgrade') {
      const auto = this.selection.autoPick(active, nowMs);
      if (auto.length === 0) return false;
      if (this.selection.isComplete(active)) this.resolveLevelUp();
      return true;
    }
    if (active.kind === 'relic') {
      // Relic reveal has no normal deadline. It resolves only through the
      // explicit connected-player acknowledgement gate or terminal cleanup.
      return false;
    }
    return false;
  }

  private resolveLevelUp(): void {
    const s = this.ctx.state;
    const active = s.teamProgression.activeSelection!;
    active.resolved = true;
    const roleSeparated = this.modePolicy()?.levelUpSelection === 'roleSeparated';
    const cards: UpgradeCard[] = [];
    if (roleSeparated) {
      const driver = this.selection.selectedCard(active, 'driver');
      const gunner = this.selection.selectedCard(active, 'gunner');
      if (driver) cards.push(driver);
      if (gunner) cards.push(gunner);
    } else {
      const single = this.selection.selectedCard(active, 'single');
      if (single) cards.push(single);
    }
    for (const card of cards) {
      applyUpgradeCard(
        this.ctx.rules,
        active.offerId,
        card,
        this.telemetry,
        s.teamProgression.levelUpgradeSummary,
      );
    }
    s.teamProgression.levelUpOffersCompleted++;
    s.teamProgression.activeSelection = null;
    this.teamXp.consumeLevelUp();
    this.ctx.eventBus.emit('progressionEvent', { type: 'upgradeOfferResolved', offerId: active.offerId });
    this.advanceProgressionFlow(Date.now());
  }

  /**
   * One central serialized flow advance. Priority: terminal → active relic
   * reveal → active upgrade selection → queued relic reveal → queued
   * level-up → playing. No two reward flows can overwrite each other.
   */
  private advanceProgressionFlow(nowMs: number): void {
    const s = this.ctx.state;
    if (!this.isEnabled) return;
    if (s.matchFlow === 'clear' || s.matchFlow === 'gameOver' || s.phase === 'results') {
      s.teamProgression.activeSelection = null;
      s.teamProgression.pendingRelicResults = [];
      return;
    }
    const active = s.teamProgression.activeSelection;
    if (active && !active.resolved) return;
    s.teamProgression.activeSelection = null;
    s.matchFlow = 'playing';
    if (s.teamProgression.pendingRelicResults.length > 0) {
      const next = s.teamProgression.pendingRelicResults.shift()!;
      this.beginRelicReveal(next, nowMs, undefined, undefined);
      return;
    }
    if (s.teamProgression.pendingLevelUps > 0) {
      this.tryStartLevelUp(nowMs);
    }
  }

  // ------------------------------------------------------ chest director
  private initializeMapChests(): void {
    if (!this.chestPolicy || !this.chestSpawnDirector) return;
    const spawn = this.ctx.world.spawnPoints[0] ?? { x: this.ctx.state.tank.x, z: this.ctx.state.tank.z };
    const placements = this.chestSpawnDirector.initialPlacements(spawn);
    for (const placement of placements) {
      this.createChest('mapStart', placement.x, placement.z, placement.y - 0.4);
      this.telemetry.initialMapChestsSpawned++;
    }
    this.mapChestsSpawned = placements.length;
    this.periodicSpawnRemaining = this.nextPeriodicDelay();
    this.updateActiveChestPeak();
  }

  /** Active-simulation chest lifecycle. Paused frames never call this. */
  step(dt: number): void {
    if (!this.isEnabled || !this.chestPolicy || dt <= 0) return;
    const s = this.ctx.state;
    this.registry.prune(s.time);
    if (s.matchFlow === 'clear' || s.matchFlow === 'gameOver' || s.phase === 'results') {
      this.captureTerminalChestTelemetry();
      return;
    }

    for (const chest of s.chests) {
      if (chest.lifecycle === 'spawning' && s.time >= chest.claimableAtGameTime) {
        chest.lifecycle = 'closed';
      } else if (
        chest.lifecycle === 'open' &&
        chest.fullyOpenStartedAtGameTime !== undefined &&
        s.time - chest.fullyOpenStartedAtGameTime >= this.chestPolicy.minimumFullyOpenLifetimeSeconds
      ) {
        chest.lifecycle = 'despawning';
        chest.despawnStartedAtGameTime = s.time;
      }
    }

    s.chests = s.chests.filter((chest) => {
      if (chest.lifecycle !== 'despawning' || chest.despawnStartedAtGameTime === undefined) return true;
      return s.time - chest.despawnStartedAtGameTime < this.chestPolicy!.despawnAnimationSeconds;
    });

    if (s.matchFlow !== 'playing') return;
    if (this.worldChestSpawningEnabled) this.stepPeriodicSpawning(dt);
    const claimable = s.chests
      .filter((chest) => chest.lifecycle === 'closed')
      .map((chest) => ({ chest, distance: Math.hypot(chest.x - s.tank.x, chest.z - s.tank.z) }))
      .filter((candidate) => candidate.distance <= this.chestPolicy!.claimRadius)
      .sort((a, b) => a.distance - b.distance || a.chest.id - b.chest.id);
    if (claimable[0]) this.claimChest(claimable[0].chest, Date.now());
    this.updateActiveChestPeak();
  }

  private stepPeriodicSpawning(dt: number): void {
    if (!this.chestPolicy?.periodic.enabled || !this.chestSpawnDirector) return;
    this.periodicSpawnRemaining -= dt;
    if (this.periodicSpawnRemaining > 0) return;
    const s = this.ctx.state;
    const activeMapChests = s.chests.filter((chest) => chest.source === 'mapStart' || chest.source === 'mapPeriodic').length;
    if (
      activeMapChests >= this.chestPolicy.periodic.maximumActiveMapChests ||
      this.mapChestsSpawned >= this.chestPolicy.periodic.maximumMapChestsSpawnedPerMatch
    ) {
      this.periodicSpawnRemaining = 1;
      return;
    }
    const placement = this.chestSpawnDirector.periodicPlacement(s.tank, s.chests);
    if (!placement) {
      this.periodicSpawnRemaining = 1;
      return;
    }
    this.createChest('mapPeriodic', placement.x, placement.z, placement.y - 0.4);
    this.mapChestsSpawned++;
    this.telemetry.periodicMapChestsSpawned++;
    this.periodicSpawnRemaining = this.nextPeriodicDelay();
  }

  private nextPeriodicDelay(): number {
    if (!this.chestPolicy) return Number.POSITIVE_INFINITY;
    const periodic = this.chestPolicy.periodic;
    return periodic.intervalSeconds + (this.rng.stream('progression.chestPeriodicTiming')() * 2 - 1) * periodic.intervalJitterSeconds;
  }

  private updateActiveChestPeak(): void {
    this.telemetry.activeChestPeak = Math.max(this.telemetry.activeChestPeak, this.ctx.state.chests.length);
  }

  private captureTerminalChestTelemetry(): void {
    if (this.terminalTelemetryCaptured) return;
    this.terminalTelemetryCaptured = true;
    this.telemetry.unopenedChestsAtEnd = this.ctx.state.chests.filter((chest) => !chest.rewardResolved).length;
  }

  // ------------------------------------------------------------- chests
  spawnChest(source: TreasureChestSource | 'map', x: number, z: number): TreasureChestState {
    const normalizedSource: TreasureChestSource = source === 'map' ? 'mapStart' : source;
    if (!this.isEnabled) {
      // Disabled modes never register an active progression chest; the
      // detached object lets callers keep their API shape safely.
      return this.chests.makeChest(this.ctx.state.nextChestId++, normalizedSource, x, z, this.ctx.world.groundHeightAt(x, z));
    }
    return this.createChest(normalizedSource, x, z, this.ctx.world.groundHeightAt(x, z));
  }

  private createChest(source: TreasureChestSource, x: number, z: number, groundY: number): TreasureChestState {
    const s = this.ctx.state;
    const chest = this.chests.makeChest(
      s.nextChestId++,
      source,
      x,
      z,
      groundY,
      s.time,
      this.chestPolicy?.spawnAnimationSeconds ?? 0,
    );
    s.chests.push(chest);
    this.updateActiveChestPeak();
    return chest;
  }

  openChest(chestId: number, nowMs: number): RelicRewardOffer | null {
    const s = this.ctx.state;
    if (!this.isEnabled) return null;
    const chest = s.chests.find((candidate) => candidate.id === chestId && candidate.lifecycle === 'closed');
    if (!chest || s.matchFlow !== 'playing') return null;
    if (s.teamProgression.activeSelection && !s.teamProgression.activeSelection.resolved) return null;
    return this.claimChest(chest, nowMs);
  }

  private claimChest(chest: TreasureChestState, nowMs: number): RelicRewardOffer | null {
    const s = this.ctx.state;
    if (chest.lifecycle !== 'closed' || chest.rewardOffer || chest.rewardResolved) return null;

    const isFirstChest = s.teamProgression.treasureChestsOpened === 0;
    const rarity = this.chests.rollRarityFor(
      isFirstChest,
      this.rng.stream('progression.relicRarity'),
      this.ctx.rules.firstTreasureContent!,
      this.ctx.rules.treasureRarityTableContent!,
    );
    const pool = this.ctx.rules.relicPoolIds
      .map((id) => this.ctx.rules.relicsById.get(id))
      .filter((r): r is NonNullable<typeof r> => r !== undefined);
    const eligible = pool.filter((relic) => relic.stackPolicy !== 'unique' || !this.inventory.has(relic.id));
    const candidates = eligible.filter((relic) => relic.rarity === rarity);
    // Deterministic rarity fallback: preserve the rolled rarity whenever it
    // has an eligible candidate, otherwise draw only from remaining eligible
    // content in canonical pool order. Owned uniques never re-enter.
    const pickPool = candidates.length > 0 ? candidates : eligible;
    if (pickPool.length === 0) return null;
    const relic = pickPool[Math.floor(this.rng.stream('progression.relicSelection')() * pickPool.length)];
    const offer: RelicRewardOffer = {
      offerId: `relic-offer-${s.matchId}-${chest.id}`,
      chestId: chest.id,
      candidates: [{ relicId: relic.id, rarity }],
      selectionMode: 'automaticSingle',
      selectedIndex: 0,
      resolved: false,
    };
    chest.rewardOffer = offer;
    chest.rewardOfferId = offer.offerId;
    chest.lifecycle = 'opening';
    chest.openingStartedAtWallMs = nowMs;
    chest.fullyOpenAtWallMs = nowMs + (this.chestPolicy?.openAnimationSeconds ?? 0.65) * 1000;
    s.matchFlow = 'relicOpening';
    this.telemetry.chestsClaimed++;
    if (this.telemetry.timeToFirstChestClaim === null) this.telemetry.timeToFirstChestClaim = s.time;
    return offer;
  }

  private resolveChestOffer(chest: TreasureChestState, nowMs: number): RelicRollResult | null {
    const s = this.ctx.state;
    const offer = chest.rewardOffer;
    if (!offer || offer.resolved || chest.rewardResolved) return null;
    const selectedIndex = offer.selectedIndex ?? 0;
    const candidate = offer.candidates[selectedIndex];
    if (!candidate) return null;
    const relic = this.ctx.rules.relicsById.get(candidate.relicId);
    if (!relic) return null;

    offer.selectedIndex = selectedIndex;
    offer.resolved = true;
    chest.rewardResolved = true;
    this.chests.open(chest);
    const acquisitionSequence = ++s.teamProgression.relicAcquisitionSequence;
    const acquire = this.inventory.add(relic);
    const roll: RelicRollResult = {
      acquisitionSequence,
      relicId: relic.id,
      rarity: candidate.rarity,
      duplicateConverted: acquire.duplicateConverted,
      replacementXp: acquire.replacementXp,
      stackCountAfter: acquire.stackCount,
    };
    s.teamProgression.lastRelicResult = roll;
    this.telemetry.relicsAcquired++;
    this.telemetry.rarityDistribution[candidate.rarity] = (this.telemetry.rarityDistribution[candidate.rarity] ?? 0) + 1;
    this.telemetry.relicDistribution[relic.id] = (this.telemetry.relicDistribution[relic.id] ?? 0) + 1;
    this.projector.reproject(s.teamProgression);
    if (acquire.capabilityGranted) {
      this.ctx.eventBus.emit('progressionEvent', { type: 'progressionCapabilityChanged', capabilityId: relic.capabilityId });
    }
    this.ctx.eventBus.emit('progressionEvent', { type: 'relicAcquired', relicId: relic.id, rarity: candidate.rarity, duplicateConverted: acquire.duplicateConverted });
    this.beginRelicReveal(roll, nowMs, chest, offer);
    return roll;
  }

  /** Start the authoritative shared relic reveal (result is already fixed). */
  private beginRelicReveal(
    result: RelicRollResult,
    nowMs: number,
    chest?: TreasureChestState,
    offer?: RelicRewardOffer,
  ): void {
    const s = this.ctx.state;
    if (chest) chest.lifecycle = 'revealing';
    s.teamProgression.activeSelection = {
      offerId: `reveal-${result.acquisitionSequence}`,
      kind: 'relic',
      level: s.teamProgression.level,
      revealStartedAtWallMs: nowMs,
      continueAllowedAtWallMs: nowMs + (this.chestPolicy?.relicRevealMinimumSkipSeconds ?? 0.35) * 1000,
      singlePlayerRelicAcknowledged: false,
      driverRelicAcknowledged: false,
      gunnerRelicAcknowledged: false,
      chestId: chest?.id,
      relicOffer: offer,
      relicResult: result,
      resolved: false,
      applied: true,
    };
    s.matchFlow = 'relicSelection';
    this.ctx.eventBus.emit('progressionEvent', {
      type: 'relicRevealStarted',
      acquisitionSequence: result.acquisitionSequence,
      relicId: result.relicId,
    });
  }

  /** Idempotent acknowledgement of the predetermined active relic result. */
  acknowledgeProgressionRelic(
    role: SelectionRole,
    acquisitionSequence: number,
    requiredRoles: SelectionRole[],
    nowMs: number,
  ): { accepted: boolean; reason?: string; waitingFor?: SelectionRole[] } {
    if (!this.isEnabled) return { accepted: false, reason: 'disabled' };
    const active = this.ctx.state.teamProgression.activeSelection;
    if (!active || active.kind !== 'relic') return { accepted: false, reason: 'no_active_reveal' };
    if (active.resolved) return { accepted: false, reason: 'already_resolved' };
    if (active.relicResult?.acquisitionSequence !== acquisitionSequence) {
      return { accepted: false, reason: 'sequence_mismatch' };
    }
    if (nowMs < (active.continueAllowedAtWallMs ?? 0)) {
      return { accepted: false, reason: 'minimum_delay' };
    }
    setRelicAcknowledged(active, role);
    const required = [...new Set(requiredRoles)];
    const waitingFor = required.filter((requiredRole) => !isRelicAcknowledged(active, requiredRole));
    if (waitingFor.length > 0) return { accepted: true, waitingFor };
    return this.resolveRelicReveal(nowMs) ? { accepted: true } : { accepted: false, reason: 'terminal' };
  }

  refreshRelicAcknowledgementGate(requiredRoles: SelectionRole[], nowMs: number): boolean {
    const active = this.ctx.state.teamProgression.activeSelection;
    if (!active || active.kind !== 'relic' || active.resolved) return false;
    const required = [...new Set(requiredRoles)];
    if (required.length === 0 || required.some((role) => !isRelicAcknowledged(active, role))) return false;
    return this.resolveRelicReveal(nowMs);
  }

  /** Backwards-compatible Single Player/test facade. */
  skipProgressionRelic(acquisitionSequence: number, nowMs: number): { accepted: boolean; reason?: string } {
    return this.acknowledgeProgressionRelic('single', acquisitionSequence, ['single'], nowMs);
  }

  private resolveRelicReveal(nowMs: number): boolean {
    const s = this.ctx.state;
    const active = s.teamProgression.activeSelection;
    if (!active || active.kind !== 'relic' || active.resolved) return false;
    if (s.matchFlow === 'clear' || s.matchFlow === 'gameOver' || s.phase === 'results') {
      s.teamProgression.activeSelection = null;
      s.teamProgression.pendingRelicResults = [];
      return false;
    }
    active.resolved = true;
    const chest = active.chestId === undefined ? undefined : s.chests.find((candidate) => candidate.id === active.chestId);
    if (chest && (chest.lifecycle === 'revealing' || chest.lifecycle === 'opening')) {
      chest.lifecycle = 'open';
      chest.fullyOpenStartedAtGameTime = s.time;
    }
    this.ctx.eventBus.emit('progressionEvent', {
      type: 'relicRevealResolved',
      acquisitionSequence: active.relicResult?.acquisitionSequence,
      relicId: active.relicResult?.relicId,
    });
    this.advanceProgressionFlow(nowMs);
    return true;
  }

  // ---------------------------------------------------------- rewards
  private onEntityKilled(payload: { enemy: { id: number; x: number; y: number; z: number }; source: DamageSource; weaponId?: string }): void {
    if (!this.isEnabled) return;
    const s = this.ctx.state;
    const enemy = s.enemies.find((e) => e.id === payload.enemy.id);
    if (!enemy || enemy.rewardResolved || enemy.monster?.chestRewardResolved) return;
    enemy.rewardResolved = true;
    const monster = enemy?.monster;
    if (monster) monster.chestRewardResolved = true;
    const ownership = enemy.ownership;
    const rewardClass = normalizedEnemyClass(enemy);
    const isBoss = rewardClass === 'boss';
    const isLeader = !isBoss && isWaveLeader(enemy);

    if (monster) {
      if (!monster.xpAwarded) {
        monster.xpAwarded = true;
        const rewardsDef = this.ctx.rules.enemyXpRewards.get('enemyXpRewards.mainStage');
        const range = rewardsDef?.visualShardCounts[rewardClass] ?? [1, 1];
        const count = range[0] + (enemy!.id % (range[1] - range[0] + 1));
        this.spawnXpBundle(monster.resolvedRewardXp, count, payload.enemy.x, payload.enemy.z);
      }
    } else {
      const def = this.ctx.rules.progressionContent!;
      const xp = def.enemyXpRewards[rewardClass] ?? def.enemyXpRewards.ambient;
      if (isLeader) {
        this.grantXp(def.enemyXpRewards.elite, 'waveLeader', payload.enemy);
      } else if (isBoss) {
        this.grantXp(def.enemyXpRewards.boss, 'boss', payload.enemy);
      } else {
        this.spawnXpShard(xp, payload.enemy.x, payload.enemy.z);
      }
    }

    if (isLeader && this.chestPolicy?.enemyDropRates.leaderGuaranteed) {
      const waveId = ownership?.waveId ?? -payload.enemy.id;
      const runtime = waveId >= 0 ? this.ctx.waves.waves.get(waveId) : undefined;
      const finalLeader = !runtime || runtime.state === 'complete';
      if (finalLeader && !this.leaderChestRewardedWaveIds.has(waveId)) {
        if (this.spawnRewardChest('waveClear', payload.enemy.x, payload.enemy.z, true)) {
          this.leaderChestRewardedWaveIds.add(waveId);
          this.telemetry.leaderChestsSpawned++;
        }
      }
      this.ctx.eventBus.emit('progressionEvent', {
        type: 'reward',
        payload: { kind: 'waveLeaderKilled', waveId: ownership?.waveId ?? undefined, leaderEnemyId: payload.enemy.id } satisfies ProgressionRewardEvent,
      });
    } else if (isBoss) {
      this.resolveRandomEnemyChest(rewardClass, payload.enemy.x, payload.enemy.z);
      this.ctx.eventBus.emit('progressionEvent', {
        type: 'reward',
        payload: { kind: 'bossKilled', bossEnemyId: payload.enemy.id } satisfies ProgressionRewardEvent,
      });
    } else {
      this.resolveRandomEnemyChest(rewardClass, payload.enemy.x, payload.enemy.z);
      this.ctx.eventBus.emit('progressionEvent', {
        type: 'reward',
        payload: {
          kind: 'enemyKilled',
          enemyId: payload.enemy.id,
          enemyDefinitionId: enemy?.defId,
          populationClass: rewardClass === 'elite' ? 'special' : rewardClass,
          waveId: ownership?.waveId ?? undefined,
          damageSource: payload.source,
        } satisfies ProgressionRewardEvent,
      });
    }
    this.dispatchTrigger({ type: 'enemyKilled', enemyId: payload.enemy.id, source: payload.source, weaponId: payload.weaponId });
    this.registry.removeEnemy(payload.enemy.id);
  }

  private resolveRandomEnemyChest(rewardClass: 'ambient' | 'wave' | 'elite' | 'boss', x: number, z: number): void {
    const rates = this.chestPolicy?.enemyDropRates;
    if (!rates) return;
    this.telemetry.enemyChestRollsByClass[rewardClass] = (this.telemetry.enemyChestRollsByClass[rewardClass] ?? 0) + 1;
    if (this.enemyChestRandom() >= rates[rewardClass]) return;
    if (!this.spawnRewardChest('enemyDrop', x, z)) return;
    this.telemetry.enemyChestDropsByClass[rewardClass] = (this.telemetry.enemyChestDropsByClass[rewardClass] ?? 0) + 1;
    this.telemetry.enemyDropChestsSpawned++;
  }

  private spawnRewardChest(source: 'enemyDrop' | 'waveClear', x: number, z: number, guaranteed = false): TreasureChestState | null {
    const placement = this.chestSpawnDirector?.enemyDropPlacement({ x, z }, this.ctx.state.chests, guaranteed);
    if (!placement) return null;
    return this.createChest(source, placement.x, placement.z, placement.y - 0.4);
  }

  private spawnXpShard(value: number, x: number, z: number): void {
    if (!this.isEnabled) return;
    const def = this.ctx.rules.progressionContent;
    if (!def || value <= 0) return;
    this.ctx.xpShards.spawn(Math.max(1, Math.round(value)), x, z);
  }

  /** Deterministic value-preserving visual bundle for monster kills. */
  private spawnXpBundle(value: number, count: number, x: number, z: number): void {
    if (!this.isEnabled || value <= 0 || count <= 0) return;
    const base = Math.floor(value / count);
    const remainder = value % count;
    for (let i = 0; i < count; i++) {
      const shardValue = base + (i < remainder ? 1 : 0);
      if (shardValue <= 0) continue;
      this.ctx.xpShards.spawn(shardValue, x + (i - (count - 1) / 2) * 0.8, z);
    }
  }

  private onDamageApplied(payload: { targetId: number | string; targetKind: string; amount: number; source: DamageSource; weaponId?: string }): void {
    if (!this.isEnabled) return;
    this.dispatchTrigger({
      type: 'damageApplied',
      targetId: payload.targetId,
      targetKind: payload.targetKind,
      amount: payload.amount,
      source: payload.source,
      weaponId: payload.weaponId,
    });
  }

  private onWaveEvent(payload: { type: string; waveId: number }): void {
    if (!this.isEnabled) return;
    // Purge is cleanup, not a semantic wave-clear relic trigger.
    void payload;
  }

  private onStageEvent(payload: StageEvent): void {
    if (!this.isEnabled || payload.type !== 'waveCleared' || payload.waveId === undefined) return;
    this.dispatchWaveCleared(payload.waveId);
  }

  private dispatchWaveCleared(waveId: number): void {
    if (this.clearedWaveTriggerIds.has(waveId)) return;
    this.clearedWaveTriggerIds.add(waveId);
    if (this.inventory.has('relic.safe_haven')) this.lastSafeHavenWaveId = waveId;
    this.dispatchTrigger({ type: 'waveCleared', waveId });
  }

  // ---------------------------------------------------------- triggers
  private dispatchTrigger(event: RelicTriggerEvent): void {
    if (!this.isEnabled) return;
    const s = this.ctx.state;
    for (const [relicId, stacks] of Object.entries(s.teamProgression.relicStacks)) {
      if (stacks <= 0) continue;
      const relic = this.ctx.rules.relicsById.get(relicId);
      if (!relic) continue;
      for (const effect of relic.effects) {
        const template = this.ctx.rules.relicEffectTemplatesById.get(effect.templateId);
        if (!template) continue;
        const handler = this.registry.resolve(template.effectType);
        if (!handler) continue;
        handler.handle(event, this.ctx, relic, stacks, resolveRelicEffectParameters(template, effect), this.telemetry);
      }
    }
  }

  notifyCannonFired(): void {
    if (!this.isEnabled) return;
    this.dispatchTrigger({ type: 'cannonFired' });
  }

  notifyDash(): void {
    if (!this.isEnabled) return;
  }

  notifyDashHit(enemyId: number): void {
    if (!this.isEnabled) return;
    this.dispatchTrigger({ type: 'dashHit', enemyId });
  }

  notifyLanded(): void {
    if (!this.isEnabled) return;
    this.dispatchTrigger({ type: 'landed' });
  }

  notifyAirborneTick(dt: number, grounded: boolean): void {
    if (!this.isEnabled) return;
    if (!grounded) this.dispatchTrigger({ type: 'airborneTick', dt });
  }

  notifyWipeout(): void {
    if (!this.isEnabled) return;
    this.dispatchTrigger({ type: 'wipeout' });
  }

  notifyWaveCleared(waveId: number): void {
    if (!this.isEnabled) return;
    this.dispatchWaveCleared(waveId);
  }

  notifyCannonHit(enemyId: number): void {
    if (!this.isEnabled) return;
    this.dispatchTrigger({ type: 'cannonHit', enemyId });
  }

  // ------------------------------------------------------------ damage
  modifyEnemyDamage(amount: number, source: DamageSource, ctx2: { enemy: EnemyState; weaponId?: string }): number {
    if (!this.isEnabled) return amount;
    const m = this.projector.reproject(this.ctx.state.teamProgression);
    let multiplier = 1 + m.outgoingPercent / 100;
    if (!this.ctx.state.tank.grounded && isGunnerWeaponDamage(source)) {
      multiplier *= 1 + m.airbornePercent / 100;
    }
    const cls = normalizedEnemyClass(ctx2.enemy);
    const isEliteOrBoss = cls === 'elite' || cls === 'boss' || isWaveLeader(ctx2.enemy);
    if (isEliteOrBoss) multiplier *= 1 + m.eliteBossPercent / 100;
    if (this.ctx.state.tank.integrity / Math.max(1, this.ctx.rules.resolver.resolve('tank.maxIntegrity')) <= 0.3) {
      multiplier *= 1 + m.lastResortPercent / 100;
    }
    const debuff = this.registry.debuffFor(ctx2.enemy.id, this.ctx.state.time);
    multiplier *= 1 + debuff.vulnPercent / 100;
    void ctx2.weaponId;
    return amount * multiplier;
  }

  modifyTankDamage(amount: number, source: DamageSource): number {
    if (!this.isEnabled) return amount;
    const t = this.ctx.state.tank;
    if (this.inventory.has('relic.phase_dash') && t.dashState !== undefined && t.dashState !== 'inactive') return 0;
    const m = this.projector.reproject(this.ctx.state.teamProgression);
    let multiplier = Math.max(0, 1 - m.incomingPercent / 100);
    if (isCannonSelfDamage(source)) multiplier *= Math.max(0, 1 - m.cannonSelfPercent / 100);
    const speed = Math.hypot(t.vx, t.vz);
    const maxSpeed = this.ctx.rules.resolver.resolve('tank.forwardSpeed');
    if (speed >= maxSpeed) multiplier *= Math.max(0, 1 - m.momentumPercent / 100);
    const ratio = t.integrity / Math.max(1, this.ctx.rules.resolver.resolve('tank.maxIntegrity'));
    if (ratio <= 0.5) multiplier *= Math.max(0, 1 - m.ironWillPercent / 100);
    return Math.max(0, amount * multiplier);
  }

  enemySpeedMultiplier(e: EnemyState): number {
    if (!this.isEnabled) return 1;
    const d = this.registry.debuffFor(e.id, this.ctx.state.time);
    return Math.max(0, 1 - d.speedPercent / 100);
  }

  // --------------------------------------------------------- roadkill
  roadkillParams() {
    if (!this.isEnabled) return null;
    const relic = this.ctx.rules.relicsById.get('relic.roadkill');
    if (!relic) return null;
    const stacks = this.inventory.getStack('relic.roadkill');
    if (stacks <= 0) return null;
    const effect = relic.effects.find((e) => e.templateId === 'relicEffect.roadkill');
    const template = effect ? this.ctx.rules.relicEffectTemplatesById.get(effect.templateId) : undefined;
    if (!effect || !template) return null;
    const params = resolveRelicEffectParameters(template, effect);
    return {
      capability: 'tank.roadkillContact',
      stacks,
      minimumSpeedRatio: params.minimumSpeedRatio as number,
      baseDamageCoefficient: params.baseDamageCoefficient as number,
      coefficientPerAdditionalStack: params.coefficientPerAdditionalStack as number,
      perTargetCooldownSeconds: params.perTargetCooldownSeconds as number,
      knockbackCoefficient: params.knockbackCoefficient as number,
    };
  }

  recordRoadkill(speed: number, maxSpeed: number, damage: number): void {
    if (!this.isEnabled) return;
    this.telemetry.roadkillHits++;
    this.lastRoadkill = { speed, maxSpeed, ratio: speed / Math.max(0.001, maxSpeed), damage };
  }

  recordRoadkillKill(): void {
    if (!this.isEnabled) return;
    this.telemetry.roadkillKills++;
  }

  twinShellCooldownMultiplier(): number {
    if (!this.isEnabled) return 1;
    const relic = this.ctx.rules.relicsById.get('relic.twin_shell');
    if (!relic || this.inventory.getStack('relic.twin_shell') <= 0) return 1;
    const effect = relic.effects.find((e) => e.templateId === 'relicEffect.twinShell');
    const template = effect ? this.ctx.rules.relicEffectTemplatesById.get(effect.templateId) : undefined;
    const params = effect && template ? resolveRelicEffectParameters(template, effect) : undefined;
    return (params?.cooldownMultiplier as number) ?? 1;
  }

  get hasTwinShell(): boolean {
    return this.isEnabled && this.inventory.getStack('relic.twin_shell') > 0;
  }

  /** Reproject relic stat aggregates (tests/debug). */
  projectionRefresh(): void {
    this.projector.reproject(this.ctx.state.teamProgression);
  }

  debugState(): ProgressionDebugState {
    const s = this.ctx.state;
    const t = s.tank;
    const maxSpeed = this.ctx.rules.resolver.resolve('tank.forwardSpeed');
    const roadkill = this.roadkillParams();
    return {
      flow: s.matchFlow,
      stagePhase: this.ctx.stage.state.phase,
      team: {
        level: s.teamProgression.level,
        currentXp: s.teamProgression.currentXp,
        xpForNextLevel: s.teamProgression.xpForNextLevel,
        pendingLevelUps: s.teamProgression.pendingLevelUps,
      },
      activeOfferId: s.teamProgression.activeSelection?.offerId ?? null,
      driverReady: s.teamProgression.activeSelection?.driverSelection !== undefined,
      gunnerReady: s.teamProgression.activeSelection?.gunnerSelection !== undefined,
      timeoutMs: s.teamProgression.activeSelection
        ? Math.max(0, (s.teamProgression.activeSelection.expiresAtWallMs ?? Date.now()) - Date.now())
        : 0,
      chestsOpened: s.teamProgression.treasureChestsOpened,
      relicStacks: { ...s.teamProgression.relicStacks },
      damageModifiers: this.projector.reproject(s.teamProgression),
      roadkill: {
        capability: this.ctx.capabilities.has('tank.roadkillContact'),
        speed: Math.hypot(t.vx, t.vz),
        maxSpeed,
        ratio: Math.hypot(t.vx, t.vz) / Math.max(0.001, maxSpeed),
        threshold: roadkill?.minimumSpeedRatio ?? 1,
        lastDamage: this.lastRoadkill.damage,
      },
      capabilitySources: this.ctx.capabilities.debugSources(),
      movement: {
        grounded: t.grounded,
        extraJumpsRemaining: t.airJumpsRemaining ?? 0,
        airDashReuseRemaining: t.airDashReuseRemaining ?? 0,
        dashState: t.dashState ?? 'inactive',
        phaseDashInvulnerable: this.inventory.has('relic.phase_dash') && t.dashState !== undefined && t.dashState !== 'inactive',
      },
      triggers: {
        phoenixConsumed: this.registry.wasConsumed('relic.phoenix_core'),
        safeHavenLastWaveId: this.lastSafeHavenWaveId,
        activeEnemyDebuffs: this.registry.size(),
        aerialMasterEligible: this.inventory.has('relic.aerial_master') && !t.grounded,
      },
      lastRelicResult: s.teamProgression.lastRelicResult
        ? {
            acquisitionSequence: s.teamProgression.lastRelicResult.acquisitionSequence,
            relicId: s.teamProgression.lastRelicResult.relicId,
            duplicateConverted: s.teamProgression.lastRelicResult.duplicateConverted,
            replacementXp: s.teamProgression.lastRelicResult.replacementXp,
          }
        : null,
    };
  }
}

function emptyCurve(): LevelCurveDefinition {
  return { id: 'levelCurve.empty', label: 'Empty', thresholds: [20], overflowRule: 'cap' as const, behaviors: [] };
}

function setRelicAcknowledged(active: ProgressionSelectionState, role: SelectionRole): void {
  if (role === 'single') active.singlePlayerRelicAcknowledged = true;
  else if (role === 'driver') active.driverRelicAcknowledged = true;
  else active.gunnerRelicAcknowledged = true;
}

function isRelicAcknowledged(active: ProgressionSelectionState, role: SelectionRole): boolean {
  if (role === 'single') return active.singlePlayerRelicAcknowledged === true;
  if (role === 'driver') return active.driverRelicAcknowledged === true;
  return active.gunnerRelicAcknowledged === true;
}

function emptyDefinition(): ProgressionDefinition {
  return {
    id: 'progression.empty',
    label: 'Empty',
    behaviors: [],
    levelCurveId: 'levelCurve.empty',
    xpPickupDefinitionId: 'xpPickup.empty',
    upgradeRarityTableId: 'rarity.upgrade.empty',
    upgradeFirstExperienceRuleId: 'firstExperience.empty',
    treasureRarityTableId: 'rarity.treasure.empty',
    firstTreasureRuleId: 'firstExperience.treasure.empty',
    relicPoolId: 'relicPool.empty',
    multiplayerPolicyId: 'progressionMode.multiplayer',
    singlePlayerPolicyId: 'progressionMode.singlePlayer',
    relicChestSpawnPolicyId: 'relicChestSpawn.empty',
    enemyXpRewards: { ambient: 0, wave: 0, elite: 0, boss: 0 },
    duplicateUniqueRelicXp: 0,
  };
}
