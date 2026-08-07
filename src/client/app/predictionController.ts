import { SharedTankPredictor } from '../prediction/sharedTankPredictor';
import { BASE_CONFIG } from '../../shared/config';
import { angleDiff, clamp, wrapAngle } from '../../shared/math';
import type { GroundQuery } from '../../shared/sim/groundQuery';
import { STATIC_GROUND_QUERY } from '../../shared/sim/groundQuery';
import type { MovementRulesBlock } from '../../shared/stats/rulesRevision';
import type { DriverInput, GunnerInput, MatchState, Role, TankState } from '../../shared/types';
import type { TankImpulseWire } from '../../shared/effects/tankImpulseSystem';
import type { GunnerActionType } from '../../shared/net/protocol';
import type { OpEntry } from '../../shared/sim/opLog';
import { netcodeMetrics } from '../netcode/netcodeMetrics';
import { VERTICAL_AIM_MAX_PITCH, VERTICAL_AIM_MIN_PITCH } from '../../shared/vehicle/tankRigTypes';
import type { TankDashDiagnostics } from '../../shared/sim/tankKinematics';

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
  private predictor: SharedTankPredictor | null = null;
  private movementRevision = 0;
  private role: Role;
  private desiredTurretYawLocal = Math.PI / 2;
  private desiredTurretPitch = 0.05;
  private predictedTurretYawLocal = Math.PI / 2;
  private predictedTurretPitch = 0.05;
  private authoritativeTurretYawLocal = Math.PI / 2;
  private authoritativeTurretPitch = 0.05;
  private turretReconcileSeq = 0;
  private pendingAimFrames: Array<{ seq: number; aimYaw: number; aimPitch: number }> = [];
  private readonly pendingActions = new Map<number, { action: GunnerActionType; sentAt: number; tries: number; aimYaw: number; aimPitch: number }>();
  private actionSeq = 0;
  private inputSeq = 0;
  private turretTurnRate = 4.6;
  private pitchFollowRate = 8;
  private turretMinPitch = VERTICAL_AIM_MIN_PITCH;
  private turretMaxPitch = VERTICAL_AIM_MAX_PITCH;
  private turretResponseMode: 'instant' | 'rateLimited' = 'instant';
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
      this.turretResponseMode = movement.turret.responseMode ?? 'instant';
      this.turretTurnRate = movement.turret.turnRate;
      this.pitchFollowRate = movement.turret.pitchFollowRate;
      this.turretMinPitch = movement.turret.minPitch;
      this.turretMaxPitch = movement.turret.maxPitch;
    }
    this.ensurePredictor(modifier);
    this.predictor?.applyMovementRules(movement, revision);
    this.movementRevision = revision;
  }

  /** Single Player path: mirror the local match's turret rates directly. */
  setTurretRates(turnRate: number, pitchFollowRate: number): void {
    this.turretTurnRate = turnRate;
    this.pitchFollowRate = pitchFollowRate;
  }

  /** Single Player path: expose the local match's resolved movement/weapon block. */
  setMovementRules(movement: MovementRulesBlock): void {
    this.latestMovement = movement;
    if (movement.turret) {
      this.turretResponseMode = movement.turret.responseMode ?? 'instant';
      this.turretTurnRate = movement.turret.turnRate;
      this.pitchFollowRate = movement.turret.pitchFollowRate;
      this.turretMinPitch = movement.turret.minPitch;
      this.turretMaxPitch = movement.turret.maxPitch;
    }
  }

  /** Latest replicated movement block (online) or local rules (Single Player). */
  movementRules(): MovementRulesBlock | null {
    return this.latestMovement;
  }

  ensurePredictor(modifier: string): void {
    if (!this.predictor) {
      this.predictor = new SharedTankPredictor(
        BASE_CONFIG,
        modifier as never,
        this.ground,
        this.role === 'gunner' ? 'gunner' : 'driver',
      );
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

  groundHeightAt(x: number, z: number): number {
    return this.ground.groundHeightAt(x, z);
  }

  /** True when local tank prediction is disabled (wrong-ground fallback). */
  isPredictionDisabled(): boolean {
    return this.predictor?.isDisabled ?? false;
  }

  dashDiagnostics(): TankDashDiagnostics | null {
    return this.predictor?.dashDiagnostics ?? null;
  }

  reconcile(
    state: MatchState,
    ackSeq: number,
    extra: { impulseAckSeq?: number; opLog?: OpEntry[] } = {},
  ): void {
    this.ensurePredictor(state.modifier);
    this.predictor?.reconcile(state.tank, ackSeq, {
      impulseAckSeq: extra.impulseAckSeq,
      opLog: extra.opLog,
      onCorrection: (meters) => netcodeMetrics.markCorrection(meters),
    });
  }

  /** Apply an exact authoritative tank impulse immediately (both roles). */
  applyImpulse(wire: TankImpulseWire): void {
    this.predictor?.applyImpulse(wire);
  }

  /** Gunner: queue a server-relayed sanitized Driver input frame. */
  pushRelayInput(seq: number, input: DriverInput): void {
    this.ensurePredictor('none');
    this.predictor?.pushRelayInput(seq, input);
  }

  sampleDriver(input: DriverInput, dtRaw: number): void {
    this.predictor?.sampleInput(input, dtRaw);
    this.predictor?.smooth(dtRaw);
  }

  /** Gunner: sample the shared predictor every frame (no local driver input). */
  sampleRelayed(dtRaw: number): void {
    this.predictor?.sampleRelayed(dtRaw);
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
      dashDamageT: d.dashDamageT,
      dashState: d.dashState,
      dashStateT: d.dashStateT,
      dashDirectionX: d.dashDirectionX,
      dashDirectionZ: d.dashDirectionZ,
      dashPeakSpeed: d.dashPeakSpeed,
      dashSpeed: d.dashSpeed,
      dashSteeringMultiplier: d.dashSteeringMultiplier,
      airJumpsRemaining: d.airJumpsRemaining,
      airJumpCapacity: d.airJumpCapacity,
      airDashReuseRemaining: d.airDashReuseRemaining,
      airDashReuseCapacity: d.airDashReuseCapacity,
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
    netcodeMetrics.markInput(performance.now());
  }

  sendGunner(input: GunnerInput): void {
    const seq = this.nextSeq();
    this.pendingAimFrames.push({ seq, aimYaw: input.aimYaw, aimPitch: input.aimPitch });
    if (this.pendingAimFrames.length > 16) this.pendingAimFrames.shift();
    this.callbacks.send({ t: 'input', seq, gunner: input });
    netcodeMetrics.markInput(performance.now());
  }

  /** Immediate discrete Gunner action (bypasses the periodic timer). */
  sendGunnerAction(action: GunnerActionType): number {
    const actionSeq = ++this.actionSeq;
    const aimYaw = this.desiredTurretYawLocal;
    const aimPitch = this.desiredTurretPitch;
    this.pendingActions.set(actionSeq, { action, sentAt: performance.now(), tries: 1, aimYaw, aimPitch });
    if (this.pendingActions.size > 16) this.pendingActions.delete(this.pendingActions.keys().next().value as number);
    this.callbacks.send({ t: 'action', actionSeq, action, aimYaw, aimPitch });
    return actionSeq;
  }

  /**
   * Reliability under loss/jitter: retransmit unacknowledged discrete
   * actions with the same actionSeq (the server dedupes by sequence).
   */
  retransmitPendingActions(now: number): void {
    for (const [seq, entry] of [...this.pendingActions]) {
      if (now - entry.sentAt > 2000) {
        this.pendingActions.delete(seq);
        continue;
      }
      if (now - entry.sentAt > 100 && entry.tries < 4) {
        entry.tries++;
        entry.sentAt = now;
        this.callbacks.send({ t: 'action', actionSeq: seq, action: entry.action, aimYaw: entry.aimYaw, aimPitch: entry.aimPitch });
      }
    }
  }

  confirmAction(actionSeq: number): GunnerActionType | undefined {
    const action = this.pendingActions.get(actionSeq)?.action;
    this.pendingActions.delete(actionSeq);
    return action;
  }

  rejectAction(actionSeq: number): void {
    this.pendingActions.delete(actionSeq);
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

  /** Resolved turret pitch limits (server parity via movement block). */
  turretPitchLimits(): { minPitch: number; maxPitch: number } {
    return { minPitch: this.turretMinPitch, maxPitch: this.turretMaxPitch };
  }

  updateTurretTarget(worldYaw: number, pitch: number, chassisYaw: number, dt: number): void {
    this.desiredTurretYawLocal = wrapAngle(worldYaw - chassisYaw);
    this.desiredTurretPitch = clamp(pitch, this.turretMinPitch, this.turretMaxPitch);
    if (this.turretResponseMode === 'instant') {
      // Combat 05: the local turret model matches the mouse target in the
      // same rendered frame (no rate-limited visual chase).
      this.predictedTurretYawLocal = this.desiredTurretYawLocal;
      this.predictedTurretPitch = this.desiredTurretPitch;
    } else {
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
  }

  /**
   * Turret reconcile keyed to the Gunner input acknowledgement (not the
   * snapshot sequence): start from authority, replay queued unacknowledged
   * aim frames under the authoritative turn rate.
   */
  reconcileTurret(state: MatchState, lastProcessedGunnerInputSeq: number): void {
    this.authoritativeTurretYawLocal = state.turret.yaw;
    this.authoritativeTurretPitch = state.turret.pitch;
    if (this.role === 'gunner') {
      if (this.turretResponseMode === 'instant') {
        // Local visual truth is the newest local desired aim. Use the Gunner
        // input acknowledgement only to discard processed frames; never
        // blend the predicted turret backward toward every snapshot.
        this.pendingAimFrames = this.pendingAimFrames.filter((f) => f.seq > lastProcessedGunnerInputSeq);
        const invalid =
          !Number.isFinite(this.predictedTurretYawLocal + this.predictedTurretPitch) ||
          this.predictedTurretPitch < this.turretMinPitch - 0.001 ||
          this.predictedTurretPitch > this.turretMaxPitch + 0.001;
        const divergence = Math.abs(angleDiff(this.predictedTurretYawLocal, this.authoritativeTurretYawLocal));
        if (invalid) {
          this.predictedTurretYawLocal = this.desiredTurretYawLocal;
          this.predictedTurretPitch = this.desiredTurretPitch;
        }
        netcodeMetrics.markTurretCorrection(invalid ? divergence : 0);
        return;
      }
      const remaining = this.pendingAimFrames
        .filter((f) => f.seq > lastProcessedGunnerInputSeq)
        .slice(0, 8);
      let yaw = this.authoritativeTurretYawLocal;
      let pitch = this.authoritativeTurretPitch;
      for (const frame of remaining) {
        yaw += clamp(
          angleDiff(yaw, frame.aimYaw),
          -this.turretTurnRate * (1 / 30),
          this.turretTurnRate * (1 / 30),
        );
        pitch += clamp(frame.aimPitch - pitch, -this.pitchFollowRate * (1 / 30), this.pitchFollowRate * (1 / 30));
      }
      const correction = Math.abs(angleDiff(this.predictedTurretYawLocal, yaw));
      if (correction > 0.9) {
        this.predictedTurretYawLocal = yaw;
        this.predictedTurretPitch = pitch;
      } else {
        this.predictedTurretYawLocal += angleDiff(this.predictedTurretYawLocal, yaw) * 0.5;
        this.predictedTurretPitch += (pitch - this.predictedTurretPitch) * 0.5;
      }
      netcodeMetrics.markTurretCorrection(correction);
      this.pendingAimFrames = this.pendingAimFrames.filter((f) => f.seq > lastProcessedGunnerInputSeq);
    } else if (this.turretReconcileSeq === 0) {
      this.predictedTurretYawLocal = this.authoritativeTurretYawLocal;
      this.predictedTurretPitch = this.authoritativeTurretPitch;
      this.turretReconcileSeq = 1;
    }
  }

  metricsPending(): { inputs: number; impulses: number; actions: number; aim: number } {
    return {
      inputs: this.predictor?.pendingCount ?? 0,
      impulses: this.predictor?.pendingImpulseCount ?? 0,
      actions: this.pendingActions.size,
      aim: this.pendingAimFrames.length,
    };
  }

  predictorDisabledReason(): string {
    return this.predictor?.disabledReason ?? '';
  }

  predictionDebug() {
    return {
      disabled: this.predictor?.disabled ?? false,
      disabledReason: this.predictor?.disabledReason ?? '',
      source: this.role,
      pendingInputs: this.predictor?.pendingCount ?? 0,
      pendingImpulses: this.predictor?.pendingImpulseCount ?? 0,
      display: this.predictor ? { x: this.predictor.display.x, z: this.predictor.display.z } : null,
      predicted: this.predictor ? { x: this.predictor.predicted.x, z: this.predictor.predicted.z } : null,
      latestRelay: (this.predictor as unknown as { lastRelayInput?: { throttle: number } | null }).lastRelayInput ?? null,
    };
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
    this.pendingAimFrames.length = 0;
    this.pendingActions.clear();
    this.actionSeq = 0;
    this.inputSeq = 0;
    this.turretTurnRate = 4.6;
    this.pitchFollowRate = 8;
    this.turretResponseMode = 'instant';
    // NOTE: the ground is owned by the arena lifecycle (setGround on
    // create/start/rematch/reconnect/Single Player reroll). reset() must NOT
    // revert it to the legacy static arena, or a 400x400 (or any other)
    // generated world would predict against the wrong bounds and jitter.
  }
}
