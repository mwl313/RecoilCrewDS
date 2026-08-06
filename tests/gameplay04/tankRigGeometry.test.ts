// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DEFAULT_TANK_RIG } from '../../src/shared/vehicle/tankRigTypes';
import {
  computeAimPivotWorld,
  computeWeaponMountWorldPose,
  resolveTerrainSafeMuzzle,
  solveTurretAim,
  type TankPose,
} from '../../src/shared/vehicle/tankRigGeometry';
import type { TankRigDefinition } from '../../src/shared/content/schemas/tank';
import { loadContentPackFromFilesystem } from '../../src/shared/content/contentLoader';
import { AssetService } from '../../src/client/assets';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MatchRules } from '../../src/shared/rules/matchRules';

const CONTENT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../content');

function tank(partial: Partial<TankPose> = {}): TankPose {
  return { x: 10, y: 2, z: -8, yaw: 0.7, ...partial };
}

describe('tank rig schema and content', () => {
  it('default tank content carries the rig and matches the built-in fallback', () => {
    const pack = loadContentPackFromFilesystem(CONTENT_ROOT);
    const tankDef = pack.getTank('tank.default');
    expect(tankDef.rig).toBeDefined();
    expect(tankDef.rig).toEqual(DEFAULT_TANK_RIG);
    expect(tankDef.rig.muzzleLocal).toEqual([0, 0.75, 2.9]);
    expect(tankDef.rig.turretPivot).toEqual([0, 1.15, 0]);
    expect(tankDef.rig.barrelPivot).toEqual([0, 0.62, 0]);
  });

  it('MatchRules resolves the selected tank rig on content and legacy paths', () => {
    const pack = loadContentPackFromFilesystem(CONTENT_ROOT);
    const content = MatchRules.fromContentPack(pack, 'none', 'mode.singlePlayerScoreAttack');
    expect(content.tank.id).toBe('tank.default');
    expect(content.tankRigBlock().rig).toEqual(DEFAULT_TANK_RIG);
    expect(content.tankRigBlock().tankId).toBe('tank.default');
    const legacy = MatchRules.fromLegacyConfig('none');
    expect(legacy.tank.rig).toEqual(content.tank.rig);
  });
});

describe('shared weapon-mount geometry', () => {
  it('matches the Three.js tank hierarchy for muzzle position and direction', () => {
    const rig = DEFAULT_TANK_RIG;
    const pose = tank({ yaw: 0.7 });
    const turret = { yaw: -0.4, pitch: 0.25 };
    const shared = computeWeaponMountWorldPose(pose, turret, rig);

    const chassis = new THREE.Group();
    chassis.position.set(pose.x, pose.y, pose.z);
    chassis.rotation.y = pose.yaw;
    const turretObj = new THREE.Group();
    turretObj.position.set(rig.turretPivot[0], rig.turretPivot[1], rig.turretPivot[2]);
    turretObj.rotation.y = turret.yaw;
    chassis.add(turretObj);
    const barrel = new THREE.Group();
    barrel.position.set(rig.barrelPivot[0], rig.barrelPivot[1], rig.barrelPivot[2]);
    barrel.rotation.x = -turret.pitch;
    turretObj.add(barrel);
    chassis.updateMatrixWorld(true);

    const muzzle = new THREE.Vector3(rig.muzzleLocal[0], rig.muzzleLocal[1], rig.muzzleLocal[2]).applyMatrix4(barrel.matrixWorld);
    expect(shared.muzzle.x).toBeCloseTo(muzzle.x, 5);
    expect(shared.muzzle.y).toBeCloseTo(muzzle.y, 5);
    expect(shared.muzzle.z).toBeCloseTo(muzzle.z, 5);

    const forward = new THREE.Vector3(0, 0, 1)
      .applyAxisAngle(new THREE.Vector3(1, 0, 0), -turret.pitch)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), pose.yaw + turret.yaw)
      .normalize();
    expect(shared.direction.x).toBeCloseTo(forward.x, 5);
    expect(shared.direction.y).toBeCloseTo(forward.y, 5);
    expect(shared.direction.z).toBeCloseTo(forward.z, 5);
  });

  it('pitch follows the -rotation.x convention used by the renderer', () => {
    const shared = computeWeaponMountWorldPose(tank({ yaw: 0 }), { yaw: 0, pitch: 0.5 }, DEFAULT_TANK_RIG);
    expect(shared.direction.y).toBeCloseTo(Math.sin(0.5), 6);
    expect(shared.direction.z).toBeCloseTo(Math.cos(0.5), 6);
  });

  it('backs a vertical-down muzzle up to terrain without changing shot direction', () => {
    const mount = computeWeaponMountWorldPose(
      { x: 0, y: 0, z: 0, yaw: 0 },
      { yaw: 0, pitch: -Math.PI / 2 },
      DEFAULT_TANK_RIG,
    );
    expect(mount.muzzle.y).toBeLessThan(0);
    const safe = resolveTerrainSafeMuzzle(mount, () => 0);
    expect(safe.y).toBeCloseTo(0.0801, 3);
    expect(mount.direction.y).toBeCloseTo(-1, 6);
    expect(Math.hypot(safe.x, safe.z)).toBeLessThan(1);
  });

  it('solveTurretAim points the rig aim pivot at the desired world point', () => {
    const pose = tank({ yaw: 0 });
    const desired = { x: pose.x, y: pose.y + 4, z: pose.z + 20 };
    const limits = { minPitch: -1.45, maxPitch: 0.42 };
    const solved = solveTurretAim(pose, DEFAULT_TANK_RIG, desired, limits);
    expect(solved.desiredYawLocal).toBeCloseTo(0, 3);
    expect(solved.desiredPitch).toBeCloseTo(Math.atan2(4 - DEFAULT_TANK_RIG.aimPivotLocal[1], 20), 3);
    // Clamp: an extreme below-floor point stays inside turret limits.
    const clamped = solveTurretAim(pose, DEFAULT_TANK_RIG, { x: pose.x, y: -50, z: pose.z + 1 }, limits);
    expect(clamped.desiredPitch).toBe(limits.minPitch);
  });

  it('aim pivot world uses the rig aimPivotLocal rotated by chassis yaw', () => {
    const pose = tank({ yaw: Math.PI / 2 });
    const pivot = computeAimPivotWorld(pose, DEFAULT_TANK_RIG);
    // [0,1.15,0] rotated 90° around Y stays (0,1.15,0).
    expect(pivot.x).toBeCloseTo(pose.x, 6);
    expect(pivot.y).toBeCloseTo(pose.y + 1.15, 6);
    expect(pivot.z).toBeCloseTo(pose.z, 6);
  });
});

describe('client rig factory', () => {
  it('builds a TankRig from resolved rig data with no hardcoded pivots', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({ ok: false })) as unknown as typeof fetch;
    try {
      const service = await AssetService.load({
        gltfLoaderFactory: async () => ({
          load(_url: string, onLoad: (gltf: { scene: THREE.Object3D }) => void) {
            onLoad({ scene: new THREE.Group() });
          },
        }),
      });
      const custom: TankRigDefinition = {
        ...DEFAULT_TANK_RIG,
        turretPivot: [0, 2, 0],
        barrelPivot: [0, 1, 0],
        muzzleLocal: [0, 0.5, 4],
        aimPivotLocal: [0, 2, 0],
      };
      const rig = service.tankRig(custom);
      expect(rig.turret.position.y).toBe(2);
      expect(rig.barrel.position.y).toBe(1);
      expect(rig.rigDefinition).toEqual(custom);
      // Shared math and the built hierarchy agree at a nonzero pose.
      rig.chassis.position.set(3, 1, -2);
      rig.chassis.rotation.y = 0.9;
      rig.turret.rotation.y = -0.3;
      rig.barrel.rotation.x = -0.2;
      rig.chassis.updateMatrixWorld(true);
      const shared = computeWeaponMountWorldPose({ x: 3, y: 1, z: -2, yaw: 0.9 }, { yaw: -0.3, pitch: 0.2 }, custom);
      const muzzle = new THREE.Vector3(custom.muzzleLocal[0], custom.muzzleLocal[1], custom.muzzleLocal[2]).applyMatrix4(rig.barrel.matrixWorld);
      expect(shared.muzzle.x).toBeCloseTo(muzzle.x, 4);
      expect(shared.muzzle.y).toBeCloseTo(muzzle.y, 4);
      expect(shared.muzzle.z).toBeCloseTo(muzzle.z, 4);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
