import type { TankState } from '../types';

/**
 * Authoritative enemy-attack target volume. The 0.6 m radius preserves the
 * historical projectile target radius; the vertical spine makes hits finite
 * in Y while covering the chassis and turret from the authoritative tank Y.
 */
export interface TankHurtCapsule {
  center: { x: number; y: number; z: number };
  radius: number;
  segmentStartY: number;
  segmentEndY: number;
}

export const TANK_HURT_RADIUS = 0.6;
export const TANK_HURT_SEGMENT_BOTTOM = 0.55;
export const TANK_HURT_SEGMENT_TOP = 1.55;

export function resolveTankHurtCapsule(tank: Pick<TankState, 'x' | 'y' | 'z'>): TankHurtCapsule {
  const segmentStartY = tank.y + TANK_HURT_SEGMENT_BOTTOM;
  const segmentEndY = tank.y + TANK_HURT_SEGMENT_TOP;
  return {
    center: {
      x: tank.x,
      y: (segmentStartY + segmentEndY) * 0.5,
      z: tank.z,
    },
    radius: TANK_HURT_RADIUS,
    segmentStartY,
    segmentEndY,
  };
}

export function intervalOverlapsTankHurtCapsule(
  minY: number,
  maxY: number,
  capsule: TankHurtCapsule,
): boolean {
  return maxY >= capsule.segmentStartY - capsule.radius &&
    minY <= capsule.segmentEndY + capsule.radius;
}

export function directionToTankHurtCenter(
  origin: { x: number; y: number; z: number },
  capsule: TankHurtCapsule,
): { x: number; y: number; z: number } {
  const dx = capsule.center.x - origin.x;
  const dy = capsule.center.y - origin.y;
  const dz = capsule.center.z - origin.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  return { x: dx / length, y: dy / length, z: dz / length };
}
