import type { TankRigDefinition } from '../content/schemas/tank';

/**
 * Three.js-free weapon-mount geometry shared by the authoritative server,
 * client prediction/VFX, and the trajectory crosshair. The transform
 * pipeline is exactly:
 *
 *   chassis position + chassis yaw
 *     → turret pivot (chassis-local)
 *     → turret local yaw
 *     → barrel pivot (turret-local)
 *     → barrel pitch
 *     → muzzle local (barrel-local)
 *
 * No gameplay or presentation code may reconstruct these offsets with its
 * own constants.
 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface TankPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch?: number;
  roll?: number;
}

export interface TurretPose {
  yaw: number;
  pitch: number;
}

export interface WeaponMountWorldPose {
  turretPivot: Vec3;
  barrelPivot: Vec3;
  muzzle: Vec3;
  direction: Vec3;
}

export interface TurretAimSolution {
  desiredYawLocal: number;
  desiredPitch: number;
}

export interface PitchLimits {
  minPitch: number;
  maxPitch: number;
}

export type GroundHeightAt = (x: number, z: number) => number;

function vec(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

function add(a: Vec3, b: Vec3): Vec3 {
  return vec(a.x + b.x, a.y + b.y, a.z + b.z);
}

function rotateY(v: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return vec(v.x * c + v.z * s, v.y, -v.x * s + v.z * c);
}

function rotateX(v: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return vec(v.x, v.y * c - v.z * s, v.y * s + v.z * c);
}

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return vec(v.x / len, v.y / len, v.z / len);
}

function wrapAngle(a: number): number {
  const tau = Math.PI * 2;
  let out = ((a + Math.PI) % tau + tau) % tau - Math.PI;
  if (out === -Math.PI) out = Math.PI;
  return out;
}

export function computeWeaponMountWorldPose(
  tank: TankPose,
  turret: TurretPose,
  rig: TankRigDefinition,
): WeaponMountWorldPose {
  const worldYaw = tank.yaw + turret.yaw;
  const pitch = turret.pitch;
  const turretPivot = add(vec(tank.x, tank.y, tank.z), rotateY(vec(rig.turretPivot[0], rig.turretPivot[1], rig.turretPivot[2]), tank.yaw));
  const barrelPivot = add(turretPivot, rotateY(vec(rig.barrelPivot[0], rig.barrelPivot[1], rig.barrelPivot[2]), worldYaw));
  const muzzle = add(barrelPivot, rotateY(rotateX(vec(rig.muzzleLocal[0], rig.muzzleLocal[1], rig.muzzleLocal[2]), -pitch), worldYaw));
  const forwardAxis = rig.forwardAxis ?? [0, 0, 1];
  const direction = normalize(rotateY(rotateX(vec(forwardAxis[0], forwardAxis[1], forwardAxis[2]), -pitch), worldYaw));
  return { turretPivot, barrelPivot, muzzle, direction };
}

/**
 * Back the projectile origin up along the barrel line when an extreme
 * downward pose puts the authored visual muzzle below terrain. This keeps
 * the deliberate under-tank ground detonation while preventing a shell from
 * beginning underground. Recoil continues to use the unchanged direction.
 */
export function resolveTerrainSafeMuzzle(
  mount: WeaponMountWorldPose,
  groundHeightAt: GroundHeightAt,
  clearance = 0.08,
): Vec3 {
  const origin = { ...mount.muzzle };
  if (!Number.isFinite(origin.x + origin.y + origin.z)) return origin;

  for (let i = 0; i < 3; i++) {
    const floor = groundHeightAt(origin.x, origin.z) + clearance;
    if (origin.y >= floor) return origin;
    if (mount.direction.y < -1e-5) {
      const backtrack = (floor - origin.y) / -mount.direction.y + 1e-4;
      origin.x -= mount.direction.x * backtrack;
      origin.y -= mount.direction.y * backtrack;
      origin.z -= mount.direction.z * backtrack;
    } else {
      origin.y = floor;
      return origin;
    }
  }

  origin.y = Math.max(origin.y, groundHeightAt(origin.x, origin.z) + clearance);
  return origin;
}

/** World position of the rig's aim pivot (camera/turret solve reference). */
export function computeAimPivotWorld(tank: TankPose, rig: TankRigDefinition): Vec3 {
  return add(vec(tank.x, tank.y, tank.z), rotateY(vec(rig.aimPivotLocal[0], rig.aimPivotLocal[1], rig.aimPivotLocal[2]), tank.yaw));
}

/**
 * Solve desired turret yaw (chassis-local) and pitch toward a world point
 * from the resolved rig aim pivot. The server receives the solved values,
 * never a trusted hit point.
 */
export function solveTurretAim(
  tank: TankPose,
  rig: TankRigDefinition,
  desiredWorldPoint: Vec3,
  limits: PitchLimits,
): TurretAimSolution {
  const pivot = computeAimPivotWorld(tank, rig);
  const dx = desiredWorldPoint.x - pivot.x;
  const dy = desiredWorldPoint.y - pivot.y;
  const dz = desiredWorldPoint.z - pivot.z;
  const flat = Math.hypot(dx, dz) || 0.001;
  const worldYaw = Math.atan2(dx, dz);
  const desiredPitch = Math.max(limits.minPitch, Math.min(limits.maxPitch, Math.atan2(dy, flat)));
  return {
    desiredYawLocal: wrapAngle(worldYaw - tank.yaw),
    desiredPitch,
  };
}

export type { TankRigDefinition };
