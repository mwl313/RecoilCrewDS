import { buildMatchConfig, type GameConfig } from '../shared/config';
import { lerp } from '../shared/math';
import type { GroundQuery } from '../shared/sim/groundQuery';
import { resolveArenaBounds, STATIC_GROUND_QUERY } from '../shared/sim/groundQuery';
import { stepTankKinematics, type TankKinematicState } from '../shared/sim/tankKinematics';
import type { MovementRulesBlock } from '../shared/stats/rulesRevision';
import type { DriverInput, ModifierId, TankState } from '../shared/types';

const STEP = 1 / 30;
/** Maximum unacked inputs replayed per reconcile (production network bound). */
const MAX_REPLAY_INPUTS = 8;
/** Hard snap only for respawn / initial sync / extreme teleport (> 60 m). */
const HARD_SNAP_DISTANCE = 60;
/**
 * Maximum display correction speed toward reconciled authority (m/s).
 * Must sit well above the vehicle's top speed so normal tracking is never
 * capped; it only bounds pathological divergence (teleports) to a smooth
 * glide instead of a snap.
 */
const MAX_CORRECTION_MPS = (cfg: GameConfig): number => Math.max(30, cfg.tank.forwardSpeed * 1.8);
/** Maximum display yaw correction speed (rad/s), above the max steer rate. */
const MAX_YAW_CORRECTION_RPS = 8;
/** Authority may exceed ground.half only by this margin before fallback. */
const GROUND_MARGIN = 1;

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
  private groundHalf = STATIC_GROUND_QUERY.half;
  private hasReconciled = false;
  /** Wrong-ground/authority-outside-world fallback: render authority. */
  disabled = false;

  constructor(cfg: GameConfig, modifier: ModifierId, ground: GroundQuery = STATIC_GROUND_QUERY) {
    this.cfg = cfg;
    this.mcfg = buildMatchConfig(modifier);
    this.ground = ground;
    this.groundHalf = ground.half;
  }

  /** Phase 3: switch the predictor to the authoritative arena ground. */
  setGround(ground: GroundQuery): void {
    this.ground = ground;
    this.groundHalf = ground.half;
  }

  get half(): number {
    return this.groundHalf;
  }

  get isDisabled(): boolean {
    return this.disabled;
  }

  resetFromAuthority(t: TankState): void {
    this.predicted = fromTank(t);
    this.display = copyToDisplay(this.predicted);
    this.pending = [];
    this.acc = 0;
    this.hasReconciled = true;
    this.disabled = false;
    this.prevDead = t.deadT;
    this.prevEdges = { dash: false, jump: false };
    this.appliedActions = [];
  }

  pushInput(seq: number, input: DriverInput): void {
    if (this.disabled) return;
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
    if (this.disabled) return;
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
    const first = !this.hasReconciled;
    this.hasReconciled = true;
    // Arena bounds sanity: if the authoritative tank lies outside the
    // predictor's ground, the ground is wrong (or the arena changed). Never
    // simulate against the wrong world — disable local prediction so the
    // client renders the interpolated authority instead of teleporting.
    // Bounds are axis-aware so rectangular/offset arenas of any size work.
    const b = resolveArenaBounds(this.ground);
    if (
      authoritative.x < b.minX - GROUND_MARGIN ||
      authoritative.x > b.maxX + GROUND_MARGIN ||
      authoritative.z < b.minZ - GROUND_MARGIN ||
      authoritative.z > b.maxZ + GROUND_MARGIN
    ) {
      if (!this.disabled) {
        console.warn(
          `[predictor] authoritative tank outside ground bounds (${b.minX}..${b.maxX}, ${b.minZ}..${b.maxZ}); disabling local prediction`,
        );
      }
      this.disabled = true;
      this.predicted = base;
      this.display = copyToDisplay(base);
      this.pending = [];
      this.acc = 0;
      return;
    }
    // Bound the replay: only inputs that could realistically be in flight
    // are replayed (an ack stall must never launch predicted tens of meters).
    const remaining = this.pending.filter((p) => p.seq > ackSeq).slice(-MAX_REPLAY_INPUTS);
    for (const q of remaining) {
      stepTankKinematics(base, q.input, this.cfg, this.mcfg, STEP, undefined, this.ground);
    }
    const respawned = authoritative.deadT > 0 && this.prevDead <= 0;
    const divergence = Math.hypot(base.x - this.predicted.x, base.z - this.predicted.z);
    this.prevDead = authoritative.deadT;
    this.predicted = base;
    if (respawned || first || divergence > HARD_SNAP_DISTANCE) {
      this.display = copyToDisplay(base);
    }
    // Replayed inputs are consumed; future inputs start a fresh pending queue.
    this.pending = [];
  }

  /** Smooth small visual error between display and predicted. */
  smooth(dt: number): void {
    const k = 1 - Math.exp(-dt * 8);
    const maxStep = MAX_CORRECTION_MPS(this.cfg) * dt;
    const maxYawStep = MAX_YAW_CORRECTION_RPS * dt;
    const d = this.display;
    const p = this.predicted;
    const step = (value: number, target: number): number =>
      value + Math.max(-maxStep, Math.min(maxStep, (target - value) * k));
    d.x = step(d.x, p.x);
    d.y = step(d.y, p.y);
    d.z = step(d.z, p.z);
    d.vx = step(d.vx, p.vx);
    d.vz = step(d.vz, p.vz);
    d.vy = step(d.vy, p.vy);
    const yawDelta = Math.max(-maxYawStep, Math.min(maxYawStep, angleDiff(d.yaw, p.yaw) * k));
    d.yaw = d.yaw + yawDelta;
    d.yawVel = step(d.yawVel, p.yawVel);
    d.pitch = step(d.pitch, p.pitch);
    d.roll = step(d.roll, p.roll);
  }
}

function angleDiff(a: number, b: number): number {
  let v = (b - a) % (Math.PI * 2);
  if (v > Math.PI) v -= Math.PI * 2;
  if (v < -Math.PI) v += Math.PI * 2;
  return v;
}
