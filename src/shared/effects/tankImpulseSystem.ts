import { recordOp, type NetcodeOpState } from '../sim/opLog';
import type { SystemContext } from '../sim/systems/systemContext';

export type TankImpulseSource = 'recoil' | 'cannon' | 'mg' | 'jackpot' | 'external';

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
  sourceActionSeq?: number;
  deltaVx: number;
  deltaVy: number;
  deltaVz: number;
  deltaYawVel: number;
  deltaRoll: number;
}

export interface TankImpulseParams {
  deltaVx: number;
  deltaVy: number;
  deltaVz: number;
  deltaYawVel: number;
  deltaRoll: number;
  source: TankImpulseSource;
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

  apply(params: TankImpulseParams): TankImpulseWire {
    const opState: NetcodeOpState = this.ctx.opState;
    const t = this.ctx.state.tank;
    t.vx += params.deltaVx;
    t.vy += params.deltaVy;
    t.vz += params.deltaVz;
    t.yawVel += params.deltaYawVel;
    t.roll = Math.max(-1.4, Math.min(1.4, t.roll + params.deltaRoll));
    const impulseSeq = ++opState.lastImpulseSeq;
    const opSeq = recordOp(opState, 'i', impulseSeq);
    const wire: TankImpulseWire = {
      impulseSeq,
      opSeq,
      simulationTick: this.ctx.simTick,
      source: params.source,
      sourceActionSeq: params.sourceActionSeq,
      deltaVx: params.deltaVx,
      deltaVy: params.deltaVy,
      deltaVz: params.deltaVz,
      deltaYawVel: params.deltaYawVel,
      deltaRoll: params.deltaRoll,
    };
    this.ctx.impulseEvents.push(wire);
    return wire;
  }
}
