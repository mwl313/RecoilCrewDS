import * as THREE from 'three';
import type { TankRigDefinition } from '../../shared/content/schemas/tank';
import {
  computeWeaponMountWorldPose,
  resolveTerrainSafeMuzzle,
  type GroundHeightAt,
  type Vec3,
} from '../../shared/vehicle/tankRigGeometry';
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
  /** Cannon is in the exact vertical assist detent. */
  verticalLocked: boolean;
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
  groundHeightAt: GroundHeightAt;
  projectile: { speed: number; gravity: number; life: number };
  /** Desired world aim point from the camera center ray. */
  desiredPoint: Vec3;
  /** Optional reusable result (avoid per-frame allocation). */
  out?: TrajectoryReticleResult;
}

const FALLBACK_RANGE = 90;
const OFFSCREEN_MARGIN = 1.2;
const TRAJECTORY_STEP = 1 / 60;

const scratchOrigin = new THREE.Vector3();
const scratchDir = new THREE.Vector3();
const scratchQueryCenter = new THREE.Vector3();
const scratchPoint = new THREE.Vector3();
const scratchNext = new THREE.Vector3();
const scratchVelocity = new THREE.Vector3();
const scratchSegment = new THREE.Vector3();
const scratchAimDelta = new THREE.Vector3();
const scratchNdc = new THREE.Vector3();

export function projectTrajectoryReticle(input: TrajectoryReticleInput): TrajectoryReticleResult {
  const out = input.out ?? {
    x: 0,
    y: 0,
    visible: false,
    blocked: false,
    verticalLocked: false,
    worldPoint: { x: 0, y: 0, z: 0 },
  };
  out.verticalLocked = Math.abs(Math.abs(input.turretPitch) - Math.PI / 2) < 1e-4;
  if (input.renderWidth <= 0 || input.renderHeight <= 0) {
    out.visible = false;
    out.blocked = false;
    out.verticalLocked = false;
    return out;
  }
  const mount = computeWeaponMountWorldPose(input.tank, { yaw: input.turretLocalYaw, pitch: input.turretPitch }, input.rig);
  const safeMuzzle = resolveTerrainSafeMuzzle(mount, input.groundHeightAt);
  const origin = scratchOrigin.set(safeMuzzle.x, safeMuzzle.y, safeMuzzle.z);
  const dir = scratchDir.set(mount.direction.x, mount.direction.y, mount.direction.z);
  if (dir.lengthSq() < 1e-12 || !Number.isFinite(origin.x + origin.y + origin.z)) {
    out.visible = false;
    out.blocked = false;
    return out;
  }
  dir.normalize();

  // Follow the shell to the camera's desired aim range. Unlike the old
  // straight ray, this uses the same integration order as ProjectileSystem:
  // move first, then apply gravity.
  let range = FALLBACK_RANGE;
  const aimDelta = scratchAimDelta.set(input.desiredPoint.x - origin.x, input.desiredPoint.y - origin.y, input.desiredPoint.z - origin.z);
  const desiredRange = aimDelta.dot(dir);
  if (Number.isFinite(desiredRange) && desiredRange > 1) range = desiredRange;
  const speed = Math.max(0.001, input.projectile.speed);
  const gravity = Math.max(0, input.projectile.gravity);
  const duration = Math.min(Math.max(TRAJECTORY_STEP, input.projectile.life), range / speed);
  const world = scratchPoint.copy(origin);
  const velocity = scratchVelocity.copy(dir).multiplyScalar(speed);
  let blocked = false;
  let elapsed = 0;
  while (elapsed < duration - 1e-8) {
    const dt = Math.min(TRAJECTORY_STEP, duration - elapsed);
    const next = scratchNext.copy(world).addScaledVector(velocity, dt);
    const segment = scratchSegment.copy(next).sub(world);
    const segmentLength = segment.length();
    if (input.cameraQuery && segmentLength > 1e-6) {
      segment.divideScalar(segmentLength);
      scratchQueryCenter.copy(world).addScaledVector(segment, segmentLength * 0.5);
      const candidates = input.cameraQuery.query(scratchQueryCenter, segmentLength + 1);
      let nearest = segmentLength;
      for (const candidate of candidates) {
        const hit = rayAabbT(world, segment, candidate.box);
        if (hit !== null && hit > 0.01 && hit < nearest) nearest = hit;
      }
      if (nearest < segmentLength) {
        world.addScaledVector(segment, nearest);
        blocked = true;
        break;
      }
    }
    const floor = input.groundHeightAt(next.x, next.z) + 0.05;
    if (next.y <= floor) {
      world.set(next.x, floor, next.z);
      break;
    }
    world.copy(next);
    velocity.y -= gravity * dt;
    elapsed += dt;
  }
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
