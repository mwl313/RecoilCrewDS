import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { CLIENT_CONTENT_PACK } from '../../src/generated/contentPack.generated';
import type { AssetService } from '../../src/client/assets';
import { RelicChestWorldRenderer } from '../../src/client/relics/relicChestWorldRenderer';
import type { TreasureChestState } from '../../src/shared/progression/progressionTypes';

function chestRoot(material = new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.73 })) {
  const root = new THREE.Group();
  const chest = new THREE.Group();
  chest.name = 'RelicChest';
  const base = new THREE.Group();
  base.name = 'Base';
  base.add(new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 0.7), material));
  const lid = new THREE.Group();
  lid.name = 'Lid';
  lid.add(new THREE.Mesh(new THREE.BoxGeometry(1, 0.25, 0.7), material));
  const glow = new THREE.Group();
  glow.name = 'GlowOrigin';
  const reward = new THREE.Group();
  reward.name = 'RewardAnchor';
  chest.add(base, lid, glow, reward);
  root.add(chest);
  return root;
}

function state(lifecycle: TreasureChestState['lifecycle'], overrides: Partial<TreasureChestState> = {}): TreasureChestState {
  return {
    id: 7,
    source: 'mapStart',
    x: 10,
    y: 2,
    z: -4,
    lifecycle,
    spawnStartedAtGameTime: 1,
    claimableAtGameTime: 1.5,
    ...overrides,
  };
}

describe('relic chest world renderer', () => {
  it('keeps one visual per authoritative id and reconstructs lifecycle progress', () => {
    const scene = new THREE.Scene();
    const createModelInstance = vi.fn(() => ({ root: chestRoot(), source: {}, skinned: false }));
    const assets = { createModelInstance } as unknown as AssetService;
    const policy = CLIENT_CONTENT_PACK.getRelicChestSpawnPolicy('relicChestSpawn.mainStage');
    const renderer = new RelicChestWorldRenderer(scene, assets, policy);

    renderer.sync([state('spawning')], 1, 10_000, 0.016);
    const root = scene.getObjectByName('RelicChestWorld.7')!;
    expect(renderer.size).toBe(1);
    expect(root.scale.x).toBeCloseTo(0.001, 5);
    expect(root.position.toArray()).toEqual([10, 2, -4]);

    renderer.sync([state('opening', { openingStartedAtWallMs: 10_000, fullyOpenAtWallMs: 10_650 })], 2, 10_325, 0.016);
    const lid = root.getObjectByName('Lid')!;
    const halfwayRotation = lid.rotation.x;
    expect(halfwayRotation).toBeLessThan(0);
    renderer.sync([state('opening', { openingStartedAtWallMs: 10_000, fullyOpenAtWallMs: 10_650 })], 2, 10_500, 0.016);
    expect(scene.getObjectByName('RelicChestWorld.7')).toBe(root);
    expect(lid.rotation.x).toBeLessThan(halfwayRotation);
    expect(createModelInstance).toHaveBeenCalledTimes(1);

    renderer.sync([state('revealing')], 2, 11_000, 0.016);
    expect(lid.rotation.x).toBeCloseTo(THREE.MathUtils.degToRad(-55.791075), 5);
  });

  it('preserves PBR values while fading and disposes only instance materials', () => {
    const scene = new THREE.Scene();
    const prototypeMaterial = new THREE.MeshStandardMaterial({ color: 0x6f452b, roughness: 0.81, metalness: 0.17 });
    const createModelInstance = vi.fn(() => {
      const owned = prototypeMaterial.clone();
      return { root: chestRoot(owned), source: {}, skinned: false };
    });
    const policy = CLIENT_CONTENT_PACK.getRelicChestSpawnPolicy('relicChestSpawn.mainStage');
    const renderer = new RelicChestWorldRenderer(scene, { createModelInstance } as unknown as AssetService, policy);

    renderer.sync([state('despawning', { despawnStartedAtGameTime: 4 })], 4.225, 1, 0.016);
    const mesh = scene.getObjectByName('RelicChestWorld.7')!.getObjectByProperty('isMesh', true) as THREE.Mesh;
    const material = mesh.material as THREE.MeshStandardMaterial;
    expect(material.color.getHex()).toBe(prototypeMaterial.color.getHex());
    expect(material.roughness).toBe(prototypeMaterial.roughness);
    expect(material.metalness).toBe(prototypeMaterial.metalness);
    expect(material.opacity).toBeCloseTo(0.5, 1);
    expect(scene.getObjectByName('RelicChestWorld.7')!.scale.x).toBeLessThan(1);
    const dispose = vi.spyOn(material, 'dispose');

    renderer.sync([], 5, 1, 0.016);
    expect(renderer.size).toBe(0);
    expect(scene.getObjectByName('RelicChestWorld.7')).toBeUndefined();
    expect(dispose).toHaveBeenCalled();
    expect(prototypeMaterial.color.getHex()).toBe(0x6f452b);
  });
});
