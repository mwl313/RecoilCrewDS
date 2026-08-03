import { clamp } from '../math';
import { pushEvent, type SystemContext } from '../sim/systems/systemContext';

export interface RecoilAppliedEvent {
  impulse: number;
  braced: boolean;
  weaponId?: string;
}

/**
 * Reusable authoritative recoil effect. Applies the exact legacy math
 * (spin/roll randomness, air lift) and emits both the wire `recoil` event
 * and a semantic `recoil.applied` bus event. Recoil is no longer reducible
 * by a Driver brace input.
 */
export class RecoilEffect {
  constructor(private readonly ctx: SystemContext) {}

  apply(dirX: number, dirZ: number, impulse: number, spin: number, weaponId?: string): void {
    const t = this.ctx.state.tank;
    t.vx += dirX * impulse;
    t.vz += dirZ * impulse;
    t.yawVel += (Math.random() - 0.5) * 2 * spin;
    if (!t.grounded) {
      t.vy += 1.8 * clamp(impulse / 7, 0, 1.4);
    }
    t.roll = clamp(t.roll + (Math.random() - 0.5) * 0.35, -1.4, 1.4);
    pushEvent(this.ctx, 'recoil', t.x, t.y, t.z, { value: impulse });
    this.ctx.eventBus.emit('recoil.applied', { impulse, braced: false, weaponId });
  }
}
