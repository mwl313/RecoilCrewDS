import * as THREE from 'three';
import { clientGroundHeightAt } from './groundQuery';
import { angleDiff, clamp, wrapAngle } from '../shared/math';
import { rayAabbT, type Collider } from './arenaView';
import type { CameraCollisionQuery } from './cameraCollision';
import type { GroundHeightAt } from '../shared/vehicle/tankRigGeometry';

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
  /** Look pitch where the physical boom begins its pole-safe remap. */
  boomPoleStartPitch: number;
  /** Maximum physical boom pitch at an exact ±90° look intent. */
  boomMaxPitch: number;
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
  boomPoleStartPitch: (50 * Math.PI) / 180,
  boomMaxPitch: (65 * Math.PI) / 180,
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

/**
 * Gameplay cameras stop short of the Euler pole. The weapon resolver maps
 * the final part of this visual range to an exact vertical cannon direction.
 */
export const TPS_CAMERA_CONTROL_MAX_PITCH = (86 * Math.PI) / 180;
export const TPS_CAMERA_CONTROL_MIN_PITCH = -TPS_CAMERA_CONTROL_MAX_PITCH;
export const TPS_CAMERA_YAW_ATTENUATION_START_PITCH = (78 * Math.PI) / 180;
export const TPS_CAMERA_YAW_ATTENUATION_END_PITCH = (84 * Math.PI) / 180;
/** Never discard horizontal look intent, even while weapon yaw is pole-locked. */
export const TPS_CAMERA_MIN_YAW_INPUT_SCALE = 0.3;
/** Generous one-RAF guards: preserve flicks without accepting multi-turn spikes. */
export const TPS_CAMERA_MAX_YAW_INPUT_STEP = (75 * Math.PI) / 180;
export const TPS_CAMERA_MAX_PITCH_INPUT_STEP = (45 * Math.PI) / 180;

function smoothstep01(value: number): number {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

/** Slow horizontal look near a vertical pole without trapping the player. */
export function cameraPoleYawInputScale(pitch: number): number {
  const absolutePitch = Math.abs(pitch);
  if (absolutePitch <= TPS_CAMERA_YAW_ATTENUATION_START_PITCH) return 1;
  if (absolutePitch >= TPS_CAMERA_YAW_ATTENUATION_END_PITCH) return TPS_CAMERA_MIN_YAW_INPUT_SCALE;
  const t = (
    absolutePitch - TPS_CAMERA_YAW_ATTENUATION_START_PITCH
  ) / (
    TPS_CAMERA_YAW_ATTENUATION_END_PITCH - TPS_CAMERA_YAW_ATTENUATION_START_PITCH
  );
  return 1 - smoothstep01(t) * (1 - TPS_CAMERA_MIN_YAW_INPUT_SCALE);
}

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
  lookPitch: number;
  boomPitch: number;
  groundClearanceAdjustment: number;
  shoulderOffset: number;
  collisionSafetyOverride: boolean;
  cameraUpdateCount: number;
}

export interface CameraInputDiagnostics {
  dx: number;
  dy: number;
  yawBefore: number;
  yawAfter: number;
  pitchBefore: number;
  pitchAfter: number;
  yawScale: number;
  accepted: boolean;
}

export interface WorldAimDiagnostics {
  distance: number;
  hitKind: 'terrain' | 'collider' | 'range';
  terrainMarchSteps: number;
  terrainRefinementSteps: number;
}

export type CameraCollider = Collider;
export type CameraCollisionSource = readonly CameraCollider[] | CameraCollisionQuery;

const scratchBoomForward = new THREE.Vector3();
const scratchFlat = new THREE.Vector3();
const scratchRight = new THREE.Vector3();
const scratchUp = new THREE.Vector3(0, 1, 0);
const scratchAnchor = new THREE.Vector3();
const scratchDesired = new THREE.Vector3();
const scratchCenteredDesired = new THREE.Vector3();
const scratchEye = new THREE.Vector3();
const scratchProposedEye = new THREE.Vector3();
const scratchExpandedCollider = new THREE.Box3();
const scratchRayDir = new THREE.Vector3();
const scratchAimDir = new THREE.Vector3();
const scratchAimPoint = new THREE.Vector3();
const FOLLOW_DISCONTINUITY_DISTANCE_SQ = 12 * 12;
const AIM_MAX_DISTANCE = 90;
const TERRAIN_MARCH_STEPS = 64;
const TERRAIN_REFINEMENT_STEPS = 10;
const AIM_TERRAIN_START_DISTANCE = 0.2;
const AIM_COLLIDER_EPSILON = 1e-4;
const CAMERA_COLLISION_SKIN = 0.04;
const CAMERA_EMERGENCY_MIN_DISTANCE = 0.15;
const CAMERA_SAFETY_BACKTRACK_STEPS = 24;
const CAMERA_SHOULDER_CLEARANCE_ADVANTAGE = 0.2;
const SPEED_FOV_FOLLOW_SECONDS = 0.12;

function candidatesOf(
  source: CameraCollisionSource,
  origin: THREE.Vector3,
  radius: number,
): readonly CameraCollider[] {
  if ('query' in source) return source.query(origin, radius);
  return source;
}

function expandedCameraBox(collider: CameraCollider, radius: number): THREE.Box3 {
  return collider.expanded
    ?? scratchExpandedCollider.copy(collider.box).expandByScalar(radius);
}

function cameraEyeOverlapsCollider(
  eye: THREE.Vector3,
  colliders: readonly CameraCollider[],
  radius: number,
): boolean {
  for (const collider of colliders) {
    if (expandedCameraBox(collider, radius).containsPoint(eye)) return true;
  }
  return false;
}

function placeCameraEye(
  out: THREE.Vector3,
  anchor: THREE.Vector3,
  rayDir: THREE.Vector3,
  distance: number,
  cameraRadius: number,
): number {
  out.copy(anchor).addScaledVector(rayDir, distance);
  const minY = Math.max(0, clientGroundHeightAt(out.x, out.z)) + cameraRadius + 0.12;
  const adjustment = Math.max(0, minY - out.y);
  if (adjustment > 0) out.y = minY;
  return adjustment;
}

function cameraPathSafeDistance(
  anchor: THREE.Vector3,
  desiredEye: THREE.Vector3,
  colliders: readonly CameraCollider[],
  cameraRadius: number,
  outDirection?: THREE.Vector3,
): { length: number; safeDistance: number } {
  const direction = outDirection ?? scratchAimDir;
  direction.copy(desiredEye).sub(anchor);
  const length = direction.length();
  let safeDistance = length;
  if (length <= 1e-5) return { length, safeDistance };
  direction.divideScalar(length);
  for (const collider of colliders) {
    const t = rayAabbT(anchor, direction, expandedCameraBox(collider, cameraRadius));
    if (t !== null && t > 0.05 && t < safeDistance) {
      safeDistance = Math.max(CAMERA_EMERGENCY_MIN_DISTANCE, t - CAMERA_COLLISION_SKIN);
    }
  }
  return { length, safeDistance };
}

export class TpsCameraController {
  readonly camera: THREE.PerspectiveCamera;
  /** Normalized horizontal yaw intent (radians). */
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
  private lastBoomPitch = 0;
  private lastGroundClearanceAdjustment = 0;
  private currentShoulderOffset: number;
  private lastCollisionSafetyOverride = false;
  private cameraUpdateCount = 0;
  private inputDiagnostics: CameraInputDiagnostics = {
    dx: 0,
    dy: 0,
    yawBefore: 0,
    yawAfter: 0,
    pitchBefore: 0,
    pitchAfter: 0,
    yawScale: 1,
    accepted: true,
  };

  constructor(tuning: Partial<TpsCameraTuning> = {}) {
    this.tuning = { ...DEFAULT_TPS_TUNING, ...tuning };
    this.camera = new THREE.PerspectiveCamera(this.tuning.fov, 16 / 9, 0.1, 220);
    this.currentDistance = this.tuning.distance;
    this.currentShoulderOffset = this.tuning.shoulderOffset;
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
      lookPitch: this.pitch,
      boomPitch: this.lastBoomPitch,
      groundClearanceAdjustment: this.lastGroundClearanceAdjustment,
      shoulderOffset: this.currentShoulderOffset,
      collisionSafetyOverride: this.lastCollisionSafetyOverride,
      cameraUpdateCount: this.cameraUpdateCount,
    };
  }

  getInputDiagnostics(): CameraInputDiagnostics {
    return { ...this.inputDiagnostics };
  }

  /** Consume raw pointer-lock deltas immediately (never multiplied by dt). */
  applyMouseDelta(dx: number, dy: number): void {
    const yawBefore = this.yaw;
    const pitchBefore = this.pitch;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
      this.inputDiagnostics = {
        dx,
        dy,
        yawBefore,
        yawAfter: this.yaw,
        pitchBefore,
        pitchAfter: this.pitch,
        yawScale: cameraPoleYawInputScale(this.pitch),
        accepted: false,
      };
      return;
    }
    // Real user input cancels a recenter; a zero-delta poll (every frame)
    // must NOT cancel it, or R would never get a chance to damp.
    if (dx === 0 && dy === 0) return;
    if (this.recentering) this.recentering = false; // user input cancels recenter
    const sx = this.tuning.invertMouseX ? -1 : 1;
    const sy = this.tuning.invertMouseY ? -1 : 1;
    const pitchDelta = clamp(
      -dy * sy * this.tuning.sensitivityY,
      -TPS_CAMERA_MAX_PITCH_INPUT_STEP,
      TPS_CAMERA_MAX_PITCH_INPUT_STEP,
    );
    const nextPitch = clamp(
      this.pitch + pitchDelta,
      this.tuning.minPitch,
      this.tuning.maxPitch,
    );
    const yawScale = cameraPoleYawInputScale(nextPitch);
    const yawDelta = clamp(
      -dx * sx * this.tuning.sensitivityX,
      -TPS_CAMERA_MAX_YAW_INPUT_STEP,
      TPS_CAMERA_MAX_YAW_INPUT_STEP,
    );
    this.yaw = wrapAngle(this.yaw + yawDelta * yawScale);
    this.pitch = nextPitch;
    this.inputDiagnostics = {
      dx,
      dy,
      yawBefore,
      yawAfter: this.yaw,
      pitchBefore,
      pitchAfter: this.pitch,
      yawScale,
      accepted: true,
    };
  }

  /** Recenter behind the chassis through the shortest angle with damping. */
  requestRecenter(chassisYaw: number): void {
    this.recenterTargetYaw = chassisYaw;
    this.recenterTargetPitch = 0.12;
    this.recentering = true;
  }

  /** Clear view/collision state at match, rematch, reconnect, and role boundaries. */
  resetTransientState(): void {
    this.yaw = 0;
    this.pitch = this.tuning.minPitch * 0.2;
    this.recentering = false;
    this.currentDistance = this.tuning.distance;
    this.currentShoulderOffset = this.tuning.shoulderOffset;
    this.initialized = false;
    this.followInitialized = false;
    this.lastColliding = false;
    this.lastCollisionSafetyOverride = false;
    this.lastGroundClearanceAdjustment = 0;
    this.inputDiagnostics = {
      dx: 0,
      dy: 0,
      yawBefore: this.yaw,
      yawAfter: this.yaw,
      pitchBefore: this.pitch,
      pitchAfter: this.pitch,
      yawScale: cameraPoleYawInputScale(this.pitch),
      accepted: true,
    };
    this.camera.fov = this.tuning.fov;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number, colliders: CameraCollisionSource, speedRatio = 0): CameraPose {
    this.cameraUpdateCount++;
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
      this.yaw = wrapAngle(this.yaw);
      this.pitch += (this.recenterTargetPitch - this.pitch) * k;
      if (Math.abs(angleDiff(this.yaw, this.recenterTargetYaw)) < 0.004 && Math.abs(this.pitch - this.recenterTargetPitch) < 0.004) {
        this.yaw = this.recenterTargetYaw;
        this.pitch = this.recenterTargetPitch;
        this.recentering = false;
      }
    }

    const boomPitch = mapLookPitchToBoomPitch(
      this.pitch,
      this.tuning.boomPoleStartPitch,
      this.tuning.boomMaxPitch,
    );
    this.lastBoomPitch = boomPitch;
    const boomForward = scratchBoomForward.set(
      Math.sin(this.yaw) * Math.cos(boomPitch),
      Math.sin(boomPitch),
      Math.cos(this.yaw) * Math.cos(boomPitch),
    );
    const forwardFlat = scratchFlat.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    // Horizontal right vector (perpendicular to forwardFlat and world up).
    const right = scratchRight.crossVectors(scratchUp, forwardFlat).normalize();

    const anchor = scratchAnchor.set(
      this.smoothedFollow.x,
      this.smoothedFollow.y + this.tuning.anchorHeight,
      this.smoothedFollow.z,
    );
    const fullShoulderEye = scratchDesired
      .copy(anchor)
      .add(scratchEye.set(0, this.tuning.shoulderHeight + this.tuning.verticalArm, 0))
      .addScaledVector(right, this.tuning.shoulderOffset)
      .addScaledVector(boomForward, -this.tuning.distance);

    // A right-shoulder camera should tuck toward the centerline at corners
    // instead of collapsing the whole boom when the centered path is clear.
    const centeredEye = scratchCenteredDesired
      .copy(anchor)
      .add(scratchEye.set(0, this.tuning.shoulderHeight + this.tuning.verticalArm, 0))
      .addScaledVector(boomForward, -this.tuning.distance);
    const fullPathLength = fullShoulderEye.distanceTo(anchor);
    const centeredPathLength = centeredEye.distanceTo(anchor);
    const candidates = candidatesOf(
      colliders,
      anchor,
      Math.max(fullPathLength, centeredPathLength) + this.tuning.cameraRadius,
    );
    const fullPath = cameraPathSafeDistance(
      anchor,
      fullShoulderEye,
      candidates,
      this.tuning.cameraRadius,
    );
    const centeredPath = cameraPathSafeDistance(
      anchor,
      centeredEye,
      candidates,
      this.tuning.cameraRadius,
    );
    const fullClearance = fullPath.length > 1e-5 ? fullPath.safeDistance / fullPath.length : 1;
    const centeredClearance = centeredPath.length > 1e-5
      ? centeredPath.safeDistance / centeredPath.length
      : 1;
    const targetShoulderOffset = centeredClearance > fullClearance + CAMERA_SHOULDER_CLEARANCE_ADVANTAGE
      ? 0
      : this.tuning.shoulderOffset;
    if (targetShoulderOffset < this.currentShoulderOffset) {
      // Moving 65 cm to the center is far less disruptive than collapsing a
      // five-metre boom, and immediately clears the corner overlap.
      this.currentShoulderOffset = targetShoulderOffset;
    } else {
      const shoulderRelease = expFollow(safeDt, this.tuning.collisionReleaseSeconds);
      this.currentShoulderOffset += (
        targetShoulderOffset - this.currentShoulderOffset
      ) * shoulderRelease;
    }
    const desiredEye = fullShoulderEye
      .copy(anchor)
      .add(scratchEye.set(0, this.tuning.shoulderHeight + this.tuning.verticalArm, 0))
      .addScaledVector(right, this.currentShoulderOffset)
      .addScaledVector(boomForward, -this.tuning.distance);

    // Swept-sphere collision: candidates from the spatial index carry
    // pre-expanded AABBs (baked at arena construction); raw arrays are
    // expanded here for backward-compatible tests.
    const rayDir = scratchRayDir.copy(desiredEye).sub(anchor);
    const rayLen = rayDir.length();
    const boomLen = rayLen;
    let targetDistance = boomLen;
    let hardSafeDistance = boomLen;
    if (rayLen > 1e-5) {
      rayDir.divideScalar(rayLen);
      for (const c of candidates) {
        const box = expandedCameraBox(c, this.tuning.cameraRadius);
        const t = rayAabbT(anchor, rayDir, box);
        if (t !== null && t > 0.05 && t < hardSafeDistance) {
          hardSafeDistance = Math.max(CAMERA_EMERGENCY_MIN_DISTANCE, t - CAMERA_COLLISION_SKIN);
          targetDistance = Math.max(this.tuning.minimumDistance, hardSafeDistance);
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
    let nextDistance = pullIn
      ? Math.max(requestedDistance, this.currentDistance - this.tuning.collisionMaxPullInSpeed * safeDt)
      : requestedDistance;
    let safetyOverride = false;
    placeCameraEye(
      scratchProposedEye,
      anchor,
      rayDir,
      nextDistance,
      this.tuning.cameraRadius,
    );
    if (cameraEyeOverlapsCollider(scratchProposedEye, candidates, this.tuning.cameraRadius)) {
      // Preserve normal collision damping whenever its proposed position is
      // valid. If the damping would leave the camera sphere embedded, move
      // only as far inward as necessary along the same boom for this frame.
      const lineOfSightSafeDistance = Math.min(nextDistance, hardSafeDistance);
      if (lineOfSightSafeDistance < nextDistance - 1e-5) {
        nextDistance = lineOfSightSafeDistance;
        safetyOverride = true;
      }

      // Ground clearance can raise an otherwise valid boom point into an
      // overhang. Backtrack only while the final, ground-adjusted eye remains
      // occupied; normal TPS placement never enters this path.
      placeCameraEye(
        scratchProposedEye,
        anchor,
        rayDir,
        nextDistance,
        this.tuning.cameraRadius,
      );
      if (cameraEyeOverlapsCollider(scratchProposedEye, candidates, this.tuning.cameraRadius)) {
        const startDistance = nextDistance;
        const span = Math.max(0, startDistance - CAMERA_EMERGENCY_MIN_DISTANCE);
        for (let step = 1; step <= CAMERA_SAFETY_BACKTRACK_STEPS; step++) {
          const candidateDistance = startDistance - span * (step / CAMERA_SAFETY_BACKTRACK_STEPS);
          placeCameraEye(
            scratchProposedEye,
            anchor,
            rayDir,
            candidateDistance,
            this.tuning.cameraRadius,
          );
          if (!cameraEyeOverlapsCollider(scratchProposedEye, candidates, this.tuning.cameraRadius)) {
            nextDistance = candidateDistance;
            safetyOverride = true;
            break;
          }
        }
      }
    }
    const distanceFloor = safetyOverride
      ? CAMERA_EMERGENCY_MIN_DISTANCE
      : Math.min(this.tuning.minimumDistance, this.currentDistance);
    this.currentDistance = clamp(nextDistance, distanceFloor, boomLen);
    this.lastCollisionSafetyOverride = safetyOverride;

    const eye = scratchEye;
    this.lastGroundClearanceAdjustment = placeCameraEye(
      eye,
      anchor,
      rayDir,
      this.currentDistance,
      this.tuning.cameraRadius,
    );

    this.camera.position.copy(eye);
    // Three.js cameras look down local -Z; add π so the camera looks along
    // +forward = (sin yaw, cos yaw) with yaw 0 facing +Z.
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw + Math.PI, 0, 'YXZ'));
    const targetFov = this.tuning.fov + (this.tuning.speedFovBonus ?? 0) * speedRatio;
    if (Math.abs(this.camera.fov - targetFov) > 0.01) {
      const fovK = expFollow(safeDt, SPEED_FOV_FOLLOW_SECONDS);
      this.camera.fov += (targetFov - this.camera.fov) * fovK;
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
 * Continuous monotonic remap from full look intent to a pole-safe physical
 * boom. Normal TPS angles remain unchanged; the boom approaches a bounded
 * angle with zero temporal filtering while look/weapon pitch still reaches
 * exact ±π/2.
 */
export function mapLookPitchToBoomPitch(
  lookPitch: number,
  poleStartPitch = DEFAULT_TPS_TUNING.boomPoleStartPitch,
  maxBoomPitch = DEFAULT_TPS_TUNING.boomMaxPitch,
): number {
  if (!Number.isFinite(lookPitch)) return 0;
  const sign = lookPitch < 0 ? -1 : 1;
  const absolute = Math.abs(lookPitch);
  const start = clamp(Math.abs(poleStartPitch), 0, Math.PI / 2);
  const end = Math.PI / 2;
  const maxBoom = clamp(Math.abs(maxBoomPitch), start, end);
  if (absolute <= start || start >= end - 1e-8) return lookPitch;
  const u = clamp((absolute - start) / (end - start), 0, 1);
  const span = end - start;
  const delta = maxBoom - start;
  // Cubic Hermite: exact identity slope at the transition, flat slope at
  // the pole. Clamp the initial tangent to preserve monotonicity for custom
  // tuning values with a very small output range.
  const startSlope = Math.min(1, (3 * delta) / Math.max(span, 1e-8));
  const h00 = 2 * u ** 3 - 3 * u ** 2 + 1;
  const h10 = u ** 3 - 2 * u ** 2 + u;
  const h01 = -2 * u ** 3 + 3 * u ** 2;
  const mapped = h00 * start + h10 * span * startSlope + h01 * maxBoom;
  return sign * mapped;
}

/**
 * World aim point under the final camera center ray: the closest collider or
 * real terrain-surface hit. Terrain intersection uses a bounded march and
 * binary refinement; it never substitutes a flat tank-height plane.
 */
export function computeWorldAim(
  camera: THREE.PerspectiveCamera,
  colliders: CameraCollisionSource,
  groundHeightAt: GroundHeightAt,
  diagnostics?: WorldAimDiagnostics,
): THREE.Vector3 {
  const dir = scratchAimDir;
  camera.getWorldDirection(dir);
  const origin = camera.position;
  let t = AIM_MAX_DISTANCE;
  let hitKind: WorldAimDiagnostics['hitKind'] = 'range';
  let terrainMarchSteps = 0;
  let terrainRefinementSteps = 0;
  const candidates = candidatesOf(colliders, origin, AIM_MAX_DISTANCE + 10);
  for (const c of candidates) {
    // A camera pressed close to cover must resolve that nearby surface rather
    // than discarding it and jumping to the 90 m range fallback. If a camera
    // ever begins inside a proxy, the first useful surface is its exit face.
    const hit = rayAabbT(origin, dir, c.box, true);
    if (hit !== null && hit > AIM_COLLIDER_EPSILON && hit < t) {
      t = hit;
      hitKind = 'collider';
    }
  }

  const terrainLimit = t;
  let previousT = AIM_TERRAIN_START_DISTANCE;
  let previousClearance = rayTerrainClearance(origin, dir, previousT, groundHeightAt);
  for (let i = 1; terrainLimit > AIM_TERRAIN_START_DISTANCE && i <= TERRAIN_MARCH_STEPS; i++) {
    terrainMarchSteps = i;
    const sampleT = AIM_TERRAIN_START_DISTANCE
      + (terrainLimit - AIM_TERRAIN_START_DISTANCE) * (i / TERRAIN_MARCH_STEPS);
    const clearance = rayTerrainClearance(origin, dir, sampleT, groundHeightAt);
    if (Number.isFinite(clearance) && clearance <= 0 && previousClearance > 0) {
      let low = previousT;
      let high = sampleT;
      for (let refine = 0; refine < TERRAIN_REFINEMENT_STEPS; refine++) {
        terrainRefinementSteps++;
        const mid = (low + high) * 0.5;
        if (rayTerrainClearance(origin, dir, mid, groundHeightAt) > 0) low = mid;
        else high = mid;
      }
      t = high;
      hitKind = 'terrain';
      break;
    }
    previousT = sampleT;
    previousClearance = clearance;
  }

  scratchAimPoint.copy(origin).addScaledVector(dir, t);
  if (hitKind === 'terrain') {
    scratchAimPoint.y = groundHeightAt(scratchAimPoint.x, scratchAimPoint.z);
  }
  if (diagnostics) {
    diagnostics.distance = t;
    diagnostics.hitKind = hitKind;
    diagnostics.terrainMarchSteps = terrainMarchSteps;
    diagnostics.terrainRefinementSteps = terrainRefinementSteps;
  }
  return scratchAimPoint;
}

function rayTerrainClearance(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  distance: number,
  groundHeightAt: GroundHeightAt,
): number {
  const x = origin.x + direction.x * distance;
  const y = origin.y + direction.y * distance;
  const z = origin.z + direction.z * distance;
  return y - groundHeightAt(x, z);
}

/** World turret yaw → chassis-local turret yaw (chassis yaw applied exactly once). */
export function worldYawToLocal(worldYaw: number, chassisYaw: number): number {
  return wrapAngle(worldYaw - chassisYaw);
}

/** Chassis-local turret yaw → world yaw. */
export function localYawToWorld(localYaw: number, chassisYaw: number): number {
  return wrapAngle(chassisYaw + localYaw);
}
