import { DriverPredictor } from '../predictor';
import { BASE_CONFIG } from '../../shared/config';
import { angleDiff, clamp, wrapAngle } from '../../shared/math';
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
    if (this.role !== 'driver' || !movement || revision === undefined) return;
    this.ensurePredictor(modifier);
    this.predictor!.applyMovementRules(movement, revision);
    this.movementRevision = revision;
  }

  ensurePredictor(modifier: string): void {
    if (this.role === 'driver' && !this.predictor) {
      this.predictor = new DriverPredictor(BASE_CONFIG, modifier as never);
    }
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
      grounded: d.grounded, boosting: d.boosting, brace: d.brace, drift: d.drift,
    };
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
    const turnRate = 4.6;
    this.predictedTurretYawLocal += clamp(
      angleDiff(this.predictedTurretYawLocal, this.desiredTurretYawLocal),
      -turnRate * dt,
      turnRate * dt,
    );
    this.predictedTurretPitch += clamp(this.desiredTurretPitch - this.predictedTurretPitch, -turnRate * dt, turnRate * dt);
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
  }
}
