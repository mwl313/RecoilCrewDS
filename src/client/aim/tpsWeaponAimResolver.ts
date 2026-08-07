import { angleLerp, clamp, wrapAngle } from '../../shared/math';
import {
  computeAimPivotWorld,
  type PitchLimits,
  type TankPose,
  type TankRigDefinition,
  type TurretAimSolution,
  type Vec3,
} from '../../shared/vehicle/tankRigGeometry';

const DIRECTION_EPSILON = 1e-8;

export const TPS_PARALLAX_SAFETY = {
  softStart: (10 * Math.PI) / 180,
  asymptoticLimit: (14 * Math.PI) / 180,
} as const;

export const TPS_VERTICAL_AIM_ASSIST = {
  pitchStartPitch: (70 * Math.PI) / 180,
  yawStartPitch: (78 * Math.PI) / 180,
  lockPitch: (84 * Math.PI) / 180,
} as const;

/** Compatibility diagnostics expressed as horizontal direction ratios. */
export const TPS_AIM_POLE_THRESHOLDS = {
  blendInner: Math.cos(TPS_VERTICAL_AIM_ASSIST.lockPitch),
  enter: Math.cos(TPS_VERTICAL_AIM_ASSIST.lockPitch),
  exit: Math.cos(TPS_VERTICAL_AIM_ASSIST.yawStartPitch),
  blendOuter: Math.cos(TPS_VERTICAL_AIM_ASSIST.yawStartPitch),
} as const;

export interface TpsWeaponAimState {
  poleActive: boolean;
  /** World yaw captured before yaw loses meaning near a vertical pole. */
  lockedWorldYaw?: number;
  /** Previous stable output used when a frame jumps directly into the lock. */
  lastResolvedWorldYaw?: number;
  /** Distinguishes a direct jump from the downward pole to the upward pole. */
  lockedPoleSign?: -1 | 1;
}

export interface TpsWeaponAimDiagnostics {
  targetDistance: number;
  horizontalDistance: number;
  horizontalRatio: number;
  cameraHorizontalRatio: number;
  conditioningRatio: number;
  parallaxDivergence: number;
  parallaxOutputDivergence: number;
  parallaxLimited: boolean;
  pitchAssistWeight: number;
  poleBlendWeight: number;
  poleActive: boolean;
  verticalLocked: boolean;
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

function compressParallaxDivergence(divergence: number): number {
  if (divergence <= TPS_PARALLAX_SAFETY.softStart) return divergence;
  const span = TPS_PARALLAX_SAFETY.asymptoticLimit - TPS_PARALLAX_SAFETY.softStart;
  return TPS_PARALLAX_SAFETY.softStart
    + span * (1 - Math.exp(-(divergence - TPS_PARALLAX_SAFETY.softStart) / span));
}

/**
 * Resolve ordinary over-the-shoulder parallax, then enter an angular vertical
 * assist before the camera reaches its visual pole. Pitch and shortest-path
 * yaw are solved separately: raw direction vectors are never allowed to
 * cancel and feed an unstable atan2 near straight up/down.
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

  const rawWorldPitch = targetDistance > DIRECTION_EPSILON
    ? Math.atan2(dy, horizontalDistance)
    : input.cameraPitch;
  const rawWorldYaw = horizontalDistance > DIRECTION_EPSILON
    ? Math.atan2(dx, dz)
    : input.cameraYaw;
  const pitchDelta = rawWorldPitch - input.cameraPitch;
  const yawDelta = angleLerp(input.cameraYaw, rawWorldYaw, 1) - input.cameraYaw;
  // Approximate the local angular cone. Yaw loses physical significance near
  // a vertical pole, so weight it by the camera's horizontal component.
  const weightedYawDelta = yawDelta * Math.abs(Math.cos(input.cameraPitch));
  const parallaxDivergence = Math.hypot(pitchDelta, weightedYawDelta);
  const parallaxOutputDivergence = compressParallaxDivergence(parallaxDivergence);
  const parallaxScale = parallaxDivergence > DIRECTION_EPSILON
    ? parallaxOutputDivergence / parallaxDivergence
    : 1;
  // Normal terrain following is byte-for-byte equivalent below 10°. Beyond
  // that, close-wall parallax is compressed continuously toward a 14° cone
  // rather than snapping to a separate aiming mode.
  const worldPitch = input.cameraPitch + pitchDelta * parallaxScale;
  const worldYaw = wrapAngle(input.cameraYaw + yawDelta * parallaxScale);
  const absoluteCameraPitch = Math.abs(input.cameraPitch);
  const pitchAssistT = (
    absoluteCameraPitch - TPS_VERTICAL_AIM_ASSIST.pitchStartPitch
  ) / (
    TPS_VERTICAL_AIM_ASSIST.lockPitch - TPS_VERTICAL_AIM_ASSIST.pitchStartPitch
  );
  const yawAssistT = (
    absoluteCameraPitch - TPS_VERTICAL_AIM_ASSIST.yawStartPitch
  ) / (
    TPS_VERTICAL_AIM_ASSIST.lockPitch - TPS_VERTICAL_AIM_ASSIST.yawStartPitch
  );
  const pitchAssistWeight = smoothstep01(pitchAssistT);
  const poleBlendWeight = smoothstep01(yawAssistT);
  const verticalLocked = pitchAssistWeight >= 1 - 1e-8;
  state.poleActive = poleBlendWeight > 0;
  const poleSign: -1 | 1 = input.cameraPitch < 0 ? -1 : 1;

  if (state.poleActive && (
    state.lockedWorldYaw === undefined || state.lockedPoleSign !== poleSign
  )) {
    // A normal sweep carries its previous stable yaw into the pole. A direct
    // one-frame jump to full lock uses camera heading rather than the offset
    // shoulder-camera terrain point.
    state.lockedWorldYaw = state.lastResolvedWorldYaw
      ?? (verticalLocked ? input.cameraYaw : worldYaw);
    state.lockedPoleSign = poleSign;
  } else if (!state.poleActive) {
    state.lockedWorldYaw = undefined;
    state.lockedPoleSign = undefined;
  }

  const resolvedWorldYaw = state.lockedWorldYaw === undefined
    ? worldYaw
    : angleLerp(worldYaw, state.lockedWorldYaw, poleBlendWeight);
  const verticalPitch = poleSign < 0
    ? input.limits.minPitch
    : input.limits.maxPitch;
  const resolvedPitch = clamp(
    worldPitch + (verticalPitch - worldPitch) * pitchAssistWeight,
    input.limits.minPitch,
    input.limits.maxPitch,
  );
  state.lastResolvedWorldYaw = resolvedWorldYaw;

  return {
    desiredYawLocal: wrapAngle(resolvedWorldYaw - input.tank.yaw),
    desiredPitch: resolvedPitch,
    diagnostics: {
      targetDistance,
      horizontalDistance,
      horizontalRatio,
      cameraHorizontalRatio,
      conditioningRatio,
      parallaxDivergence,
      parallaxOutputDivergence,
      parallaxLimited: parallaxScale < 1 - 1e-8,
      pitchAssistWeight,
      poleBlendWeight,
      poleActive: state.poleActive,
      verticalLocked,
      resolvedWorldYaw,
      resolvedPitch,
    },
  };
}
