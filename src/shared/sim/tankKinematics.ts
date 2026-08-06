import { pitchFromNormal } from '../arena';
import type { GameConfig } from '../config';
import { clamp, lerp, pointInBox } from '../math';
import type { GroundQuery } from './groundQuery';
import { resolveArenaBounds, STATIC_GROUND_QUERY } from './groundQuery';
import type { DriverInput, MatchConfig, TankDashState } from '../types';
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
  /** Authoritative Dash contact-damage window (seconds remaining). */
  dashDamageT: number;
  dashState?: TankDashState;
  dashStateT?: number;
  dashDirectionX?: number;
  dashDirectionZ?: number;
  dashPeakSpeed?: number;
  dashSpeed?: number;
  dashSteeringMultiplier?: number;
  drift: boolean;
  /** Landing momentum grace window (seconds); affects grip. */
  landingGripT: number;
  prevOnRamp?: boolean;
}

export interface TankKinematicsCallbacks {
  onHardCrash?(impactSpeed: number): void;
  onRampLaunch?(fwdSpeed: number): void;
  onJump?(): void;
  onDash?(): void;
}

export interface CollisionHit {
  normalX: number;
  normalZ: number;
  penetration: number;
  obstacleId?: string;
}

export interface TankKinematicsOptions {
  /** Frozen Phase-0 Demo compatibility; production/content matches use stateful. */
  dashModel?: 'stateful' | 'legacyImpulse';
}

export interface TankDashDiagnostics {
  state: TankDashState;
  elapsed: number;
  baseSpeed: number;
  dashSpeed: number;
  finalSpeed: number;
  capturedDirection: { x: number; z: number };
  steeringMultiplier: number;
  cooldown: number;
}

/** Development-only values derived from the same replicated state as the simulation. */
export function tankDashDiagnostics(t: TankKinematicState): TankDashDiagnostics {
  const dx = finiteOr(t.dashDirectionX, 0);
  const dz = finiteOr(t.dashDirectionZ, 1);
  const dashSpeed = Math.max(0, finiteOr(t.dashSpeed, 0));
  return {
    state: t.dashState ?? 'inactive',
    elapsed: Math.max(0, finiteOr(t.dashStateT, 0)),
    baseSpeed: Math.hypot(t.vx - dx * dashSpeed, t.vz - dz * dashSpeed),
    dashSpeed,
    finalSpeed: Math.hypot(t.vx, t.vz),
    capturedDirection: { x: dx, z: dz },
    steeringMultiplier: clamp(finiteOr(t.dashSteeringMultiplier, 1), 0, 1),
    cooldown: Math.max(0, t.dashCooldown),
  };
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
  options: TankKinematicsOptions = {},
): CollisionHit[] {
  const tankCfg = cfg.tank;
  normalizeDashState(t);
  const legacyImpulseDash = options.dashModel === 'legacyImpulse';
  if (legacyImpulseDash) {
    // The deterministic Phase-0 Demo is a frozen compatibility contract.
    // Its impulse model remains isolated here; validated content matches use
    // the stateful model and replicated phase below.
    t.dashSpeed = 0;
    t.dashPeakSpeed = 0;
    t.dashSteeringMultiplier = 1;
  }
  // Remove last tick's temporary contribution before ordinary driving is
  // decomposed and clamped. External recoil/contact velocity remains base
  // movement and therefore is never mistaken for dash velocity.
  const previousDashSpeed = t.dashSpeed!;
  const baseVx = t.vx - t.dashDirectionX! * previousDashSpeed;
  const baseVz = t.vz - t.dashDirectionZ! * previousDashSpeed;
  const forward = { x: Math.sin(t.yaw), z: Math.cos(t.yaw) };
  const fwdSpeed = baseVx * forward.x + baseVz * forward.z;

  // Timers decrement by simulation time. The cooldown gates dash acceptance;
  // the presentation timer is cosmetic and deliberately independent.
  t.dashCooldown = Math.max(0, t.dashCooldown - dt);
  t.dashPresentationT = Math.max(0, t.dashPresentationT - dt);
  t.dashDamageT = Math.max(0, t.dashDamageT - dt);
  t.landingGripT = Math.max(0, t.landingGripT - dt);
  if (!legacyImpulseDash) advanceDashState(t, tankCfg, dt);

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
  steerRate *= t.dashSteeringMultiplier!;

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
  const lateralX = baseVx - forward.x * fwdSpeed;
  const lateralZ = baseVz - forward.z * fwdSpeed;
  // Aerial grip is reduced; landing grace briefly carries momentum.
  let grip = mcfg.grip;
  if (!t.grounded) grip *= tankCfg.airGripMultiplier;
  if (t.grounded && t.landingGripT > 0) grip *= tankCfg.landingGripMultiplier;
  const gripF = Math.exp(-grip * dt);
  // 3. Rebuild velocity with the NEW basis; preserve intentional lateral drift.
  let nextBaseVx = f2.x * newFwd + lateralX * gripF;
  let nextBaseVz = f2.z * newFwd + lateralZ * gripF;

  // 4. Dash edge: enter a temporary authoritative movement state. Capture
  // chassis forward only at the accepted edge; camera, turret, and current
  // velocity direction cannot affect the burst direction.
  if (inp.dashPressed && t.dashCooldown <= 0) {
    if (legacyImpulseDash) {
      const strength = tankCfg.dashImpulse * (t.grounded ? 1 : tankCfg.dashAirMultiplier);
      if (strength > 0) {
        t.vx = nextBaseVx + Math.sin(t.yaw) * strength;
        t.vz = nextBaseVz + Math.cos(t.yaw) * strength;
        capHorizontalSpeed(t, tankCfg.dashMaxHorizontalSpeed);
        t.dashState = 'burst';
        t.dashDirectionX = Math.sin(t.yaw);
        t.dashDirectionZ = Math.cos(t.yaw);
        t.dashCooldown = tankCfg.dashCooldown;
        t.dashPresentationT = tankCfg.dashPresentationSeconds;
        t.dashDamageT = tankCfg.dashDamageWindowSeconds;
        callbacks?.onDash?.();
      }
    } else {
    const airMultiplier = t.grounded ? 1 : tankCfg.dashAirMultiplier;
    const peakTotalSpeed = Math.max(
      tankCfg.forwardSpeed * tankCfg.dashPeakSpeedMultiplier,
      tankCfg.forwardSpeed + tankCfg.dashImpulse,
    ) * airMultiplier;
    if (peakTotalSpeed > 0) {
      t.dashDirectionX = Math.sin(t.yaw);
      t.dashDirectionZ = Math.cos(t.yaw);
      const baseAlongDash = nextBaseVx * t.dashDirectionX + nextBaseVz * t.dashDirectionZ;
      t.dashPeakSpeed = Math.max(0, peakTotalSpeed - baseAlongDash);
      t.dashState = 'burst';
      t.dashStateT = Math.min(dt, tankCfg.dashBurstSeconds);
      t.dashSpeed = dashCurveSpeed(t, tankCfg);
      t.dashSteeringMultiplier = dashSteeringMultiplier(t, tankCfg);
      t.dashCooldown = tankCfg.dashCooldown;
      t.dashPresentationT = tankCfg.dashPresentationSeconds;
      t.dashDamageT = tankCfg.dashDamageWindowSeconds;
      callbacks?.onDash?.();
    }
    }
  }
  if (!legacyImpulseDash) {
    t.vx = nextBaseVx + t.dashDirectionX! * t.dashSpeed!;
    t.vz = nextBaseVz + t.dashDirectionZ! * t.dashSpeed!;
    capHorizontalSpeed(t, t.dashState === 'inactive' ? 0 : tankCfg.dashMaxHorizontalSpeed);
  } else if (!(inp.dashPressed && t.dashCooldown === tankCfg.dashCooldown)) {
    t.vx = nextBaseVx;
    t.vz = nextBaseVz;
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
  // A wall directly opposing the captured burst ends damage immediately and
  // transfers the remainder into recovery. Tangential sliding is preserved.
  if (
    t.dashState === 'burst' &&
    hits.some((hit) => hit.normalX * t.dashDirectionX! + hit.normalZ * t.dashDirectionZ! < -0.25)
  ) {
    t.dashState = 'recovery';
    t.dashStateT = 0;
    t.dashPeakSpeed = t.dashSpeed! / Math.max(0.001, tankCfg.dashRecoveryStartRatio);
    t.dashDamageT = 0;
  }

  // Natural surface crest launch. Before the grounded snap, sample terrain
  // behind, at, and ahead of the tank along the ACTUAL horizontal movement
  // direction (not chassis forward), so recoil, drift, dash, and reverse
  // motion behave consistently. A launch is accepted only when the tank
  // arrived from a meaningful uphill slope and the surface ahead becomes
  // flat or descends.
  let crestLaunched = false;
  if (t.grounded && !jumped) {
    const speed = Math.hypot(t.vx, t.vz);
    if (speed >= tankCfg.surfaceLaunchMinSpeed) {
      const dirX = t.vx / speed;
      const dirZ = t.vz / speed;
      const lookBehind = tankCfg.surfaceLaunchLookBehind;
      const lookAhead = tankCfg.surfaceLaunchLookAhead;
      const behindHeight = ground.groundHeightAt(t.x - dirX * lookBehind, t.z - dirZ * lookBehind);
      const currentHeight = ground.groundHeightAt(t.x, t.z);
      const aheadHeight = ground.groundHeightAt(t.x + dirX * lookAhead, t.z + dirZ * lookAhead);
      const incomingGrade = (currentHeight - behindHeight) / lookBehind;
      const outgoingGrade = (aheadHeight - currentHeight) / lookAhead;
      if (
        incomingGrade >= tankCfg.surfaceLaunchMinIncomingGrade &&
        outgoingGrade <= tankCfg.surfaceLaunchMaxOutgoingGrade
      ) {
        const launchVy = clamp(
          speed * incomingGrade * tankCfg.surfaceLaunchRetention,
          tankCfg.surfaceLaunchMinVy,
          tankCfg.surfaceLaunchMaxVy,
        );
        t.y = currentHeight + tankCfg.surfaceLaunchDetachEpsilon;
        t.vy = Math.max(t.vy, launchVy);
        t.grounded = false;
        crestLaunched = true;
        callbacks?.onRampLaunch?.(speed);
      }
    }
  }

  // 6. Ground/air. A jump applied this step must not immediately snap back
  // to the ground; it integrates upward and stays airborne.
  const h = ground.groundHeightAt(t.x, t.z);
  const wasGrounded = t.grounded;
  const onRamp = ground.ramps.some((r) => pointInBox(t.x, t.z, r.x, r.z, r.w, r.d));
  if (!jumped && !crestLaunched && t.y <= h + 0.08) {
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
  if (!crestLaunched && wasOnRamp && !onRamp && Math.abs(newFwd) > 7) {
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

function normalizeDashState(t: TankKinematicState): void {
  t.dashState = t.dashState ?? 'inactive';
  t.dashStateT = Math.max(0, finiteOr(t.dashStateT, 0));
  t.dashDirectionX = finiteOr(t.dashDirectionX, 0);
  t.dashDirectionZ = finiteOr(t.dashDirectionZ, 1);
  const length = Math.hypot(t.dashDirectionX, t.dashDirectionZ);
  if (length > 0.0001) {
    t.dashDirectionX /= length;
    t.dashDirectionZ /= length;
  } else {
    t.dashDirectionX = 0;
    t.dashDirectionZ = 1;
  }
  t.dashPeakSpeed = Math.max(0, finiteOr(t.dashPeakSpeed, 0));
  t.dashSpeed = Math.max(0, finiteOr(t.dashSpeed, 0));
  t.dashSteeringMultiplier = clamp(finiteOr(t.dashSteeringMultiplier, 1), 0, 1);
}

function advanceDashState(t: TankKinematicState, cfg: GameConfig['tank'], dt: number): void {
  if (t.dashState === 'inactive') {
    t.dashStateT = 0;
    t.dashSpeed = 0;
    t.dashPeakSpeed = 0;
    t.dashSteeringMultiplier = 1;
    return;
  }
  t.dashStateT! += Math.max(0, dt);
  if (t.dashState === 'burst' && t.dashStateT! >= cfg.dashBurstSeconds) {
    t.dashState = 'recovery';
    t.dashStateT = Math.max(0, t.dashStateT! - cfg.dashBurstSeconds);
    t.dashDamageT = 0;
  }
  if (t.dashState === 'recovery' && t.dashStateT! >= cfg.dashRecoverySeconds) {
    t.dashState = 'inactive';
    t.dashStateT = 0;
    t.dashSpeed = 0;
    t.dashPeakSpeed = 0;
    t.dashSteeringMultiplier = 1;
    return;
  }
  t.dashSpeed = dashCurveSpeed(t, cfg);
  t.dashSteeringMultiplier = dashSteeringMultiplier(t, cfg);
}

function dashCurveSpeed(t: TankKinematicState, cfg: GameConfig['tank']): number {
  if (t.dashState === 'inactive') return 0;
  if (t.dashState === 'recovery') {
    const u = clamp(t.dashStateT! / Math.max(0.001, cfg.dashRecoverySeconds), 0, 1);
    return t.dashPeakSpeed! * cfg.dashRecoveryStartRatio * (1 - smoothstep(u));
  }
  if (t.dashStateT! <= cfg.dashAccelerationSeconds) {
    return t.dashPeakSpeed! * smoothstep(t.dashStateT! / Math.max(0.001, cfg.dashAccelerationSeconds));
  }
  const decayDuration = Math.max(0.001, cfg.dashBurstSeconds - cfg.dashAccelerationSeconds);
  const u = clamp((t.dashStateT! - cfg.dashAccelerationSeconds) / decayDuration, 0, 1);
  return t.dashPeakSpeed! * lerp(1, cfg.dashRecoveryStartRatio, smoothstep(u));
}

function dashSteeringMultiplier(t: TankKinematicState, cfg: GameConfig['tank']): number {
  if (t.dashState === 'inactive') return 1;
  if (t.dashState === 'recovery') {
    const u = clamp(t.dashStateT! / Math.max(0.001, cfg.dashRecoverySeconds), 0, 1);
    return lerp(cfg.dashLateSteeringInfluence, 1, smoothstep(u));
  }
  if (t.dashStateT! <= cfg.dashDirectionLockSeconds) return 0;
  const remaining = Math.max(0.001, cfg.dashBurstSeconds - cfg.dashDirectionLockSeconds);
  return cfg.dashLateSteeringInfluence * smoothstep((t.dashStateT! - cfg.dashDirectionLockSeconds) / remaining);
}

function smoothstep(value: number): number {
  const u = clamp(value, 0, 1);
  return u * u * (3 - 2 * u);
}

function finiteOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
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
      const res = ground.resolveCircleContacts(t.x + ox, t.z + oz, foot.radius, t.y);
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
