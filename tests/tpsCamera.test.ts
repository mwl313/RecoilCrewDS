import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  TpsCameraController,
  computeWorldAim,
  localYawToWorld,
  worldYawToLocal,
  type TpsCameraTuning,
} from '../src/client/tpsCamera';

const TUNING: TpsCameraTuning = {
  fov: 70,
  shoulderOffset: 0.65,
  shoulderHeight: 0.35,
  verticalArm: 0.65,
  distance: 5.2,
  minimumDistance: 1.25,
  cameraRadius: 0.3,
  anchorHeight: 1.35,
  minPitch: (-35 * Math.PI) / 180,
  maxPitch: (55 * Math.PI) / 180,
  sensitivityX: 0.0024,
  sensitivityY: 0.0022,
  invertMouseX: false,
  invertMouseY: false,
  collisionPullInSeconds: 0.02,
  collisionReleaseSeconds: 0.1,
  recenterSeconds: 0.16,
};

function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
  return { box: new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)), type: 'test' };
}

describe('TPS camera direction conventions', () => {
  it('mouse right decreases yaw (standard look-right from behind) by default', () => {
    const cam = new TpsCameraController(TUNING);
    const y0 = cam.yaw;
    cam.applyMouseDelta(100, 0);
    expect(cam.yaw - y0).toBeCloseTo(-100 * TUNING.sensitivityX, 6);
  });

  it('mouse up increases pitch (looks up) by default', () => {
    const cam = new TpsCameraController(TUNING);
    const p0 = cam.pitch;
    cam.applyMouseDelta(0, -100);
    expect(cam.pitch - p0).toBeCloseTo(100 * TUNING.sensitivityY, 6);
  });

  it('default invert flags are false', () => {
    expect(TUNING.invertMouseX).toBe(false);
    expect(TUNING.invertMouseY).toBe(false);
  });

  it('yaw is unbounded across repeated rotations', () => {
    const cam = new TpsCameraController(TUNING);
    cam.applyMouseDelta((-3 * Math.PI * 2) / TUNING.sensitivityX, 0);
    expect(cam.yaw).toBeGreaterThan(Math.PI * 4);
    cam.applyMouseDelta((6 * Math.PI * 2) / TUNING.sensitivityX, 0);
    expect(cam.yaw).toBeLessThan(-Math.PI * 4);
  });

  it('pitch clamps smoothly at the configured limits', () => {
    const cam = new TpsCameraController(TUNING);
    cam.applyMouseDelta(0, -100000);
    expect(cam.pitch).toBeCloseTo(TUNING.maxPitch);
    cam.applyMouseDelta(0, 100000);
    expect(cam.pitch).toBeCloseTo(TUNING.minPitch);
  });
});

describe('TPS camera rig placement', () => {
  it('places the camera behind the chassis and looks along view-forward', () => {
    const cam = new TpsCameraController(TUNING);
    cam.setFollowPose(new THREE.Vector3(0, 0, 0), 0);
    cam.update(1 / 30, []);
    expect(cam.camera.position.z).toBeLessThan(-TUNING.distance * 0.9);
    expect(cam.camera.position.x).toBeCloseTo(TUNING.shoulderOffset, 2);
    const dir = new THREE.Vector3();
    cam.camera.getWorldDirection(dir);
    expect(dir.z).toBeGreaterThan(0.9);
  });

  it('recenters to behind the chassis through the shortest angle without snapping', () => {
    const cam = new TpsCameraController(TUNING);
    cam.yaw = Math.PI * 0.8;
    cam.pitch = 0.7;
    cam.requestRecenter(0);
    let lastDist = Math.abs(cam.yaw);
    for (let i = 0; i < 40 && cam.recentering; i++) {
      cam.update(1 / 30, []);
      const d = Math.abs(cam.yaw);
      expect(d).toBeLessThanOrEqual(lastDist + 1e-9);
      lastDist = d;
    }
    expect(cam.recentering).toBe(false);
    expect(cam.yaw).toBeCloseTo(0, 3);
    expect(cam.pitch).toBeLessThan(0.2);
  });

  it('pulls the camera in when a wall is behind the chassis', () => {
    const cam = new TpsCameraController(TUNING);
    cam.setFollowPose(new THREE.Vector3(0, 0, 0), 0);
    const colliders = [box(-5, 0, -4, 5, 4, -1)];
    cam.update(1 / 30, colliders);
    expect(cam.camera.position.z).toBeGreaterThan(-2.0);
    expect(cam.camera.position.z).toBeLessThan(-0.8);
  });

  it('never places the camera below the floor, even at maximum upward pitch', () => {
    const cam = new TpsCameraController(TUNING);
    cam.setFollowPose(new THREE.Vector3(0, 0, 0), 0);
    cam.applyMouseDelta(0, -100000);
    cam.update(1 / 30, []);
    expect(cam.camera.position.y).toBeGreaterThanOrEqual(TUNING.cameraRadius * 0.8);
  });

  it('camera collision changes position only, never yaw/pitch', () => {
    const cam = new TpsCameraController(TUNING);
    cam.setFollowPose(new THREE.Vector3(0, 0, 0), 0);
    const y0 = cam.yaw;
    const p0 = cam.pitch;
    cam.update(1 / 30, [box(-5, 0, -4, 5, 4, -1)]);
    expect(cam.yaw).toBe(y0);
    expect(cam.pitch).toBe(p0);
  });
});

describe('gunner world aim and turret conversion', () => {
  it('aim point comes from the final camera center ray', () => {
    const cam = new TpsCameraController(TUNING);
    cam.setFollowPose(new THREE.Vector3(0, 0, 0), 0);
    cam.update(1 / 30, []);
    const aim = computeWorldAim(cam.camera, [], 0);
    expect(aim.z).toBeGreaterThan(0);
    expect(aim.x).toBeCloseTo(cam.camera.position.x, 3);
  });

  it('converts world yaw to chassis-local yaw and back (single chassis application)', () => {
    expect(worldYawToLocal(0, 0)).toBeCloseTo(0);
    expect(worldYawToLocal(Math.PI / 2, 0)).toBeCloseTo(Math.PI / 2);
    expect(worldYawToLocal(Math.PI / 2, Math.PI)).toBeCloseTo(-Math.PI / 2);
    for (const world of [0.3, -2.1, 2.8, -3.0]) {
      for (const chassis of [0, 1.2, -2.4]) {
        const local = worldYawToLocal(world, chassis);
        expect(localYawToWorld(local, chassis)).toBeCloseTo(world, 6);
      }
    }
  });

  it('uses shortest angle for ±π crossings', () => {
    // +179° → -179° moves +2° shortest.
    const a = (179 * Math.PI) / 180;
    const b = (-179 * Math.PI) / 180;
    const diff = ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    expect(Math.abs(diff)).toBeCloseTo((2 * Math.PI) / 180, 6);
  });
});
