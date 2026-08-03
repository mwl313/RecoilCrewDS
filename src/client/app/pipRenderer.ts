import * as THREE from 'three';
import { PipCamera } from '../cameras';
import type { RenderWorld } from './renderWorld';
import type { Role, TankState } from '../../shared/types';
import { NET_TUNING } from '../../shared/net/tuning';

/** Picture-in-picture partner viewport rendering. */
export class PipRenderer {
  private readonly pipCam = new PipCamera();
  pipRate = Math.max(1, Math.round(60 / NET_TUNING.pip.normalHz));
  pipScale = 0.75;
  private frame = 0;

  constructor(private readonly world: RenderWorld) {}

  update(dt: number, tank: TankState, turretYaw: number, role: Role): void {
    this.frame++;
    if (this.frame % this.pipRate !== 0) return;
    const pos = new THREE.Vector3(tank.x, tank.y, tank.z);
    const pipRole: Role = role === 'driver' ? 'gunner' : 'driver';
    this.pipCam.update(dt, pos, tank.yaw, tank.yaw + turretYaw, pipRole);
    const w = this.world.renderer.domElement.clientWidth || window.innerWidth;
    const h = this.world.renderer.domElement.clientHeight || window.innerHeight;
    const pr = this.world.renderer.getPixelRatio();
    const pw = Math.max(80, Math.round(w * 0.2 * pr * this.pipScale));
    const ph = Math.round(pw * 9 / 16);
    const px = Math.round((w - pw / pr - 14) * pr);
    const py = Math.round((h - ph / pr - 14) * pr);
    this.world.renderWithCamera(this.pipCam.camera, px, py, pw, ph);
    this.world.resetViewport(w, h);
  }

  reset(): void {
    this.frame = 0;
  }
}
