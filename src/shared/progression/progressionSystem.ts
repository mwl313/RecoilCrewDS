import type { MatchRules } from '../rules/matchRules';
import type { SystemContext } from '../sim/systems/systemContext';
import type { EnemyState, MatchState } from '../types';
import type { ProgressionRewardEvent, RelicRollResult, TreasureChestState, UpgradeCard } from './progressionTypes';
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
  private phaseDashUntil = -1;
  private lastRoadkill: { speed: number; maxSpeed: number; ratio: number; damage: number } = { speed: 0, maxSpeed: 0, ratio: 0, damage: 0 };

  constructor(private readonly ctx: SystemContext) {
    const s = ctx.state;
    const rules = ctx.rules;
    const enabled = rules.progressionContent !== null;
    this.rng = new ProgressionRng(hash32('progression', s.matchId));
    const curve = rules.levelCurveContent;
    const def = rules.progressionContent;
    const xpMult = () => {
      if (!enabled) return 1;
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
    this.projector = new RelicStatProjector(rules, rules.relicsById, rules.relicEffectTemplatesById);
    const policy = this.modePolicy();
    this.selection = new UpgradeSelectionController(
      this.rng,
      this.telemetry,
      policy?.levelUpSelection === 'roleSeparated',
    );
    if (curve) s.teamProgression.xpForNextLevel = curve.thresholds[0] ?? 1;
    if (enabled) {
      ctx.eventBus.subscribe('entity.killed', (payload) => this.onEntityKilled(payload as { enemy: { id: number; x: number; y: number; z: number }; source: DamageSource; weaponId?: string }));
      ctx.eventBus.subscribe('damage.applied', (payload) => this.onDamageApplied(payload as { targetId: number | string; targetKind: string; amount: number; source: DamageSource; weaponId?: string }));
      ctx.eventBus.subscribe('waveEvent', (payload) => this.onWaveEvent(payload as { type: string; waveId: number }));
    }
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
    if (!this.isEnabled || this.ctx.state.matchFlow !== 'playing') return;
    const result = this.teamXp.addXp(value);
    if (result.levelUps > 0) this.tryStartLevelUp(Date.now());
    this.ctx.eventBus.emit('progressionEvent', { type: 'xpCollected', value, x, y, z });
  }

  noteMissedShard(value: number): void {
    this.telemetry.xpMissed += value;
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
    const active = s.teamProgression.activeSelection;
    if (!active || active.resolved) return false;
    if (active.kind === 'upgrade') {
      const auto = this.selection.autoPick(active, nowMs);
      if (auto.length === 0) return false;
      if (this.selection.isComplete(active)) this.resolveLevelUp();
      return true;
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
    for (const card of cards) applyUpgradeCard(this.ctx.rules, active.offerId, card, this.telemetry);
    s.teamProgression.levelUpOffersCompleted++;
    s.teamProgression.activeSelection = null;
    s.matchFlow = 'playing';
    this.teamXp.consumeLevelUp();
    this.ctx.eventBus.emit('progressionEvent', { type: 'upgradeOfferResolved', offerId: active.offerId });
    this.tryStartLevelUp(Date.now());
  }

  // ------------------------------------------------------------- chests
  spawnChest(source: 'map' | 'enemyDrop' | 'waveClear', x: number, z: number): TreasureChestState {
    const s = this.ctx.state;
    const chest = this.chests.makeChest(s.nextChestId++, source, x, z, this.ctx.world.groundHeightAt(x, z));
    s.chests.push(chest);
    return chest;
  }

  openChest(chestId: number, nowMs: number): RelicRollResult | null {
    const s = this.ctx.state;
    const chest = s.chests.find((c) => c.id === chestId && !c.opened);
    if (!chest || !this.isEnabled || s.matchFlow !== 'playing') return null;
    this.chests.open(chest);
    const rarity = this.chests.rollRarity(
      this.rng.stream('progression.relicRarity'),
      this.ctx.rules.firstTreasureContent!,
      this.ctx.rules.treasureRarityTableContent!,
    );
    const pool = this.ctx.rules.relicPoolIds
      .map((id) => this.ctx.rules.relicsById.get(id))
      .filter((r): r is NonNullable<typeof r> => r !== undefined);
    const candidates = pool.filter((r) => r.rarity === rarity);
    const pickPool = candidates.length > 0 ? candidates : pool;
    const relic = pickPool[Math.floor(this.rng.stream('progression.relicSelection')() * pickPool.length)];
    const result = this.inventory.add(relic);
    const roll: RelicRollResult = {
      relicId: relic.id,
      rarity,
      duplicateConverted: result.duplicateConverted,
      replacementXp: result.replacementXp,
      stackCountAfter: result.stackCount,
    };
    if (result.duplicateConverted) {
      this.addXp(result.replacementXp, chest.x, chest.y, chest.z);
    } else {
      this.projector.reproject(s.teamProgression);
      if (result.capabilityGranted) {
        this.ctx.eventBus.emit('progressionEvent', { type: 'progressionCapabilityChanged', capabilityId: relic.capabilityId });
      }
    }
    s.teamProgression.lastRelicResult = roll;
    this.telemetry.relicDistribution[relic.id] = (this.telemetry.relicDistribution[relic.id] ?? 0) + 1;
    this.ctx.eventBus.emit('progressionEvent', { type: 'relicAcquired', relicId: relic.id, rarity, duplicateConverted: result.duplicateConverted });
    void nowMs;
    return roll;
  }

  // ---------------------------------------------------------- rewards
  private onEntityKilled(payload: { enemy: { id: number; x: number; y: number; z: number }; source: DamageSource; weaponId?: string }): void {
    const s = this.ctx.state;
    const enemy = s.enemies.find((e) => e.id === payload.enemy.id);
    const ownership = enemy?.ownership;
    const cls = ownership?.populationClass ?? 'ambient';
    const def = this.ctx.rules.progressionContent!;
    const xp =
      cls === 'special'
        ? def.enemyXpRewards.elite
        : def.enemyXpRewards[cls] ?? def.enemyXpRewards.ambient;
    const isLeader = ownership?.leaderId === payload.enemy.id;
    const isBoss = cls === 'boss';
    if (isLeader && !isBoss) {
      this.teamXp.addXp(def.enemyXpRewards.elite);
      this.spawnChest('waveClear', payload.enemy.x, payload.enemy.z);
      this.ctx.eventBus.emit('progressionEvent', {
        type: 'reward',
        payload: { kind: 'waveLeaderKilled', waveId: ownership.waveId ?? undefined, leaderEnemyId: payload.enemy.id } satisfies ProgressionRewardEvent,
      });
    } else if (isBoss) {
      this.teamXp.addXp(def.enemyXpRewards.boss);
      this.ctx.eventBus.emit('progressionEvent', {
        type: 'reward',
        payload: { kind: 'bossKilled', bossEnemyId: payload.enemy.id } satisfies ProgressionRewardEvent,
      });
    } else {
      this.spawnXpShard(xp, payload.enemy.x, payload.enemy.z);
      if (this.rng.stream('progression.enemyChestDrop')() < def.enemyChestDropChance) {
        this.spawnChest('enemyDrop', payload.enemy.x, payload.enemy.z);
      }
      this.ctx.eventBus.emit('progressionEvent', {
        type: 'reward',
        payload: {
          kind: 'enemyKilled',
          enemyId: payload.enemy.id,
          enemyDefinitionId: enemy?.defId,
          populationClass: cls,
          waveId: ownership?.waveId ?? undefined,
          damageSource: payload.source,
        } satisfies ProgressionRewardEvent,
      });
    }
    this.dispatchTrigger({ type: 'enemyKilled', enemyId: payload.enemy.id, source: payload.source, weaponId: payload.weaponId });
  }

  private spawnXpShard(value: number, x: number, z: number): void {
    const def = this.ctx.rules.progressionContent;
    if (!def || value <= 0) return;
    this.ctx.xpShards.spawn(Math.max(1, Math.round(value)), x, z);
  }

  private onDamageApplied(payload: { targetId: number | string; targetKind: string; source: DamageSource; weaponId?: string }): void {
    this.dispatchTrigger({
      type: 'damageApplied',
      targetId: payload.targetId,
      targetKind: payload.targetKind,
      amount: 0,
      source: payload.source,
      weaponId: payload.weaponId,
    });
  }

  private onWaveEvent(payload: { type: string; waveId: number }): void {
    if (payload.type !== 'wavePurged') return;
    this.dispatchTrigger({ type: 'waveCleared', waveId: payload.waveId });
    this.telemetry.levelsPerStage += 0;
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
        handler.handle(event, this.ctx, relic, stacks, { ...(template.parameters ?? {}), ...(effect.parameters ?? {}) }, this.telemetry);
      }
    }
  }

  notifyCannonFired(): void {
    this.dispatchTrigger({ type: 'cannonFired' });
  }

  notifyDash(): void {
    if (this.inventory.has('relic.phase_dash')) {
      this.phaseDashUntil = this.ctx.state.time + this.ctx.rules.config.tank.dashPresentationSeconds;
    }
  }

  notifyDashHit(enemyId: number): void {
    this.dispatchTrigger({ type: 'dashHit', enemyId });
  }

  notifyLanded(): void {
    this.dispatchTrigger({ type: 'landed' });
  }

  notifyAirborneTick(dt: number, grounded: boolean): void {
    if (!grounded) this.dispatchTrigger({ type: 'airborneTick', dt });
  }

  notifyWipeout(): void {
    this.dispatchTrigger({ type: 'wipeout' });
  }

  notifyWaveCleared(waveId: number): void {
    this.dispatchTrigger({ type: 'waveCleared', waveId });
  }

  // ------------------------------------------------------------ damage
  modifyEnemyDamage(amount: number, source: DamageSource, ctx2: { airborne: boolean; enemy: EnemyState }): number {
    const m = this.projector.reproject(this.ctx.state.teamProgression);
    let multiplier = 1 + m.outgoingPercent / 100;
    if (ctx2.airborne) multiplier *= 1 + m.airbornePercent / 100;
    const ownership = ctx2.enemy.ownership;
    const cls = ownership?.populationClass;
    const isEliteOrBoss =
      cls === 'boss' || (cls === 'wave' && ownership !== undefined && ownership.leaderId === ctx2.enemy.id);
    if (isEliteOrBoss) multiplier *= 1 + m.eliteBossPercent / 100;
    if (this.ctx.state.tank.integrity / Math.max(1, this.ctx.rules.resolver.resolve('tank.maxIntegrity')) <= 0.3) {
      multiplier *= 1 + m.lastResortPercent / 100;
    }
    const debuff = this.registry.debuffFor(ctx2.enemy.id, this.ctx.state.time);
    multiplier *= 1 + debuff.vulnPercent / 100;
    void source;
    return amount * multiplier;
  }

  modifyTankDamage(amount: number, source: DamageSource): number {
    const t = this.ctx.state.tank;
    if (this.phaseDashUntil > this.ctx.state.time) return 0;
    const m = this.projector.reproject(this.ctx.state.teamProgression);
    let multiplier = 1 + m.incomingPercent / 100;
    if (source === 'cannon') multiplier *= 1 + m.cannonSelfPercent / 100;
    const speed = Math.hypot(t.vx, t.vz);
    const maxSpeed = this.ctx.rules.resolver.resolve('tank.forwardSpeed');
    if (speed >= maxSpeed) multiplier *= 1 + m.momentumPercent / 100;
    const ratio = t.integrity / Math.max(1, this.ctx.rules.resolver.resolve('tank.maxIntegrity'));
    if (ratio <= 0.5) multiplier *= 1 + m.ironWillPercent / 100;
    return Math.max(0, amount * multiplier);
  }

  enemySpeedMultiplier(e: EnemyState): number {
    const d = this.registry.debuffFor(e.id, this.ctx.state.time);
    return 1 - d.speedPercent / 100;
  }

  // --------------------------------------------------------- roadkill
  roadkillParams() {
    const relic = this.ctx.rules.relicsById.get('relic.roadkill');
    if (!relic) return null;
    const stacks = this.inventory.getStack('relic.roadkill');
    if (stacks <= 0) return null;
    const template = relic.effects.find((e) => e.templateId === 'relicEffect.roadkill');
    const params = template?.parameters as Record<string, unknown> | undefined;
    return {
      capability: 'tank.roadkillContact',
      stacks,
      minimumSpeedRatio: (params?.minimumSpeedRatio as number) ?? 1,
      baseDamageCoefficient: (params?.baseDamageCoefficient as number) ?? 0.8,
      coefficientPerAdditionalStack: (params?.coefficientPerAdditionalStack as number) ?? 0.25,
      perTargetCooldownSeconds: (params?.perTargetCooldownSeconds as number) ?? 0.35,
      knockbackCoefficient: (params?.knockbackCoefficient as number) ?? 0.5,
    };
  }

  recordRoadkill(speed: number, maxSpeed: number, damage: number): void {
    this.telemetry.roadkillHits++;
    this.lastRoadkill = { speed, maxSpeed, ratio: speed / Math.max(0.001, maxSpeed), damage };
  }

  recordRoadkillKill(): void {
    this.telemetry.roadkillKills++;
  }

  twinShellCooldownMultiplier(): number {
    const relic = this.ctx.rules.relicsById.get('relic.twin_shell');
    if (!relic || this.inventory.getStack('relic.twin_shell') <= 0) return 1;
    const params = relic.effects.find((e) => e.templateId === 'relicEffect.twinShell')?.parameters as Record<string, unknown> | undefined;
    return (params?.cooldownMultiplier as number) ?? 1.2;
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
        ? Math.max(0, s.teamProgression.activeSelection.expiresAtWallMs - Date.now())
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
    };
  }
}

function emptyCurve(): LevelCurveDefinition {
  return { id: 'levelCurve.empty', label: 'Empty', thresholds: [20], overflowRule: 'cap' as const, behaviors: [] };
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
    enemyXpRewards: { ambient: 0, wave: 0, elite: 0, boss: 0 },
    enemyChestDropChance: 0,
    duplicateUniqueRelicXp: 0,
  };
}
