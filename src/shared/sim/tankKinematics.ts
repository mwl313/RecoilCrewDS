import { pitchFromNormal } from '../arena';
import type { GameConfig } from '../config';
import { clamp, lerp, pointInBox } from '../math';
import type { GroundQuery } from './groundQuery';
import { resolveArenaBounds, STATIC_GROUND_QUERY } from './groundQuery';
import type { DriverInput, MatchConfig } from '../types';
import { canTraverseGroundStep } from '../mapgen/terrainTraversal';

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
  /** Authoritative time until the next dash may be accepted (seconds). */
  dashCooldown: number;
  /** Short presentation window after an accepted dash (seconds). */
  dashPresentationT: number;
  drift: boolean;
  /** Landing momentum grace window (seconds); affects grip. */
  landingGripT: number;
  prevOnRamp?: boolean;
}

export interface TankKinematicsCallbacks {
  onHardCrash?(impactSpeed: number): void;
  onRampLaunch?(fwdSpeed: number): void;
  onHardFall?(fallSpeed: number): void;
  onJump?(): void;
  onDash?(): void;
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
 * Steering order: timers → jump edge → read input → update yaw → recompute
 * basis → rebuild velocity → dash edge → integrate → resolve the
 * three-circle footprint with substeps.
 */
export function stepTankKinematics(
  t: TankKinematicState,
  inp: DriverInput,
  cfg: GameConfig,
  mcfg: MatchConfig,
  dt: number,
  callbacks?: TankKinematicsCallbacks,
  ground: GroundQuery = STATIC_GROUND_QUERY,
): CollisionHit[] {
  const tankCfg = cfg.tank;
  const forward = { x: Math.sin(t.yaw), z: Math.cos(t.yaw) };
  const fwdSpeed = t.vx * forward.x + t.vz * forward.z;

  // Timers decrement by simulation time. The cooldown gates dash acceptance;
  // the presentation timer is cosmetic and deliberately independent.
  t.dashCooldown = Math.max(0, t.dashCooldown - dt);
  t.dashPresentationT = Math.max(0, t.dashPresentationT - dt);
  t.landingGripT = Math.max(0, t.landingGripT - dt);

  // Jump edge: grounded-only, before normal gravity integration. Launch
  // velocity derives identically on server, predictor, and Single Player from the
  // same resolved gravity and designer-facing jumpHeight.
  const jumped = inp.jumpPressed && t.grounded && tankCfg.jumpHeight > 0;
  if (jumped) {
    t.vy = Math.max(t.vy, Math.sqrt(2 * mcfg.gravity * tankCfg.jumpHeight));
    t.grounded = false;
    callbacks?.onJump?.();
  }

  const maxSpeed = tankCfg.forwardSpeed;
  const targetSpeed = inp.throttle >= 0 ? inp.throttle * maxSpeed : inp.throttle * tankCfg.reverseSpeed;
  const accel = inp.throttle >= 0 ? tankCfg.accel : tankCfg.reverseAccel;
  let newFwd = approach(fwdSpeed, targetSpeed, accel * dt);
  newFwd = Math.max(-tankCfg.reverseSpeed, Math.min(maxSpeed, newFwd));

  // Steering. Reverse reduces strength but NEVER flips A/D direction.
  const speedRatio = Math.abs(newFwd) / tankCfg.forwardSpeed;
  let steerRate = lerp(tankCfg.steerLow, tankCfg.steerHigh, speedRatio);
  if (!t.grounded) steerRate *= tankCfg.airControl;
  if (newFwd < -0.1) steerRate *= tankCfg.reverseSteerMult;

  // 1. Update yaw. Screen-right when viewed from behind is -X, so positive
  // steer (D) rotates the chassis toward -X (yaw decreases).
  t.yaw -= inp.steer * steerRate * dt;
  t.yaw += t.yawVel * dt;
  // Separate ground/air yaw damping: recoil spin persists longer in the air
  // without destabilizing ground handling.
  const yawDamping = t.grounded ? tankCfg.groundYawDamping : tankCfg.airYawDamping;
  t.yawVel *= Math.exp(-yawDamping * dt);

  // 2. Recompute the basis AFTER steering.
  const f2 = { x: Math.sin(t.yaw), z: Math.cos(t.yaw) };
  const lateralX = t.vx - forward.x * fwdSpeed;
  const lateralZ = t.vz - forward.z * fwdSpeed;
  // Aerial grip is reduced; landing grace briefly carries momentum.
  let grip = mcfg.grip;
  if (!t.grounded) grip *= tankCfg.airGripMultiplier;
  if (t.grounded && t.landingGripT > 0) grip *= tankCfg.landingGripMultiplier;
  const gripF = Math.exp(-grip * dt);
  // 3. Rebuild velocity with the NEW basis; preserve intentional lateral drift.
  t.vx = f2.x * newFwd + lateralX * gripF;
  t.vz = f2.z * newFwd + lateralZ * gripF;

  // 4. Dash edge: one instantaneous chassis-forward burst per sequenced
  // press, cooldown-gated. Lateral momentum is preserved; vertical velocity
  // is untouched; the horizontal speed cap preserves direction.
  if (inp.dashPressed && t.dashCooldown <= 0) {
    const strength = tankCfg.dashImpulse * (t.grounded ? 1 : tankCfg.dashAirMultiplier);
    if (strength > 0) {
      t.vx += Math.sin(t.yaw) * strength;
      t.vz += Math.cos(t.yaw) * strength;
      capHorizontalSpeed(t, tankCfg.dashMaxHorizontalSpeed);
      t.dashCooldown = tankCfg.dashCooldown;
      t.dashPresentationT = tankCfg.dashPresentationSeconds;
      callbacks?.onDash?.();
    }
  }

  // 5. Integrate with displacement-based substeps (dash/recoil/rammer/high speed).
  const displacement = Math.hypot(t.vx, t.vz) * dt;
  const substeps = Math.max(1, Math.min(tankCfg.maxSubsteps, Math.ceil(displacement / tankCfg.maxSafeStep)));
  const subDt = dt / substeps;
  let hits: CollisionHit[] = [];
  for (let s = 0; s < substeps; s++) {
    const nx = t.x + t.vx * subDt;
    const nz = t.z + t.vz * subDt;
    // Cliff/step guard: a grounded tank may never climb an upward step
    // above maxStepUp or cross a cliff wall upward. Downhill (falling)
    // movement is always allowed. Dash and recoil share these substeps.
    if (t.grounded && ground.queryTerrainTransition) {
      const transition = ground.queryTerrainTransition(t.x, t.z, nx, nz);
      if (transition && !canTraverseGroundStep(transition)) {
        t.vx = 0;
        t.vz = 0;
        t.y += t.vy * subDt;
        hits = hits.concat(resolveTankFootprint(t, cfg, ground));
        continue;
      }
    }
    t.x = nx;
    t.y += t.vy * subDt;
    t.z = nz;
    hits = hits.concat(resolveTankFootprint(t, cfg, ground));
  }

  // 6. Ground/air. A jump applied this step must not immediately snap back
  // to the ground; it integrates upward and stays airborne.
  const h = ground.groundHeightAt(t.x, t.z);
  const wasGrounded = t.grounded;
  const onRamp = ground.ramps.some((r) => pointInBox(t.x, t.z, r.x, r.z, r.w, r.d));
  if (!jumped && t.y <= h + 0.08) {
    if (!wasGrounded && t.vy < -tankCfg.fallDamageSpeed) {
      callbacks?.onHardFall?.(-t.vy);
    }
    t.y = h;
    t.vy = 0;
    t.grounded = true;
    if (!wasGrounded) t.landingGripT = tankCfg.landingGripSeconds;
  } else {
    t.vy -= mcfg.gravity * dt;
    t.grounded = false;
  }
  // Ramp launch: leaving a ramp at speed launches the tank.
  const wasOnRamp = t.prevOnRamp === true;
  t.prevOnRamp = onRamp;
  if (wasOnRamp && !onRamp && Math.abs(newFwd) > 7) {
    const rampLaunch = tankCfg.rampLaunchSpeed * Math.min(1, Math.abs(newFwd) / tankCfg.forwardSpeed);
    t.vy = rampLaunch;
    t.grounded = false;
    callbacks?.onRampLaunch?.(Math.abs(newFwd));
  }

  // 7. Visual pitch/roll and auto-right (visual only, safe for prediction).
  const targetRoll = clamp(-inp.steer * speedRatio * 0.16 - t.yawVel * 0.04, -0.55, 0.55);
  if (t.grounded) {
    t.roll = lerp(t.roll, targetRoll, clamp(dt * 5, 0, 1));
    if (Math.abs(t.roll) > tankCfg.autoRightRoll) {
      t.roll = 0;
      t.yawVel = 0;
    }
  } else {
    // Airborne visual roll from steering + yaw velocity, clamped to the
    // content limit. Presentation only: never used by collision or basis.
    const airRoll = clamp(
      -inp.steer * speedRatio * 0.16 - t.yawVel * 0.04,
      -tankCfg.maxVisualAirRoll,
      tankCfg.maxVisualAirRoll,
    );
    t.roll = lerp(t.roll, airRoll, clamp(dt * tankCfg.visualAirLevelRate, 0, 1));
  }
  const normal = ground.groundNormalAt(t.x, t.z);
  if (t.grounded) {
    t.pitch = lerp(t.pitch, pitchFromNormal(normal, t.yaw), clamp(dt * 8, 0, 1));
  } else {
    // Airborne visual pitch from vertical velocity (recoil changes vy, so
    // downward cannon shots pitch the nose up), clamped and never inverted.
    const airPitch = clamp(t.vy * 0.02, -tankCfg.maxVisualAirPitch, tankCfg.maxVisualAirPitch);
    t.pitch = lerp(t.pitch, airPitch, clamp(dt * tankCfg.visualAirLevelRate, 0, 1));
  }
  // Drift is a presentation label for hard cornering at speed (no boost
  // state exists anymore).
  t.drift = t.grounded && Math.abs(inp.steer) > 0.4 && Math.abs(newFwd) > 6;
  return hits;
}

function capHorizontalSpeed(t: TankKinematicState, maxHorizontalSpeed: number): void {
  if (maxHorizontalSpeed <= 0) return;
  const speed = Math.hypot(t.vx, t.vz);
  if (speed > maxHorizontalSpeed) {
    const k = maxHorizontalSpeed / speed;
    t.vx *= k;
    t.vz *= k;
  }
}

/**
 * Resolve the oriented three-circle chassis footprint against every exact
 * obstacle rectangle, iterating to convergence. Returns contact normals so
 * the caller can apply velocity response.
 */
export function resolveTankFootprint(
  t: TankKinematicState,
  cfg: GameConfig,
  ground: GroundQuery = STATIC_GROUND_QUERY,
): CollisionHit[] {
  const hits: CollisionHit[] = [];
  for (let iter = 0; iter < 3; iter++) {
    let corrected = false;
    for (const foot of cfg.tank.footprint) {
      const ox = Math.sin(t.yaw) * foot.offset;
      const oz = Math.cos(t.yaw) * foot.offset;
      const res = ground.resolveCircleContacts(t.x + ox, t.z + oz, foot.radius);
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
  // Arena bounds are axis-aware: generated arenas may be rectangular or
  // offset from the origin, so the clamp must not assume ±(half - 0.5).
  const b = resolveArenaBounds(ground);
  const clampedX = clamp(t.x, b.minX + 0.5, b.maxX - 0.5);
  const clampedZ = clamp(t.z, b.minZ + 0.5, b.maxZ - 0.5);
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
