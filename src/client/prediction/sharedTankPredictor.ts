import { buildMatchConfig, type GameConfig } from '../../shared/config';
import type { GroundQuery } from '../../shared/sim/groundQuery';
import { resolveArenaBounds, STATIC_GROUND_QUERY } from '../../shared/sim/groundQuery';
import { stepTankKinematics, tankDashDiagnostics, type TankDashDiagnostics, type TankKinematicState } from '../../shared/sim/tankKinematics';
import type { MovementRulesBlock } from '../../shared/stats/rulesRevision';
import type { DriverInput, ModifierId, TankState } from '../../shared/types';
import type { TankImpulseWire } from '../../shared/effects/tankImpulseSystem';
import { opSeqByKind, type OpEntry } from '../../shared/sim/opLog';
import { NET_TUNING } from '../../shared/net/tuning';

const STEP = 1 / NET_TUNING.simHz;
const MAX_REPLAY_INPUTS = NET_TUNING.queues.maxReplayDriverInputs;
const MAX_REPLAY_IMPULSES = NET_TUNING.queues.maxReplayImpulses;
const MAX_PENDING_INPUTS = NET_TUNING.queues.maxPendingDriverInputs;
const MAX_PENDING_IMPULSES = NET_TUNING.queues.maxPendingImpulses;
const HARD_SNAP_DISTANCE = 60;
const MAX_CORRECTION_MPS = (cfg: GameConfig): number => Math.max(30, cfg.tank.forwardSpeed * 1.8);
const MAX_YAW_CORRECTION_RPS = 8;
const GROUND_MARGIN = 1;

export interface QueuedDriverInput {
  seq: number;
  input: DriverInput;
}

interface QueuedImpulse {
  impulseSeq: number;
  op: number;
  wire: TankImpulseWire;
}

export type PredictorSource = 'driver' | 'gunner';

export interface ReconcileOptions {
  impulseAckSeq?: number;
  opLog?: OpEntry[];
  onCorrection?: (meters: number) => void;
}

function emptyState(): TankKinematicState {
  return {
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, yawVel: 0,
    pitch: 0, roll: 0, grounded: true, dashCooldown: 0, dashPresentationT: 0, dashDamageT: 0, drift: false,
    landingGripT: 0,
    dashState: 'inactive', dashStateT: 0, dashDirectionX: 0, dashDirectionZ: 1,
    dashPeakSpeed: 0, dashSpeed: 0, dashSteeringMultiplier: 1,
  };
}

function fromTank(t: TankState): TankKinematicState {
  return {
    x: t.x, y: t.y, z: t.z, vx: t.vx, vy: t.vy, vz: t.vz,
    yaw: t.yaw, yawVel: t.yawVel, pitch: t.pitch, roll: t.roll,
    grounded: t.grounded,
    dashCooldown: t.dashCooldown,
    dashPresentationT: t.dashPresentationT,
    dashDamageT: t.dashDamageT ?? 0,
    dashState: t.dashState ?? 'inactive',
    dashStateT: t.dashStateT ?? 0,
    dashDirectionX: t.dashDirectionX ?? 0,
    dashDirectionZ: t.dashDirectionZ ?? 1,
    dashPeakSpeed: t.dashPeakSpeed ?? 0,
    dashSpeed: t.dashSpeed ?? 0,
    dashSteeringMultiplier: t.dashSteeringMultiplier ?? 1,
    drift: t.drift,
    landingGripT: t.landingGripT ?? 0,
    prevOnRamp: t.prevOnRamp ?? false,
  };
}

function copyToDisplay(src: TankKinematicState): TankKinematicState {
  return { ...src };
}

function angleDiff(a: number, b: number): number {
  let v = (b - a) % (Math.PI * 2);
  if (v > Math.PI) v -= Math.PI * 2;
  if (v < -Math.PI) v += Math.PI * 2;
  return v;
}

/**
 * Shared tank predictor (network03 Milestone 4). Both online roles predict
 * the same shared tank through `stepTankKinematics` on the authoritative
 * ground:
 *
 * - Driver: local input sampled every frame + sequenced sends.
 * - Gunner: server-relayed sanitized accepted Driver input frames.
 * - Both: exact tank impulses applied immediately and replayed on
 *   reconcile in server op order.
 */
export class SharedTankPredictor {
  predicted: TankKinematicState = emptyState();
  display: TankKinematicState = emptyState();
  private pendingInputs: QueuedDriverInput[] = [];
  private pendingImpulses: QueuedImpulse[] = [];
  private opLog: OpEntry[] = [];
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
  private lastImpulseSeq = 0;
  private lastRelayInput: DriverInput | null = null;
  private source: PredictorSource;
  /** Wrong-ground/authority-outside-world fallback: render authority. */
  disabled = false;
  disabledReason = '';

  constructor(
    cfg: GameConfig,
    modifier: ModifierId,
    ground: GroundQuery = STATIC_GROUND_QUERY,
    source: PredictorSource = 'driver',
  ) {
    this.cfg = cfg;
    this.mcfg = buildMatchConfig(modifier);
    this.ground = ground;
    this.groundHalf = ground.half;
    this.source = source;
  }

  setSource(source: PredictorSource): void {
    this.source = source;
  }

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

  get pendingCount(): number {
    return this.pendingInputs.length;
  }

  get pendingImpulseCount(): number {
    return this.pendingImpulses.length;
  }

  get dashDiagnostics(): TankDashDiagnostics {
    return tankDashDiagnostics(this.predicted);
  }

  resetFromAuthority(t: TankState): void {
    this.predicted = fromTank(t);
    this.display = copyToDisplay(this.predicted);
    this.pendingInputs = [];
    this.pendingImpulses = [];
    this.lastRelayInput = null;
    this.lastImpulseSeq = 0;
    this.opLog = [];
    this.acc = 0;
    this.hasReconciled = true;
    this.disabled = false;
    this.disabledReason = '';
    this.prevDead = t.deadT;
    this.prevEdges = { dash: false, jump: false };
    this.appliedActions = [];
  }

  /** Local Driver sequenced input (also used by Single Player parity). */
  pushInput(seq: number, input: DriverInput): void {
    if (this.disabled) return;
    this.pendingInputs.push({ seq, input });
    if (this.pendingInputs.length > MAX_PENDING_INPUTS) this.pendingInputs.shift();
  }

  /** Server-relayed sanitized accepted Driver input (Gunner source). */
  pushRelayInput(seq: number, input: DriverInput): void {
    if (this.disabled) return;
    this.lastRelayInput = input;
    this.pendingInputs.push({ seq, input });
    if (this.pendingInputs.length > MAX_PENDING_INPUTS) this.pendingInputs.shift();
  }

  /**
   * Apply an exact authoritative tank impulse immediately (once) and queue
   * it for reconcile replay. Duplicate impulseSeqs are ignored.
   */
  applyImpulse(wire: TankImpulseWire): void {
    if (wire.impulseSeq <= this.lastImpulseSeq) return;
    this.lastImpulseSeq = wire.impulseSeq;
    if (this.disabled) return;
    this.pendingImpulses.push({ impulseSeq: wire.impulseSeq, op: wire.opSeq, wire });
    if (this.pendingImpulses.length > MAX_PENDING_IMPULSES) this.pendingImpulses.shift();
    this.applyDeltas(this.predicted, wire);
    this.applyDeltas(this.display, wire);
  }

  private applyDeltas(state: TankKinematicState, wire: TankImpulseWire): void {
    state.vx += wire.deltaVx;
    state.vy += wire.deltaVy;
    state.vz += wire.deltaVz;
    state.yawVel += wire.deltaYawVel;
    state.roll = Math.max(-1.4, Math.min(1.4, state.roll + wire.deltaRoll));
  }

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

  /** Sample the local Driver input every frame; simulate at 30 Hz. */
  sampleInput(input: DriverInput, dt: number): void {
    if (this.disabled) return;
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

  /**
   * Gunner: step the shared tank from the latest server-relayed accepted
   * Driver input every rendered frame (same 30 Hz fixed stepping as the
   * Driver). Reconcile rebuilds from authority + replay, so local stepping
   * never double-applies.
   */
  sampleRelayed(dt: number): void {
    if (this.source !== 'gunner' || !this.lastRelayInput) return;
    this.sampleInput(this.lastRelayInput, dt);
  }

  takeAppliedActions(): string[] {
    const out = [...this.appliedActions];
    this.appliedActions = [];
    return out;
  }

  /**
   * Reconcile from authority, then replay unacknowledged operations in
   * server order: driver input frames and tank impulses, ordered by the
   * unified op log when known.
   */
  reconcile(authoritative: TankState, ackSeq: number, opts: ReconcileOptions = {}): void {
    const base = fromTank(authoritative);
    if (Math.abs(base.z - this.predicted.z) > 5) {
      console.warn(`[predictor] reconcile jump base.z=${base.z.toFixed(2)} predicted.z=${this.predicted.z.toFixed(2)} ack=${ackSeq} pending=${this.pendingInputs.length} impulses=${this.pendingImpulses.length}`);
    }
    const first = !this.hasReconciled;
    this.hasReconciled = true;
    if (opts.opLog) this.opLog = opts.opLog;
    const impulseAckSeq = opts.impulseAckSeq ?? this.lastImpulseSeq;
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
      this.disabledReason = `authority outside bounds (${b.minX}..${b.maxX}, ${b.minZ}..${b.maxZ})`;
      this.predicted = base;
      this.display = copyToDisplay(base);
      this.pendingInputs = [];
      this.pendingImpulses = [];
      this.lastRelayInput = null;
      this.acc = 0;
      return;
    }

    const remainingInputs = this.pendingInputs.filter((p) => p.seq > ackSeq).slice(-MAX_REPLAY_INPUTS);
    const remainingImpulses = this.pendingImpulses
      .filter((p) => p.impulseSeq > impulseAckSeq)
      .slice(-MAX_REPLAY_IMPULSES);

    interface ReplayOp {
      order: number;
      apply(): void;
    }
    const ops: ReplayOp[] = [];
    for (const q of remainingInputs) {
      const op = opSeqByKind(this.opLog, 'd', q.seq);
      ops.push({
        order: op ?? Number.MAX_SAFE_INTEGER,
        apply: () => stepTankKinematics(base, q.input, this.cfg, this.mcfg, STEP, undefined, this.ground),
      });
    }
    for (const q of remainingImpulses) {
      ops.push({
        order: q.op,
        apply: () => this.applyDeltas(base, q.wire),
      });
    }
    ops.sort((a, b) => a.order - b.order);
    for (const op of ops) op.apply();

    const respawned = authoritative.deadT > 0 && this.prevDead <= 0;
    const divergence = Math.hypot(base.x - this.predicted.x, base.z - this.predicted.z);
    this.prevDead = authoritative.deadT;
    this.predicted = base;
    if (respawned || first || divergence > HARD_SNAP_DISTANCE) {
      this.display = copyToDisplay(base);
    }
    opts.onCorrection?.(divergence);
    // A snapshot can only retire operations the server explicitly
    // acknowledged. Preserve the rest so a later snapshot with the same ack
    // can rebuild prediction from authority without dropping movement/recoil.
    this.pendingInputs = remainingInputs;
    this.pendingImpulses = remainingImpulses;
  }

  smooth(dt: number): void {
    // Faster tracking: at ~12 m/s top speed, k=20 keeps steady-state display
    // lag ≈ 0.4 m (well inside the gunner no-historical-delay target) while
    // remaining smooth enough to hide per-snapshot reconcile steps.
    const k = 1 - Math.exp(-dt * 30);
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
    d.grounded = p.grounded;
    d.dashCooldown = p.dashCooldown;
    d.dashPresentationT = p.dashPresentationT;
    d.dashDamageT = p.dashDamageT;
    d.dashState = p.dashState;
    d.dashStateT = p.dashStateT;
    d.dashDirectionX = p.dashDirectionX;
    d.dashDirectionZ = p.dashDirectionZ;
    d.dashPeakSpeed = p.dashPeakSpeed;
    d.dashSpeed = p.dashSpeed;
    d.dashSteeringMultiplier = p.dashSteeringMultiplier;
    d.drift = p.drift;
  }
}
