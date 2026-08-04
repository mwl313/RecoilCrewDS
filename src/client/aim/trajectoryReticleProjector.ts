import * as THREE from 'three';
import type { TankRigDefinition } from '../../shared/content/schemas/tank';
import { computeWeaponMountWorldPose, type Vec3 } from '../../shared/vehicle/tankRigGeometry';
import type { CameraCollisionQuery } from '../cameraCollision';
import { rayAabbT } from '../arenaView';

/**
 * Truthful trajectory reticle (gameplay04 M6).
 *
 * The crosshair shows where the CURRENT predicted shot line (predicted tank
 * pose + predicted turret pose + shared rig) actually lands, not the camera
 * center ray. While the turret catches up, the reticle honestly sits off
 * center. Near cover that blocks the muzzle is reflected as a blocked state
 * instead of a fake line through the obstacle.
 */
export interface TrajectoryReticleResult {
  /** Screen-space position (CSS pixels). */
  x: number;
  y: number;
  visible: boolean;
  blocked: boolean;
  worldPoint: Vec3;
}

export interface TrajectoryReticleInput {
  camera: THREE.PerspectiveCamera;
  renderWidth: number;
  renderHeight: number;
  tank: { x: number; y: number; z: number; yaw: number };
  /** Chassis-local predicted turret yaw. */
  turretLocalYaw: number;
  turretPitch: number;
  rig: TankRigDefinition;
  cameraQuery: CameraCollisionQuery | null;
  /** Desired world aim point from the camera center ray. */
  desiredPoint: Vec3;
  /** Optional reusable result (avoid per-frame allocation). */
  out?: TrajectoryReticleResult;
}

const FALLBACK_RANGE = 90;
const OFFSCREEN_MARGIN = 1.2;

const scratchOrigin = new THREE.Vector3();
const scratchDir = new THREE.Vector3();
const scratchQueryCenter = new THREE.Vector3();
const scratchPoint = new THREE.Vector3();
const scratchNdc = new THREE.Vector3();

export function projectTrajectoryReticle(input: TrajectoryReticleInput): TrajectoryReticleResult {
  const out = input.out ?? {
    x: 0,
    y: 0,
    visible: false,
    blocked: false,
    worldPoint: { x: 0, y: 0, z: 0 },
  };
  if (input.renderWidth <= 0 || input.renderHeight <= 0) {
    out.visible = false;
    out.blocked = false;
    return out;
  }
  const mount = computeWeaponMountWorldPose(input.tank, { yaw: input.turretLocalYaw, pitch: input.turretPitch }, input.rig);
  const origin = scratchOrigin.set(mount.muzzle.x, mount.muzzle.y, mount.muzzle.z);
  const dir = scratchDir.set(mount.direction.x, mount.direction.y, mount.direction.z);
  if (dir.lengthSq() < 1e-12 || !Number.isFinite(origin.x + origin.y + origin.z)) {
    out.visible = false;
    out.blocked = false;
    return out;
  }
  dir.normalize();

  // Fallback: where the shot line crosses the plane through the tank at the
  // desired aim range (keeps the reticle meaningful when the ray points up).
  let range = FALLBACK_RANGE;
  const aimDelta = new THREE.Vector3(input.desiredPoint.x - origin.x, input.desiredPoint.y - origin.y, input.desiredPoint.z - origin.z);
  const desiredRange = aimDelta.dot(dir);
  if (Number.isFinite(desiredRange) && desiredRange > 1) range = desiredRange;
  const planeDot = -dir.y;
  if (planeDot > 1e-4) {
    const groundT = (origin.y - input.tank.y) / planeDot;
    if (groundT > 0.2 && groundT < range) range = groundT;
  }

  let blocked = false;
  if (input.cameraQuery) {
    scratchQueryCenter.copy(origin);
    const candidates = input.cameraQuery.query(scratchQueryCenter, range + 1);
    for (const c of candidates) {
      const t = rayAabbT(origin, dir, c.box);
      if (t !== null && t > 0.2 && t < range) {
        range = t;
        blocked = true;
      }
    }
  }

  const world = scratchPoint.copy(origin).addScaledVector(dir, range);
  out.worldPoint.x = world.x;
  out.worldPoint.y = world.y;
  out.worldPoint.z = world.z;
  out.blocked = blocked;

  const ndc = scratchNdc.copy(world).project(input.camera);
  const px = ((ndc.x + 1) / 2) * input.renderWidth;
  const py = ((1 - ndc.y) / 2) * input.renderHeight;
  const visible =
    Number.isFinite(ndc.x + ndc.y + ndc.z) &&
    ndc.z < 1 &&
    ndc.x > -OFFSCREEN_MARGIN &&
    ndc.x < OFFSCREEN_MARGIN &&
    ndc.y > -OFFSCREEN_MARGIN &&
    ndc.y < OFFSCREEN_MARGIN;
  out.x = px;
  out.y = py;
  out.visible = visible;
  return out;
}
