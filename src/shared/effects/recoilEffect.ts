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

  apply(dirX: number, dirZ: number, impulse: number, spin: number, weaponId?: string, sourceActionSeq?: number): void {
    const t = this.ctx.state.tank;
    const actionSeq = sourceActionSeq ?? this.ctx.pendingActionSeq;
    this.ctx.pendingActionSeq = undefined;
    // Compute the exact deltas and let TankImpulseSystem apply them once
    // (sequenced + wire event) so clients can predict/replay recoil.
    this.ctx.impulses.apply({
      deltaVx: dirX * impulse,
      deltaVy: t.grounded ? 0 : 1.8 * clamp(impulse / 7, 0, 1.4),
      deltaVz: dirZ * impulse,
      deltaYawVel: (Math.random() - 0.5) * 2 * spin,
      deltaRoll: (Math.random() - 0.5) * 0.35,
      source: 'recoil',
      sourceActionSeq: actionSeq,
    });
    pushEvent(this.ctx, 'recoil', t.x, t.y, t.z, { value: impulse });
    this.ctx.eventBus.emit('recoil.applied', { impulse, braced: false, weaponId });
  }
}
