import { canTraverseGroundStep } from '../mapgen/terrainTraversal';
import type { SystemContext } from '../sim/systems/systemContext';
import type { EnemyDefinition } from '../content/schemas/enemy';
import type { EnemyState } from '../types';
import type { DamageSource } from '../damage/damageTypes';

/** Shared default response for enemies without an explicit knockback block. */
const DEFAULT_KNOCKBACK = {
  immovable: false,
  horizontalResistance: 0.5,
  verticalResistance: 0.5,
  groundDrag: 4.0,
  airDrag: 0.8,
  gravityScale: 1.0,
};

/**
 * Authoritative enemy impulse motion (arcade knockback). Owns impulse
 * velocity, ground/air drag, gravity, airborne state, upward cliff guard,
 * downward cliff falls, landing, source attribution, and arena bounds.
 * Combat 05 removed fall damage: cliff falls and landings never damage HP.
 * Normal behavior primitives compose around it; `movement.integrate`
 * skips position while an enemy is strongly airborne.
 */
export class EnemyImpulseController {
  constructor(private readonly ctx: SystemContext) {}

  isAirborne(e: EnemyState): boolean {
    return e.impulseGrounded === false;
  }

  /** Apply a radial impulse to one enemy (resistance-scaled). */
  apply(
    e: EnemyState,
    def: EnemyDefinition,
    dirX: number,
    dirZ: number,
    horizontal: number,
    vertical: number,
    source: DamageSource,
  ): void {
    const kb = def.knockback ?? DEFAULT_KNOCKBACK;
    if (kb.immovable) return;
    e.impulseVx = (e.impulseVx ?? 0) + dirX * horizontal * kb.horizontalResistance;
    e.impulseVz = (e.impulseVz ?? 0) + dirZ * horizontal * kb.horizontalResistance;
    e.impulseVy = Math.max(e.impulseVy ?? 0, vertical * kb.verticalResistance);
    if (e.impulseVy > 0) e.impulseGrounded = false;
    e.lastImpulseSource = source;
    e.lastImpulseT = this.ctx.state.time;
  }

  /** Integrate impulse motion for one fixed step. */
  update(e: EnemyState, def: EnemyDefinition, dt: number): void {
    const kb = def.knockback ?? DEFAULT_KNOCKBACK;
    if (kb.immovable) {
      e.impulseVx = 0;
      e.impulseVy = 0;
      e.impulseVz = 0;
      e.impulseGrounded = true;
      return;
    }
    const vx = e.impulseVx ?? 0;
    const vy = e.impulseVy ?? 0;
    const vz = e.impulseVz ?? 0;
    const moving = Math.hypot(vx, vz) >= 0.05 || vy > 0;
    if (!moving && e.impulseGrounded !== false) return;

    if (e.impulseGrounded === false) {
      // Airborne: air drag + gravity, integrate with substeps. Upward cliff
      // crossings are blocked; falling down cliffs is allowed.
      const drag = Math.exp(-kb.airDrag * dt);
      const ivx = vx * drag;
      const ivz = vz * drag;
      const ivy = vy - this.ctx.rules.matchConfig.gravity * kb.gravityScale * dt;
      const steps = 3;
      const sub = dt / steps;
      let nx = e.x;
      let ny = e.y;
      let nz = e.z;
      let blocked = false;
      for (let i = 0; i < steps; i++) {
        const tx = nx + ivx * sub;
        const tz = nz + ivz * sub;
        if (this.ctx.world.queryTerrainTransition) {
          const tr = this.ctx.world.queryTerrainTransition(nx, nz, tx, tz);
          if (tr && !canTraverseGroundStep(tr)) {
            blocked = true;
            break;
          }
        }
        nx = tx;
        nz = tz;
        ny += ivy * sub;
      }
      const groundY = this.ctx.world.groundHeightAt(nx, nz);
      if (ny <= groundY) {
        ny = groundY;
        e.impulseVy = 0;
        e.impulseGrounded = true;
      } else {
        e.impulseVy = ivy;
        e.impulseGrounded = false;
      }
      e.x = nx;
      e.y = ny;
      e.z = nz;
      e.impulseVx = blocked ? 0 : ivx;
      e.impulseVz = blocked ? 0 : ivz;
      const col = this.ctx.world.resolveCircle(e.x, e.z, this.ctx.enemies.radiusFor(e), e.y);
      e.x = col.x;
      e.z = col.z;
      return;
    }

    // Grounded sliding: drag + horizontal integration with the same cliff
    // upward guard.
    const drag = Math.exp(-kb.groundDrag * dt);
    const ivx = vx * drag;
    const ivz = vz * drag;
    const nx = e.x + ivx * dt;
    const nz = e.z + ivz * dt;
    let ok = true;
    if (this.ctx.world.queryTerrainTransition) {
      const tr = this.ctx.world.queryTerrainTransition(e.x, e.z, nx, nz);
      if (tr && !canTraverseGroundStep(tr)) ok = false;
    }
    if (ok) {
      e.x = nx;
      e.z = nz;
      e.y = this.ctx.world.groundHeightAt(e.x, e.z);
      const col = this.ctx.world.resolveCircle(e.x, e.z, this.ctx.enemies.radiusFor(e), e.y);
      e.x = col.x;
      e.z = col.z;
    } else {
      e.impulseVx = 0;
      e.impulseVz = 0;
      return;
    }
    if (Math.hypot(ivx, ivz) < 0.05) {
      e.impulseVx = 0;
      e.impulseVz = 0;
    } else {
      e.impulseVx = ivx;
      e.impulseVz = ivz;
    }
  }
}
