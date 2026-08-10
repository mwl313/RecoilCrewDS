import * as THREE from 'three';
import { clamp } from '../../shared/math';
import {
  TpsCameraController,
  TPS_CAMERA_CONTROL_MAX_PITCH,
  TPS_CAMERA_CONTROL_MIN_PITCH,
  computeWorldAim,
  type CameraCollisionSource,
  type TpsCameraTuning,
  type WorldAimDiagnostics,
} from '../tpsCamera';
import type { MatchState, Role, TankState } from '../../shared/types';
import { netcodeMetrics } from '../netcode/netcodeMetrics';
import { VERTICAL_AIM_MAX_PITCH, VERTICAL_AIM_MIN_PITCH } from '../../shared/vehicle/tankRigTypes';
import type { GroundHeightAt, PitchLimits, TankPose, TankRigDefinition, Vec3 } from '../../shared/vehicle/tankRigGeometry';
import {
  resolveTpsWeaponAim,
  type TpsWeaponAimDiagnostics,
  type TpsWeaponAimResult,
  type TpsWeaponAimState,
} from '../aim/tpsWeaponAimResolver';

/**
 * One gameplay camera for every mode and role. Keeping the shared values in
 * one object prevents Single Player, Driver, and Gunner controls from drifting
 * apart as the camera is tuned.
 */
export const SHARED_GAMEPLAY_CAMERA_TUNING: Partial<TpsCameraTuning> = {
  fov: 70,
  distance: 5.2,
  shoulderOffset: 0.65,
  shoulderHeight: 0.35,
  verticalArm: 0.65,
  speedFovBonus: 5.5,
  minPitch: TPS_CAMERA_CONTROL_MIN_PITCH,
  maxPitch: TPS_CAMERA_CONTROL_MAX_PITCH,
};

/** Driver/Gunner TPS rigs + camera impulses; TPS math stays in tpsCamera. */
export class CameraManager {
  readonly driverCam: TpsCameraController;
  readonly gunnerCam: TpsCameraController;
  activeCam: TpsCameraController;
  private shake = 0;
  private shakeTime = 0;
  private damageLateral = 0;
  private damageRoll = 0;
  private lastRenderYaw = 0;
  private overviewSize = 0;
  private readonly driverAimState: TpsWeaponAimState = { poleActive: false };
  private readonly gunnerAimState: TpsWeaponAimState = { poleActive: false };
  private lastAimDiagnostics: TpsWeaponAimDiagnostics | null = null;
  private readonly worldAimDiagnostics: WorldAimDiagnostics = {
    distance: 0,
    hitKind: 'range',
    terrainMarchSteps: 0,
    terrainRefinementSteps: 0,
  };

  constructor() {
    this.driverCam = new TpsCameraController(SHARED_GAMEPLAY_CAMERA_TUNING);
    this.gunnerCam = new TpsCameraController(SHARED_GAMEPLAY_CAMERA_TUNING);
    this.activeCam = this.driverCam;
  }

  setRole(role: Role): void {
    this.activeCam = role === 'driver' ? this.driverCam : this.gunnerCam;
  }

  /** Preserve camera-control parity regardless of which game mode is entered. */
  setSinglePlayerMode(_singlePlayer: boolean): void {
    this.driverCam.setPitchLimits(TPS_CAMERA_CONTROL_MIN_PITCH, TPS_CAMERA_CONTROL_MAX_PITCH);
    this.gunnerCam.setPitchLimits(TPS_CAMERA_CONTROL_MIN_PITCH, TPS_CAMERA_CONTROL_MAX_PITCH);
  }

  resize(aspect: number): void {
    this.driverCam.resize(aspect);
    this.gunnerCam.resize(aspect);
  }

  addImpulse(shake: number): void {
    this.shake = Math.min(1.6, this.shake + shake);
  }

  /** One already-coordinated landing impulse; reduced-motion scaling is upstream. */
  addLandingImpulse(shake: number): void {
    this.addImpulse(clamp(shake, 0, 0.72));
  }

  addDamageImpulse(shake: number, screenDirection: number, reducedMotion = false): void {
    const motionScale = reducedMotion ? .32 : 1;
    this.addImpulse(shake * motionScale);
    this.damageLateral = clamp(this.damageLateral - screenDirection * shake * .08 * motionScale, -.16, .16);
    this.damageRoll = clamp(this.damageRoll - screenDirection * shake * .012 * motionScale, -.018, .018);
  }

  tickShake(dtRaw: number): void {
    const dt = Number.isFinite(dtRaw) ? clamp(dtRaw, 0, 0.1) : 0;
    this.shakeTime += dt;
    this.shake = Math.max(0, this.shake - dt * 1.4);
    this.damageLateral *= Math.exp(-dt * 15);
    this.damageRoll *= Math.exp(-dt * 18);
  }

  recenter(chassisYaw: number): void {
    this.activeCam.requestRecenter(chassisYaw);
  }

  /** Fixed high-angle QA view used to inspect complete authored map layouts. */
  setOverview(sizeMeters: number): void {
    this.overviewSize = Math.max(0, sizeMeters);
    const camera = this.activeCam.camera;
    camera.far = Math.max(220, this.overviewSize * 3);
    camera.updateProjectionMatrix();
  }

  getCameraState() {
    return {
      yaw: this.activeCam.yaw,
      pitch: this.activeCam.pitch,
      position: {
        x: this.activeCam.camera.position.x,
        y: this.activeCam.camera.position.y,
        z: this.activeCam.camera.position.z,
      },
      recentering: this.activeCam.recentering,
      recenterTargetYaw: (this.activeCam as unknown as { recenterTargetYaw?: number }).recenterTargetYaw,
      lastRenderYaw: this.lastRenderYaw,
      follow: this.activeCam.getFollowDiagnostics(),
      input: this.activeCam.getInputDiagnostics(),
      aim: this.lastAimDiagnostics,
      worldAim: { ...this.worldAimDiagnostics },
    };
  }

  /** Mouse intent is owned by RAF even when no fresh simulation frame exists. */
  applyMouseDelta(mouse: { dx: number; dy: number }): void {
    this.activeCam.applyMouseDelta(mouse.dx, mouse.dy);
  }

  resetTransientState(): void {
    this.driverCam.resetTransientState();
    this.gunnerCam.resetTransientState();
    for (const state of [this.driverAimState, this.gunnerAimState]) {
      state.poleActive = false;
      state.lockedWorldYaw = undefined;
      state.lastResolvedWorldYaw = undefined;
      state.lockedPoleSign = undefined;
    }
    this.lastAimDiagnostics = null;
    this.damageLateral = 0;
    this.damageRoll = 0;
  }

  /** Apply mouse deltas + follow pose + collision update for the active rig. */
  update(
    dt: number,
    pos: THREE.Vector3,
    chassisYaw: number,
    speedRatio: number,
    colliders: CameraCollisionSource | null,
    mouse: { dx: number; dy: number },
  ): void {
    this.lastRenderYaw = chassisYaw;
    this.activeCam.applyMouseDelta(mouse.dx, mouse.dy);
    if (this.overviewSize > 0) {
      const distance = this.overviewSize * 0.72;
      this.activeCam.camera.position.set(distance, this.overviewSize * 0.92, distance);
      this.activeCam.camera.lookAt(0, 0, 0);
      return;
    }
    this.activeCam.setFollowPose(pos, chassisYaw);
    const t0 = performance.now();
    this.activeCam.update(dt, colliders ?? [], speedRatio);
    netcodeMetrics.cameraQueryMs = performance.now() - t0;
  }

  computeAim(
    camera: THREE.PerspectiveCamera,
    colliders: CameraCollisionSource | null,
    groundHeightAt: GroundHeightAt,
  ): Vec3 {
    const t0 = performance.now();
    const aim = computeWorldAim(camera, colliders ?? [], groundHeightAt, this.worldAimDiagnostics);
    netcodeMetrics.aimQueryMs = performance.now() - t0;
    return { x: aim.x, y: aim.y, z: aim.z };
  }

  resolveWeaponAim(
    tank: TankPose,
    rig: TankRigDefinition,
    worldTarget: Vec3,
    limits: PitchLimits,
  ): TpsWeaponAimResult {
    const state = this.activeCam === this.gunnerCam ? this.gunnerAimState : this.driverAimState;
    const result = resolveTpsWeaponAim({
      tank,
      rig,
      worldTarget,
      cameraYaw: this.activeCam.yaw,
      cameraPitch: this.activeCam.pitch,
      limits,
    }, state);
    this.lastAimDiagnostics = result.diagnostics;
    return result;
  }

  /** Continuous, non-accumulating camera shake applied during render. */
  applyShake(): void {
    if (this.shake <= 0.001 && Math.abs(this.damageLateral) <= .0001 && Math.abs(this.damageRoll) <= .0001) return;
    const s = this.shake;
    const t = this.shakeTime;
    this.activeCam.camera.position.x += Math.sin(t * 37 + 0.3) * s * 0.11;
    this.activeCam.camera.position.y += Math.sin(t * 43 + 1.7) * s * 0.08;
    this.activeCam.camera.position.z += Math.sin(t * 31 + 2.4) * s * 0.11;
    if (Math.abs(this.damageLateral) > .0001) {
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.activeCam.camera.quaternion);
      this.activeCam.camera.position.addScaledVector(right, this.damageLateral);
    }
    if (Math.abs(this.damageRoll) > .0001) this.activeCam.camera.rotateZ(this.damageRoll);
  }
}

export function tankSpeedRatio(t: TankState): number {
  return Math.min(1, Math.hypot(t.vx, t.vz) / 18);
}

export function clampAimPitch(pitch: number): number {
  return clamp(pitch, VERTICAL_AIM_MIN_PITCH, VERTICAL_AIM_MAX_PITCH);
}

export type { MatchState };
