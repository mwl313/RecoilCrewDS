import { buildMatchConfig, type GameConfig } from '../shared/config';
import { lerp } from '../shared/math';
import type { GroundQuery } from '../shared/sim/groundQuery';
import { STATIC_GROUND_QUERY } from '../shared/sim/groundQuery';
import { stepTankKinematics, type TankKinematicState } from '../shared/sim/tankKinematics';
import type { MovementRulesBlock } from '../shared/stats/rulesRevision';
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
    pitch: 0, roll: 0, grounded: true, dashCooldown: 0, dashPresentationT: 0, drift: false,
  };
}

function fromTank(t: TankState): TankKinematicState {
  return {
    x: t.x, y: t.y, z: t.z, vx: t.vx, vy: t.vy, vz: t.vz,
    yaw: t.yaw, yawVel: t.yawVel, pitch: t.pitch, roll: t.roll,
    grounded: t.grounded,
    dashCooldown: t.dashCooldown,
    dashPresentationT: t.dashPresentationT,
    drift: t.drift,
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
  private ground: GroundQuery;
  private prevDead = 0;
  private movementRevision = 0;
  private prevEdges = { dash: false, jump: false };
  private appliedActions: string[] = [];

  constructor(cfg: GameConfig, modifier: ModifierId, ground: GroundQuery = STATIC_GROUND_QUERY) {
    this.cfg = cfg;
    this.mcfg = buildMatchConfig(modifier);
    this.ground = ground;
  }

  /** Phase 3: switch the predictor to the authoritative arena ground. */
  setGround(ground: GroundQuery): void {
    this.ground = ground;
  }

  resetFromAuthority(t: TankState): void {
    this.predicted = fromTank(t);
    this.display = copyToDisplay(this.predicted);
    this.pending = [];
    this.acc = 0;
    this.prevDead = t.deadT;
    this.prevEdges = { dash: false, jump: false };
    this.appliedActions = [];
  }

  pushInput(seq: number, input: DriverInput): void {
    this.pending.push({ seq, input });
    if (this.pending.length > 64) this.pending.shift();
  }

  get pendingCount(): number {
    return this.pending.length;
  }

  /**
   * Apply the authoritative resolved movement block when the movement rules
   * revision advances. Prediction afterwards uses the same movement-critical
   * values as the server (REFACTOR_02 §13).
   */
  applyMovementRules(block: MovementRulesBlock, revision: number): void {
    if (revision <= this.movementRevision) return;
    this.movementRevision = revision;
    this.cfg = {
      ...this.cfg,
      tank: { ...this.cfg.tank, ...block.tank },
    };
    this.mcfg = {
      ...this.mcfg,
      timeScale: block.match.timeScale,
      grip: block.match.grip,
      gravity: block.match.gravity,
    };
  }

  /** Sample the current input every frame; simulate at the fixed server rate. */
  sampleInput(input: DriverInput, dt: number): void {
    // A latched edge is applied on exactly one fixed step, when it first
    // appears in the sampled input. Repeating samples (same latch held until
    // the send frame consumes it) never apply the edge again locally.
    const dashEdge = input.dashPressed && !this.prevEdges.dash;
    const jumpEdge = input.jumpPressed && !this.prevEdges.jump;
    this.prevEdges = { dash: input.dashPressed, jump: input.jumpPressed };
    const stepInput: DriverInput = {
      throttle: input.throttle,
      steer: input.steer,
      dashPressed: dashEdge,
      jumpPressed: jumpEdge,
    };
    this.acc += Math.min(0.1, dt);
    let guard = 0;
    let appliedOnFirstStep = true;
    while (this.acc >= STEP && guard++ < 6) {
      this.acc -= STEP;
      stepTankKinematics(
        this.predicted,
        stepInput,
        this.cfg,
        this.mcfg,
        STEP,
        {
          onJump: () => {
            if (appliedOnFirstStep) this.appliedActions.push('jump');
          },
          onDash: () => {
            if (appliedOnFirstStep) this.appliedActions.push('dash');
          },
        },
        this.ground,
      );
      appliedOnFirstStep = false;
    }
  }

  /** One-shot local presentation actions (jump/dash) applied by prediction. */
  takeAppliedActions(): string[] {
    const out = [...this.appliedActions];
    this.appliedActions = [];
    return out;
  }

  /**
   * Reconcile with an authoritative snapshot. Acknowledged inputs are
   * discarded; unacknowledged inputs are replayed in order from authority.
   */
  reconcile(authoritative: TankState, ackSeq: number): void {
    const base = fromTank(authoritative);
    const remaining = this.pending.filter((p) => p.seq > ackSeq);
    for (const q of remaining) {
      stepTankKinematics(base, q.input, this.cfg, this.mcfg, STEP, undefined, this.ground);
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
