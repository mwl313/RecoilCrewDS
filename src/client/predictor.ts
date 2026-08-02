import { buildMatchConfig, type GameConfig } from '../shared/config';
import { lerp } from '../shared/math';
import { stepTankKinematics, type TankKinematicState } from '../shared/sim/tankKinematics';
import type { DriverInput, ModifierId, TankState } from '../shared/types';

const STEP = 1 / 30;
const SNAP_DISTANCE = 7;

export interface QueuedDriverInput {
  seq: number;
  input: DriverInput;
}

function emptyState(): TankKinematicState {
  return {
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, yawVel: 0,
    pitch: 0, roll: 0, grounded: true, boosting: false, brace: false, drift: false,
  };
}

function fromTank(t: TankState): TankKinematicState {
  return {
    x: t.x, y: t.y, z: t.z, vx: t.vx, vy: t.vy, vz: t.vz,
    yaw: t.yaw, yawVel: t.yawVel, pitch: t.pitch, roll: t.roll,
    grounded: t.grounded, boosting: t.boosting, brace: t.brace, drift: t.drift,
    prevOnRamp: t.prevOnRamp ?? false,
  };
}

function copyToDisplay(src: TankKinematicState): TankKinematicState {
  return { ...src };
}

/**
 * Driver local prediction with authoritative reconciliation.
 *   predict immediately → send sequenced input → receive authority →
 *   discard acknowledged input → replay remaining input → smooth error.
 * The rendered `display` state converges to `predicted`; large divergence or
 * a Wipeout/respawn snaps.
 */
export class DriverPredictor {
  predicted: TankKinematicState = emptyState();
  display: TankKinematicState = emptyState();
  private pending: QueuedDriverInput[] = [];
  private acc = 0;
  private cfg: GameConfig;
  private mcfg: ReturnType<typeof buildMatchConfig>;
  private prevDead = 0;

  constructor(cfg: GameConfig, modifier: ModifierId) {
    this.cfg = cfg;
    this.mcfg = buildMatchConfig(modifier);
  }

  resetFromAuthority(t: TankState): void {
    this.predicted = fromTank(t);
    this.display = copyToDisplay(this.predicted);
    this.pending = [];
    this.acc = 0;
    this.prevDead = t.deadT;
  }

  pushInput(seq: number, input: DriverInput): void {
    this.pending.push({ seq, input });
    if (this.pending.length > 64) this.pending.shift();
  }

  get pendingCount(): number {
    return this.pending.length;
  }

  /** Sample the current input every frame; simulate at the fixed server rate. */
  sampleInput(input: DriverInput, dt: number): void {
    this.acc += Math.min(0.1, dt);
    let guard = 0;
    while (this.acc >= STEP && guard++ < 6) {
      this.acc -= STEP;
      stepTankKinematics(this.predicted, input, this.cfg, this.mcfg, STEP);
    }
  }

  /**
   * Reconcile with an authoritative snapshot. Acknowledged inputs are
   * discarded; unacknowledged inputs are replayed in order from authority.
   */
  reconcile(authoritative: TankState, ackSeq: number): void {
    const base = fromTank(authoritative);
    const remaining = this.pending.filter((p) => p.seq > ackSeq);
    for (const q of remaining) {
      stepTankKinematics(base, q.input, this.cfg, this.mcfg, STEP);
    }
    const respawned = authoritative.deadT > 0 && this.prevDead <= 0;
    const divergence = Math.hypot(base.x - this.predicted.x, base.z - this.predicted.z);
    this.prevDead = authoritative.deadT;
    this.predicted = base;
    if (respawned || divergence > SNAP_DISTANCE) {
      this.display = copyToDisplay(base);
    }
    // Replayed inputs are consumed; future inputs start a fresh pending queue.
    this.pending = [];
  }

  /** Smooth small visual error between display and predicted. */
  smooth(dt: number): void {
    const k = 1 - Math.exp(-dt * 8);
    const d = this.display;
    const p = this.predicted;
    d.x = lerp(d.x, p.x, k);
    d.y = lerp(d.y, p.y, k);
    d.z = lerp(d.z, p.z, k);
    d.vx = lerp(d.vx, p.vx, k);
    d.vz = lerp(d.vz, p.vz, k);
    d.vy = lerp(d.vy, p.vy, k);
    d.yaw = d.yaw + angleDiff(d.yaw, p.yaw) * k;
    d.yawVel = lerp(d.yawVel, p.yawVel, k);
    d.pitch = lerp(d.pitch, p.pitch, k);
    d.roll = lerp(d.roll, p.roll, k);
  }
}

function angleDiff(a: number, b: number): number {
  let v = (b - a) % (Math.PI * 2);
  if (v > Math.PI) v -= Math.PI * 2;
  if (v < -Math.PI) v += Math.PI * 2;
  return v;
}
