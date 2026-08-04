import { pushEvent, type SystemContext } from '../sim/systems/systemContext';
import type { TankImpulseSpec } from './tankImpulseSystem';

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

  /**
   * Weapon-facing adapter: builds a pitch-aware 3D impulse spec and
   * delegates to TankImpulseSystem (the sole impulse entry point). The old
   * fixed airborne lift is gone — vertical recoil comes from the shot
   * direction × verticalScale.
   */
  apply(spec: TankImpulseSpec): void {
    const t = this.ctx.state.tank;
    const actionSeq = spec.sourceActionSeq ?? this.ctx.pendingActionSeq;
    this.ctx.pendingActionSeq = undefined;
    this.ctx.impulses.apply({ ...spec, sourceActionSeq: actionSeq });
    pushEvent(this.ctx, 'recoil', t.x, t.y, t.z, { value: spec.magnitude });
    this.ctx.eventBus.emit('recoil.applied', { impulse: spec.magnitude, braced: false, weaponId: spec.sourceId });
  }
}
