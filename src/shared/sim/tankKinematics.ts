import { ARENA, groundHeightAt, groundNormalAt, pitchFromNormal, resolveCircleContacts } from '../arena';
import type { GameConfig } from '../config';
import { clamp, lerp, pointInBox } from '../math';
import type { DriverInput, MatchConfig } from '../types';

/**
 * Shared deterministic tank kinematics used by BOTH the authoritative server
 * (src/shared/sim/match.ts) and the Driver client predictor. Keeping a single
 * implementation guarantees prediction and authority converge.
 *
 * Coordinate convention: +Y up, +Z forward at yaw 0, +X right at yaw 0,
 * forward = (sin yaw, 0, cos yaw), positive yaw turns +Z toward +X.
 * A = steer -1 → yaw increases → nose turns toward +X = chassis left
 *   (screen-left when viewed from behind the chassis).
 * D = steer +1 → yaw decreases → nose turns toward -X = chassis right
 *   (screen-right when viewed from behind the chassis).
 * The direction is identical while reversing (strength may be reduced,
 * never flipped).
 */
export interface TankKinematicState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  yawVel: number;
  pitch: number;
  roll: number;
  grounded: boolean;
  boosting: boolean;
  brace: boolean;
  drift: boolean;
  prevOnRamp?: boolean;
}

export interface TankKinematicsCallbacks {
  onHardCrash?(impactSpeed: number): void;
  onRampLaunch?(fwdSpeed: number): void;
  onHardFall?(fallSpeed: number): void;
}

export interface CollisionHit {
  normalX: number;
  normalZ: number;
  penetration: number;
  obstacleId?: string;
}

/** Remove only the inward velocity component; preserve tangent sliding. */
export function applyVelocityResponse(vx: number, vz: number, normalX: number, normalZ: number): { vx: number; vz: number } {
  const vn = vx * normalX + vz * normalZ;
  if (vn < 0) {
    return { vx: vx - vn * normalX, vz: vz - vn * normalZ };
  }
  return { vx, vz };
}

/**
 * Advance tank kinematics by one fixed simulation step.
 * Steering order: read input → update yaw → recompute basis → rebuild
 * velocity → integrate → resolve the three-circle footprint with substeps.
 */
export function stepTankKinematics(
  t: TankKinematicState,
  inp: DriverInput,
  cfg: GameConfig,
  mcfg: MatchConfig,
  dt: number,
  callbacks?: TankKinematicsCallbacks,
): CollisionHit[] {
  const tankCfg = cfg.tank;
  const forward = { x: Math.sin(t.yaw), z: Math.cos(t.yaw) };
  const fwdSpeed = t.vx * forward.x + t.vz * forward.z;
  const boosting = inp.boost && Math.abs(inp.throttle) > 0.05 && t.grounded;
  const bracing = inp.brace && t.grounded;
  t.boosting = boosting;
  t.brace = bracing;

  const maxSpeed = boosting ? tankCfg.forwardSpeed * tankCfg.boostMult : tankCfg.forwardSpeed;
  const targetSpeed = inp.throttle >= 0 ? inp.throttle * maxSpeed : inp.throttle * tankCfg.reverseSpeed;
  const accel = (inp.throttle >= 0 ? tankCfg.accel : tankCfg.reverseAccel) * (bracing ? tankCfg.braceAccelMult : 1);
  let newFwd = approach(fwdSpeed, targetSpeed, accel * dt);
  newFwd = Math.max(-tankCfg.reverseSpeed, Math.min(maxSpeed, newFwd));

  // Steering. Reverse reduces strength but NEVER flips A/D direction.
  const speedRatio = Math.abs(newFwd) / tankCfg.forwardSpeed;
  let steerRate = lerp(tankCfg.steerLow, tankCfg.steerHigh, speedRatio);
  if (boosting) steerRate *= 1.3;
  if (bracing) steerRate *= tankCfg.braceSteerMult;
  if (!t.grounded) steerRate *= tankCfg.airControl;
  if (newFwd < -0.1) steerRate *= tankCfg.reverseSteerMult;

  // 1. Update yaw. Screen-right when viewed from behind is -X, so positive
  // steer (D) rotates the chassis toward -X (yaw decreases).
  t.yaw -= inp.steer * steerRate * dt;
  t.yaw += t.yawVel * dt;
  t.yawVel *= Math.exp(-3.2 * dt);

  // 2. Recompute the basis AFTER steering.
  const f2 = { x: Math.sin(t.yaw), z: Math.cos(t.yaw) };
  const lateralX = t.vx - forward.x * fwdSpeed;
  const lateralZ = t.vz - forward.z * fwdSpeed;
  const grip = bracing ? tankCfg.braceGrip : boosting ? mcfg.boostGrip : mcfg.grip;
  const gripF = Math.exp(-grip * dt);
  // 3. Rebuild velocity with the NEW basis; preserve intentional lateral drift.
  t.vx = f2.x * newFwd + lateralX * gripF;
  t.vz = f2.z * newFwd + lateralZ * gripF;

  // 4. Integrate with displacement-based substeps (boost/recoil/rammer/high speed).
  const displacement = Math.hypot(t.vx, t.vz) * dt;
  const substeps = Math.max(1, Math.min(tankCfg.maxSubsteps, Math.ceil(displacement / tankCfg.maxSafeStep)));
  const subDt = dt / substeps;
  let hits: CollisionHit[] = [];
  for (let s = 0; s < substeps; s++) {
    t.x += t.vx * subDt;
    t.y += t.vy * subDt;
    t.z += t.vz * subDt;
    hits = hits.concat(resolveTankFootprint(t, cfg));
  }

  // 5. Ground/air.
  const h = groundHeightAt(t.x, t.z);
  const wasGrounded = t.grounded;
  const onRamp = ARENA.ramps.some((r) => pointInBox(t.x, t.z, r.x, r.z, r.w, r.d));
  if (t.y <= h + 0.08) {
    if (!wasGrounded && t.vy < -tankCfg.fallDamageSpeed) {
      callbacks?.onHardFall?.(-t.vy);
    }
    t.y = h;
    t.vy = 0;
    t.grounded = true;
  } else {
    t.vy -= mcfg.gravity * dt;
    t.grounded = false;
  }
  // Ramp launch: leaving a ramp at speed launches the tank.
  const wasOnRamp = t.prevOnRamp === true;
  t.prevOnRamp = onRamp;
  if (wasOnRamp && !onRamp && Math.abs(newFwd) > 7) {
    t.vy = Math.min(tankCfg.jumpImpulse, tankCfg.jumpImpulse * (Math.abs(newFwd) / tankCfg.forwardSpeed));
    t.grounded = false;
    callbacks?.onRampLaunch?.(Math.abs(newFwd));
  }

  // 6. Visual pitch/roll and auto-right (visual only, safe for prediction).
  const targetRoll = clamp(-inp.steer * speedRatio * 0.16 - t.yawVel * 0.04, -0.55, 0.55);
  if (t.grounded) {
    t.roll = lerp(t.roll, targetRoll, clamp(dt * 5, 0, 1));
    if (Math.abs(t.roll) > tankCfg.autoRightRoll) {
      t.roll = 0;
      t.yawVel = 0;
    }
  }
  const normal = groundNormalAt(t.x, t.z);
  t.pitch = t.grounded ? lerp(t.pitch, pitchFromNormal(normal, t.yaw), clamp(dt * 8, 0, 1)) : t.pitch;
  t.drift = boosting && Math.abs(inp.steer) > 0.4;
  return hits;
}

/**
 * Resolve the oriented three-circle chassis footprint against every exact
 * obstacle rectangle, iterating to convergence. Returns contact normals so
 * the caller can apply velocity response.
 */
export function resolveTankFootprint(t: TankKinematicState, cfg: GameConfig): CollisionHit[] {
  const hits: CollisionHit[] = [];
  for (let iter = 0; iter < 3; iter++) {
    let corrected = false;
    for (const foot of cfg.tank.footprint) {
      const ox = Math.sin(t.yaw) * foot.offset;
      const oz = Math.cos(t.yaw) * foot.offset;
      const res = resolveCircleContacts(t.x + ox, t.z + oz, foot.radius);
      for (const c of res.contacts) {
        // Correction applies to the whole chassis.
        t.x += c.x - (t.x + ox);
        t.z += c.z - (t.z + oz);
        hits.push({ normalX: c.normalX, normalZ: c.normalZ, penetration: c.penetration, obstacleId: c.obstacleId });
        corrected = true;
      }
    }
    if (!corrected) break;
  }
  // Arena bounds: the contact resolver clamps internally, but that clamped
  // position is only returned as a correction when an obstacle box was hit.
  // The gate gaps have no wall box, so clamp the chassis explicitly and stop
  // the outward velocity component to prevent escaping or boundary jitter.
  const half = ARENA.half - 0.5;
  const clampedX = clamp(t.x, -half, half);
  const clampedZ = clamp(t.z, -half, half);
  if (clampedX !== t.x) t.vx = 0;
  if (clampedZ !== t.z) t.vz = 0;
  t.x = clampedX;
  t.z = clampedZ;
  // Velocity response: remove inward components for each contact.
  for (const hit of hits) {
    const r = applyVelocityResponse(t.vx, t.vz, hit.normalX, hit.normalZ);
    t.vx = r.vx;
    t.vz = r.vz;
  }
  return hits;
}

function approach(v: number, target: number, delta: number): number {
  if (v < target) return Math.min(v + delta, target);
  return Math.max(v - delta, target);
}
