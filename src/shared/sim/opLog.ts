import { NET_TUNING } from '../net/tuning';

/**
 * Unified operation log shared by the server and clients. Every applied
 * Driver input frame and every applied tank impulse gets one monotonically
 * increasing opSeq, so clients can replay unacknowledged operations in the
 * exact server order after a reconcile.
 */
export type OpKind = 'd' | 'i';

export interface OpEntry {
  /** Unified server order (across driver inputs and impulses). */
  o: number;
  k: OpKind;
  /** Kind-specific sequence: driver input seq for 'd', impulseSeq for 'i'. */
  s: number;
}

export interface NetcodeOpState {
  opSeq: number;
  lastDriverInputSeq: number;
  lastGunnerInputSeq: number;
  lastImpulseSeq: number;
  ops: OpEntry[];
}

export function createNetcodeOpState(): NetcodeOpState {
  return { opSeq: 0, lastDriverInputSeq: 0, lastGunnerInputSeq: 0, lastImpulseSeq: 0, ops: [] };
}

export function recordOp(state: NetcodeOpState, k: OpKind, s: number): number {
  const o = ++state.opSeq;
  state.ops.push({ o, k, s });
  if (state.ops.length > NET_TUNING.queues.serverOpLog) state.ops.shift();
  return o;
}

export function opLogTail(state: NetcodeOpState): OpEntry[] {
  return state.ops.slice();
}

/** opSeq lookup per kind-sequence, from the latest snapshot's op log. */
export function opSeqByKind(log: OpEntry[], k: OpKind, s: number): number | undefined {
  for (let i = log.length - 1; i >= 0; i--) {
    const entry = log[i];
    if (entry.k === k && entry.s === s) return entry.o;
  }
  return undefined;
}
