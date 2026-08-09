import type { EntityKilledEvent } from '../damage/damageTypes';
import { enemyThreat } from '../enemies/monsterCompat';
import { pushEvent, type SystemContext } from '../sim/systems/systemContext';
import { PopulationManager } from './populationManager';

export interface WaveOpeningOptions {
  definitionId: string;
  leaderEnemyId: string;
  /** Additional co-leaders selected for a multi-elite production wave. */
  leaderEnemyIds?: string[];
  openingThreat: number;
  reinforcementThreat: number;
  reinforcementThreatPerSecond: number;
  maximumActiveWaveThreat: number;
  maximumActiveWaveEntities: number;
  boss?: boolean;
}

export interface WaveRuntime {
  waveId: number;
  definitionId: string;
  leaderId: number;
  /** Every designated leader; leaderId remains the primary cohort anchor. */
  leaderIds: number[];
  defeatedLeaderIds: number[];
  initialThreatRemaining: number;
  reinforcementThreatRemaining: number;
  activeWaveThreat: number;
  activeWaveEntities: number;
  maximumActiveWaveThreat: number;
  maximumActiveWaveEntities: number;
  reinforcementAccumulator: number;
  reservedWaveThreat: number;
  reservedWaveEntities: number;
  reinforcementPackCursor: number;
  state: 'opening' | 'active' | 'leaderDead' | 'purging' | 'complete';
}

export interface CohortSpawnOptions {
  leaderId?: number;
  maintenanceSummon?: boolean;
  rewardSuppressed?: boolean;
}

interface CohortReservation {
  reservationId: number;
  waveId: number;
  packInstanceId: number;
  remainingEntities: number;
  remainingThreat: number;
  reinforcement: boolean;
  remainingAuthoredCost: number;
}

/**
 * WaveController owns one elite-led crisis population (Core Loop 06 M2):
 * wave IDs, leader designation, tagged opening/reinforcement cohorts, a
 * finite reinforcement reserve, leader-death purge, and one leader reward.
 * Purge removes only the matching cohort and never triggers kill hooks,
 * XP, drops, or Dash/cannon credit.
 */
export class WaveController {
  readonly waves = new Map<number, WaveRuntime>();
  private nextWaveId = 1;
  private readonly rewardFired = new Set<number>();
  private readonly accountedDeathIds = new Set<number>();
  private packInstanceCounter = 0;
  private reservationCounter = 1;
  private readonly reservations = new Map<number, CohortReservation>();

  constructor(
    private readonly ctx: SystemContext,
    private readonly onLeaderKilled: (waveId: number) => void,
  ) {
    this.ctx.eventBus.subscribe('entity.killed', (payload) => this.onKilled(payload as EntityKilledEvent));
  }

  openWave(opts: WaveOpeningOptions): WaveRuntime {
    const waveId = this.nextWaveId++;
    const runtime: WaveRuntime = {
      waveId,
      definitionId: opts.definitionId,
      leaderId: 0,
      leaderIds: [],
      defeatedLeaderIds: [],
      initialThreatRemaining: opts.openingThreat,
      reinforcementThreatRemaining: opts.reinforcementThreat,
      activeWaveThreat: 0,
      activeWaveEntities: 0,
      maximumActiveWaveThreat: opts.maximumActiveWaveThreat,
      maximumActiveWaveEntities: opts.maximumActiveWaveEntities,
      reinforcementAccumulator: 0,
      reservedWaveThreat: 0,
      reservedWaveEntities: 0,
      reinforcementPackCursor: 0,
      state: 'opening',
    };
    this.waves.set(waveId, runtime);

    const leaderEnemyIds = opts.leaderEnemyIds?.length ? opts.leaderEnemyIds : [opts.leaderEnemyId];
    const gate = this.ctx.world.bugSpawns[(waveId * 7) % Math.max(1, this.ctx.world.bugSpawns.length)];
    for (let i = 0; i < leaderEnemyIds.length; i++) {
      const def = this.ctx.enemies.defById(leaderEnemyIds[i]);
      if (!def) continue;
      const angle = leaderEnemyIds.length <= 1 ? 0 : (i / leaderEnemyIds.length) * Math.PI * 2;
      const leader = this.ctx.enemies.spawnEnemyDef(def, gate.x + Math.sin(angle) * 3, gate.z + Math.cos(angle) * 3, {
        populationClass: opts.boss ? 'boss' : 'wave',
        waveId,
        leaderId: null,
        packInstanceId: 0,
        spawnAnchorId: null,
        purgeOnLeaderDeath: false,
      });
      if (leader) {
        leader.ownership = { ...leader.ownership!, leaderId: leader.id };
        runtime.leaderIds.push(leader.id);
        if (runtime.leaderId === 0) runtime.leaderId = leader.id;
        runtime.activeWaveEntities++;
        runtime.activeWaveThreat += enemyThreat(def);
      }
    }
    runtime.state = 'active';
    this.emitWaveEvent('waveOpened', runtime);
    return runtime;
  }

  /** Tag an already-spawned placeholder as the wave leader (adapter path). */
  designateLeader(waveId: number, enemyId: number): void {
    const runtime = this.waves.get(waveId);
    const enemy = this.ctx.state.enemies.find((e) => e.id === enemyId);
    if (!runtime || !enemy) return;
    enemy.ownership = {
      populationClass: runtime.definitionId.startsWith('boss') ? 'boss' : 'wave',
      waveId,
      leaderId: enemyId,
      packInstanceId: this.packInstanceCounter++,
      spawnAnchorId: null,
      purgeOnLeaderDeath: false,
    };
    runtime.leaderId = enemyId;
    runtime.leaderIds = [enemyId];
    runtime.defeatedLeaderIds = [];
    runtime.activeWaveEntities++;
    runtime.activeWaveThreat += enemyThreat(this.ctx.enemies.defFor(enemy));
  }

  /** Spawn a tagged cohort (opening or reinforcement pack). */
  spawnCohort(
    waveId: number,
    enemyId: string,
    count: number,
    _threatCost: number,
    positions?: Array<{ x: number; z: number }>,
    formationRole?: string,
  ): boolean {
    const runtime = this.waves.get(waveId);
    if (!runtime || runtime.state === 'leaderDead' || runtime.state === 'complete') return false;
    const def = this.ctx.enemies.defById(enemyId);
    if (!def) return false;
    const actualThreat = enemyThreat(def) * count;
    if (!this.hasSpawnCapacity(runtime, count, actualThreat)) return false;
    const leader = this.ctx.state.enemies.find((e) => e.id === runtime.leaderId);
    const anchor = leader ?? this.ctx.state.tank;
    const packInstanceId = this.packInstanceCounter++;
    for (let i = 0; i < count; i++) {
      const px = positions?.[i]?.x;
      const pz = positions?.[i]?.z;
      if (px === undefined || pz === undefined) {
        const angle = (i / Math.max(1, count)) * Math.PI * 2;
        this.ctx.enemies.spawnEnemyDef(def, anchor.x + Math.sin(angle) * (4 + i), anchor.z + Math.cos(angle) * (4 + i), {
          populationClass: 'wave',
          waveId,
          leaderId: runtime.leaderId,
          packInstanceId,
          spawnAnchorId: null,
          purgeOnLeaderDeath: true,
          formationRole,
        });
        continue;
      }
      this.ctx.enemies.spawnEnemyDef(def, px, pz, {
        populationClass: 'wave',
        waveId,
        leaderId: runtime.leaderId,
        packInstanceId,
        spawnAnchorId: null,
        purgeOnLeaderDeath: true,
        formationRole,
      });
    }
    runtime.activeWaveEntities += count;
    runtime.activeWaveThreat += actualThreat;
    return true;
  }

  /**
   * Atomic multi-entry pack spawn (second-pass): every authored entry spawns
   * or none does. Preflight covers wave state, every definition, total count,
   * and total threat before any enemy is created. Positions are consumed in
   * entry order when supplied; otherwise a deterministic ring is used.
   */
  spawnCohortPack(
    waveId: number,
    entries: Array<{ enemyId: string; count: number; formationRole?: string }>,
    _threatCost: number,
    positions?: Array<{ x: number; z: number }>,
  ): boolean {
    const runtime = this.waves.get(waveId);
    if (!runtime || runtime.state === 'leaderDead' || runtime.state === 'complete') return false;
    const totalCount = entries.reduce((sum, e) => sum + Math.max(0, e.count), 0);
    if (totalCount === 0) return false;
    let actualThreat = 0;
    for (const entry of entries) {
      if (entry.count < 0) return false;
      const def = this.ctx.enemies.defById(entry.enemyId);
      if (!def) return false;
      actualThreat += enemyThreat(def) * entry.count;
    }
    if (!this.hasSpawnCapacity(runtime, totalCount, actualThreat)) return false;
    const leader = this.ctx.state.enemies.find((e) => e.id === runtime.leaderId);
    const anchor = leader ?? this.ctx.state.tank;
    const packInstanceId = this.packInstanceCounter++;
    let positionIndex = 0;
    for (const entry of entries) {
      const def = this.ctx.enemies.defById(entry.enemyId)!;
      for (let i = 0; i < entry.count; i++) {
        const px = positions?.[positionIndex]?.x;
        const pz = positions?.[positionIndex]?.z;
        positionIndex++;
        if (px === undefined || pz === undefined) {
          const angle = (i / Math.max(1, entry.count)) * Math.PI * 2;
          this.ctx.enemies.spawnEnemyDef(def, anchor.x + Math.sin(angle) * (4 + i), anchor.z + Math.cos(angle) * (4 + i), {
            populationClass: 'wave',
            waveId,
            leaderId: runtime.leaderId,
            packInstanceId,
            spawnAnchorId: null,
            purgeOnLeaderDeath: true,
            formationRole: entry.formationRole,
          });
          continue;
        }
        this.ctx.enemies.spawnEnemyDef(def, px, pz, {
          populationClass: 'wave',
          waveId,
          leaderId: runtime.leaderId,
          packInstanceId,
          spawnAnchorId: null,
          purgeOnLeaderDeath: true,
          formationRole: entry.formationRole,
        });
      }
    }
    runtime.activeWaveEntities += totalCount;
    runtime.activeWaveThreat += actualThreat;
    return true;
  }

  /**
   * Reserve a complete pack before subgroup A. Active and global caps see
   * the reservation immediately; reinforcement reserve is spent exactly
   * once and may be partially refunded if a deferred subgroup cannot replan.
   */
  reserveCohortPack(
    waveId: number,
    entries: Array<{ enemyId: string; count: number; formationRole?: string }>,
    reinforcementThreatCost: number | null = null,
  ): number | null {
    const runtime = this.waves.get(waveId);
    if (!runtime || runtime.state === 'leaderDead' || runtime.state === 'complete') return null;
    const totalCount = entries.reduce((sum, entry) => sum + Math.max(0, entry.count), 0);
    if (totalCount <= 0) return null;
    let actualThreat = 0;
    for (const entry of entries) {
      if (entry.count < 0) return null;
      const def = this.ctx.enemies.defById(entry.enemyId);
      if (!def) return null;
      actualThreat += enemyThreat(def) * entry.count;
    }
    if (reinforcementThreatCost !== null && reinforcementThreatCost > runtime.reinforcementThreatRemaining) return null;
    if (!this.hasSpawnCapacity(runtime, totalCount, actualThreat)) return null;
    if (reinforcementThreatCost !== null) runtime.reinforcementThreatRemaining -= reinforcementThreatCost;
    runtime.reservedWaveEntities += totalCount;
    runtime.reservedWaveThreat += actualThreat;
    const reservationId = this.reservationCounter++;
    this.reservations.set(reservationId, {
      reservationId,
      waveId,
      packInstanceId: this.packInstanceCounter++,
      remainingEntities: totalCount,
      remainingThreat: actualThreat,
      reinforcement: reinforcementThreatCost !== null,
      remainingAuthoredCost: reinforcementThreatCost ?? 0,
    });
    if (reinforcementThreatCost !== null) this.emitWaveEvent('reinforcementSpawned', runtime);
    return reservationId;
  }

  spawnReservedCohortSubgroup(
    reservationId: number,
    entries: Array<{ enemyId: string; count: number; formationRole?: string }>,
    positions: Array<{ x: number; z: number }>,
    options: CohortSpawnOptions = {},
    authoredCost = 0,
  ): boolean {
    const reservation = this.reservations.get(reservationId);
    const runtime = reservation ? this.waves.get(reservation.waveId) : undefined;
    if (!reservation || !runtime || runtime.state === 'leaderDead' || runtime.state === 'complete') return false;
    const totalCount = entries.reduce((sum, entry) => sum + Math.max(0, entry.count), 0);
    if (totalCount <= 0 || totalCount > reservation.remainingEntities) return false;
    let actualThreat = 0;
    for (const entry of entries) {
      const def = this.ctx.enemies.defById(entry.enemyId);
      if (!def) return false;
      actualThreat += enemyThreat(def) * entry.count;
    }
    if (actualThreat > reservation.remainingThreat + 1e-6) return false;
    const leaderId = options.leaderId ?? runtime.leaderId;
    const leader = this.ctx.state.enemies.find((enemy) => enemy.id === leaderId);
    if (options.leaderId !== undefined && (!leader || !leader.alive)) return false;
    const anchor = leader ?? this.ctx.state.tank;
    let positionIndex = 0;
    for (const entry of entries) {
      const def = this.ctx.enemies.defById(entry.enemyId)!;
      for (let i = 0; i < entry.count; i++) {
        const position = positions[positionIndex++];
        const angle = (i / Math.max(1, entry.count)) * Math.PI * 2;
        this.ctx.enemies.spawnEnemyDef(
          def,
          position?.x ?? anchor.x + Math.sin(angle) * (4 + i),
          position?.z ?? anchor.z + Math.cos(angle) * (4 + i),
          {
            populationClass: 'wave',
            waveId: runtime.waveId,
            leaderId,
            packInstanceId: reservation.packInstanceId,
            spawnAnchorId: null,
            purgeOnLeaderDeath: true,
            formationRole: entry.formationRole,
            ...(options.maintenanceSummon
              ? { maintenanceSummon: true, summonedByLeaderId: leaderId }
              : {}),
            ...(options.rewardSuppressed ? { rewardSuppressed: true } : {}),
          },
        );
      }
    }
    reservation.remainingEntities -= totalCount;
    reservation.remainingThreat = Math.max(0, reservation.remainingThreat - actualThreat);
    runtime.reservedWaveEntities = Math.max(0, runtime.reservedWaveEntities - totalCount);
    runtime.reservedWaveThreat = Math.max(0, runtime.reservedWaveThreat - actualThreat);
    runtime.activeWaveEntities += totalCount;
    runtime.activeWaveThreat += actualThreat;
    if (reservation.reinforcement) {
      reservation.remainingAuthoredCost = Math.max(0, reservation.remainingAuthoredCost - Math.max(0, authoredCost));
    }
    if (reservation.remainingEntities === 0) this.reservations.delete(reservationId);
    return true;
  }

  refundReservedCohortSubgroup(
    reservationId: number,
    entries: Array<{ enemyId: string; count: number; formationRole?: string }>,
    authoredCost: number,
  ): boolean {
    const reservation = this.reservations.get(reservationId);
    const runtime = reservation ? this.waves.get(reservation.waveId) : undefined;
    if (!reservation || !runtime) return false;
    const count = entries.reduce((sum, entry) => sum + Math.max(0, entry.count), 0);
    let threat = 0;
    for (const entry of entries) {
      const def = this.ctx.enemies.defById(entry.enemyId);
      if (def) threat += enemyThreat(def) * entry.count;
    }
    reservation.remainingEntities = Math.max(0, reservation.remainingEntities - count);
    reservation.remainingThreat = Math.max(0, reservation.remainingThreat - threat);
    runtime.reservedWaveEntities = Math.max(0, runtime.reservedWaveEntities - count);
    runtime.reservedWaveThreat = Math.max(0, runtime.reservedWaveThreat - threat);
    if (reservation.reinforcement) {
      const refund = Math.min(Math.max(0, authoredCost), reservation.remainingAuthoredCost);
      runtime.reinforcementThreatRemaining += refund;
      reservation.remainingAuthoredCost -= refund;
    }
    if (reservation.remainingEntities === 0) this.reservations.delete(reservationId);
    return true;
  }

  reservationActive(reservationId: number): boolean {
    return this.reservations.has(reservationId);
  }

  /** Spend from the finite reinforcement reserve (no spending after death). */
  spendReinforcement(
    waveId: number,
    threatCost: number,
    packEnemyId: string,
    count: number,
    formationRole?: string,
  ): boolean {
    const runtime = this.waves.get(waveId);
    if (!runtime || runtime.state === 'leaderDead' || runtime.state === 'complete') return false;
    if (threatCost > runtime.reinforcementThreatRemaining) return false;
    const ok = this.spawnCohort(waveId, packEnemyId, count, threatCost, undefined, formationRole);
    if (!ok) return false;
    runtime.reinforcementThreatRemaining -= threatCost;
    this.emitWaveEvent('reinforcementSpawned', runtime);
    return true;
  }

  /**
   * Atomic reinforcement pack spend: preflight the whole pack (reserve,
   * entity cap, definitions, wave state), then spawn all entries or none.
   */
  spendReinforcementPack(
    waveId: number,
    threatCost: number,
    entries: Array<{ enemyId: string; count: number; formationRole?: string }>,
  ): boolean {
    const runtime = this.waves.get(waveId);
    if (!runtime || runtime.state === 'leaderDead' || runtime.state === 'complete') return false;
    if (threatCost > runtime.reinforcementThreatRemaining) return false;
    const ok = this.spawnCohortPack(waveId, entries, threatCost);
    if (!ok) return false;
    runtime.reinforcementThreatRemaining -= threatCost;
    this.emitWaveEvent('reinforcementSpawned', runtime);
    return true;
  }

  private onKilled(payload: EntityKilledEvent): void {
    const enemy = this.ctx.state.enemies.find((candidate) => candidate.id === payload.enemy.id);
    const waveId = enemy?.ownership?.waveId;
    if (waveId === null || waveId === undefined) return;
    const runtime = this.waves.get(waveId);
    if (!runtime || runtime.state === 'complete') return;
    if (!this.accountedDeathIds.has(payload.enemy.id)) {
      this.accountedDeathIds.add(payload.enemy.id);
      runtime.activeWaveEntities = Math.max(0, runtime.activeWaveEntities - 1);
      runtime.activeWaveThreat = Math.max(0, runtime.activeWaveThreat - enemyThreat(this.ctx.enemies.defFor(enemy!)));
    }
    if (runtime.leaderIds.includes(payload.enemy.id)) {
      if (!runtime.defeatedLeaderIds.includes(payload.enemy.id)) {
        runtime.defeatedLeaderIds.push(payload.enemy.id);
        this.purgeMaintenanceForLeader(runtime, payload.enemy.id);
      }
      if (runtime.defeatedLeaderIds.length === runtime.leaderIds.length) this.finishWave(runtime);
    }
  }

  private purgeMaintenanceForLeader(runtime: WaveRuntime, leaderId: number): void {
    const sectors = this.ctx.hordeSectors?.purgeLeaderDetailed(leaderId) ?? { entities: 0, threat: 0 };
    const removed = this.ctx.enemies.purge((enemy) =>
      enemy.ownership?.maintenanceSummon === true && enemy.ownership.summonedByLeaderId === leaderId,
    );
    const removedThreat = removed.reduce(
      (sum, enemy) => sum + enemyThreat(this.ctx.enemies.defFor(enemy)),
      sectors.threat,
    );
    runtime.activeWaveEntities = Math.max(0, runtime.activeWaveEntities - removed.length - sectors.entities);
    runtime.activeWaveThreat = Math.max(0, runtime.activeWaveThreat - removedThreat);
  }

  private finishWave(runtime: WaveRuntime): void {
    runtime.state = 'leaderDead';
    this.cancelReservations(runtime.waveId);
    const removed = this.purge(runtime.waveId);
    runtime.state = 'complete';
    this.emitWaveEvent('wavePurged', runtime, removed);
    if (!this.rewardFired.has(runtime.waveId)) {
      this.rewardFired.add(runtime.waveId);
      pushEvent(this.ctx, 'score', this.ctx.state.tank.x, this.ctx.state.tank.y + 2, this.ctx.state.tank.z, {
        value: 0,
        label: `WAVE ${runtime.waveId} CLEARED`,
      });
    }
    this.onLeaderKilled(runtime.waveId);
  }

  /** Remove only this wave's purgeable cohort (ambient untouched, no hooks). */
  purge(waveId: number): number {
    const sectors = this.ctx.hordeSectors?.purgeWaveDetailed(waveId) ?? { entities: 0, threat: 0 };
    const removed = this.ctx.enemies.purge((e) => {
      const o = e.ownership;
      return o !== undefined && o.purgeOnLeaderDeath === true && o.waveId === waveId;
    });
    const runtime = this.waves.get(waveId);
    if (runtime) {
      const unaccounted = removed.filter((enemy) => !this.accountedDeathIds.has(enemy.id));
      const removedThreat = unaccounted.reduce(
        (sum, enemy) => sum + enemyThreat(this.ctx.enemies.defFor(enemy)),
        sectors.threat,
      );
      runtime.activeWaveEntities = Math.max(0, runtime.activeWaveEntities - unaccounted.length - sectors.entities);
      runtime.activeWaveThreat = Math.max(0, runtime.activeWaveThreat - removedThreat);
    }
    return removed.length + sectors.entities;
  }

  /** Explicit test/controller purge path with the same reward suppression. */
  purgeWave(waveId: number): number {
    const runtime = this.waves.get(waveId);
    if (!runtime) return 0;
    this.cancelReservations(waveId);
    return this.purge(waveId);
  }

  private emitWaveEvent(type: string, runtime: WaveRuntime, count = 0): void {
    this.ctx.eventBus.emit('waveEvent', { type, waveId: runtime.waveId, leaderId: runtime.leaderId, count });
  }

  private hasSpawnCapacity(runtime: WaveRuntime, entities: number, threat: number): boolean {
    if (runtime.activeWaveEntities + runtime.reservedWaveEntities + entities > runtime.maximumActiveWaveEntities) return false;
    if (runtime.activeWaveThreat + runtime.reservedWaveThreat + threat > runtime.maximumActiveWaveThreat) return false;
    const limits = this.ctx.horde?.resolved.limits;
    if (!limits) return true;
    const population = new PopulationManager(this.ctx);
    const tally = population.refresh();
    const waveEntities = tally.byClass.wave.entities + tally.byClass.boss.entities;
    const waveThreat = tally.byClass.wave.threat + tally.byClass.boss.threat;
    if (waveEntities + entities > limits.waveSoftEntityCap) return false;
    if (waveThreat + threat > limits.waveSoftThreatCap) return false;
    return population.hardCapacity(limits, tally, entities + runtime.reservedWaveEntities, threat + runtime.reservedWaveThreat);
  }

  private cancelReservations(waveId: number): void {
    const runtime = this.waves.get(waveId);
    for (const [reservationId, reservation] of [...this.reservations]) {
      if (reservation.waveId !== waveId) continue;
      this.reservations.delete(reservationId);
    }
    if (runtime) {
      runtime.reservedWaveEntities = 0;
      runtime.reservedWaveThreat = 0;
    }
  }
}
