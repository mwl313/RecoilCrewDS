import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { projectTrajectoryReticle, type TrajectoryReticleResult } from '../../src/client/aim/trajectoryReticleProjector';
import { buildCameraCollisionIndex } from '../../src/client/cameraCollision';
import { DEFAULT_TANK_RIG } from '../../src/shared/vehicle/tankRigTypes';
import type { Collider } from '../../src/client/arenaView';

const W = 1280;
const H = 720;

function cameraAt(position: [number, number, number], target: [number, number, number]): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(70, W / H, 0.1, 220);
  cam.position.set(position[0], position[1], position[2]);
  cam.lookAt(new THREE.Vector3(target[0], target[1], target[2]));
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  return cam;
}

function project(
  cam: THREE.PerspectiveCamera,
  tank: { x: number; y: number; z: number; yaw: number },
  turret: { yaw: number; pitch: number },
  desiredPoint: { x: number; y: number; z: number },
  cameraQuery: ReturnType<typeof buildCameraCollisionIndex> | null = null,
  out?: TrajectoryReticleResult,
): TrajectoryReticleResult {
  return projectTrajectoryReticle({
    camera: cam,
    renderWidth: W,
    renderHeight: H,
    tank,
    turretLocalYaw: turret.yaw,
    turretPitch: turret.pitch,
    rig: DEFAULT_TANK_RIG,
    cameraQuery,
    desiredPoint,
    out,
  });
}

function boxCollider(min: [number, number, number], max: [number, number, number]): Collider {
  return { box: new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max)), type: 'wall' };
}

describe('trajectory reticle projection', () => {
  it('aligned barrel projects near screen center', () => {
    const cam = cameraAt([0, 2.5, -6], [0, 2, 20]);
    const r = project(cam, { x: 0, y: 0, z: 0, yaw: 0 }, { yaw: 0, pitch: 0 }, { x: 0, y: 2, z: 20 });
    expect(r.visible).toBe(true);
    expect(r.x).toBeGreaterThan(W * 0.45);
    expect(r.x).toBeLessThan(W * 0.55);
    expect(r.y).toBeGreaterThan(H * 0.3);
    expect(r.y).toBeLessThan(H * 0.7);
    expect(r.blocked).toBe(false);
  });

  it('turret lag honestly offsets the reticle from center', () => {
    const cam = cameraAt([0, 2.5, -6], [0, 2, 20]);
    // Turret is still rotated +0.5 rad (toward world +X) while the camera is
    // centered. The game camera is rotated π around Y, so world +X appears on
    // screen-left; the reticle must follow the shot line, not stay centered.
    const r = project(cam, { x: 0, y: 0, z: 0, yaw: 0 }, { yaw: 0.5, pitch: 0 }, { x: 0, y: 2, z: 20 });
    expect(r.visible).toBe(true);
    expect(r.x).toBeLessThan(W * 0.45);
    expect(r.worldPoint.x).toBeGreaterThan(0);
  });

  it('tank yaw rotates the reticle with the chassis', () => {
    // Tank faces +X; camera follows behind looking +X.
    const cam = cameraAt([-6, 2.5, 0], [20, 2, 0]);
    const r = project(cam, { x: 0, y: 0, z: 0, yaw: Math.PI / 2 }, { yaw: 0, pitch: 0 }, { x: 20, y: 2, z: 0 });
    expect(r.visible).toBe(true);
    expect(r.x).toBeGreaterThan(W * 0.45);
    expect(r.x).toBeLessThan(W * 0.55);
  });

  it('pitch aims the reticle vertically', () => {
    const cam = cameraAt([0, 2.5, -6], [0, 2, 20]);
    const r = project(cam, { x: 0, y: 0, z: 0, yaw: 0 }, { yaw: 0, pitch: 0.35 }, { x: 0, y: 6, z: 20 });
    expect(r.visible).toBe(true);
    expect(r.worldPoint.y).toBeGreaterThan(DEFAULT_TANK_RIG.muzzleLocal[1]);
    expect(r.y).toBeLessThan(H * 0.5);
  });

  it('model-specific muzzle offsets change the reticle', () => {
    const cam = cameraAt([0, 2.5, -6], [0, 2, 20]);
    // Raise the muzzle perpendicular to the aim line: the shot line shifts
    // and the reticle must move with it.
    const custom = { ...DEFAULT_TANK_RIG, muzzleLocal: [0, 1.6, 2.9] as [number, number, number] };
    const base = project(cam, { x: 0, y: 0, z: 0, yaw: 0 }, { yaw: 0, pitch: 0.3 }, { x: 0, y: 6, z: 20 });
    const shifted = projectTrajectoryReticle({
      camera: cam,
      renderWidth: W,
      renderHeight: H,
      tank: { x: 0, y: 0, z: 0, yaw: 0 },
      turretLocalYaw: 0,
      turretPitch: 0.3,
      rig: custom,
      cameraQuery: null,
      desiredPoint: { x: 0, y: 6, z: 20 },
    });
    // The longer barrel shifts the pitched shot line; the reticle visibly
    // differs from the base rig under the same camera.
    expect(Math.abs(shifted.y - base.y)).toBeGreaterThan(0.5);
    expect(shifted.visible).toBe(true);
  });

  it('near cover blocks the muzzle and marks the reticle blocked at the obstacle', () => {
    const cam = cameraAt([0, 2.5, -6], [0, 2, 20]);
    const query = buildCameraCollisionIndex([boxCollider([-2, 0, 7], [2, 4, 9])]);
    const r = project(cam, { x: 0, y: 0, z: 0, yaw: 0 }, { yaw: 0, pitch: 0 }, { x: 0, y: 2, z: 20 }, query);
    expect(r.blocked).toBe(true);
    expect(r.worldPoint.z).toBeGreaterThanOrEqual(7);
    expect(r.worldPoint.z).toBeLessThanOrEqual(9);
  });

  it('never emits NaN and hides off-screen trajectories', () => {
    const cam = cameraAt([0, 2.5, -6], [0, 2, 20]);
    const r = project(cam, { x: 0, y: 0, z: 0, yaw: 0 }, { yaw: Math.PI, pitch: 0 }, { x: 0, y: 2, z: 20 });
    expect(Number.isFinite(r.x)).toBe(true);
    expect(Number.isFinite(r.y)).toBe(true);
    expect(Number.isFinite(r.worldPoint.x + r.worldPoint.y + r.worldPoint.z)).toBe(true);
    expect(r.visible).toBe(false);
  });

  it('reuses a caller-provided result object without allocation churn', () => {
    const cam = cameraAt([0, 2.5, -6], [0, 2, 20]);
    const out: TrajectoryReticleResult = { x: -1, y: -1, visible: false, blocked: false, worldPoint: { x: 0, y: 0, z: 0 } };
    const r = project(cam, { x: 0, y: 0, z: 0, yaw: 0 }, { yaw: 0, pitch: 0 }, { x: 0, y: 2, z: 20 }, null, out);
    expect(r).toBe(out);
    expect(out.visible).toBe(true);
  });
});
