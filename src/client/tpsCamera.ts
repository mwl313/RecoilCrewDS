import * as THREE from 'three';
import { clientGroundHeightAt } from './groundQuery';
import { angleDiff, clamp, wrapAngle } from '../shared/math';
import { rayAabbT, type Collider } from './arenaView';
import type { CameraCollisionQuery } from './cameraCollision';

/**
 * Modern shooter TPS rig, role-independent. Driver and Gunner own separate
 * instances and never share mutable state.
 *
 * Conventions (project-wide):
 *   +Y up, +Z forward at yaw 0, +X right at yaw 0.
 *   forward = (sin yaw, 0, cos yaw); positive yaw turns +Z toward +X.
 *   Mouse right → yaw -= dx * sensitivityX (invertMouseX = false): standard
 *   look-right. With the camera behind the chassis looking along +Z, screen
 *   right is -X, so positive mouse-X decreases yaw.
 *   Mouse up    → pitch += -dy * sensitivityY (invertMouseY = false).
 *   A → steer -1 → yaw increases → chassis left (screen-left from behind)
 *   D → steer +1 → yaw decreases → chassis right (screen-right from behind)
 *
 * The camera never waits for the network, never reads turret state, and
 * collision changes position only.
 */
export interface TpsCameraTuning {
  fov: number;
  shoulderOffset: number;
  shoulderHeight: number;
  verticalArm: number;
  distance: number;
  minimumDistance: number;
  cameraRadius: number;
  anchorHeight: number;
  minPitch: number;
  maxPitch: number;
  sensitivityX: number;
  sensitivityY: number;
  invertMouseX: boolean;
  invertMouseY: boolean;
  collisionPullInSeconds: number;
  collisionMaxPullInSpeed: number;
  collisionReleaseSeconds: number;
  recenterSeconds: number;
  horizontalFollowSeconds: number;
  verticalFollowUpSeconds: number;
  verticalFollowDownSeconds: number;
  maxVerticalLag: number;
  speedFovBonus?: number;
}

export const DEFAULT_TPS_TUNING: TpsCameraTuning = {
  fov: 70,
  distance: 5.2,
  minimumDistance: 1.25,
  shoulderOffset: 0.65,
  shoulderHeight: 0.35,
  verticalArm: 0.65,
  anchorHeight: 1.35,
  cameraRadius: 0.3,
  minPitch: (-35 * Math.PI) / 180,
  maxPitch: (55 * Math.PI) / 180,
  sensitivityX: 0.0024,
  sensitivityY: 0.0022,
  invertMouseX: false,
  invertMouseY: false,
  collisionPullInSeconds: 0.055,
  collisionMaxPullInSpeed: 32,
  collisionReleaseSeconds: 0.1,
  recenterSeconds: 0.16,
  // Ground-plane follow is rigid by default. The rendered tank is already
  // presentation-smoothed, so smoothing it again here creates visible model
  // drift and lets the camera boom trail through unrelated geometry.
  horizontalFollowSeconds: 0,
  verticalFollowUpSeconds: 0.14,
  verticalFollowDownSeconds: 0.1,
  maxVerticalLag: 2,
  speedFovBonus: 5.5,
};

export interface CameraPose {
  position: THREE.Vector3;
  distance: number;
  colliding: boolean;
}

export interface CameraFollowDiagnostics {
  targetAnchorY: number;
  smoothedAnchorY: number;
  verticalLag: number;
  horizontalLag: number;
  distance: number;
  colliding: boolean;
}

export type CameraCollider = Collider;
export type CameraCollisionSource = readonly CameraCollider[] | CameraCollisionQuery;

const scratchForward = new THREE.Vector3();
const scratchFlat = new THREE.Vector3();
const scratchRight = new THREE.Vector3();
const scratchUp = new THREE.Vector3(0, 1, 0);
const scratchAnchor = new THREE.Vector3();
const scratchDesired = new THREE.Vector3();
const scratchEye = new THREE.Vector3();
const scratchRayDir = new THREE.Vector3();
const scratchAimDir = new THREE.Vector3();
const scratchAimPoint = new THREE.Vector3();
const FOLLOW_DISCONTINUITY_DISTANCE_SQ = 12 * 12;

function candidatesOf(
  source: CameraCollisionSource,
  origin: THREE.Vector3,
  radius: number,
): readonly CameraCollider[] {
  if ('query' in source) return source.query(origin, radius);
  return source;
}

export class TpsCameraController {
  readonly camera: THREE.PerspectiveCamera;
  /** Unbounded horizontal yaw (radians). */
  yaw = 0;
  /** Clamped vertical pitch (radians). */
  pitch = 0.12;
  recentering = false;

  private tuning: TpsCameraTuning;
  private followTarget = new THREE.Vector3();
  private smoothedFollow = new THREE.Vector3();
  private chassisYaw = 0;
  private currentDistance: number;
  private recenterTargetYaw = 0;
  private recenterTargetPitch = 0.12;
  private initialized = false;
  private followInitialized = false;
  private lastColliding = false;

  constructor(tuning: Partial<TpsCameraTuning> = {}) {
    this.tuning = { ...DEFAULT_TPS_TUNING, ...tuning };
    this.camera = new THREE.PerspectiveCamera(this.tuning.fov, 16 / 9, 0.1, 220);
    this.currentDistance = this.tuning.distance;
    // Default: camera behind a chassis facing +Z.
    this.yaw = 0;
    this.pitch = this.tuning.minPitch * 0.2;
  }

  get minPitch(): number {
    return this.tuning.minPitch;
  }

  get maxPitch(): number {
    return this.tuning.maxPitch;
  }

  /** Change the camera pitch floor (Single Player uses the wide gunner range). */
  setMinPitch(min: number): void {
    this.tuning.minPitch = min;
    if (this.pitch < min) this.pitch = min;
  }

  /** Change both pitch endpoints without resetting the player's current aim. */
  setPitchLimits(min: number, max: number): void {
    this.tuning.minPitch = Math.min(min, max);
    this.tuning.maxPitch = Math.max(min, max);
    this.pitch = clamp(this.pitch, this.tuning.minPitch, this.tuning.maxPitch);
  }

  setFollowPose(position: THREE.Vector3, chassisYaw: number): void {
    // Respawns, rematches, and large reconciliation corrections are
    // discontinuities rather than motion to be eased across. Reset the
    // anchor so the camera cannot travel through the arena toward the tank.
    if (this.followInitialized && this.followTarget.distanceToSquared(position) > FOLLOW_DISCONTINUITY_DISTANCE_SQ) {
      this.smoothedFollow.copy(position);
      this.initialized = false;
    }
    this.followTarget.copy(position);
    this.chassisYaw = chassisYaw;
  }

  getFollowDiagnostics(): CameraFollowDiagnostics {
    return {
      targetAnchorY: this.followTarget.y + this.tuning.anchorHeight,
      smoothedAnchorY: this.smoothedFollow.y + this.tuning.anchorHeight,
      verticalLag: this.followTarget.y - this.smoothedFollow.y,
      horizontalLag: Math.hypot(
        this.followTarget.x - this.smoothedFollow.x,
        this.followTarget.z - this.smoothedFollow.z,
      ),
      distance: this.currentDistance,
      colliding: this.lastColliding,
    };
  }

  /** Consume raw pointer-lock deltas immediately (never multiplied by dt). */
  applyMouseDelta(dx: number, dy: number): void {
    // Real user input cancels a recenter; a zero-delta poll (every frame)
    // must NOT cancel it, or R would never get a chance to damp.
    if (dx === 0 && dy === 0) return;
    if (this.recentering) this.recentering = false; // user input cancels recenter
    const sx = this.tuning.invertMouseX ? -1 : 1;
    const sy = this.tuning.invertMouseY ? -1 : 1;
    this.yaw -= dx * sx * this.tuning.sensitivityX;
    this.pitch = clamp(this.pitch + -dy * sy * this.tuning.sensitivityY, this.tuning.minPitch, this.tuning.maxPitch);
  }

  /** Recenter behind the chassis through the shortest angle with damping. */
  requestRecenter(chassisYaw: number): void {
    this.recenterTargetYaw = chassisYaw;
    this.recenterTargetPitch = 0.12;
    this.recentering = true;
  }

  update(dt: number, colliders: CameraCollisionSource, speedRatio = 0): CameraPose {
    const safeDt = Number.isFinite(dt) ? clamp(dt, 0, 0.1) : 0;
    if (!this.followInitialized) {
      this.smoothedFollow.copy(this.followTarget);
      this.followInitialized = true;
    } else {
      if (this.tuning.horizontalFollowSeconds <= 0) {
        // Keep the tank locked to the same screen-space position during
        // ordinary driving. Vertical motion is damped independently below.
        this.smoothedFollow.x = this.followTarget.x;
        this.smoothedFollow.z = this.followTarget.z;
      } else {
        const horizontalK = expFollow(safeDt, this.tuning.horizontalFollowSeconds);
        this.smoothedFollow.x += (this.followTarget.x - this.smoothedFollow.x) * horizontalK;
        this.smoothedFollow.z += (this.followTarget.z - this.smoothedFollow.z) * horizontalK;
      }
      const verticalSeconds = this.followTarget.y < this.smoothedFollow.y
        ? this.tuning.verticalFollowDownSeconds
        : this.tuning.verticalFollowUpSeconds;
      const verticalK = expFollow(safeDt, verticalSeconds);
      this.smoothedFollow.y += (this.followTarget.y - this.smoothedFollow.y) * verticalK;
      // The leash is measured at the tank-relative pivot and cannot be
      // affected by boom collision or terrain clearance.
      this.smoothedFollow.y = clamp(
        this.smoothedFollow.y,
        this.followTarget.y - this.tuning.maxVerticalLag,
        this.followTarget.y + this.tuning.maxVerticalLag,
      );
    }
    if (this.recentering) {
      const k = 1 - Math.exp(-safeDt / Math.max(0.001, this.tuning.recenterSeconds));
      this.yaw += angleDiff(this.yaw, this.recenterTargetYaw) * k;
      this.pitch += (this.recenterTargetPitch - this.pitch) * k;
      if (Math.abs(angleDiff(this.yaw, this.recenterTargetYaw)) < 0.004 && Math.abs(this.pitch - this.recenterTargetPitch) < 0.004) {
        this.yaw = this.recenterTargetYaw;
        this.pitch = this.recenterTargetPitch;
        this.recentering = false;
      }
    }

    const forward = scratchForward.set(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    );
    const forwardFlat = scratchFlat.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    // Horizontal right vector (perpendicular to forwardFlat and world up).
    const right = scratchRight.crossVectors(scratchUp, forwardFlat).normalize();

    const anchor = scratchAnchor.set(
      this.smoothedFollow.x,
      this.smoothedFollow.y + this.tuning.anchorHeight,
      this.smoothedFollow.z,
    );
    const desiredEye = scratchDesired
      .copy(anchor)
      .add(scratchEye.set(0, this.tuning.shoulderHeight + this.tuning.verticalArm, 0))
      .addScaledVector(right, this.tuning.shoulderOffset)
      .addScaledVector(forward, -this.tuning.distance);

    // Swept-sphere collision: candidates from the spatial index carry
    // pre-expanded AABBs (baked at arena construction); raw arrays are
    // expanded here for backward-compatible tests.
    const rayDir = scratchRayDir.copy(desiredEye).sub(anchor);
    const rayLen = rayDir.length();
    const boomLen = rayLen;
    let targetDistance = boomLen;
    if (rayLen > 1e-5) {
      rayDir.divideScalar(rayLen);
      const candidates = candidatesOf(colliders, anchor, boomLen + this.tuning.cameraRadius);
      for (const c of candidates) {
        const box = c.expanded ?? c.box.clone().expandByScalar(this.tuning.cameraRadius);
        const t = rayAabbT(anchor, rayDir, box);
        if (t !== null && t > 0.05 && t < targetDistance) {
          targetDistance = Math.max(this.tuning.minimumDistance, t - 0.01);
        }
      }
    }

    // Pull inward almost immediately; release outward with short damping.
    if (!this.initialized) {
      this.currentDistance = targetDistance;
      this.initialized = true;
    }
    const pullIn = targetDistance < this.currentDistance - 0.001;
    const rate = pullIn
      ? 1 - Math.exp(-safeDt / Math.max(0.001, this.tuning.collisionPullInSeconds))
      : 1 - Math.exp(-safeDt / Math.max(0.001, this.tuning.collisionReleaseSeconds));
    const requestedDistance = this.currentDistance + (targetDistance - this.currentDistance) * rate;
    // A newly intersecting proxy must not teleport the camera several metres
    // in one rendered frame. Bound inward travel in world units per second;
    // outward release retains its exponential damping.
    const nextDistance = pullIn
      ? Math.max(requestedDistance, this.currentDistance - this.tuning.collisionMaxPullInSpeed * safeDt)
      : requestedDistance;
    this.currentDistance = clamp(nextDistance, this.tuning.minimumDistance, boomLen);

    const eye = scratchEye.copy(anchor).addScaledVector(rayDir, this.currentDistance);
    // Ground clearance: never clip below the floor plus the camera radius.
    const minY = Math.max(0, clientGroundHeightAt(eye.x, eye.z)) + this.tuning.cameraRadius + 0.12;
    if (eye.y < minY) eye.y = minY;

    this.camera.position.copy(eye);
    // Three.js cameras look down local -Z; add π so the camera looks along
    // +forward = (sin yaw, cos yaw) with yaw 0 facing +Z.
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw + Math.PI, 0, 'YXZ'));
    const targetFov = this.tuning.fov + (this.tuning.speedFovBonus ?? 0) * speedRatio;
    if (Math.abs(this.camera.fov - targetFov) > 0.01) {
      this.camera.fov = targetFov;
      this.camera.updateProjectionMatrix();
    }
    this.lastColliding = targetDistance < boomLen - 0.001;
    return { position: this.camera.position, distance: this.currentDistance, colliding: this.lastColliding };
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  setFov(fov: number): void {
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }
}

function expFollow(dt: number, seconds: number): number {
  return 1 - Math.exp(-dt / Math.max(0.001, seconds));
}

/**
 * World aim point under the final camera center ray: nearest collider hit,
 * otherwise the ground plane at groundY.
 */
export function computeWorldAim(camera: THREE.PerspectiveCamera, colliders: CameraCollisionSource, groundY: number): THREE.Vector3 {
  const dir = scratchAimDir;
  camera.getWorldDirection(dir);
  const origin = camera.position;
  let t = 90;
  const candidates = candidatesOf(colliders, origin, 100);
  for (const c of candidates) {
    const hit = rayAabbT(origin, dir, c.box);
    if (hit !== null && hit > 0.2 && hit < t) t = hit;
  }
  if (dir.y < -1e-6) {
    const groundT = (origin.y - groundY) / -dir.y;
    if (groundT > 0.2 && groundT < t) t = groundT;
  }
  return scratchAimPoint.copy(origin).addScaledVector(dir, t);
}

/** World turret yaw → chassis-local turret yaw (chassis yaw applied exactly once). */
export function worldYawToLocal(worldYaw: number, chassisYaw: number): number {
  return wrapAngle(worldYaw - chassisYaw);
}

/** Chassis-local turret yaw → world yaw. */
export function localYawToWorld(localYaw: number, chassisYaw: number): number {
  return wrapAngle(chassisYaw + localYaw);
}
