import { beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { AssetService } from '../../src/client/assets';
import type { GltfLoaderFactory } from '../../src/client/assets/modelProvider';
import { EntityViewFactory } from '../../src/client/app/entityViewFactory';
import { EntityViewRegistry } from '../../src/client/app/entityViewRegistry';
import { animationTelemetry, resetAnimationTelemetry } from '../../src/client/animation/animationTelemetry';
import { resetPresentationResolverWarnings } from '../../src/client/animation/enemyPresentationResolver';
import type { EnemyState } from '../../src/shared/types';

function enemyState(overrides: Partial<EnemyState> = {}): EnemyState {
  return {
    id: 1,
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
    ...overrides,
  };
}

/** Fake GLB loader returning a skinned rig with animation clips. */
function animatedLoaderFactory(): GltfLoaderFactory {
  return async () => {
    const mod = await import('./proceduralRig');
    const asset = mod.buildProceduralSkinnedAsset();
    return {
      load(url: string, onLoad: (gltf: { scene: THREE.Object3D; animations?: THREE.AnimationClip[] }) => void) {
        void url;
        onLoad({ scene: asset.scene, animations: witchClips(asset) });
      },
    };
  };
}

function witchClips(asset: ReturnType<typeof import('./proceduralRig')['buildProceduralSkinnedAsset']>): THREE.AnimationClip[] {
  const byName = new Map(asset.animations.map((c) => [c.name, c]));
  const rename = (from: string, to: string): THREE.AnimationClip => {
    const clip = byName.get(from)!;
    return new THREE.AnimationClip(to, clip.duration, clip.tracks);
  };
  return [
    rename('Walk', 'Witch_Idle'),
    rename('Walk', 'Witch_Walk'),
    rename('Attack', 'Witch_Attack_Primary'),
    rename('Stagger', 'Witch_Hit'),
    rename('Death', 'Witch_Death'),
  ];
}

async function loadAssets(withAnimatedWitch: boolean): Promise<AssetService> {
  const originalFetch = globalThis.fetch;
  if (withAnimatedWitch) {
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
  } else {
    globalThis.fetch = (async () => ({ ok: false })) as unknown as typeof fetch;
  }
  try {
    return await AssetService.load({ gltfLoaderFactory: animatedLoaderFactory() });
  } finally {
    globalThis.fetch = originalFetch;
  }
}

describe('enemy presentation integration (animation07 M7/M10)', () => {
  beforeEach(() => {
    resetAnimationTelemetry();
    resetPresentationResolverWarnings();
  });

  it('legacy enemies resolve through generated legacy profiles without animation', async () => {
    const assets = await loadAssets(false);
    const factory = new EntityViewFactory(assets);
    const scene = new THREE.Scene();
    const rig = factory.createEnemyRig(enemyState({ id: 7, type: 'rammer' }), scene);
    expect(rig.presentationProfileId).toBe('enemyPresentation.legacy.rammer');
    expect(rig.animation).toBeNull();
    expect(rig.model.children.length).toBeGreaterThan(0);
    expect(rig.modelVariant).toBe('near');
    scene.remove(rig.group);
    scene.remove(rig.telegraph);
  });

  it('profile-driven enemies create an animation controller with a mixer', async () => {
    const assets = await loadAssets(true);
    const factory = new EntityViewFactory(assets);
    const scene = new THREE.Scene();
    const rig = factory.createEnemyRig(
      enemyState({ id: 42, type: 'scrapBug', presentationProfileId: 'enemyPresentation.witch.common' }),
      scene,
    );
    expect(rig.presentationProfileId).toBe('enemyPresentation.witch.common');
    expect(rig.animation).not.toBeNull();
    expect(animationTelemetry.liveMixers).toBe(1);
    rig.animation!.update(
      { alive: true, state: 'hunt', stateT: 0, speed: 3, telegraph: 0, flash: 0, airborne: false },
      0.1,
    );
    expect(rig.animation!.instance.currentRole).toBe('walk');
    rig.animation!.dispose();
    scene.remove(rig.group);
    scene.remove(rig.telegraph);
  });

  it('near -> far swap removes the mixer and uses the far model', async () => {
    const assets = await loadAssets(true);
    const factory = new EntityViewFactory(assets);
    const scene = new THREE.Scene();
    const registry = new EntityViewRegistry(scene, factory);
    const e = enemyState({ id: 5, type: 'scrapBug', presentationProfileId: 'enemyPresentation.witch.common' });
    const rig = registry.createEnemy(e);
    const nearModel = rig.model;
    factory.applyPresentationTier(rig, 'far');
    expect(rig.modelVariant).toBe('far');
    expect(rig.animation).toBeNull();
    expect(rig.model).not.toBe(nearModel);
    expect(rig.group.children).toContain(rig.model);
    expect(rig.group.children).not.toContain(nearModel);
    expect(rig.group.children.filter((c) => c !== rig.telegraph).length).toBe(1);
    // No mixer for far tier.
    expect(animationTelemetry.liveMixers).toBe(0);
    expect(animationTelemetry.liveRigidFarRoots).toBe(1);
    // Promotion recreates the near animated model.
    factory.applyPresentationTier(rig, 'near');
    expect(rig.modelVariant).toBe('near');
    expect(rig.animation).not.toBeNull();
    expect(rig.model).not.toBe(nearModel);
    expect(animationTelemetry.liveMixers).toBe(1);
    expect(animationTelemetry.liveRigidFarRoots).toBe(0);
    registry.removeEnemy(5);
  });

  it('farRecords exposes the instanced-renderer seam without mixers', async () => {
    const assets = await loadAssets(true);
    const factory = new EntityViewFactory(assets);
    const scene = new THREE.Scene();
    const registry = new EntityViewRegistry(scene, factory);
    const e = enemyState({ id: 9, type: 'scrapBug', presentationProfileId: 'enemyPresentation.witch.common', x: 30, z: 40, yaw: 1.2 });
    const rig = registry.createEnemy(e);
    rig.group.position.set(e.x, e.y, e.z);
    rig.group.rotation.y = e.yaw;
    factory.applyPresentationTier(rig, 'far');
    const records = registry.farRecords();
    expect(records.length).toBe(1);
    expect(records[0]).toMatchObject({
      enemyId: 9,
      presentationProfileId: 'enemyPresentation.witch.common',
      x: 30,
      z: 40,
      yaw: 1.2,
    });
    expect(records[0].phase).toBeGreaterThanOrEqual(0);
    registry.removeEnemy(9);
  });
});
