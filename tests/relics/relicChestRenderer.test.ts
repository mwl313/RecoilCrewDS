import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { AssetService } from '../../src/client/assets';
import {
  RelicChestRenderer,
} from '../../src/client/relics/relicChestRenderer';
import type { TreasureChestState } from '../../src/shared/progression/progressionTypes';
import { TREASURE_CHEST_STATE_GROUND_OFFSET } from '../../src/shared/progression/treasureChestGeometry';

describe('RelicChestRenderer', () => {
  it('renders replicated chests at ground level with the explicit spherical collider', () => {
    const scene = new THREE.Scene();
    const renderer = new RelicChestRenderer(scene, fakeAssets());
    renderer.update([chest({ x: 7, y: 3.4, z: 9 })], 1 / 60);

    const rig = renderer.rigs.get(1)!;
    expect(scene.children).toContain(rig.root);
    expect(rig.root.position.toArray()).toEqual([7, 3.4 - TREASURE_CHEST_STATE_GROUND_OFFSET, 9]);
    expect(rig.root.scale.toArray()).toEqual([2, 2, 2]);
    expect(rig.root.userData.collider).toEqual({ shape: 'sphere', radius: 1 });
    expect(rig.beacon.visible).toBe(true);
    expect(rig.root.getObjectByName('TreasureChestBeaconDiamond')).toBeTruthy();
    for (const name of ['TreasureChestBeaconDiamond', 'TreasureChestBeaconRing', 'TreasureChestBeaconStem']) {
      const material = (rig.root.getObjectByName(name) as THREE.Mesh).material as THREE.Material;
      expect(material.depthTest, name).toBe(true);
    }
    renderer.dispose();
  });

  it('animates an authoritative open and removes stale chest views', () => {
    const scene = new THREE.Scene();
    const renderer = new RelicChestRenderer(scene, fakeAssets());
    renderer.update([chest()], 0.1);
    renderer.update([chest({ opened: true })], 0.325);
    expect(renderer.rigs.get(1)?.presentation.getOpenProgress()).toBeCloseTo(0.5);
    expect(renderer.rigs.get(1)?.beacon.visible).toBe(false);

    renderer.update([], 1 / 60);
    expect(renderer.rigs.size).toBe(0);
    expect(scene.getObjectByName('TreasureChest.1')).toBeUndefined();
  });
});

function chest(overrides: Partial<TreasureChestState> = {}): TreasureChestState {
  return {
    id: 1,
    source: 'enemyDrop',
    x: 0,
    y: TREASURE_CHEST_STATE_GROUND_OFFSET,
    z: 0,
    opened: false,
    ...overrides,
  };
}

function fakeAssets(): AssetService {
  return {
    createModelInstance: () => {
      const root = new THREE.Group();
      root.scale.setScalar(2);
      const chestRoot = new THREE.Group();
      chestRoot.name = 'RelicChest';
      const base = new THREE.Group();
      base.name = 'Base';
      const lid = new THREE.Group();
      lid.name = 'Lid';
      const glow = new THREE.Group();
      glow.name = 'GlowOrigin';
      const reward = new THREE.Group();
      reward.name = 'RewardAnchor';
      base.add(glow, reward);
      chestRoot.add(base, lid);
      root.add(chestRoot);
      return { root };
    },
  } as unknown as AssetService;
}
