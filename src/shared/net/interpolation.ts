import { angleLerp, clamp, lerp } from '../math';
import type { MovementRulesBlock } from '../stats/rulesRevision';
import type { EnemyState, MatchState, ShellState, TruckState } from '../types';

export interface SnapshotEnvelope<T> {
  seq: number;
  serverTime: number;
  state: T;
  lastProcessedDriverInputSeq: number;
  lastProcessedGunnerInputSeq: number;
  rulesRevision?: number;
  movementRulesRevision?: number;
  movement?: MovementRulesBlock;
}

export interface SnapshotPair<T> {
  a: SnapshotEnvelope<T>;
  b: SnapshotEnvelope<T>;
  alpha: number;
}

/**
 * Ordered snapshot buffer. Rejects out-of-order and repeated snapshots and
 * returns the pair that actually surrounds render time.
 */
export class SnapshotBuffer<T> {
  private entries: SnapshotEnvelope<T>[] = [];
  latestSeq = 0;
  private maxEntries = 12;

  push(entry: SnapshotEnvelope<T>): void {
    if (entry.seq <= this.latestSeq) return; // out-of-order / duplicate
    this.latestSeq = entry.seq;
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
  }

  clear(): void {
    this.entries = [];
    this.latestSeq = 0;
  }

  get length(): number {
    return this.entries.length;
  }

  /** Pair A.serverTime <= renderTime <= B.serverTime with bounded fallback. */
  pick(renderTime: number): SnapshotPair<T> | null {
    const n = this.entries.length;
    if (n === 0) return null;
    const first = this.entries[0];
    if (renderTime < first.serverTime) {
      return { a: first, b: first, alpha: 0 };
    }
    let a = first;
    let b: SnapshotEnvelope<T> | null = null;
    for (let i = 1; i < n; i++) {
      const e = this.entries[i];
      if (e.serverTime <= renderTime) {
        a = e;
      } else {
        b = e;
        break;
      }
    }
    if (!b) {
      // No future snapshot yet: bounded fallback (hold latest, alpha = 1).
      return { a, b: a, alpha: 1 };
    }
    const span = Math.max(0.001, b.serverTime - a.serverTime);
    return { a, b, alpha: clamp((renderTime - a.serverTime) / span, 0, 1) };
  }

  latest(): SnapshotEnvelope<T> | null {
    return this.entries.length > 0 ? this.entries[this.entries.length - 1] : null;
  }
}

function lerpEnemy(a: EnemyState, b: EnemyState, alpha: number): EnemyState {
  if (!a.alive || !b.alive) return b;
  return {
    ...b,
    x: lerp(a.x, b.x, alpha),
    y: lerp(a.y, b.y, alpha),
    z: lerp(a.z, b.z, alpha),
    yaw: angleLerp(a.yaw, b.yaw, alpha),
    aimYaw: angleLerp(a.aimYaw, b.aimYaw, alpha),
  };
}

function lerpTruck(a: TruckState, b: TruckState, alpha: number): TruckState {
  if (!a.active || !b.active) return b;
  return {
    ...b,
    x: lerp(a.x, b.x, alpha),
    y: lerp(a.y, b.y, alpha),
    z: lerp(a.z, b.z, alpha),
    yaw: angleLerp(a.yaw, b.yaw, alpha),
  };
}

/**
 * Interpolate continuous entity state between two snapshots. Discrete state
 * (score, integrity, pickups, phase, cooldowns, events) comes from B.
 */
export function interpolateMatchState(a: MatchState, b: MatchState, alpha: number): MatchState {
  const t = b.tank;
  const ta = a.tank;
  const aById = new Map(a.enemies.map((e) => [e.id, e]));
  const enemies = b.enemies.map((e) => {
    const prev = aById.get(e.id);
    return prev ? lerpEnemy(prev, e, alpha) : e;
  });
  const aShells = new Map(a.shells.map((s) => [s.id, s]));
  const shells: ShellState[] = b.shells.map((s) => {
    const prev = aShells.get(s.id);
    return prev
      ? { ...s, x: lerp(prev.x, s.x, alpha), y: lerp(prev.y, s.y, alpha), z: lerp(prev.z, s.z, alpha) }
      : s;
  });
  return {
    ...b,
    tank: {
      ...t,
      x: lerp(ta.x, t.x, alpha),
      y: lerp(ta.y, t.y, alpha),
      z: lerp(ta.z, t.z, alpha),
      vx: lerp(ta.vx, t.vx, alpha),
      vy: lerp(ta.vy, t.vy, alpha),
      vz: lerp(ta.vz, t.vz, alpha),
      yaw: angleLerp(ta.yaw, t.yaw, alpha),
      pitch: lerp(ta.pitch, t.pitch, alpha),
      roll: lerp(ta.roll, t.roll, alpha),
    },
    turret: {
      ...b.turret,
      yaw: angleLerp(a.turret.yaw, b.turret.yaw, alpha),
      pitch: lerp(a.turret.pitch, b.turret.pitch, alpha),
    },
    enemies,
    shells,
    truck: lerpTruck(a.truck, b.truck, alpha),
  };
}
