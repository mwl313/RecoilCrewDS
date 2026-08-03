import { DriverPredictor } from '../predictor';
import { BASE_CONFIG } from '../../shared/config';
import { angleDiff, clamp, wrapAngle } from '../../shared/math';
import type { GroundQuery } from '../../shared/sim/groundQuery';
import { STATIC_GROUND_QUERY } from '../../shared/sim/groundQuery';
import type { MovementRulesBlock } from '../../shared/stats/rulesRevision';
import type { DriverInput, GunnerInput, MatchState, Role, TankState } from '../../shared/types';

export interface PredictionCallbacks {
  send(msg: Record<string, unknown>): void;
}

/**
 * PredictionController owns Driver prediction (kept separate from snapshot
 * interpolation) and the Gunner turret prediction spaces. Movement rules
 * blocks from authoritative snapshots keep local prediction on the current
 * movement revision.
 */
export class PredictionController {
  private predictor: DriverPredictor | null = null;
  private movementRevision = 0;
  private role: Role;
  private desiredTurretYawLocal = Math.PI / 2;
  private desiredTurretPitch = 0.05;
  private predictedTurretYawLocal = Math.PI / 2;
  private predictedTurretPitch = 0.05;
  private authoritativeTurretYawLocal = Math.PI / 2;
  private authoritativeTurretPitch = 0.05;
  private turretReconcileSeq = 0;
  private inputSeq = 0;
  private turretTurnRate = 4.6;
  private pitchFollowRate = 8;
  private latestMovement: MovementRulesBlock | null = null;
  private ground: GroundQuery = STATIC_GROUND_QUERY;

  constructor(
    role: Role,
    private readonly callbacks: PredictionCallbacks,
  ) {
    this.role = role;
  }

  setRole(role: Role): void {
    this.role = role;
  }

  applyMovementRules(movement: MovementRulesBlock | undefined, revision: number | undefined, modifier: string): void {
    if (!movement || revision === undefined) return;
    this.latestMovement = movement;
    if (movement.turret) {
      this.turretTurnRate = movement.turret.turnRate;
      this.pitchFollowRate = movement.turret.pitchFollowRate;
    }
    if (this.role === 'driver') {
      this.ensurePredictor(modifier);
      this.predictor!.applyMovementRules(movement, revision);
      this.movementRevision = revision;
    }
  }

  /** Practice path: mirror the local match's turret rates directly. */
  setTurretRates(turnRate: number, pitchFollowRate: number): void {
    this.turretTurnRate = turnRate;
    this.pitchFollowRate = pitchFollowRate;
  }

  /** Practice path: expose the local match's resolved movement/weapon block. */
  setMovementRules(movement: MovementRulesBlock): void {
    this.latestMovement = movement;
  }

  /** Latest replicated movement block (online) or local rules (practice). */
  movementRules(): MovementRulesBlock | null {
    return this.latestMovement;
  }

  ensurePredictor(modifier: string): void {
    if (this.role === 'driver' && !this.predictor) {
      this.predictor = new DriverPredictor(BASE_CONFIG, modifier as never, this.ground);
    }
  }

  /** Phase 3: switch prediction to the authoritative arena ground. */
  setGround(ground: GroundQuery): void {
    this.ground = ground;
    this.predictor?.setGround(ground);
  }

  /** Arena half the predictor is bound to (for diagnostics/tests). */
  groundHalf(): number {
    return this.ground.half;
  }

  /** True when local tank prediction is disabled (wrong-ground fallback). */
  isPredictionDisabled(): boolean {
    return this.predictor?.isDisabled ?? false;
  }

  reconcile(state: MatchState, ackSeq: number): void {
    this.ensurePredictor(state.modifier);
    this.predictor?.reconcile(state.tank, ackSeq);
  }

  sampleDriver(input: DriverInput, dtRaw: number): void {
    this.predictor?.sampleInput(input, dtRaw);
    this.predictor?.smooth(dtRaw);
  }

  /** Merge predicted display pose over the interpolated authoritative tank. */
  renderTank(base: TankState): TankState {
    if (!this.predictor) return base;
    const d = this.predictor.display;
    return {
      ...base,
      x: d.x, y: d.y, z: d.z, vx: d.vx, vy: d.vy, vz: d.vz,
      yaw: d.yaw, yawVel: d.yawVel, pitch: d.pitch, roll: d.roll,
      grounded: d.grounded,
      dashCooldown: d.dashCooldown,
      dashPresentationT: d.dashPresentationT,
      drift: d.drift,
    };
  }

  /** Local one-shot Driver actions applied by prediction (jump/dash). */
  takeLocalDriverActions(): string[] {
    return this.predictor?.takeAppliedActions() ?? [];
  }

  nextSeq(): number {
    return ++this.inputSeq;
  }

  sendDriver(input: DriverInput): void {
    const seq = this.nextSeq();
    this.predictor?.pushInput(seq, input);
    this.callbacks.send({ t: 'input', seq, driver: input });
  }

  sendGunner(input: GunnerInput): void {
    this.callbacks.send({ t: 'input', seq: this.nextSeq(), gunner: input });
  }

  getTurretSpaces() {
    return {
      desiredYawLocal: this.desiredTurretYawLocal,
      predictedYawLocal: this.predictedTurretYawLocal,
      authoritativeYawLocal: this.authoritativeTurretYawLocal,
      authoritativePitch: this.authoritativeTurretPitch,
      desiredPitch: this.desiredTurretPitch,
      predictedPitch: this.predictedTurretPitch,
    };
  }

  updateTurretTarget(worldYaw: number, pitch: number, chassisYaw: number, dt: number): void {
    this.desiredTurretYawLocal = wrapAngle(worldYaw - chassisYaw);
    this.desiredTurretPitch = clamp(pitch, -0.45, 0.5);
    this.predictedTurretYawLocal += clamp(
      angleDiff(this.predictedTurretYawLocal, this.desiredTurretYawLocal),
      -this.turretTurnRate * dt,
      this.turretTurnRate * dt,
    );
    this.predictedTurretPitch += clamp(
      this.desiredTurretPitch - this.predictedTurretPitch,
      -this.pitchFollowRate * dt,
      this.pitchFollowRate * dt,
    );
  }

  reconcileTurret(seq: number, state: MatchState): void {
    if (seq <= this.turretReconcileSeq) return;
    this.turretReconcileSeq = seq;
    this.authoritativeTurretYawLocal = state.turret.yaw;
    this.authoritativeTurretPitch = state.turret.pitch;
    if (this.role === 'gunner') {
      const diff = angleDiff(this.predictedTurretYawLocal, this.authoritativeTurretYawLocal);
      if (Math.abs(diff) > 1.2) {
        this.predictedTurretYawLocal = this.authoritativeTurretYawLocal;
        this.predictedTurretPitch = this.authoritativeTurretPitch;
      } else {
        this.predictedTurretYawLocal += diff * 0.2;
        this.predictedTurretPitch += (this.authoritativeTurretPitch - this.predictedTurretPitch) * 0.2;
      }
    }
  }

  reset(): void {
    this.predictor = null;
    this.movementRevision = 0;
    this.desiredTurretYawLocal = Math.PI / 2;
    this.desiredTurretPitch = 0.05;
    this.predictedTurretYawLocal = Math.PI / 2;
    this.predictedTurretPitch = 0.05;
    this.authoritativeTurretYawLocal = Math.PI / 2;
    this.authoritativeTurretPitch = 0.05;
    this.turretReconcileSeq = 0;
    this.inputSeq = 0;
    this.turretTurnRate = 4.6;
    this.pitchFollowRate = 8;
    // NOTE: the ground is owned by the arena lifecycle (setGround on
    // create/start/rematch/reconnect/practice reroll). reset() must NOT
    // revert it to the legacy static arena, or a 400x400 (or any other)
    // generated world would predict against the wrong bounds and jitter.
  }
}
