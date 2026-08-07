import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  TpsCameraController,
  computeWorldAim,
  localYawToWorld,
  worldYawToLocal,
  type TpsCameraTuning,
} from '../src/client/tpsCamera';
import { CameraManager } from '../src/client/app/cameraManager';

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
  horizontalFollowSeconds: 0.16,
  verticalFollowUpSeconds: 0.2,
  verticalFollowDownSeconds: 0.13,
  maxVerticalLag: 2,
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

  it('gunner tuning can aim near-vertical for cannon takeoffs', () => {
    const gunner = new TpsCameraController({
      ...TUNING,
      minPitch: -Math.PI / 2,
      maxPitch: Math.PI / 2,
    });
    gunner.applyMouseDelta(0, 100000);
    expect(gunner.pitch).toBeCloseTo(-Math.PI / 2, 6);
    gunner.applyMouseDelta(0, -100000);
    expect(gunner.pitch).toBeCloseTo(Math.PI / 2, 6);
  });

  it('single player and multiplayer Gunner share the full vertical aim range', () => {
    const cm = new CameraManager();
    expect(cm.gunnerCam.minPitch).toBeCloseTo(-Math.PI / 2, 6);
    expect(cm.gunnerCam.maxPitch).toBeCloseTo(Math.PI / 2, 6);
    expect(cm.driverCam.minPitch).toBeCloseTo((-35 * Math.PI) / 180, 6);
    expect(cm.driverCam.maxPitch).toBeCloseTo((55 * Math.PI) / 180, 6);
    cm.setSinglePlayerMode(true);
    expect(cm.driverCam.minPitch).toBeCloseTo(cm.gunnerCam.minPitch, 6);
    expect(cm.driverCam.maxPitch).toBeCloseTo(cm.gunnerCam.maxPitch, 6);
    cm.setSinglePlayerMode(false);
    expect(cm.driverCam.minPitch).toBeCloseTo((-35 * Math.PI) / 180, 6);
    expect(cm.driverCam.maxPitch).toBeCloseTo((55 * Math.PI) / 180, 6);
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

  it('follows a steep valley downward without exceeding the vertical leash', () => {
    const cam = new TpsCameraController(TUNING);
    cam.setFollowPose(new THREE.Vector3(0, 8, 0), 0);
    cam.update(1 / 60, []);
    for (let i = 1; i <= 90; i++) {
      cam.setFollowPose(new THREE.Vector3(0, 8 - i * 0.1, i * 0.12), 0);
      cam.update(1 / 60, []);
      expect(Math.abs(cam.getFollowDiagnostics().verticalLag)).toBeLessThanOrEqual(TUNING.maxVerticalLag + 1e-6);
    }
    for (let i = 0; i < 60; i++) cam.update(1 / 60, []);
    expect(Math.abs(cam.getFollowDiagnostics().verticalLag)).toBeLessThan(0.05);
  });

  it('crosses a hill crest smoothly with bounded upward lag', () => {
    const cam = new TpsCameraController(TUNING);
    cam.setFollowPose(new THREE.Vector3(0, 0, 0), 0);
    cam.update(1 / 60, []);
    let lastY = cam.getFollowDiagnostics().smoothedAnchorY;
    for (let i = 1; i <= 60; i++) {
      cam.setFollowPose(new THREE.Vector3(0, Math.sin((i / 60) * Math.PI) * 4, i * 0.15), 0);
      cam.update(1 / 60, []);
      const diagnostics = cam.getFollowDiagnostics();
      expect(Math.abs(diagnostics.verticalLag)).toBeLessThanOrEqual(TUNING.maxVerticalLag + 1e-6);
      expect(Math.abs(diagnostics.smoothedAnchorY - lastY)).toBeLessThan(0.5);
      lastY = diagnostics.smoothedAnchorY;
    }
  });

  it('stays attached through a ridge jump and cliff-side fall', () => {
    const cam = new TpsCameraController(TUNING);
    cam.setFollowPose(new THREE.Vector3(0, 5, 0), 0);
    cam.update(1 / 60, []);
    for (const y of [5.4, 6.1, 6.8, 6.4, 5.2, 3.4, 1.2, -1.5]) {
      cam.setFollowPose(new THREE.Vector3(0, y, 0), 0);
      cam.update(1 / 30, []);
      expect(Math.abs(cam.getFollowDiagnostics().verticalLag)).toBeLessThanOrEqual(TUNING.maxVerticalLag + 1e-6);
    }
  });

  it('tracks rapid rolling terrain while rotating airborne', () => {
    const cam = new TpsCameraController(TUNING);
    cam.setFollowPose(new THREE.Vector3(0, 2, 0), 0);
    cam.update(1 / 60, []);
    for (let i = 1; i <= 120; i++) {
      cam.applyMouseDelta(3, i % 12 === 0 ? 2 : 0);
      cam.setFollowPose(new THREE.Vector3(i * 0.04, 2 + Math.sin(i * 0.35) * 1.8, i * 0.08), i * 0.02);
      cam.update(1 / 60, []);
      expect(Math.abs(cam.getFollowDiagnostics().verticalLag)).toBeLessThanOrEqual(TUNING.maxVerticalLag + 1e-6);
      expect(Number.isFinite(cam.camera.position.length())).toBe(true);
    }
  });

  it('recovers its boom after a wall without retaining stale follow height', () => {
    const cam = new TpsCameraController(TUNING);
    cam.setFollowPose(new THREE.Vector3(0, 4, 0), 0);
    const wall = [box(-5, 0, -4, 5, 10, -1)];
    cam.update(1 / 60, wall);
    const blockedDistance = cam.getFollowDiagnostics().distance;
    cam.setFollowPose(new THREE.Vector3(0, 0, 0), 0);
    for (let i = 0; i < 90; i++) cam.update(1 / 60, []);
    const recovered = cam.getFollowDiagnostics();
    expect(recovered.distance).toBeGreaterThan(blockedDistance);
    expect(recovered.colliding).toBe(false);
    expect(Math.abs(recovered.verticalLag)).toBeLessThan(0.05);
  });

  it('keeps finite bounded follow state after a frame spike', () => {
    const cam = new TpsCameraController(TUNING);
    cam.setFollowPose(new THREE.Vector3(0, 12, 0), 0);
    cam.update(1 / 60, []);
    cam.setFollowPose(new THREE.Vector3(30, -12, 30), 0);
    cam.update(5, []);
    const diagnostics = cam.getFollowDiagnostics();
    expect(Math.abs(diagnostics.verticalLag)).toBeLessThanOrEqual(TUNING.maxVerticalLag + 1e-6);
    expect(Number.isFinite(cam.camera.position.length())).toBe(true);
  });

  it('keeps the default camera rigidly attached in the ground plane', () => {
    const cam = new TpsCameraController();
    cam.setFollowPose(new THREE.Vector3(0, 0, 0), 0);
    cam.update(1 / 60, []);
    cam.setFollowPose(new THREE.Vector3(1.2, 0, 2.4), 0);
    cam.update(1 / 60, []);
    expect(cam.getFollowDiagnostics().horizontalLag).toBe(0);
  });

  it('resets follow state across a teleport instead of flying through the arena', () => {
    const cam = new TpsCameraController(TUNING);
    cam.setFollowPose(new THREE.Vector3(0, 0, 0), 0);
    cam.update(1 / 60, []);
    cam.setFollowPose(new THREE.Vector3(40, 25, -30), 0);
    cam.update(1 / 60, []);
    const diagnostics = cam.getFollowDiagnostics();
    expect(diagnostics.horizontalLag).toBe(0);
    expect(diagnostics.verticalLag).toBe(0);
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
