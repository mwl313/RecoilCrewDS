import * as THREE from 'three';
import { clamp } from '../../shared/math';
import { TpsCameraController, computeWorldAim, type TpsCameraTuning } from '../tpsCamera';
import type { Collider } from '../arenaView';
import type { CameraCollisionSource } from '../tpsCamera';
import type { CameraCollisionQuery } from '../cameraCollision';
import type { MatchState, Role, TankState } from '../../shared/types';
import { netcodeMetrics } from '../netcode/netcodeMetrics';

/** Driver/Gunner TPS rigs + camera impulses; TPS math stays in tpsCamera. */
export class CameraManager {
  readonly driverCam: TpsCameraController;
  readonly gunnerCam: TpsCameraController;
  activeCam: TpsCameraController;
  private shake = 0;
  private lastRenderYaw = 0;

  constructor() {
    const driverTuning: Partial<TpsCameraTuning> = {
      fov: 70,
      distance: 5.2,
      shoulderOffset: 0.65,
      speedFovBonus: 5.5,
    };
    const gunnerTuning: Partial<TpsCameraTuning> = {
      fov: 68,
      distance: 4.4,
      shoulderOffset: 0.55,
      shoulderHeight: 0.3,
      verticalArm: 0.55,
      speedFovBonus: 0,
      // The Gunner must be able to aim near-vertical for cannon takeoffs.
      // The turret remains the final authority (-1.45 rad); the camera just
      // has to reach it. The Driver camera keeps the normal -35° floor.
      minPitch: (-77 * Math.PI) / 180,
    };
    this.driverCam = new TpsCameraController(driverTuning);
    this.gunnerCam = new TpsCameraController(gunnerTuning);
    this.activeCam = this.driverCam;
  }

  setRole(role: Role): void {
    this.activeCam = role === 'driver' ? this.driverCam : this.gunnerCam;
  }

  resize(aspect: number): void {
    this.driverCam.resize(aspect);
    this.gunnerCam.resize(aspect);
  }

  addImpulse(shake: number): void {
    this.shake = Math.min(1.6, this.shake + shake);
  }

  tickShake(dtRaw: number): void {
    this.shake = Math.max(0, this.shake - dtRaw * 1.4);
  }

  recenter(chassisYaw: number): void {
    this.activeCam.requestRecenter(chassisYaw);
  }

  getCameraState() {
    return {
      yaw: this.activeCam.yaw,
      pitch: this.activeCam.pitch,
      recentering: this.activeCam.recentering,
      recenterTargetYaw: (this.activeCam as unknown as { recenterTargetYaw?: number }).recenterTargetYaw,
      lastRenderYaw: this.lastRenderYaw,
    };
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
    this.activeCam.setFollowPose(pos, chassisYaw);
    const t0 = performance.now();
    this.activeCam.update(dt, colliders ?? [], speedRatio);
    netcodeMetrics.cameraQueryMs = performance.now() - t0;
  }

  computeAim(camera: THREE.PerspectiveCamera, colliders: CameraCollisionSource | null, groundY: number): { x: number; y: number; z: number } {
    const t0 = performance.now();
    const aim = computeWorldAim(camera, colliders ?? [], groundY);
    netcodeMetrics.aimQueryMs = performance.now() - t0;
    return { x: aim.x, y: aim.y, z: aim.z };
  }

  /** Camera shake jitter applied to the active camera during render. */
  applyShake(): void {
    if (this.shake <= 0.001) return;
    const s = this.shake;
    this.activeCam.camera.position.x += (Math.random() - 0.5) * s * 0.35;
    this.activeCam.camera.position.y += (Math.random() - 0.5) * s * 0.3;
    this.activeCam.camera.position.z += (Math.random() - 0.5) * s * 0.35;
  }
}

export function tankSpeedRatio(t: TankState): number {
  return Math.min(1, Math.hypot(t.vx, t.vz) / 18);
}

export function clampAimPitch(pitch: number): number {
  // Resolved loadout pitch limits (content/legacy parity: -1.45..0.42).
  return clamp(pitch, -1.45, 0.42);
}

export type { MatchState };
