import type { ContentPack } from '../content/contentPack';
import type {
  BossWaveDefinition,
  EnemyLodPolicyDefinition,
  FarmingPhaseDefinition,
  HordeDirectorDefinition,
  HordeNavigationPolicyDefinition,
  HordeReplicationPolicyDefinition,
  PopulationLimitsDefinition,
  RewardTableDefinition,
  SpawnAnchorPolicyDefinition,
  SpawnPackDefinition,
  StageSequenceDefinition,
  WaveDefinition,
} from '../content/schemas/horde';
import type { EnemyGameplayRosterDefinition, OrdinaryRosterSlot } from '../content/schemas/enemyGameplayRoster';
import { pushEvent, type SystemContext } from '../sim/systems/systemContext';
import { phaseFarmingProgress, type StageEvent } from '../stage/stageTypes';
import { PopulationManager, type PopulationTally } from './populationManager';
import type { SpawnOwnership } from './spawnOwnership';
import type { SpawnPlan } from './spawnPlanner';

export interface ResolvedHordeDirector {
  def: HordeDirectorDefinition;
  stageSequence: StageSequenceDefinition;
  farmingPhases: FarmingPhaseDefinition[];
  limits: PopulationLimitsDefinition;
  packs: Map<string, SpawnPackDefinition>;
  waves: Map<string, WaveDefinition>;
  bossWave: BossWaveDefinition;
  rewardTables: Map<string, RewardTableDefinition>;
  gameplayRoster: EnemyGameplayRosterDefinition | null;
  policies: {
    anchor: SpawnAnchorPolicyDefinition;
    navigation: HordeNavigationPolicyDefinition;
    lod: EnemyLodPolicyDefinition;
    replication: HordeReplicationPolicyDefinition;
  };
}

export function resolveHordeDirector(pack: ContentPack, def: HordeDirectorDefinition): ResolvedHordeDirector {
  const rewardTableIds = new Set<string>();
  for (const id of def.waveIds) rewardTableIds.add(pack.getWave(id).rewardTableId);
  rewardTableIds.add(pack.getBossWave(def.bossWaveId).rewardTableId);
  return {
    def,
    stageSequence: pack.getStageSequence(def.stageSequenceId),
    farmingPhases: def.farmingPhaseIds.map((id) => pack.getFarmingPhase(id)),
    limits: pack.getPopulationLimits(def.limitsId),
    packs: new Map(def.packIds.map((id) => [id, pack.getSpawnPack(id)])),
    waves: new Map(def.waveIds.map((id) => [id, pack.getWave(id)])),
    bossWave: pack.getBossWave(def.bossWaveId),
    rewardTables: new Map([...rewardTableIds].map((id) => [id, pack.getRewardTable(id)])),
    gameplayRoster: def.gameplayRosterId ? pack.getEnemyGameplayRoster(def.gameplayRosterId) : null,
    policies: {
      anchor: pack.getSpawnAnchorPolicy(def.spawnAnchorPolicyId),
      navigation: pack.getHordeNavigationPolicy(def.navigationPolicyId),
      lod: pack.getEnemyLodPolicy(def.lodPolicyId),
      replication: pack.getHordeReplicationPolicy(def.replicationPolicyId),
    },
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * HordeDirector interprets the stage phase, accumulates the spawn budget,
 * selects data-driven packs, and opens/reinforces waves through
 * WaveController. It never owns stage progression.
 */
export class HordeDirector {
  readonly population: PopulationManager;
  spawnBudget = 0;
  lastSelectedPack: string | null = null;
  lastPackSize = 0;
  private lastFarmingPhase = -1;
  lastAnchor: { x: number; z: number } | null = null;
  lastAnchorDistance = 0;
  anchorFailures = 0;
  currentEntityTarget = 0;
  currentThreatTarget = 0;
  currentSpawnIncome = 0;
  currentWaveId: number | null = null;
  private readonly packCooldowns = new Map<string, number>();
  /** Deferred boss wave: opened exactly once after the authoritative intro. */
  private pendingBossWave: BossWaveDefinition | null = null;
  private ordinaryMixCounts: Record<OrdinaryRosterSlot, number> = {
    closeFodder: 0,
    rangedFodder: 0,
    specialist: 0,
  };

  constructor(
    private readonly ctx: SystemContext,
    readonly resolved: ResolvedHordeDirector,
  ) {
    this.population = new PopulationManager(ctx);
    this.ctx.eventBus.subscribe('stageEvent', (payload) => this.onStageEvent(payload as StageEvent));
    this.ctx.eventBus.subscribe('waveEvent', (payload) => this.onWaveEvent(payload as WaveEventPayload));
  }

  step(dt: number): void {
    const stage = this.ctx.stage;
    const tally = this.population.refresh();
    const phase = stage.state.phase;
    if (
      this.pendingBossWave &&
      phase === 'bossWave' &&
      stage.state.bossIntroRemaining <= 0 &&
      this.currentWaveId === null
    ) {
      const def = this.pendingBossWave;
      this.pendingBossWave = null;
      this.openWave(def, true, 3);
    }
    for (const [id, cd] of this.packCooldowns) {
      this.packCooldowns.set(id, cd - dt);
      if (cd - dt <= 0) this.packCooldowns.delete(id);
    }
    if (phase === 'farming1' || phase === 'farming2' || phase === 'farming3') {
      this.stepFarming(dt, tally, phase === 'farming1' ? 0 : phase === 'farming2' ? 1 : 2);
    } else if (phase === 'wave1' || phase === 'wave2' || phase === 'bossWave') {
      this.stepWave(dt);
    }
  }

  private stepFarming(dt: number, tally: PopulationTally, phaseIndex: number): void {
    this.refreshPhaseSlots(phaseIndex);
    const phase = this.resolved.farmingPhases[phaseIndex];
    const stage = this.ctx.stage;
    const progress = phaseFarmingProgress(stage.state, phase.durationSeconds);
    const entityTarget = lerp(phase.entityTargetStart, phase.entityTargetEnd, progress);
    const threatTarget = lerp(phase.threatTargetStart, phase.threatTargetEnd, progress);
    const income = lerp(phase.spawnIncomeStart, phase.spawnIncomeEnd, progress);
    this.currentEntityTarget = entityTarget;
    this.currentThreatTarget = threatTarget;
    this.currentSpawnIncome = income;
    this.spawnBudget = Math.min(this.resolved.limits.maximumStoredBudget, this.spawnBudget + income * dt);

    if (tally.entities >= entityTarget || tally.threat >= threatTarget) return;
    const capacity = this.population.ambientCapacity(this.resolved.limits, tally);
    if (!capacity.entities || !capacity.threat) return;
    const pack = this.pickPack(phase.eligiblePackTags, 'farming');
    if (!pack) return;
    if (this.spawnBudget < pack.threatCost) return;
    const entries = this.resolvePackEntries(pack, false);
    const plannedPack = this.packForEntries(pack, entries);
    const plan = this.ctx.spawnPlanner.plan(plannedPack, 'ambient');
    if (!plan) {
      this.anchorFailures++;
      return;
    }
    if (!this.population.hardCapacity(this.resolved.limits, tally, pack.entityCost, pack.threatCost)) return;
    this.spawnPackFromPlan(entries, pack, plan, 'ambient', null, null);
    this.commitOrdinaryMix(entries, pack);
    this.spawnBudget -= pack.threatCost;
    this.lastSelectedPack = pack.id;
    this.lastPackSize = entries.reduce((sum, entry) => sum + entry.count, 0);
    this.lastAnchor = { x: plan.anchor.x, z: plan.anchor.z };
    this.lastAnchorDistance = Math.hypot(plan.anchor.x - this.ctx.state.tank.x, plan.anchor.z - this.ctx.state.tank.z);
    this.packCooldowns.set(pack.id, pack.cooldownSeconds ?? 1);
  }

  /** Production: rebind selected.phase.* to the current farming roster. */
  private refreshPhaseSlots(phaseIndex: number): void {
    if (phaseIndex === this.lastFarmingPhase) return;
    this.lastFarmingPhase = phaseIndex;
    this.ordinaryMixCounts = { closeFodder: 0, rangedFodder: 0, specialist: 0 };
    const run = this.ctx.monsterRun;
    if (!run || !this.ctx.monsterSlots) return;
    const phase = run.phases[phaseIndex];
    this.ctx.monsterSlots['selected.phase.closeFodder'] = phase.closeFodderEnemyId;
    this.ctx.monsterSlots['selected.phase.rangedFodder'] = phase.rangedFodderEnemyId;
    this.ctx.monsterSlots['selected.phase.specialist'] = phase.specialistEnemyId;
  }

  private stepWave(dt: number): void {
    if (this.currentWaveId === null) return;
    const waves = this.ctx.waves;
    const runtime = waves.waves.get(this.currentWaveId);
    if (!runtime || runtime.state === 'leaderDead' || runtime.state === 'complete') return;
    const def =
      this.resolved.waves.get(runtime.definitionId) ??
      (runtime.definitionId === this.resolved.bossWave.id ? this.resolved.bossWave : undefined);
    if (!def) return;
    runtime.reinforcementAccumulator += def.reinforcementThreatPerSecond * dt;
    const packId = def.reinforcementPackIds[0];
    const pack = this.resolved.packs.get(packId);
    if (pack && runtime.reinforcementAccumulator >= pack.threatCost) {
      // Atomic reinforcement pack: preflight budget/cap/definitions/wave
      // state, then spawn every authored entry or none.
      const entries = this.resolvePackEntries(pack, runtime.definitionId === this.resolved.bossWave.id);
      if (waves.spendReinforcementPack(runtime.waveId, pack.threatCost, entries)) {
        runtime.reinforcementAccumulator -= pack.threatCost;
        this.commitOrdinaryMix(entries, pack);
        this.lastSelectedPack = packId;
        this.lastPackSize = entries.reduce((sum, entry) => sum + entry.count, 0);
      } else {
        runtime.reinforcementAccumulator = Math.min(runtime.reinforcementAccumulator, pack.threatCost);
      }
    }
  }

  private onWaveEvent(event: WaveEventPayload): void {
    if (event.type === 'wavePurged' && this.currentWaveId === event.waveId) {
      this.currentWaveId = null;
    }
  }

  private onStageEvent(event: StageEvent): void {
    if (event.type !== 'waveRequested' || this.currentWaveId !== null) return;
    const isBoss = event.waveId === 3;
    const def = isBoss ? this.resolved.bossWave : this.resolved.waves.get(this.waveIdToDefinitionId(event.waveId));
    if (!def) return;
    if (isBoss && this.ctx.monsterRun) {
      // Authoritative intro: do not spawn or simulate the boss/escorts until
      // the stage's intro countdown completes. Demo keeps its immediate
      // boss wave (permanent fixture).
      this.pendingBossWave = this.resolved.bossWave;
      pushEvent(this.ctx, 'assist', this.ctx.state.tank.x, this.ctx.state.tank.y + 2, this.ctx.state.tank.z, {
        label: 'BOSS INCOMING',
      });
      return;
    }
    this.openWave(def, isBoss, event.waveId ?? 1);
  }

  private openWave(def: BossWaveDefinition | WaveDefinition, isBoss: boolean, waveId: number): void {
    const selectedLeaders = !isBoss ? this.ctx.monsterRun?.eliteWaves[waveId - 1]?.map((elite) => elite.enemyId) : undefined;
    const primaryLeader = this.resolveLeader(def);
    const runtime = this.ctx.waves.openWave({
      definitionId: def.id,
      leaderEnemyId: selectedLeaders?.[0] ?? primaryLeader,
      leaderEnemyIds: selectedLeaders?.length ? selectedLeaders : [primaryLeader],
      openingThreat: def.openingThreat,
      reinforcementThreat: def.reinforcementThreat,
      reinforcementThreatPerSecond: def.reinforcementThreatPerSecond,
      maximumActiveWaveThreat: def.maximumActiveWaveThreat,
      maximumActiveWaveEntities: def.maximumActiveWaveEntities,
      boss: isBoss,
    });
    this.currentWaveId = runtime.waveId;
    for (const packId of def.openingPackIds) {
      const pack = this.resolved.packs.get(packId);
      if (pack) {
        const entries = this.resolvePackEntries(pack, isBoss);
        const plannedPack = this.packForEntries(pack, entries);
        const plan = this.ctx.spawnPlanner.plan(plannedPack, isBoss ? 'boss' : 'wave');
        const positions = plan?.positions ?? [];
        // Atomic opening pack: every authored entry spawns or none does.
        if (entries.some((e) => !this.ctx.enemies.defById(e.enemyId))) continue;
        const spawned = this.ctx.waves.spawnCohortPack(
          runtime.waveId,
          entries,
          pack.threatCost,
          positions.length > 0 ? positions : undefined,
        );
        if (spawned) this.commitOrdinaryMix(entries, pack);
        if (spawned) {
          this.lastSelectedPack = packId;
          this.lastPackSize = entries.reduce((sum, entry) => sum + entry.count, 0);
          if (plan) {
            this.lastAnchor = { x: plan.anchor.x, z: plan.anchor.z };
            this.lastAnchorDistance = Math.hypot(
              plan.anchor.x - this.ctx.state.tank.x,
              plan.anchor.z - this.ctx.state.tank.z,
            );
          }
        }
      }
    }
    // Boss-intro presentation is emitted once at the deferred intro start
    // (see onStageEvent). Activation uses a distinct semantic label so the
    // incoming sting can never replay.
    pushEvent(this.ctx, 'assist', this.ctx.state.tank.x, this.ctx.state.tank.y + 2, this.ctx.state.tank.z, {
      label: isBoss ? 'BOSS ENGAGED' : `WAVE ${waveId} INCOMING`,
    });
  }

  private waveIdToDefinitionId(waveId: number | undefined): string {
    if (waveId === undefined) return this.resolved.waves.keys().next().value as string;
    const trigger = this.resolved.stageSequence.triggers[waveId - 1];
    return trigger?.waveId ?? (this.resolved.waves.keys().next().value as string);
  }

  private pickPack(tags: string[], fallbackTag: string): SpawnPackDefinition | undefined {
    for (const pack of this.resolved.packs.values()) {
      const matches = pack.tags.some((t) => tags.includes(t)) || pack.tags.includes(fallbackTag);
      if (!matches) continue;
      const cooldown = this.packCooldowns.get(pack.id);
      if (cooldown !== undefined) continue;
      if (pack.minimumPhase && !this.ctx.stage.state.phase.startsWith(pack.minimumPhase)) continue;
      return pack;
    }
    return undefined;
  }

  private spawnPackFromPlan(
    entries: ResolvedPackEntry[],
    pack: SpawnPackDefinition,
    plan: SpawnPlan,
    populationClass: SpawnOwnership['populationClass'],
    waveId: number | null,
    leaderId: number | null,
  ): void {
    let seed = pack.id.length + this.ctx.state.nextEnemyId;
    let positionIndex = 0;
    for (const entry of entries) {
      const def = this.ctx.enemies.defById(entry.enemyId);
      if (!def) continue;
      for (let i = 0; i < entry.count; i++) {
        seed += 1;
        const position = plan.positions[positionIndex++] ?? { x: plan.anchor.x, z: plan.anchor.z };
        this.ctx.enemies.spawnEnemyDef(def, position.x, position.z, {
          populationClass,
          waveId,
          leaderId,
          packInstanceId: seed,
          spawnAnchorId: anchorIdToNumber(plan.anchor.id),
          purgeOnLeaderDeath: waveId !== null,
        });
      }
    }
  }

  private slot(slotId: string | undefined): string {
    if (!slotId) throw new Error('monster slot reference missing');
    const resolved = this.ctx.monsterSlots?.[slotId];
    if (!resolved) throw new Error(`unresolved monster slot '${slotId}'`);
    return resolved;
  }

  private resolveEntry(entry: { enemyId?: string; slotId?: string }): string {
    return entry.enemyId ?? this.slot(entry.slotId);
  }

  private resolveLeader(def: { leaderEnemyId?: string; leaderSlotId?: string }): string {
    return def.leaderEnemyId ?? this.slot(def.leaderSlotId);
  }

  private resolvePackEntries(pack: SpawnPackDefinition, bossEscort: boolean): ResolvedPackEntry[] {
    const roster = this.resolved.gameplayRoster;
    if (!roster) {
      return pack.entries.map((entry) => ({
        enemyId: this.resolveEntry(entry),
        count: Math.max(0, entry.count),
        formationRole: entry.formationRole,
      }));
    }
    const isBossEscort = bossEscort && pack.tags.includes('escort');
    const usesOrdinaryRoster = pack.tags.includes('farming') || pack.tags.includes('wave') || isBossEscort;
    if (!usesOrdinaryRoster) {
      return pack.entries.map((entry) => ({ enemyId: this.resolveEntry(entry), count: entry.count, formationRole: entry.formationRole }));
    }
    const totalCount = isBossEscort
      ? (this.ctx.monsterRun?.bossEscortCount ?? pack.entityCost)
      : pack.entries.reduce((sum, entry) => sum + Math.max(0, entry.count), 0);
    const start = isBossEscort
      ? { closeFodder: 0, rangedFodder: 0, specialist: 0 }
      : this.ordinaryMixCounts;
    const counts = allocateOrdinaryMix(roster.ordinaryMix, start, totalCount);
    const delta = {
      closeFodder: counts.closeFodder - start.closeFodder,
      rangedFodder: counts.rangedFodder - start.rangedFodder,
      specialist: counts.specialist - start.specialist,
    };
    const phase3 = isBossEscort;
    return (['closeFodder', 'rangedFodder', 'specialist'] as const)
      .filter((slot) => delta[slot] > 0)
      .map((slot) => ({
        enemyId: this.slot(`selected.${phase3 ? 'phase3.' : 'phase.'}${slot}`),
        count: delta[slot],
        formationRole: formationRoleFor(slot),
        rosterSlot: slot,
      }));
  }

  private commitOrdinaryMix(entries: ResolvedPackEntry[], pack: SpawnPackDefinition): void {
    if (!this.resolved.gameplayRoster || pack.tags.includes('escort')) return;
    for (const entry of entries) {
      if (entry.rosterSlot) this.ordinaryMixCounts[entry.rosterSlot] += entry.count;
    }
  }

  private packForEntries(pack: SpawnPackDefinition, entries: ResolvedPackEntry[]): SpawnPackDefinition {
    return {
      ...pack,
      entries: entries.map((entry) => ({ enemyId: entry.enemyId, count: entry.count, formationRole: entry.formationRole })),
      entityCost: entries.reduce((sum, entry) => sum + entry.count, 0),
    };
  }

  /** Authoritative density telemetry used by debug UI and qualification tests. */
  densityTelemetry(): HordeDensityTelemetry {
    const tank = this.ctx.state.tank;
    const telemetry: HordeDensityTelemetry = {
      globalEnemyCount: 0,
      nearbyEnemyCount45: 0,
      nearbyEnemyCount70: 0,
      close: 0,
      ranged: 0,
      specialist: 0,
    };
    const roleByEnemyId = new Map(
      (this.resolved.gameplayRoster?.ordinaryCandidates ?? []).map((entry) => [entry.enemyId, entry.slot] as const),
    );
    const add = (enemyId: string, count: number, x: number, z: number) => {
      telemetry.globalEnemyCount += count;
      const distance = Math.hypot(x - tank.x, z - tank.z);
      if (distance <= 45) telemetry.nearbyEnemyCount45 += count;
      if (distance <= 70) telemetry.nearbyEnemyCount70 += count;
      const role = roleByEnemyId.get(enemyId);
      if (role === 'closeFodder') telemetry.close += count;
      else if (role === 'rangedFodder') telemetry.ranged += count;
      else if (role === 'specialist') telemetry.specialist += count;
    };
    for (const enemy of this.ctx.state.enemies) {
      if (enemy.alive) add(enemy.defId ?? '', 1, enemy.x, enemy.z);
    }
    for (const sector of this.ctx.hordeSectors.sectors.values()) {
      add(sector.enemyDefId, sector.count, sector.centerX, sector.centerZ);
    }
    return telemetry;
  }
}

export interface HordeDensityTelemetry {
  globalEnemyCount: number;
  nearbyEnemyCount45: number;
  nearbyEnemyCount70: number;
  close: number;
  ranged: number;
  specialist: number;
}

interface ResolvedPackEntry {
  enemyId: string;
  count: number;
  formationRole?: string;
  rosterSlot?: OrdinaryRosterSlot;
}

export function allocateOrdinaryMix(
  mix: Record<OrdinaryRosterSlot, number>,
  current: Record<OrdinaryRosterSlot, number>,
  additionalCount: number,
): Record<OrdinaryRosterSlot, number> {
  const result = { ...current };
  const slots: OrdinaryRosterSlot[] = ['closeFodder', 'rangedFodder', 'specialist'];
  for (let i = 0; i < additionalCount; i++) {
    const targetTotal = Object.values(result).reduce((sum, value) => sum + value, 0) + 1;
    let selected = slots[0];
    let selectedDeficit = Number.NEGATIVE_INFINITY;
    for (const slot of slots) {
      const deficit = mix[slot] * targetTotal - result[slot];
      if (deficit > selectedDeficit) {
        selected = slot;
        selectedDeficit = deficit;
      }
    }
    result[selected]++;
  }
  return result;
}

function formationRoleFor(slot: OrdinaryRosterSlot): string {
  return slot === 'closeFodder' ? 'line' : slot === 'rangedFodder' ? 'support' : 'vanguard';
}

function anchorIdToNumber(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

interface WaveEventPayload {
  type: string;
  waveId: number;
  leaderId: number;
  count: number;
}
