import * as THREE from 'three';
import { groundHeightAt } from '../shared/arena';
import { clamp, lerp, wrapAngle } from '../shared/math';
import { cameraRayHit, rayAabbT, type Collider } from './arenaView';

export interface AimInfo {
  yaw: number;
  pitch: number;
  point: THREE.Vector3;
}

export class TpsCamera {
  camera: THREE.PerspectiveCamera;
  yaw = 0;
  pitch = 0.12;
  private desiredYaw = 0;
  private desiredPitch = 0.12;
  private currentPos = new THREE.Vector3();
  private recentering = false;

  constructor(
    aspect: number,
    private role: 'driver' | 'gunner',
    private opts: { distance: number; height: number; shoulder: number; fov: number; minPitch: number; maxPitch: number },
  ) {
    this.camera = new THREE.PerspectiveCamera(opts.fov, aspect, 0.1, 220);
    this.yaw = Math.PI;
  }

  recenter() {
    this.recentering = true;
  }

  addMouse(dx: number, dy: number) {
    this.desiredYaw = wrapAngle(this.desiredYaw - dx * 0.0024);
    this.desiredPitch = clamp(this.desiredPitch - dy * 0.0022, this.opts.minPitch, this.opts.maxPitch);
    this.yaw = this.desiredYaw;
    this.pitch = this.desiredPitch;
  }

  update(
    dt: number,
    tankPos: THREE.Vector3,
    tankYaw: number,
    speedRatio: number,
    colliders: Collider[],
    isPip = false,
  ) {
    if (this.recentering) {
      this.desiredYaw = tankYaw + Math.PI;
      this.desiredPitch = 0.16;
      const diff = Math.abs(wrapAngle(this.yaw - this.desiredYaw));
      if (diff < 0.04) {
        this.recentering = false;
      }
    }
    this.yaw = wrapAngle(this.desiredYaw);
    this.pitch = this.desiredPitch;
    const d = this.opts.distance;
    const h = this.opts.height;
    const s = this.opts.shoulder;
    const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const eye = new THREE.Vector3()
      .copy(tankPos)
      .addScaledVector(dir, -d)
      .addScaledVector(right, s)
      .add(new THREE.Vector3(0, h, 0));
    // Wall / prop collision: pull the camera in toward the tank.
    const origin = tankPos.clone().add(new THREE.Vector3(0, 1.35, 0));
    const toEye = eye.clone().sub(origin);
    const dist = toEye.length();
    toEye.normalize();
    const hit = cameraRayHit(colliders, origin, toEye, dist);
    if (hit < dist) {
      eye.copy(origin).addScaledVector(toEye, hit - 0.12);
    }
    const ground = groundHeightAt(eye.x, eye.z);
    if (eye.y < ground + 0.35) eye.y = ground + 0.35;

    const damp = isPip ? 1 : Math.min(1, dt * 14);
    if (this.currentPos.lengthSq() === 0) this.currentPos.copy(eye);
    this.currentPos.lerp(eye, damp);
    this.camera.position.copy(this.currentPos);
    const look = tankPos.clone().add(new THREE.Vector3(0, 1.35, 0));
    if (this.role === 'driver') {
      look.add(new THREE.Vector3(Math.sin(tankYaw), 0, Math.cos(tankYaw)).multiplyScalar(2.5));
    }
    this.camera.lookAt(look);
    const targetFov = this.opts.fov + (this.role === 'driver' ? speedRatio * 5.5 : 0);
    this.camera.fov = lerp(this.camera.fov, targetFov, Math.min(1, dt * 3));
    this.camera.updateProjectionMatrix();
  }

  /** Gunner: compute the aim point under the center reticle and turret angles. */
  computeAim(tankPos: THREE.Vector3, colliders: Collider[]): AimInfo {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const origin = this.camera.position;
    let t = 90;
    for (const c of colliders) {
      const hit = rayAabbT(origin, dir, c.box);
      if (hit !== null && hit > 0.2 && hit < t) t = hit;
    }
    const groundT = origin.y > 0.1 ? origin.y / -dir.y : Infinity;
    if (groundT > 0.2 && groundT < t) t = groundT;
    const point = origin.clone().addScaledVector(dir, t);
    const pivot = tankPos.clone().add(new THREE.Vector3(0, 1.15, 0));
    const dx = point.x - pivot.x;
    const dz = point.z - pivot.z;
    const flat = Math.hypot(dx, dz) || 0.001;
    const yaw = Math.atan2(dx, dz);
    const pitch = clamp(Math.atan2(point.y - pivot.y, flat), -0.45, 0.5);
    return { yaw, pitch, point };
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}

/** Auto-follow camera used for the partner picture-in-picture. */
export class PipCamera {
  camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.1, 220);
  private pos = new THREE.Vector3();

  update(dt: number, tankPos: THREE.Vector3, chassisYaw: number, turretWorldYaw: number, role: 'driver' | 'gunner') {
    const yaw = role === 'driver' ? chassisYaw : turretWorldYaw;
    const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const eye = tankPos
      .clone()
      .addScaledVector(dir, -6.8)
      .add(new THREE.Vector3(0, role === 'driver' ? 2.7 : 2.3, 0));
    const ground = groundHeightAt(eye.x, eye.z);
    if (eye.y < ground + 0.4) eye.y = ground + 0.4;
    this.pos.lerp(eye, Math.min(1, dt * 5));
    if (this.pos.lengthSq() === 0) this.pos.copy(eye);
    this.camera.position.copy(this.pos);
    this.camera.lookAt(tankPos.clone().add(new THREE.Vector3(0, 1.2, 0)).addScaledVector(dir, 7));
  }
}
