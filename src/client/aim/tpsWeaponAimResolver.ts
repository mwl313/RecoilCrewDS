import { clamp, wrapAngle } from '../../shared/math';
import {
  computeAimPivotWorld,
  type PitchLimits,
  type TankPose,
  type TankRigDefinition,
  type TurretAimSolution,
  type Vec3,
} from '../../shared/vehicle/tankRigGeometry';

const DIRECTION_EPSILON = 1e-8;

/** Geometry-derived pole conditioning. Values are ratios, not angles. */
export const TPS_AIM_POLE_THRESHOLDS = {
  blendInner: 0.035,
  enter: 0.08,
  exit: 0.14,
  blendOuter: 0.18,
} as const;

export interface TpsWeaponAimState {
  poleActive: boolean;
}

export interface TpsWeaponAimDiagnostics {
  targetDistance: number;
  horizontalDistance: number;
  horizontalRatio: number;
  cameraHorizontalRatio: number;
  conditioningRatio: number;
  poleBlendWeight: number;
  poleActive: boolean;
  resolvedWorldYaw: number;
  resolvedPitch: number;
}

export interface TpsWeaponAimResult extends TurretAimSolution {
  diagnostics: TpsWeaponAimDiagnostics;
}

export interface TpsWeaponAimInput {
  tank: TankPose;
  rig: TankRigDefinition;
  worldTarget: Vec3;
  cameraYaw: number;
  cameraPitch: number;
  limits: PitchLimits;
}

function smoothstep01(value: number): number {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function cameraIntentDirection(yaw: number, pitch: number): Vec3 {
  const cosPitch = Math.cos(pitch);
  return {
    x: Math.sin(yaw) * cosPitch,
    y: Math.sin(pitch),
    z: Math.cos(yaw) * cosPitch,
  };
}

/**
 * Resolve over-the-shoulder parallax without allowing an ill-conditioned
 * world-point yaw to take control near straight up/down. Direction vectors
 * are blended; Euler yaw is derived only after the direction is stable.
 */
export function resolveTpsWeaponAim(
  input: TpsWeaponAimInput,
  state: TpsWeaponAimState,
): TpsWeaponAimResult {
  const pivot = computeAimPivotWorld(input.tank, input.rig);
  const dx = input.worldTarget.x - pivot.x;
  const dy = input.worldTarget.y - pivot.y;
  const dz = input.worldTarget.z - pivot.z;
  const horizontalDistance = Math.hypot(dx, dz);
  const targetDistance = Math.hypot(dx, dy, dz);
  const horizontalRatio = targetDistance > DIRECTION_EPSILON
    ? horizontalDistance / targetDistance
    : 0;
  // A pole-safe physical boom intentionally leaves the camera eye laterally
  // offset at exact vertical. Its terrain hit therefore need not sit above
  // the turret pivot, even though the player's angular intent is singular.
  // Keep the direct world-target metric, but let either geometric condition
  // engage the same direction-space fallback.
  const cameraHorizontalRatio = Math.abs(Math.cos(input.cameraPitch));
  const conditioningRatio = Math.min(horizontalRatio, cameraHorizontalRatio);

  if (state.poleActive) {
    if (conditioningRatio >= TPS_AIM_POLE_THRESHOLDS.exit) state.poleActive = false;
  } else if (conditioningRatio <= TPS_AIM_POLE_THRESHOLDS.enter) {
    state.poleActive = true;
  }

  const cameraDirection = cameraIntentDirection(input.cameraYaw, input.cameraPitch);
  const worldDirection = targetDistance > DIRECTION_EPSILON
    ? { x: dx / targetDistance, y: dy / targetDistance, z: dz / targetDistance }
    : cameraDirection;
  const blendT = (
    TPS_AIM_POLE_THRESHOLDS.blendOuter - conditioningRatio
  ) / (
    TPS_AIM_POLE_THRESHOLDS.blendOuter - TPS_AIM_POLE_THRESHOLDS.blendInner
  );
  const basePoleBlendWeight = smoothstep01(blendT);
  // On the way back out of the pole, retain a small extra amount of stable
  // camera authority inside the enter/exit band. The sinusoidal term is zero
  // at both switching thresholds, so hysteresis cannot introduce a jump.
  const hysteresisT = (
    conditioningRatio - TPS_AIM_POLE_THRESHOLDS.enter
  ) / (
    TPS_AIM_POLE_THRESHOLDS.exit - TPS_AIM_POLE_THRESHOLDS.enter
  );
  const hysteresisWeight = state.poleActive && hysteresisT > 0 && hysteresisT < 1
    ? Math.sin(Math.PI * hysteresisT) * 0.08
    : 0;
  const poleBlendWeight = clamp(basePoleBlendWeight + hysteresisWeight, 0, 1);
  const worldWeight = 1 - poleBlendWeight;
  let bx = worldDirection.x * worldWeight + cameraDirection.x * poleBlendWeight;
  let by = worldDirection.y * worldWeight + cameraDirection.y * poleBlendWeight;
  let bz = worldDirection.z * worldWeight + cameraDirection.z * poleBlendWeight;
  const blendedLength = Math.hypot(bx, by, bz);
  if (blendedLength > DIRECTION_EPSILON) {
    bx /= blendedLength;
    by /= blendedLength;
    bz /= blendedLength;
  } else {
    bx = cameraDirection.x;
    by = cameraDirection.y;
    bz = cameraDirection.z;
  }

  const resolvedFlat = Math.hypot(bx, bz);
  // At the exact pole, yaw is the player's stored camera intent. atan2(0,0)
  // is never treated as a meaningful direction.
  const resolvedWorldYaw = resolvedFlat > DIRECTION_EPSILON
    ? Math.atan2(bx, bz)
    : input.cameraYaw;
  const resolvedPitch = clamp(
    Math.atan2(by, resolvedFlat),
    input.limits.minPitch,
    input.limits.maxPitch,
  );

  return {
    desiredYawLocal: wrapAngle(resolvedWorldYaw - input.tank.yaw),
    desiredPitch: resolvedPitch,
    diagnostics: {
      targetDistance,
      horizontalDistance,
      horizontalRatio,
      cameraHorizontalRatio,
      conditioningRatio,
      poleBlendWeight,
      poleActive: state.poleActive,
      resolvedWorldYaw,
      resolvedPitch,
    },
  };
}
