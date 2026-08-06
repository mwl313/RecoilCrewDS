import { angleLerp, lerp } from '../../shared/math';
import type { SnapshotEnvelope } from '../../shared/net/interpolation';
import type {
  EnemyState,
  MatchState,
  PickupState,
  ShellState,
  TankState,
  TruckState,
  XpShardState,
} from '../../shared/types';

/**
 * Remote-frame contract. The renderer consumes reusable records instead of
 * a freshly allocated MatchState every frame. `discrete` is a reference to
 * the latest snapshot (never mutated); continuous fields are interpolated
 * into pooled records.
 */
export interface RemoteFrame {
  enemies: EnemyState[];
  pickups: PickupState[];
  xpShards: XpShardState[];
  shells: ShellState[];
  truck: TruckState;
  turret: { yaw: number; pitch: number };
  tank: TankState;
  discrete: MatchState;
  interpolated: boolean;
}

/**
 * Allocation-free remote entity interpolator (Milestone 6). Endpoint ID
 * lookups are rebuilt only when the snapshot pair changes; per-frame fills
 * write into pooled records. No complete MatchState is built per frame.
 */
export class RemoteEntityInterpolator {
  private prev: MatchState | null = null;
  private current: MatchState | null = null;
  private alpha = 0;
  private prevSeq = -1;
  private currentSeq = -1;
  private readonly enemyById = new Map<number, EnemyState>();
  private readonly shellById = new Map<number, ShellState>();
  private readonly pooledEnemies = new Map<number, EnemyState>();
  private readonly pooledShells = new Map<number, ShellState>();
  private readonly pooledTruck: TruckState = {
    active: false, x: 0, y: 0, z: 0, yaw: 0, hp: 0, waypoint: 0, escaped: false, sirenT: 0,
  };

  setEndpoints(a: SnapshotEnvelope<MatchState>, b: SnapshotEnvelope<MatchState>, alpha: number): void {
    if (a.seq !== this.prevSeq || b.seq !== this.currentSeq) {
      this.prevSeq = a.seq;
      this.currentSeq = b.seq;
      this.enemyById.clear();
      this.shellById.clear();
      for (const e of a.state.enemies) this.enemyById.set(e.id, e);
      for (const s of a.state.shells) this.shellById.set(s.id, s);
      this.ensurePools(b.state);
    }
    this.prev = a.state;
    this.current = b.state;
    this.alpha = alpha;
  }

  private ensurePools(b: MatchState): void {
    for (const e of b.enemies) {
      if (!this.pooledEnemies.has(e.id)) {
        this.pooledEnemies.set(e.id, { ...e });
      }
    }
    for (const s of b.shells) {
      if (!this.pooledShells.has(s.id)) {
        this.pooledShells.set(s.id, { ...s });
      }
    }
  }

  /** Fill a reusable remote frame for the current render time. */
  fill(frame: RemoteFrame): void {
    const b = this.current;
    if (!b) return;
    const a = this.prev ?? b;
    const alpha = this.alpha;

    frame.enemies.length = 0;
    for (const e of b.enemies) {
      const prev = this.enemyById.get(e.id);
      const out = this.pooledEnemies.get(e.id) ?? { ...e };
      Object.assign(out, e); // discrete fields (alive/state/flash/telegraph)
      if (prev && prev.alive && e.alive) {
        out.x = lerp(prev.x, e.x, alpha);
        out.y = lerp(prev.y, e.y, alpha);
        out.z = lerp(prev.z, e.z, alpha);
        out.yaw = angleLerp(prev.yaw, e.yaw, alpha);
        out.aimYaw = angleLerp(prev.aimYaw, e.aimYaw, alpha);
      } else {
        out.x = e.x;
        out.y = e.y;
        out.z = e.z;
        out.yaw = e.yaw;
        out.aimYaw = e.aimYaw;
      }
      frame.enemies.push(out);
    }

    frame.pickups = b.pickups; // discrete positions (bob is client-side)
    frame.xpShards = b.xpShards; // discrete positions (presentation owns bob)
    frame.shells.length = 0;
    for (const s of b.shells) {
      const prev = this.shellById.get(s.id);
      const out = this.pooledShells.get(s.id) ?? { ...s };
      Object.assign(out, s);
      out.x = prev ? lerp(prev.x, s.x, alpha) : s.x;
      out.y = prev ? lerp(prev.y, s.y, alpha) : s.y;
      out.z = prev ? lerp(prev.z, s.z, alpha) : s.z;
      frame.shells.push(out);
    }

    const truck = this.pooledTruck;
    Object.assign(truck, b.truck);
    if (a.truck.active && b.truck.active) {
      truck.x = lerp(a.truck.x, b.truck.x, alpha);
      truck.y = lerp(a.truck.y, b.truck.y, alpha);
      truck.z = lerp(a.truck.z, b.truck.z, alpha);
      truck.yaw = angleLerp(a.truck.yaw, b.truck.yaw, alpha);
    }
    frame.truck = truck;
    frame.turret.yaw = angleLerp(a.turret.yaw, b.turret.yaw, alpha);
    frame.turret.pitch = lerp(a.turret.pitch, b.turret.pitch, alpha);
    frame.tank = b.tank;
    frame.discrete = b;
    frame.interpolated = true;
  }

  /** Single Player/discrete path: frame directly from a state without lerp. */
  fillFromDiscrete(frame: RemoteFrame, state: MatchState): void {
    frame.enemies = state.enemies;
    frame.pickups = state.pickups;
    frame.xpShards = state.xpShards;
    frame.shells = state.shells;
    frame.truck = state.truck;
    frame.turret.yaw = state.turret.yaw;
    frame.turret.pitch = state.turret.pitch;
    frame.tank = state.tank;
    frame.discrete = state;
    frame.interpolated = false;
  }

  reset(): void {
    this.prev = null;
    this.current = null;
    this.prevSeq = -1;
    this.currentSeq = -1;
    this.enemyById.clear();
    this.shellById.clear();
    this.pooledEnemies.clear();
    this.pooledShells.clear();
  }
}
