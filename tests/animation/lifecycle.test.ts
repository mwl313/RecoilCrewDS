import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { AssetService } from '../../src/client/assets';
import { EntityViewFactory } from '../../src/client/app/entityViewFactory';
import { EntityViewRegistry } from '../../src/client/app/entityViewRegistry';
import { animationTelemetry, resetAnimationTelemetry } from '../../src/client/animation/animationTelemetry';
import type { EnemyState } from '../../src/shared/types';

function enemy(id: number, profile?: string): EnemyState {
  return {
    id,
    type: 'scrapBug',
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    hp: 10,
    maxHp: 10,
    state: 'hunt',
    stateT: 0,
    aimYaw: 0,
    speed: 0,
    alive: true,
    telegraph: 0,
    flash: 0,
    spawnT: 0,
    hitCd: 0,
    ...(profile ? { presentationProfileId: profile } : {}),
  };
}

async function makeRegistry(): Promise<{ registry: EntityViewRegistry; scene: THREE.Scene }> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({
    ok: true,
    json: async () => ({
      assets: [
        {
          id: 'custom.enemy.witch.common.skinned',
          category: 'model',
          file: '/assets/models/witch.glb',
        },
      ],
    }),
  })) as unknown as typeof fetch;
  try {
    const mod = await import('./proceduralRig');
    const asset = mod.buildProceduralSkinnedAsset();
    const assets = await AssetService.load({
      gltfLoaderFactory: async () => ({
        load(url: string, onLoad: (gltf: { scene: THREE.Object3D; animations?: THREE.AnimationClip[] }) => void) {
          void url;
          const byName = new Map(asset.animations.map((c) => [c.name, c]));
          const rename = (from: string, to: string): THREE.AnimationClip => {
            const clip = byName.get(from)!;
            return new THREE.AnimationClip(to, clip.duration, clip.tracks);
          };
          onLoad({
            scene: asset.scene,
            animations: [
              rename('Walk', 'Witch_Idle'),
              rename('Walk', 'Witch_Walk'),
              rename('Attack', 'Witch_Attack_Primary'),
              rename('Stagger', 'Witch_Hit'),
              rename('Death', 'Witch_Death'),
            ],
          });
        },
      }),
    });
    const scene = new THREE.Scene();
    const factory = new EntityViewFactory(assets);
    const registry = new EntityViewRegistry(scene, factory);
    return { registry, scene };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

describe('animation lifecycle cleanup (animation07 M12)', () => {
  beforeEach(() => resetAnimationTelemetry());

  it('enemy removal cleans the mixer and owned materials', async () => {
    const { registry } = await makeRegistry();
    registry.createEnemy(enemy(1, 'enemyPresentation.witch.common'));
    expect(animationTelemetry.liveMixers).toBe(1);
    registry.removeEnemy(1);
    expect(animationTelemetry.liveMixers).toBe(0);
    expect(registry.enemyRigs.size).toBe(0);
  });

  it('enemy removal disposes per-instance skeleton GPU resources', async () => {
    const { registry } = await makeRegistry();
    const rig = registry.createEnemy(enemy(2, 'enemyPresentation.witch.common'));
    let skeleton: THREE.Skeleton | null = null;
    rig.model.traverse((object) => {
      const mesh = object as THREE.SkinnedMesh;
      if (mesh.isSkinnedMesh) skeleton = mesh.skeleton;
    });
    expect(skeleton).not.toBeNull();
    const dispose = vi.spyOn(skeleton!, 'dispose');
    registry.removeEnemy(2);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('wave purge / cohort removal cleans every animated rig', async () => {
    const { registry } = await makeRegistry();
    for (let i = 0; i < 25; i++) registry.createEnemy(enemy(i + 1, 'enemyPresentation.witch.common'));
    expect(animationTelemetry.liveMixers).toBe(25);
    for (let i = 0; i < 25; i++) registry.removeEnemy(i + 1);
    expect(animationTelemetry.liveMixers).toBe(0);
    expect(animationTelemetry.liveSkinnedRoots).toBe(0);
  });

  it('reset/rematch leaves zero orphan mixers and bounded scene groups', async () => {
    const { registry, scene } = await makeRegistry();
    for (let round = 0; round < 5; round++) {
      for (let i = 0; i < 8; i++) registry.createEnemy(enemy(round * 10 + i, 'enemyPresentation.witch.common'));
      registry.reset();
      expect(animationTelemetry.liveMixers).toBe(0);
      expect(registry.enemyRigs.size).toBe(0);
    }
    const groups = scene.children.filter((c) => c.type === 'Group').length;
    expect(groups).toBeLessThanOrEqual(3);
  });

  it('100 repeated create/remove cycles stay bounded', async () => {
    const { registry } = await makeRegistry();
    for (let i = 0; i < 100; i++) {
      registry.createEnemy(enemy(i, 'enemyPresentation.witch.common'));
      registry.removeEnemy(i);
    }
    expect(animationTelemetry.liveMixers).toBe(0);
    expect(animationTelemetry.ownedMaterialClones).toBe(0);
    expect(registry.enemyRigs.size).toBe(0);
  });
});
