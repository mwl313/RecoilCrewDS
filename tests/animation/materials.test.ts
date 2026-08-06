import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { AssetService } from '../../src/client/assets';
import { EntityViewFactory } from '../../src/client/app/entityViewFactory';
import { EntityViewRegistry } from '../../src/client/app/entityViewRegistry';
import { animationTelemetry, resetAnimationTelemetry } from '../../src/client/animation/animationTelemetry';
import type { EnemyState } from '../../src/shared/types';
import { auditMonsterMaterials, prepareMonsterMaterials } from '../../src/client/materials/monsterMaterialPolicy';

function enemy(overrides: Partial<EnemyState> = {}): EnemyState {
  return {
    id: 1,
    type: 'rammer',
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    hp: 10,
    maxHp: 10,
    state: 'approach',
    stateT: 0,
    aimYaw: 0,
    speed: 0,
    alive: true,
    telegraph: 0,
    flash: 0,
    spawnT: 0,
    hitCd: 0,
    ...overrides,
  };
}

describe('material ownership and hit flash isolation (animation07 M11)', () => {
  beforeEach(() => resetAnimationTelemetry());

  async function makeRigs(): Promise<{ factory: EntityViewFactory; rigs: Array<ReturnType<EntityViewFactory['createEnemyRig']>> }> {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({ ok: false })) as unknown as typeof fetch;
    try {
      const assets = await AssetService.load();
      const factory = new EntityViewFactory(assets);
      const scene = new THREE.Scene();
      const rigs = [factory.createEnemyRig(enemy({ id: 1 }), scene), factory.createEnemyRig(enemy({ id: 2 }), scene)];
      return { factory, rigs };
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  it('a hit flash on one enemy does not affect another enemy', async () => {
    const { rigs } = await makeRigs();
    const a = rigs[0];
    const b = rigs[1];
    expect(a.materials.length).toBeGreaterThan(0);
    for (const mat of a.materials) mat.emissiveIntensity = 1.4;
    for (const mat of b.materials) {
      expect(mat.emissiveIntensity).not.toBe(1.4);
    }
  });

  it('rig materials are owned clones, not the cached prototype materials', async () => {
    const { rigs, factory } = await makeRigs();
    const rig = rigs[0];
    const proto = factory.assets.modelAsset('enemy.rammer').scene;
    const protoMesh = proto.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh;
    expect(rig.materials[0]).not.toBe(protoMesh.material);
  });

  it('cleanup disposes owned materials and never the shared prototype', async () => {
    const { rigs, factory } = await makeRigs();
    const rig = rigs[0];
    const owned = rig.materials[0];
    const disposeSpy = vi.spyOn(owned, 'dispose');
    const scene = new THREE.Scene();
    scene.add(rigs[0].group);
    scene.add(rigs[1].group);
    const registry = new EntityViewRegistry(scene, factory);
    registry.enemyRigs.set(1, rig);
    registry.enemyRigs.set(2, rigs[1]);
    registry.removeEnemy(1);
    registry.removeEnemy(2);
    expect(disposeSpy).toHaveBeenCalled();
    expect(animationTelemetry.ownedMaterialClones).toBe(0);
  });
});

describe('low-poly monster material policy', () => {
  it('preserves source color/shading while constraining dark PBR inputs', () => {
    const map = new THREE.Texture();
    map.colorSpace = THREE.NoColorSpace;
    const material = new THREE.MeshStandardMaterial({
      color: 0x38c878,
      map,
      metalness: 0.9,
      roughness: 0.2,
      vertexColors: true,
      flatShading: true,
    });
    material.aoMapIntensity = 1;
    const color = material.color.getHex();
    const root = new THREE.Mesh(new THREE.BoxGeometry(), material);
    prepareMonsterMaterials(root);
    const audit = auditMonsterMaterials(root);
    expect(material.color.getHex()).toBe(color);
    expect(material.vertexColors).toBe(true);
    expect(material.flatShading).toBe(true);
    expect(material.map!.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(audit.maxMetalness).toBeLessThanOrEqual(0.08);
    expect(audit.minRoughness).toBeGreaterThanOrEqual(0.68);
    expect(audit.maxAoIntensity).toBeLessThanOrEqual(0.5);
  });
});
