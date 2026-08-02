import { clamp } from '../math';
import { pushEvent, type SystemContext } from '../sim/systems/systemContext';

export interface RecoilAppliedEvent {
  impulse: number;
  braced: boolean;
  weaponId?: string;
}

/**
 * Reusable authoritative recoil effect. Applies the exact legacy math
 * (brace multiplier, spin/roll randomness, air lift) and emits both the wire
 * `recoil` event and a semantic `recoil.applied` bus event.
 */
export class RecoilEffect {
  constructor(private readonly ctx: SystemContext) {}

  apply(dirX: number, dirZ: number, impulse: number, spin: number, weaponId?: string): void {
    const t = this.ctx.state.tank;
    const bracing = t.brace;
    const mult = bracing ? this.ctx.rules.config.tank.braceRecoilMult : 1;
    t.vx += dirX * impulse * mult;
    t.vz += dirZ * impulse * mult;
    t.yawVel += (Math.random() - 0.5) * 2 * spin * mult;
    if (!t.grounded) {
      t.vy += 1.8 * mult * clamp(impulse / 7, 0, 1.4);
    }
    t.roll = clamp(t.roll + (Math.random() - 0.5) * 0.35 * mult, -1.4, 1.4);
    pushEvent(this.ctx, 'recoil', t.x, t.y, t.z, { value: impulse * mult });
    this.ctx.eventBus.emit('recoil.applied', { impulse: impulse * mult, braced: bracing, weaponId });
  }
}
