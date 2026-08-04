import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { AssetService, ModelProvider, FallbackAssetFactory } from '../../src/client/assets';
import { buildLoadedModelAsset, detectSkinnedMesh } from '../../src/client/assets/loadedModelAsset';
import { fakeGltfLoaderFactory } from './proceduralRig';

describe('loaded model assets (animation07 M1)', () => {
  it('rigid procedural fallbacks return empty clips and skinned=false', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({ ok: false })) as unknown as typeof fetch;
    try {
      const assets = await AssetService.load();
      const asset = assets.modelAsset('enemy.scrapBug');
      expect(asset.animations.length).toBe(0);
      expect(asset.hasSkinnedMesh).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('retains GLB animation clips and detects skinned meshes', async () => {
    const clip = new THREE.AnimationClip('Walk', 1, []);
    const scene = new THREE.Group();
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
    const provider = new ModelProvider(
      new FallbackAssetFactory(),
      async () => ({
        load(url: string, onLoad: (gltf: { scene: THREE.Object3D; animations?: THREE.AnimationClip[] }) => void) {
          expect(url).toBe('/assets/models/x.glb');
          onLoad({ scene, animations: [clip] });
        },
      }),
    );
    provider.registerFile('enemy.scrapBug', '/assets/models/x.glb');
    const asset = await provider.getModelAsset('enemy.scrapBug');
    expect(asset.animations).toContain(clip);
    expect(asset.hasSkinnedMesh).toBe(false);
  });

  it('detectSkinnedMesh finds SkinnedMesh anywhere in the hierarchy', () => {
    const skinned = new THREE.Group();
    skinned.add(new THREE.SkinnedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
    expect(detectSkinnedMesh(skinned)).toBe(true);
    const rigid = new THREE.Group();
    rigid.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
    expect(detectSkinnedMesh(rigid)).toBe(false);
  });

  it('deduplicates concurrent loads for the same id', async () => {
    let calls = 0;
    const provider = new ModelProvider(
      new FallbackAssetFactory(),
      async () => ({
        load(url: string, onLoad: (gltf: { scene: THREE.Object3D }) => void) {
          calls++;
          onLoad({ scene: new THREE.Group() });
        },
      }),
    );
    provider.registerFile('enemy.scrapBug', '/assets/models/x.glb');
    const [a, b] = await Promise.all([
      provider.getModelAsset('enemy.scrapBug'),
      provider.getModelAsset('enemy.scrapBug'),
    ]);
    expect(a).toBe(b);
    expect(calls).toBe(1);
  });

  it('uses the procedural fallback asset when the GLB fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const provider = new ModelProvider(
      new FallbackAssetFactory(),
      fakeGltfLoaderFactory(
        () => undefined,
        () => new Error('boom'),
      ),
    );
    provider.registerFile('enemy.scrapBug', '/assets/models/missing.glb');
    const asset = await provider.getModelAsset('enemy.scrapBug');
    expect(asset.hasSkinnedMesh).toBe(false);
    expect(asset.animations.length).toBe(0);
    expect(asset.scene.children.length).toBeGreaterThan(0);
    warn.mockRestore();
  });

  it('registering a file invalidates the cached asset', async () => {
    const provider = new ModelProvider(new FallbackAssetFactory(), fakeGltfLoaderFactory(() => undefined));
    const before = await provider.getModelAsset('enemy.scrapBug');
    expect(before.animations.length).toBe(0);
    provider.registerFile('enemy.scrapBug', '/assets/models/x.glb');
    const after = await provider.getModelAsset('enemy.scrapBug');
    expect(after.animations.length).toBe(1);
  });
});

describe('loaded model asset construction', () => {
  it('buildLoadedModelAsset preserves a readonly clip list', () => {
    const clip = new THREE.AnimationClip('A', 1, []);
    const asset = buildLoadedModelAsset('x', new THREE.Group(), [clip]);
    expect(asset.animations).toEqual([clip]);
    expect(asset.id).toBe('x');
  });
});
