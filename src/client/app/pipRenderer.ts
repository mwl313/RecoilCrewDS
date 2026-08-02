import * as THREE from 'three';
import { PipCamera } from '../cameras';
import type { RenderWorld } from './renderWorld';
import type { MatchState, Role } from '../../shared/types';

/** Picture-in-picture partner viewport rendering. */
export class PipRenderer {
  private readonly pipCam = new PipCamera();
  pipRate = 3;
  private frame = 0;

  constructor(private readonly world: RenderWorld) {}

  update(dt: number, state: MatchState, role: Role): void {
    this.frame++;
    if (this.frame % this.pipRate !== 0) return;
    const tank = state.tank;
    const pos = new THREE.Vector3(tank.x, tank.y, tank.z);
    const pipRole: Role = role === 'driver' ? 'gunner' : 'driver';
    this.pipCam.update(dt, pos, tank.yaw, tank.yaw + state.turret.yaw, pipRole);
    const w = this.world.renderer.domElement.clientWidth || window.innerWidth;
    const h = this.world.renderer.domElement.clientHeight || window.innerHeight;
    const pr = this.world.renderer.getPixelRatio();
    const pw = Math.round(w * 0.2 * pr);
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
