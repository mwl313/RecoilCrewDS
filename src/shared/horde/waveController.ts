import type { EntityKilledEvent } from '../damage/damageTypes';
import { pushEvent, type SystemContext } from '../sim/systems/systemContext';

export interface WaveOpeningOptions {
  definitionId: string;
  leaderEnemyId: string;
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
  initialThreatRemaining: number;
  reinforcementThreatRemaining: number;
  activeWaveThreat: number;
  activeWaveEntities: number;
  reinforcementAccumulator: number;
  state: 'opening' | 'active' | 'leaderDead' | 'purging' | 'complete';
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
  private packInstanceCounter = 0;

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
      initialThreatRemaining: opts.openingThreat,
      reinforcementThreatRemaining: opts.reinforcementThreat,
      activeWaveThreat: 0,
      activeWaveEntities: 0,
      reinforcementAccumulator: 0,
      state: 'opening',
    };
    this.waves.set(waveId, runtime);

    const def = this.ctx.enemies.defById(opts.leaderEnemyId);
    if (def) {
      const gate = this.ctx.world.bugSpawns[(waveId * 7) % Math.max(1, this.ctx.world.bugSpawns.length)];
      const leader = this.ctx.enemies.spawnEnemyDef(def, gate.x, gate.z, {
        populationClass: opts.boss ? 'boss' : 'wave',
        waveId,
        leaderId: null,
        packInstanceId: 0,
        spawnAnchorId: null,
        purgeOnLeaderDeath: false,
      });
      if (leader) {
        leader.ownership = { ...leader.ownership!, leaderId: leader.id };
        runtime.leaderId = leader.id;
        runtime.activeWaveThreat += opts.openingThreat;
        runtime.activeWaveEntities++;
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
  }

  /** Spawn a tagged cohort (opening or reinforcement pack). */
  spawnCohort(waveId: number, enemyId: string, count: number, threatCost: number): boolean {
    const runtime = this.waves.get(waveId);
    if (!runtime || runtime.state === 'leaderDead' || runtime.state === 'complete') return false;
    const def = this.ctx.enemies.defById(enemyId);
    if (!def) return false;
    const leader = this.ctx.state.enemies.find((e) => e.id === runtime.leaderId);
    const anchor = leader ?? this.ctx.state.tank;
    const packInstanceId = this.packInstanceCounter++;
    for (let i = 0; i < count; i++) {
      const angle = (i / Math.max(1, count)) * Math.PI * 2;
      const x = anchor.x + Math.sin(angle) * (4 + i);
      const z = anchor.z + Math.cos(angle) * (4 + i);
      this.ctx.enemies.spawnEnemyDef(def, x, z, {
        populationClass: 'wave',
        waveId,
        leaderId: runtime.leaderId,
        packInstanceId,
        spawnAnchorId: null,
        purgeOnLeaderDeath: true,
      });
    }
    runtime.activeWaveEntities += count;
    runtime.activeWaveThreat += threatCost;
    return true;
  }

  /** Spend from the finite reinforcement reserve (no spending after death). */
  spendReinforcement(waveId: number, threatCost: number, packEnemyId: string, count: number): boolean {
    const runtime = this.waves.get(waveId);
    if (!runtime || runtime.state === 'leaderDead' || runtime.state === 'complete') return false;
    if (threatCost > runtime.reinforcementThreatRemaining) return false;
    const cap = this.ctx.horde?.resolved.limits.waveSoftEntityCap ?? 200;
    if (runtime.activeWaveEntities + count > cap) return false;
    const ok = this.spawnCohort(waveId, packEnemyId, count, threatCost);
    if (!ok) return false;
    runtime.reinforcementThreatRemaining -= threatCost;
    this.emitWaveEvent('reinforcementSpawned', runtime);
    return true;
  }

  private onKilled(payload: EntityKilledEvent): void {
    for (const runtime of [...this.waves.values()]) {
      if (runtime.leaderId === payload.enemy.id && runtime.state !== 'complete') {
        this.finishWave(runtime);
      }
    }
  }

  private finishWave(runtime: WaveRuntime): void {
    runtime.state = 'leaderDead';
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
    const removed = this.ctx.enemies.purge((e) => {
      const o = e.ownership;
      return o !== undefined && o.purgeOnLeaderDeath === true && o.waveId === waveId;
    });
    const runtime = this.waves.get(waveId);
    if (runtime) {
      runtime.activeWaveEntities = Math.max(0, runtime.activeWaveEntities - removed.length);
    }
    return removed.length;
  }

  /** Explicit test/controller purge path with the same reward suppression. */
  purgeWave(waveId: number): number {
    const runtime = this.waves.get(waveId);
    if (!runtime) return 0;
    return this.purge(waveId);
  }

  private emitWaveEvent(type: string, runtime: WaveRuntime, count = 0): void {
    this.ctx.eventBus.emit('waveEvent', { type, waveId: runtime.waveId, leaderId: runtime.leaderId, count });
  }
}
