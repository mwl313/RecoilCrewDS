import { recordOp, type NetcodeOpState } from '../sim/opLog';
import type { SystemContext } from '../sim/systems/systemContext';

export type TankImpulseSource = 'recoil' | 'cannon' | 'mg' | 'external';

/**
 * Typed wire payload for an exact tank impulse. Clients apply this once
 * locally and replay it on reconcile using `opSeq`; they never re-derive
 * recoil from the snapshot.
 */
export interface TankImpulseWire {
  impulseSeq: number;
  opSeq: number;
  simulationTick: number;
  source: TankImpulseSource;
  sourceId: string;
  kind: string;
  sourceActionSeq?: number;
  deltaVx: number;
  deltaVy: number;
  deltaVz: number;
  deltaYawVel: number;
  deltaRoll: number;
}

/**
 * Authoritative impulse spec (arcade movement): a 3D direction, magnitude,
 * vertical scale, yaw/roll impulses, optional launch threshold and
 * horizontal speed cap. The system normalizes the direction, computes the
 * exact applied deltas, applies them once, and emits the typed wire event.
 */
export interface TankImpulseSpec {
  sourceId: string;
  kind: string;
  direction: { x: number; y: number; z: number };
  magnitude: number;
  yawImpulse: number;
  rollImpulse: number;
  verticalScale: number;
  horizontalSpeedCap?: number;
  launchThreshold?: number;
  sourceActionSeq?: number;
}

/**
 * Authoritative tank impulse system. Applies the exact deltas once,
 * increments `impulseSeq`, records the unified op, and emits a typed wire
 * impulse. The impulse queue is drained by the room and broadcast as a
 * dedicated `tankImpulse` message so clients never double-apply recoil.
 */
export class TankImpulseSystem {
  constructor(private readonly ctx: SystemContext) {}

  apply(spec: TankImpulseSpec): TankImpulseWire {
    const opState: NetcodeOpState = this.ctx.opState;
    const t = this.ctx.state.tank;
    const len = Math.hypot(spec.direction.x, spec.direction.y, spec.direction.z) || 1;
    const dx = spec.direction.x / len;
    const dy = spec.direction.y / len;
    const dz = spec.direction.z / len;
    const deltaVx = dx * spec.magnitude;
    const deltaVy = dy * spec.magnitude * spec.verticalScale;
    const deltaVz = dz * spec.magnitude;
    const deltaYawVel = spec.yawImpulse;
    const deltaRoll = spec.rollImpulse;
    t.vx += deltaVx;
    t.vy += deltaVy;
    t.vz += deltaVz;
    t.yawVel += deltaYawVel;
    t.roll = Math.max(-1.4, Math.min(1.4, t.roll + deltaRoll));
    // Ground launch: a strong upward impulse lifts the tank; it does not
    // snap back to terrain this tick.
    if (t.grounded && deltaVy >= (spec.launchThreshold ?? Number.POSITIVE_INFINITY)) {
      t.grounded = false;
    }
    // Shared horizontal safety cap (dash/recoil/MG stacking). Vertical
    // velocity is never capped by this.
    const hardCap = spec.horizontalSpeedCap ?? this.ctx.rules.config.tank.hardHorizontalSpeedCap;
    if (hardCap > 0) {
      const speed = Math.hypot(t.vx, t.vz);
      if (speed > hardCap) {
        const k = hardCap / speed;
        t.vx *= k;
        t.vz *= k;
      }
    }
    const impulseSeq = ++opState.lastImpulseSeq;
    const opSeq = recordOp(opState, 'i', impulseSeq);
    const wire: TankImpulseWire = {
      impulseSeq,
      opSeq,
      simulationTick: this.ctx.simTick,
      source: (spec.kind as TankImpulseSource) || 'external',
      sourceId: spec.sourceId,
      kind: spec.kind,
      sourceActionSeq: spec.sourceActionSeq,
      deltaVx,
      deltaVy,
      deltaVz,
      deltaYawVel,
      deltaRoll,
    };
    this.ctx.impulseEvents.push(wire);
    return wire;
  }
}
