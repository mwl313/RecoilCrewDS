import { angleLerp, clamp, lerp } from '../../shared/math';
import type { TankState } from '../../shared/types';

const TELEPORT_DISTANCE = 8;

/**
 * Render the local 30 Hz simulation as a continuous pose. Gameplay continues
 * to use the newest authoritative local state; only presentation is delayed by
 * one simulation tick so the tank and its camera share the same smooth anchor.
 */
export function interpolateSinglePlayerTank(
  previous: TankState | null,
  current: TankState,
  alpha: number,
): TankState {
  if (!previous) return current;

  const distance = Math.hypot(
    current.x - previous.x,
    current.y - previous.y,
    current.z - previous.z,
  );
  const deathStateChanged = (previous.deadT > 0) !== (current.deadT > 0);
  if (!Number.isFinite(distance) || distance > TELEPORT_DISTANCE || deathStateChanged) {
    return current;
  }

  const t = clamp(alpha, 0, 1);
  return {
    ...current,
    x: lerp(previous.x, current.x, t),
    y: lerp(previous.y, current.y, t),
    z: lerp(previous.z, current.z, t),
    vx: lerp(previous.vx, current.vx, t),
    vy: lerp(previous.vy, current.vy, t),
    vz: lerp(previous.vz, current.vz, t),
    yaw: angleLerp(previous.yaw, current.yaw, t),
    yawVel: lerp(previous.yawVel, current.yawVel, t),
    pitch: lerp(previous.pitch, current.pitch, t),
    roll: lerp(previous.roll, current.roll, t),
  };
}
