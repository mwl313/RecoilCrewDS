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
import type { EntityKilledEvent } from '../damage/damageTypes';
import { isOrdinaryPressure, isPersistentThreat } from '../enemies/enemyClassification';
import { pushEvent, type SystemContext } from '../sim/systems/systemContext';
import type { EnemyState } from '../types';
import { phaseFarmingProgress, type StageEvent } from '../stage/stageTypes';
import { PopulationManager, type PopulationTally } from './populationManager';
import type { WaveRuntime } from './waveController';
import {
  ANGULAR_PRESSURE_SECTORS,
  type MultiAnchorSpawnPlan,
  type PressurePlanOptions,
  type SpawnSubgroupPlan,
} from './spawnPlanner';

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

const NEARBY_TARGETS = {
  farming1: [14, 20],
  farming2: [22, 32],
  farming3: [32, 46],
  wave1: [35, 48],
  wave2: [42, 56],
  bossWave: [45, 60],
} as const;

const MAX_PENDING_SUBGROUPS = 12;

type PendingSpawnKind = 'ambient' | 'waveOpening' | 'waveReinforcement' | 'maintenance';

interface PendingUnit {
  enemyId: string;
  formationRole?: string;
  rosterSlot?: OrdinaryRosterSlot;
}

interface PendingSpawnSubgroup {
  id: number;
  kind: PendingSpawnKind;
  pack: SpawnPackDefinition;
  plan: SpawnSubgroupPlan;
  units: PendingUnit[];
  dueAt: number;
  authoredCost: number;
  packInstanceId: number;
  waveId: number | null;
  reservationId: number | null;
  leaderId: number | null;
  maintenanceSummon: boolean;
  rewardSuppressed: boolean;
  replanOptions: PressurePlanOptions;
}

interface PersistentRecoveryRuntime {
  lastDistance: number;
  lastProgressAt: number;
  stage: 0 | 1 | 2 | 3;
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
  nearbyTargetMinimum = 0;
  nearbyTargetMaximum = 0;
  currentNearbyTarget = 0;
  globalOrdinaryDeficit = 0;
  nearbyOrdinaryDeficit = 0;
  clearRatePerSecond = 0;
  clearRateIncomeMultiplier = 1;
  recycledUnitsPerSecond = 0;
  recycleReason = 'none';
  rewardSuppressedKills = 0;
  persistentReentries = 0;
  readonly reinforcementPackHistory: string[] = [];
  currentWaveId: number | null = null;
  private readonly packCooldowns = new Map<string, number>();
  /** Deferred boss wave: opened exactly once after the authoritative intro. */
  private pendingBossWave: BossWaveDefinition | null = null;
  private ordinaryMixCounts: Record<OrdinaryRosterSlot, number> = {
    closeFodder: 0,
    rangedFodder: 0,
    specialist: 0,
  };
  private readonly pendingSubgroups: PendingSpawnSubgroup[] = [];
  private pendingSubgroupId = 1;
  private packInstanceId = 1;
  private reservedAmbientEntities = 0;
  private reservedAmbientThreat = 0;
  private nearbyDeficitSeconds = 0;
  private recycleTokens = 0;
  private recycleWindowSeconds = 0;
  private recycledInWindow = 0;
  private readonly ordinaryKillsAt: number[] = [];
  private readonly maintenanceLastAt = new Map<number, number>();
  private maintenanceLeaderCursor = 0;
  private readonly persistentRecovery = new Map<number, PersistentRecoveryRuntime>();

  constructor(
    private readonly ctx: SystemContext,
    readonly resolved: ResolvedHordeDirector,
  ) {
    this.population = new PopulationManager(ctx);
    this.ctx.eventBus.subscribe('stageEvent', (payload) => this.onStageEvent(payload as StageEvent));
    this.ctx.eventBus.subscribe('waveEvent', (payload) => this.onWaveEvent(payload as WaveEventPayload));
    this.ctx.eventBus.subscribe('entity.killed', (payload) => this.onEntityKilled(payload as EntityKilledEvent));
  }

  step(dt: number): void {
    const stage = this.ctx.stage;
    const phase = stage.state.phase;
    this.processPendingSubgroups();
    this.updateClearRate();
    this.updateNearbyTarget(phase);
    this.updatePersistentRecovery();
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
    const tally = this.population.refresh();
    if (phase === 'farming1' || phase === 'farming2' || phase === 'farming3') {
      this.stepFarming(dt, tally, phase === 'farming1' ? 0 : phase === 'farming2' ? 1 : 2);
    } else if (phase === 'wave1' || phase === 'wave2' || phase === 'bossWave') {
      this.stepWave(dt);
    }
    const refreshed = this.population.refresh();
    const nearby = this.population.nearbyPressure(this.ctx.state.tank.x, this.ctx.state.tank.z);
    const pendingEntities = this.pendingSubgroups.reduce((sum, subgroup) => sum + subgroup.units.length, 0);
    this.globalOrdinaryDeficit = this.currentEntityTarget - refreshed.ordinary.entities - pendingEntities;
    this.nearbyOrdinaryDeficit = this.currentNearbyTarget - nearby.ordinary70;
    this.nearbyDeficitSeconds = this.nearbyOrdinaryDeficit > 0
      ? this.nearbyDeficitSeconds + dt
      : 0;
    this.recyclePressure(dt, refreshed);
    this.processPendingSubgroups();
    this.recycleWindowSeconds += dt;
    if (this.recycleWindowSeconds >= 1) {
      this.recycledUnitsPerSecond = this.recycledInWindow / this.recycleWindowSeconds;
      this.recycleWindowSeconds = 0;
      this.recycledInWindow = 0;
    }
  }

  private stepFarming(dt: number, tally: PopulationTally, phaseIndex: number): void {
    this.refreshPhaseSlots(phaseIndex);
    const phase = this.resolved.farmingPhases[phaseIndex];
    const stage = this.ctx.stage;
    const progress = phaseFarmingProgress(stage.state, phase.durationSeconds);
    const entityTarget = lerp(phase.entityTargetStart, phase.entityTargetEnd, progress);
    const threatTarget = lerp(phase.threatTargetStart, phase.threatTargetEnd, progress);
    const baseIncome = lerp(phase.spawnIncomeStart, phase.spawnIncomeEnd, progress);
    const income = baseIncome * this.clearRateIncomeMultiplier;
    this.currentEntityTarget = entityTarget;
    this.currentThreatTarget = threatTarget;
    this.currentSpawnIncome = income;
    this.spawnBudget = Math.min(this.resolved.limits.maximumStoredBudget, this.spawnBudget + income * dt);

    if (
      tally.ordinary.entities + this.reservedAmbientEntities >= entityTarget ||
      tally.ordinary.threat + this.reservedAmbientThreat >= threatTarget
    ) return;
    const capacity = this.population.ambientCapacity(this.resolved.limits, tally);
    if (!capacity.entities || !capacity.threat) return;
    if (
      tally.byClass.ambient.entities + this.reservedAmbientEntities >= this.resolved.limits.ambientSoftEntityCap ||
      tally.byClass.ambient.threat + this.reservedAmbientThreat >= this.resolved.limits.ambientSoftThreatCap
    ) return;
    const pack = this.pickPack(phase.eligiblePackTags, 'farming');
    if (!pack) return;
    if (this.spawnBudget < pack.threatCost) return;
    const entries = this.resolvePackEntries(pack, false);
    const plannedPack = this.packForEntries(pack, entries);
    const plan = this.ctx.spawnPlanner.planMulti(plannedPack, 'ambient', { forceOffCamera: true });
    if (!plan) {
      this.anchorFailures++;
      return;
    }
    if (
      !this.population.hardCapacity(
        this.resolved.limits,
        tally,
        pack.entityCost + this.reservedAmbientEntities,
        pack.threatCost + this.reservedAmbientThreat,
      )
    ) return;
    if (!this.queuePlannedPack(entries, pack, plan, 'ambient', null, null)) return;
    this.spawnBudget -= pack.threatCost;
    this.reservedAmbientEntities += entries.reduce((sum, entry) => sum + entry.count, 0);
    this.reservedAmbientThreat += pack.threatCost;
    this.commitOrdinaryMix(entries, pack);
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
    const packIds = def.reinforcementPackIds;
    for (let offset = 0; offset < packIds.length; offset++) {
      const index = (runtime.reinforcementPackCursor + offset) % packIds.length;
      const packId = packIds[index];
      const pack = this.resolved.packs.get(packId);
      if (!pack || pack.threatCost > runtime.reinforcementThreatRemaining) continue;
      // Preserve cyclic reachability: if the selected pack is affordable
      // from the finite reserve, wait for its accumulator instead of letting
      // a cheaper later pack starve it forever.
      if (runtime.reinforcementAccumulator < pack.threatCost) break;
      const entries = this.resolvePackEntries(pack, runtime.definitionId === this.resolved.bossWave.id);
      const plannedPack = this.packForEntries(pack, entries);
      const plan = this.ctx.spawnPlanner.planMulti(plannedPack, 'wave', { forceOffCamera: true });
      if (!plan || this.pendingSubgroups.length + plan.subgroups.length > MAX_PENDING_SUBGROUPS) continue;
      const reservationId = waves.reserveCohortPack(runtime.waveId, entries, pack.threatCost);
      if (reservationId === null) continue;
      if (!this.queuePlannedPack(entries, pack, plan, 'waveReinforcement', runtime.waveId, reservationId)) {
        this.refundWholeWaveReservation(reservationId, entries, pack.threatCost);
        continue;
      }
      runtime.reinforcementAccumulator -= pack.threatCost;
      runtime.reinforcementPackCursor = (index + 1) % packIds.length;
      this.reinforcementPackHistory.push(packId);
      if (this.reinforcementPackHistory.length > 16) this.reinforcementPackHistory.shift();
      this.commitOrdinaryMix(entries, pack);
      this.lastSelectedPack = packId;
      this.lastPackSize = entries.reduce((sum, entry) => sum + entry.count, 0);
      break;
    }
    this.stepMaintenanceSummons(runtime, def);
  }

  private onWaveEvent(event: WaveEventPayload): void {
    if (event.type === 'wavePurged' && this.currentWaveId === event.waveId) {
      this.currentWaveId = null;
      this.maintenanceLastAt.delete(event.waveId);
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
        const plan = this.ctx.spawnPlanner.planMulti(plannedPack, isBoss ? 'boss' : 'wave', {
          forceOffCamera: true,
        });
        if (entries.some((e) => !this.ctx.enemies.defById(e.enemyId))) continue;
        if (!plan || this.pendingSubgroups.length + plan.subgroups.length > MAX_PENDING_SUBGROUPS) continue;
        const reservationId = this.ctx.waves.reserveCohortPack(runtime.waveId, entries);
        if (reservationId === null) continue;
        const queued = this.queuePlannedPack(entries, pack, plan, 'waveOpening', runtime.waveId, reservationId);
        if (!queued) {
          this.refundWholeWaveReservation(reservationId, entries, 0);
          continue;
        }
        this.commitOrdinaryMix(entries, pack);
        if (queued) {
          this.lastSelectedPack = packId;
          this.lastPackSize = entries.reduce((sum, entry) => sum + entry.count, 0);
          this.lastAnchor = { x: plan.anchor.x, z: plan.anchor.z };
          this.lastAnchorDistance = Math.hypot(
            plan.anchor.x - this.ctx.state.tank.x,
            plan.anchor.z - this.ctx.state.tank.z,
          );
        }
      }
    }
    // Subgroup A is authored at 0ms and must exist in the same authoritative
    // wave-open transaction; later groups remain queued at their delays.
    this.processPendingSubgroups();
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

  private queuePlannedPack(
    entries: ResolvedPackEntry[],
    pack: SpawnPackDefinition,
    plan: MultiAnchorSpawnPlan,
    kind: PendingSpawnKind,
    waveId: number | null,
    reservationId: number | null,
    ownership: { leaderId?: number; maintenanceSummon?: boolean; rewardSuppressed?: boolean } = {},
  ): boolean {
    if (this.pendingSubgroups.length + plan.subgroups.length > MAX_PENDING_SUBGROUPS) return false;
    const units = flattenEntries(entries);
    if (units.length !== plan.subgroups.reduce((sum, subgroup) => sum + subgroup.count, 0)) return false;
    const sharedPackInstanceId = this.packInstanceId++;
    let allocatedCost = 0;
    for (let index = 0; index < plan.subgroups.length; index++) {
      const subgroup = plan.subgroups[index];
      const groupUnits = units.slice(subgroup.startIndex, subgroup.startIndex + subgroup.count);
      const authoredCost = index === plan.subgroups.length - 1
        ? Math.max(0, pack.threatCost - allocatedCost)
        : pack.threatCost * (groupUnits.length / Math.max(1, units.length));
      allocatedCost += authoredCost;
      this.pendingSubgroups.push({
        id: this.pendingSubgroupId++,
        kind,
        pack,
        plan: subgroup,
        units: groupUnits,
        dueAt: this.ctx.state.time + subgroup.delaySeconds,
        authoredCost,
        packInstanceId: sharedPackInstanceId,
        waveId,
        reservationId,
        leaderId: ownership.leaderId ?? null,
        maintenanceSummon: ownership.maintenanceSummon ?? false,
        rewardSuppressed: ownership.rewardSuppressed ?? false,
        replanOptions: {
          minDistance: subgroup.anchor.minTankDistance,
          maxDistance: subgroup.anchor.maxTankDistance,
          preferredDistance: Math.hypot(
            subgroup.anchor.x - this.ctx.state.tank.x,
            subgroup.anchor.z - this.ctx.state.tank.z,
          ),
          forceOffCamera: true,
          interceptionBias: ownership.maintenanceSummon ?? false,
          preferredSector: subgroup.angularSector,
        },
      });
    }
    this.lastAnchor = { x: plan.anchor.x, z: plan.anchor.z };
    this.lastAnchorDistance = Math.hypot(
      plan.anchor.x - this.ctx.state.tank.x,
      plan.anchor.z - this.ctx.state.tank.z,
    );
    return true;
  }

  private processPendingSubgroups(): void {
    this.pendingSubgroups.sort((a, b) => a.dueAt - b.dueAt || a.id - b.id);
    for (let index = 0; index < this.pendingSubgroups.length;) {
      const pending = this.pendingSubgroups[index];
      if (pending.dueAt > this.ctx.state.time + 1e-6) {
        index++;
        continue;
      }
      if (
        pending.reservationId !== null &&
        !this.ctx.waves.reservationActive(pending.reservationId)
      ) {
        this.rollbackOrdinaryMix(pending.units, pending.pack);
        this.pendingSubgroups.splice(index, 1);
        continue;
      }

      let plan = pending.plan;
      if (!this.ctx.spawnPlanner.revalidateSubgroup(plan, pending.replanOptions)) {
        const replanned = this.ctx.spawnPlanner.replanSubgroup(
          pending.pack,
          pending.units.length,
          pending.plan.angularSector,
          pending.replanOptions,
        );
        if (!replanned) {
          this.refundPendingSubgroup(pending);
          this.pendingSubgroups.splice(index, 1);
          continue;
        }
        plan = replanned;
      }

      const entries = unitsToEntries(pending.units);
      let spawned = false;
      if (pending.kind === 'ambient') {
        if (pending.units.some((unit) => !this.ctx.enemies.defById(unit.enemyId))) {
          this.refundPendingSubgroup(pending);
          this.pendingSubgroups.splice(index, 1);
          continue;
        }
        let positionIndex = 0;
        for (const unit of pending.units) {
          const def = this.ctx.enemies.defById(unit.enemyId);
          const position = plan.positions[positionIndex++];
          if (!def || !position) continue;
          this.ctx.enemies.spawnEnemyDef(def, position.x, position.z, {
            populationClass: 'ambient',
            waveId: null,
            leaderId: null,
            packInstanceId: pending.packInstanceId,
            spawnAnchorId: anchorIdToNumber(plan.anchor.id),
            purgeOnLeaderDeath: false,
            formationRole: unit.formationRole,
          });
        }
        spawned = true;
        this.reservedAmbientEntities = Math.max(0, this.reservedAmbientEntities - pending.units.length);
        this.reservedAmbientThreat = Math.max(0, this.reservedAmbientThreat - pending.authoredCost);
      } else if (pending.reservationId !== null) {
        spawned = this.ctx.waves.spawnReservedCohortSubgroup(
          pending.reservationId,
          entries,
          plan.positions,
          {
            ...(pending.leaderId !== null ? { leaderId: pending.leaderId } : {}),
            maintenanceSummon: pending.maintenanceSummon,
            rewardSuppressed: pending.rewardSuppressed,
          },
          pending.authoredCost,
        );
      }
      if (!spawned) this.refundPendingSubgroup(pending);
      this.pendingSubgroups.splice(index, 1);
    }
  }

  private refundPendingSubgroup(pending: PendingSpawnSubgroup): void {
    if (pending.kind === 'ambient') {
      this.reservedAmbientEntities = Math.max(0, this.reservedAmbientEntities - pending.units.length);
      this.reservedAmbientThreat = Math.max(0, this.reservedAmbientThreat - pending.authoredCost);
      this.spawnBudget = Math.min(
        this.resolved.limits.maximumStoredBudget,
        this.spawnBudget + pending.authoredCost,
      );
    } else if (pending.reservationId !== null) {
      this.ctx.waves.refundReservedCohortSubgroup(
        pending.reservationId,
        unitsToEntries(pending.units),
        pending.authoredCost,
      );
    }
    this.rollbackOrdinaryMix(pending.units, pending.pack);
  }

  private refundWholeWaveReservation(
    reservationId: number,
    entries: ResolvedPackEntry[],
    authoredCost: number,
  ): void {
    this.ctx.waves.refundReservedCohortSubgroup(reservationId, entries, authoredCost);
  }

  private updateNearbyTarget(phase: string): void {
    const fallback = NEARBY_TARGETS[phase as keyof typeof NEARBY_TARGETS];
    if (!fallback) {
      this.nearbyTargetMinimum = 0;
      this.nearbyTargetMaximum = 0;
      this.currentNearbyTarget = 0;
      return;
    }
    let minimum: number = fallback[0];
    let maximum: number = fallback[1];
    if (phase === 'farming1' || phase === 'farming2' || phase === 'farming3') {
      const index = phase === 'farming1' ? 0 : phase === 'farming2' ? 1 : 2;
      const definition = this.resolved.farmingPhases[index];
      minimum = definition.nearbyTargetMinimum ?? minimum;
      maximum = definition.nearbyTargetMaximum ?? maximum;
      const progress = phaseFarmingProgress(this.ctx.stage.state, definition.durationSeconds);
      this.currentNearbyTarget = lerp(minimum, maximum, progress);
    } else {
      const runtime = this.currentWaveId === null ? undefined : this.ctx.waves.waves.get(this.currentWaveId);
      const definition = runtime
        ? this.resolved.waves.get(runtime.definitionId) ??
          (runtime.definitionId === this.resolved.bossWave.id ? this.resolved.bossWave : undefined)
        : phase === 'bossWave'
          ? this.resolved.bossWave
          : undefined;
      minimum = definition?.nearbyTargetMinimum ?? minimum;
      maximum = definition?.nearbyTargetMaximum ?? maximum;
      this.currentNearbyTarget = (minimum + maximum) * 0.5;
    }
    this.nearbyTargetMinimum = minimum;
    this.nearbyTargetMaximum = maximum;
  }

  private updateClearRate(): void {
    const cutoff = this.ctx.state.time - 5;
    while (this.ordinaryKillsAt.length > 0 && this.ordinaryKillsAt[0] < cutoff) this.ordinaryKillsAt.shift();
    this.clearRatePerSecond = this.ordinaryKillsAt.length / 5;
    if (this.clearRatePerSecond < 1) this.clearRateIncomeMultiplier = 0.85;
    else if (this.clearRatePerSecond <= 4) this.clearRateIncomeMultiplier = 1;
    else this.clearRateIncomeMultiplier = Math.min(1.3, 1 + ((this.clearRatePerSecond - 4) / 4) * 0.3);
  }

  private onEntityKilled(payload: EntityKilledEvent): void {
    const enemy = this.ctx.state.enemies.find((candidate) => candidate.id === payload.enemy.id);
    if (!enemy) return;
    if (enemy.ownership?.rewardSuppressed) this.rewardSuppressedKills++;
    if (isOrdinaryPressure(enemy) && !enemy.ownership?.rewardSuppressed) {
      this.ordinaryKillsAt.push(this.ctx.state.time);
    }
  }

  private updatePersistentRecovery(): void {
    const now = this.ctx.state.time;
    const tank = this.ctx.state.tank;
    const alive = new Set<number>();
    for (const enemy of this.ctx.state.enemies) {
      if (!enemy.alive || !isPersistentThreat(enemy)) continue;
      alive.add(enemy.id);
      const distance = Math.hypot(enemy.x - tank.x, enemy.z - tank.z);
      let runtime = this.persistentRecovery.get(enemy.id);
      if (!runtime) {
        runtime = { lastDistance: distance, lastProgressAt: now, stage: 0 };
        this.persistentRecovery.set(enemy.id, runtime);
      }
      if (distance <= 110) {
        runtime.lastDistance = distance;
        runtime.lastProgressAt = now;
        if (runtime.stage !== 0) this.ctx.enemies.setPersistentRecoveryStage(enemy.id, 0);
        runtime.stage = 0;
        continue;
      }
      if (distance < runtime.lastDistance - 1.5) {
        runtime.lastDistance = distance;
        runtime.lastProgressAt = now;
        if (runtime.stage !== 0) this.ctx.enemies.setPersistentRecoveryStage(enemy.id, 0);
        runtime.stage = 0;
        continue;
      }
      if (distance < 120) continue;
      const stalledFor = now - runtime.lastProgressAt;
      const desiredStage: 0 | 1 | 2 | 3 = stalledFor >= 6 ? 3 : stalledFor >= 5 ? 2 : stalledFor >= 4 ? 1 : 0;
      if (desiredStage > runtime.stage) {
        runtime.stage = desiredStage;
        this.ctx.enemies.setPersistentRecoveryStage(enemy.id, desiredStage);
        if (desiredStage === 1) this.ctx.flowField?.forceRefresh(tank.x, tank.z);
      }
      if (stalledFor < 6.5) continue;
      const reentry = this.ctx.spawnPlanner.pressurePoint(1, {
        minDistance: 50,
        maxDistance: 70,
        preferredDistance: 60,
        forceOffCamera: true,
        interceptionBias: true,
      });
      if (!reentry) continue;
      enemy.x = reentry.anchor.x;
      enemy.z = reentry.anchor.z;
      enemy.y = this.ctx.world.groundHeightAt(enemy.x, enemy.z);
      enemy.yaw = Math.atan2(tank.x - enemy.x, tank.z - enemy.z);
      runtime.lastDistance = Math.hypot(enemy.x - tank.x, enemy.z - tank.z);
      runtime.lastProgressAt = now;
      runtime.stage = 0;
      this.ctx.enemies.setPersistentRecoveryStage(enemy.id, 0);
      this.persistentReentries++;
    }
    for (const id of [...this.persistentRecovery.keys()]) {
      if (!alive.has(id)) this.persistentRecovery.delete(id);
    }
  }

  private stepMaintenanceSummons(
    runtime: WaveRuntime,
    definition: BossWaveDefinition | WaveDefinition,
  ): void {
    const boss = runtime.definitionId === this.resolved.bossWave.id;
    const config = boss
      ? { desired: 16, cap: 24, batch: 6, interval: 6 }
      : { desired: 10, cap: 16, batch: 4, interval: 7.5 };
    const leaders = runtime.leaderIds
      .map((id) => this.ctx.state.enemies.find((enemy) => enemy.id === id && enemy.alive))
      .filter((enemy): enemy is EnemyState => enemy !== undefined);
    if (leaders.length === 0) return;
    const pending = this.pendingSubgroups
      .filter((subgroup) => subgroup.waveId === runtime.waveId && subgroup.maintenanceSummon)
      .reduce((sum, subgroup) => sum + subgroup.units.length, 0);
    const live = this.ctx.state.enemies.filter(
      (enemy) => enemy.alive && enemy.ownership?.maintenanceSummon && enemy.ownership.waveId === runtime.waveId,
    ).length + this.ctx.hordeSectors.maintenanceCount() + pending;
    if (live >= config.desired || live >= config.cap) return;
    const leader = leaders[this.maintenanceLeaderCursor++ % leaders.length];
    const distance = Math.hypot(leader.x - this.ctx.state.tank.x, leader.z - this.ctx.state.tank.z);
    const interval = distance > 120 ? config.interval * 0.85 : config.interval;
    const lastAt = this.maintenanceLastAt.get(runtime.waveId) ?? this.ctx.state.time;
    if (this.ctx.state.time - lastAt < interval) {
      if (!this.maintenanceLastAt.has(runtime.waveId)) this.maintenanceLastAt.set(runtime.waveId, lastAt);
      return;
    }
    const count = Math.min(config.batch, config.desired - live, config.cap - live);
    if (count <= 0 || definition.reinforcementPackIds.length === 0) return;
    const packId = definition.reinforcementPackIds[
      (runtime.waveId + this.maintenanceLeaderCursor) % definition.reinforcementPackIds.length
    ];
    const pack = this.resolved.packs.get(packId);
    if (!pack) return;
    const entries = truncateEntries(this.resolvePackEntries(pack, boss), count);
    const plannedPack = this.packForEntries(pack, entries);
    const plan = this.ctx.spawnPlanner.planMulti(plannedPack, 'wave', {
      minDistance: 40,
      maxDistance: 65,
      preferredDistance: 55,
      forceOffCamera: true,
      interceptionBias: true,
    });
    if (!plan || this.pendingSubgroups.length + plan.subgroups.length > MAX_PENDING_SUBGROUPS) return;
    const reservationId = this.ctx.waves.reserveCohortPack(runtime.waveId, entries);
    if (reservationId === null) return;
    const queued = this.queuePlannedPack(entries, pack, plan, 'maintenance', runtime.waveId, reservationId, {
      leaderId: leader.id,
      maintenanceSummon: true,
      rewardSuppressed: true,
    });
    if (!queued) {
      this.refundWholeWaveReservation(reservationId, entries, 0);
      return;
    }
    this.commitOrdinaryMix(entries, pack);
    this.maintenanceLastAt.set(runtime.waveId, this.ctx.state.time);
  }

  private recyclePressure(dt: number, tally: PopulationTally): void {
    if (this.currentNearbyTarget <= 0 || this.nearbyOrdinaryDeficit <= 0) {
      this.recycleReason = 'nearby_satisfied';
      this.recycleTokens = 0;
      return;
    }
    if (this.globalOrdinaryDeficit > 0) {
      this.recycleReason = 'global_deficit';
      this.recycleTokens = 0;
      return;
    }
    if (this.nearbyDeficitSeconds < 2) {
      this.recycleReason = 'deficit_grace';
      return;
    }
    if (tally.entities >= this.resolved.limits.hardEntityCap) {
      // Recycling is population-neutral and remains legal at the hard cap.
      this.recycleReason = 'global_full_hard_cap';
    } else {
      this.recycleReason = 'global_full_nearby_deficit';
    }
    const rate = Math.min(8, 4 + Math.max(0, this.nearbyOrdinaryDeficit) / 6);
    this.recycleTokens = Math.min(rate, this.recycleTokens + rate * dt);
    let allowance = Math.floor(this.recycleTokens);
    if (allowance <= 0) return;
    const tank = this.ctx.state.tank;
    let recycled = this.ctx.hordeSectors.recycleFar(allowance, tank.x, tank.z, (slice) => {
      const plan = this.ctx.spawnPlanner.pressurePoint(slice.count, {
        minDistance: 42,
        maxDistance: 68,
        preferredDistance: 56,
        forceOffCamera: true,
      });
      const def = this.ctx.enemies.defById(slice.enemyDefId);
      if (!plan || !def) return false;
      for (let i = 0; i < slice.count; i++) {
        const position = plan.positions[i] ?? plan.anchor;
        this.ctx.enemies.spawnEnemyDef(def, position.x, position.z, {
          populationClass: slice.populationClass,
          waveId: slice.waveId,
          leaderId: slice.leaderId,
          packInstanceId: slice.sectorId,
          spawnAnchorId: anchorIdToNumber(plan.anchor.id),
          purgeOnLeaderDeath: slice.purgeOnLeaderDeath,
          ...(slice.maintenanceSummon
            ? { maintenanceSummon: true, summonedByLeaderId: slice.leaderId ?? undefined }
            : {}),
          ...(slice.rewardSuppressed ? { rewardSuppressed: true } : {}),
        });
      }
      return true;
    });
    allowance -= recycled;
    if (allowance > 0) recycled += this.recycleFarIndividuals(allowance);
    if (recycled === 0) this.recycleReason = 'no_far_offscreen_candidate';
    this.recycleTokens = Math.max(0, this.recycleTokens - recycled);
    this.recycledInWindow += recycled;
  }

  private recycleFarIndividuals(maximumUnits: number): number {
    const tank = this.ctx.state.tank;
    const candidates = this.ctx.state.enemies
      .filter((enemy) => {
        if (!isOrdinaryPressure(enemy)) return false;
        if (Math.hypot(enemy.x - tank.x, enemy.z - tank.z) < 150) return false;
        if (!this.ctx.spawnPlanner.isOffCamera(enemy.x, enemy.z)) return false;
        if (enemy.telegraph > 0 || enemy.flash > 0) return false;
        return enemy.state !== 'lock' && enemy.state !== 'telegraph' && enemy.state !== 'charge' && enemy.state !== 'fire';
      })
      .sort((a, b) =>
        Math.hypot(b.x - tank.x, b.z - tank.z) - Math.hypot(a.x - tank.x, a.z - tank.z) || a.id - b.id,
      );
    let recycled = 0;
    const used = new Set<number>();
    for (let index = 0; index < candidates.length && recycled < maximumUnits;) {
      const first = candidates[index];
      index++;
      if (used.has(first.id)) continue;
      const key = ownershipCompositionKey(first);
      const group = candidates
        .filter((enemy) => !used.has(enemy.id) && ownershipCompositionKey(enemy) === key)
        .slice(0, maximumUnits - recycled);
      if (group.length === 0) continue;
      const plan = this.ctx.spawnPlanner.pressurePoint(group.length, {
        minDistance: 42,
        maxDistance: 68,
        preferredDistance: 56,
        forceOffCamera: true,
      });
      const def = this.ctx.enemies.defById(first.defId ?? '');
      if (!plan || !def) continue;
      const ids = new Set(group.map((enemy) => enemy.id));
      for (const id of ids) used.add(id);
      this.ctx.enemies.purge((enemy) => ids.has(enemy.id));
      for (let i = 0; i < group.length; i++) {
        const source = group[i];
        const position = plan.positions[i] ?? plan.anchor;
        const ownership = source.ownership;
        this.ctx.enemies.spawnEnemyDef(def, position.x, position.z, ownership
          ? {
              ...ownership,
              packInstanceId: this.packInstanceId++,
              spawnAnchorId: anchorIdToNumber(plan.anchor.id),
            }
          : undefined);
      }
      recycled += group.length;
    }
    return recycled;
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

  private rollbackOrdinaryMix(units: PendingUnit[], pack: SpawnPackDefinition): void {
    if (!this.resolved.gameplayRoster || pack.tags.includes('escort')) return;
    for (const unit of units) {
      if (unit.rosterSlot) {
        this.ordinaryMixCounts[unit.rosterSlot] = Math.max(0, this.ordinaryMixCounts[unit.rosterSlot] - 1);
      }
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
      globalOrdinaryCount: 0,
      nearbyEnemyCount45: 0,
      nearbyEnemyCount70: 0,
      nearbyOrdinaryCount45: 0,
      nearbyOrdinaryCount70: 0,
      close: 0,
      ranged: 0,
      specialist: 0,
      sectorCount: this.ctx.hordeSectors.sectors.size,
      sectorMovementProgress: this.ctx.hordeSectors.movementTelemetry().movedMeters,
      recycledUnitsPerSecond: this.recycledUnitsPerSecond,
      recycleReason: this.recycleReason,
      globalOrdinaryDeficit: this.globalOrdinaryDeficit,
      nearbyOrdinaryDeficit: this.nearbyOrdinaryDeficit,
      nearbyTargetMinimum: this.nearbyTargetMinimum,
      nearbyTargetMaximum: this.nearbyTargetMaximum,
      angularSectorCounts: this.ctx.spawnPlanner.angularTelemetry().counts,
      lastAnchorDirections: this.ctx.spawnPlanner.angularTelemetry().lastDirections,
      pendingSubgroups: this.pendingSubgroups.length,
      maintenanceSummonCount: 0,
      persistentRecoveryStage: {},
      rewardSuppressedKills: this.rewardSuppressedKills,
      clearRatePerSecond: this.clearRatePerSecond,
      clearRateIncomeMultiplier: this.clearRateIncomeMultiplier,
    };
    const roleByEnemyId = new Map(
      (this.resolved.gameplayRoster?.ordinaryCandidates ?? []).map((entry) => [entry.enemyId, entry.slot] as const),
    );
    const add = (enemyId: string, count: number, x: number, z: number, ordinary: boolean, maintenance: boolean) => {
      telemetry.globalEnemyCount += count;
      const distance = Math.hypot(x - tank.x, z - tank.z);
      if (distance <= 45) telemetry.nearbyEnemyCount45 += count;
      if (distance <= 70) telemetry.nearbyEnemyCount70 += count;
      if (!ordinary) return;
      telemetry.globalOrdinaryCount += count;
      if (distance <= 45) telemetry.nearbyOrdinaryCount45 += count;
      if (distance <= 70) telemetry.nearbyOrdinaryCount70 += count;
      if (maintenance) telemetry.maintenanceSummonCount += count;
      const role = roleByEnemyId.get(enemyId);
      if (role === 'closeFodder') telemetry.close += count;
      else if (role === 'rangedFodder') telemetry.ranged += count;
      else if (role === 'specialist') telemetry.specialist += count;
    };
    for (const enemy of this.ctx.state.enemies) {
      if (enemy.alive) {
        add(
          enemy.defId ?? '',
          1,
          enemy.x,
          enemy.z,
          isOrdinaryPressure(enemy),
          enemy.ownership?.maintenanceSummon ?? false,
        );
      }
    }
    for (const sector of this.ctx.hordeSectors.sectors.values()) {
      add(sector.enemyDefId, sector.count, sector.centerX, sector.centerZ, true, sector.maintenanceSummon ?? false);
    }
    for (const [enemyId, runtime] of this.persistentRecovery) {
      telemetry.persistentRecoveryStage[enemyId] =
        runtime.stage === 0 ? 'tracking' : runtime.stage === 1 ? 'routeRefresh' : runtime.stage === 2 ? 'pursuitPriority' : 'alternatePath';
    }
    return telemetry;
  }
}

export interface HordeDensityTelemetry {
  globalEnemyCount: number;
  globalOrdinaryCount: number;
  nearbyEnemyCount45: number;
  nearbyEnemyCount70: number;
  nearbyOrdinaryCount45: number;
  nearbyOrdinaryCount70: number;
  close: number;
  ranged: number;
  specialist: number;
  sectorCount: number;
  sectorMovementProgress: number;
  recycledUnitsPerSecond: number;
  recycleReason: string;
  globalOrdinaryDeficit: number;
  nearbyOrdinaryDeficit: number;
  nearbyTargetMinimum: number;
  nearbyTargetMaximum: number;
  angularSectorCounts: number[];
  lastAnchorDirections: Array<(typeof ANGULAR_PRESSURE_SECTORS)[number]>;
  pendingSubgroups: number;
  maintenanceSummonCount: number;
  persistentRecoveryStage: Record<number, string>;
  rewardSuppressedKills: number;
  clearRatePerSecond: number;
  clearRateIncomeMultiplier: number;
}

interface ResolvedPackEntry {
  enemyId: string;
  count: number;
  formationRole?: string;
  rosterSlot?: OrdinaryRosterSlot;
}

function flattenEntries(entries: ResolvedPackEntry[]): PendingUnit[] {
  const units: PendingUnit[] = [];
  for (const entry of entries) {
    for (let index = 0; index < entry.count; index++) {
      units.push({
        enemyId: entry.enemyId,
        formationRole: entry.formationRole,
        rosterSlot: entry.rosterSlot,
      });
    }
  }
  return units;
}

function unitsToEntries(units: PendingUnit[]): ResolvedPackEntry[] {
  const entries: ResolvedPackEntry[] = [];
  for (const unit of units) {
    const last = entries[entries.length - 1];
    if (
      last &&
      last.enemyId === unit.enemyId &&
      last.formationRole === unit.formationRole &&
      last.rosterSlot === unit.rosterSlot
    ) {
      last.count++;
    } else {
      entries.push({
        enemyId: unit.enemyId,
        count: 1,
        formationRole: unit.formationRole,
        rosterSlot: unit.rosterSlot,
      });
    }
  }
  return entries;
}

function truncateEntries(entries: ResolvedPackEntry[], count: number): ResolvedPackEntry[] {
  return unitsToEntries(flattenEntries(entries).slice(0, Math.max(0, count)));
}

function ownershipCompositionKey(enemy: EnemyState): string {
  const ownership = enemy.ownership;
  return [
    enemy.defId ?? '',
    ownership?.populationClass ?? 'ambient',
    ownership?.waveId ?? 0,
    ownership?.leaderId ?? 0,
    ownership?.maintenanceSummon ? 1 : 0,
    ownership?.rewardSuppressed ? 1 : 0,
  ].join(':');
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
