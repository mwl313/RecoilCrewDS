import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import * as THREE from 'three';
import { loadContentPackFromFilesystem, ContentLoader } from '../src/shared/content/contentLoader';
import { ContentValidationError } from '../src/shared/content/errors';
import { resolveMapBundle } from '../src/shared/mapgen/profiles';
import { GENERATED_MAP_PROFILES } from '../src/generated/mapProfiles.generated';
import { Heightfield } from '../src/shared/mapgen/heightfield';
import { buildChunkGeometry } from '../src/client/map-debug/terrainMesh';
import { TerrainMaterialFactory, type TextureLoaderLike } from '../src/client/materials/terrainMaterialFactory';
import type { AssetService } from '../src/client/assets/assetService';
import type { TerrainMaterialProfileDef } from '../src/shared/mapgen/profiles';

const pack = loadContentPackFromFilesystem('content');

describe('terrain material content', () => {
  it('both terrain-material profile files pass schema validation', () => {
    expect(pack.has('terrainMaterialProfiles', 'terrainMaterial.sparseGrass')).toBe(true);
    expect(pack.has('terrainMaterialProfiles', 'terrainMaterial.legacyProcedural')).toBe(true);
    const sparse = pack.getTerrainMaterialProfile('terrainMaterial.sparseGrass');
    expect(sparse.kind).toBe('pbrTextureSet');
    expect(sparse.tileSizeMeters).toBe(10);
    const legacy = pack.getTerrainMaterialProfile('terrainMaterial.legacyProcedural');
    expect(legacy.kind).toBe('proceduralFallback');
  });

  it('map.rocketJumpHighlands resolves sparse grass and every map has an explicit profile', () => {
    for (const id of pack.ids('maps')) {
      const bundle = resolveMapBundle(pack, id);
      expect(bundle.map.terrainMaterialProfileId).toMatch(/^terrainMaterial\./);
      expect(bundle.terrainMaterialProfile.id).toBe(bundle.map.terrainMaterialProfileId);
      expect(pack.has('terrainMaterialProfiles', bundle.map.terrainMaterialProfileId)).toBe(true);
    }
    expect(resolveMapBundle(pack, 'map.rocketJumpHighlands').terrainMaterialProfile.id).toBe('terrainMaterial.sparseGrass');
  });

  it('missing terrain-material references fail content validation', () => {
    const manifest = JSON.parse(require('node:fs').readFileSync('content/manifest.json', 'utf8'));
    const files: Record<string, unknown> = {};
    const fs = require('node:fs');
    const path = require('node:path');
    const walk = (dir: string, prefix: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(abs, rel);
        else if (entry.name.endsWith('.json')) files[rel] = JSON.parse(fs.readFileSync(abs, 'utf8'));
      }
    };
    walk('content', '');
    const map = files['maps/rocket_jump_highlands.json'] as Record<string, unknown>;
    map.terrainMaterialProfileId = 'terrainMaterial.missing';
    let message = '';
    try {
      new ContentLoader().loadFromRecords(manifest, files);
    } catch (error) {
      message = error instanceof ContentValidationError ? error.issues.join(' | ') : (error as Error).message;
    }
    expect(message).toContain('terrainMaterial.missing');
  });

  it('generated client bundle carries the resolved material profile', () => {
    const generated = GENERATED_MAP_PROFILES['map.rocketJumpHighlands'];
    expect(generated.terrainMaterialProfile.id).toBe('terrainMaterial.sparseGrass');
    expect(generated.terrainMaterialProfile.kind).toBe('pbrTextureSet');
  });
});

describe('terrain material geometry', () => {
  const hf = new Heightfield({ widthMeters: 100, depthMeters: 100, cellSize: 4 });

  it('UVs equal world X/Z metres', () => {
    const geo = buildChunkGeometry(hf, 0, 0, 1, -50, -50);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      expect(uv.getX(i)).toBeCloseTo(pos.getX(i), 9);
      expect(uv.getY(i)).toBeCloseTo(pos.getZ(i), 9);
    }
  });

  it('full and half LOD UVs agree at shared world positions', () => {
    const full = buildChunkGeometry(hf, 0, 0, 1, -50, -50);
    const half = buildChunkGeometry(hf, 0, 0, 2, -50, -50);
    const fullUv = full.attributes.uv as THREE.BufferAttribute;
    const halfUv = half.attributes.uv as THREE.BufferAttribute;
    const fullVerts = Math.floor(25 / 1) + 1; // 26
    const halfVerts = Math.floor(25 / 2) + 1; // 13
    for (let zi = 0; zi < halfVerts; zi++) {
      for (let xi = 0; xi < halfVerts; xi++) {
        const fullIdx = (zi * 2) * fullVerts + xi * 2;
        const halfIdx = zi * halfVerts + xi;
        expect(halfUv.getX(halfIdx)).toBeCloseTo(fullUv.getX(fullIdx), 9);
        expect(halfUv.getY(halfIdx)).toBeCloseTo(fullUv.getY(fullIdx), 9);
      }
    }
  });
});

describe('terrain material factory', () => {
  const loaded: THREE.Texture[] = [];
  let loadCount = 0;
  const disposed = new Set<THREE.Texture>();

  const fakeLoader: TextureLoaderLike = {
    load(url, onLoad) {
      loadCount++;
      const tex = new THREE.Texture();
      (tex as unknown as { image: unknown }).image = {};
      const origDispose = tex.dispose.bind(tex);
      tex.dispose = () => {
        disposed.add(tex);
        origDispose();
      };
      loaded.push(tex);
      onLoad?.(tex);
      return tex;
    },
  };

  const fakeAssets = {
    assetUrl: (id: string) => (id.includes('missing') ? null : `/assets/textures/${id}.png`),
  } as unknown as AssetService;

  const pbrProfile: TerrainMaterialProfileDef = {
    id: 'terrainMaterial.sparseGrass',
    label: 'Sparse Grass',
    kind: 'pbrTextureSet',
    baseColorAssetId: 'texture.environment.sparseGrass.baseColor',
    normalAssetId: 'texture.environment.sparseGrass.normal',
    roughnessAssetId: 'texture.environment.sparseGrass.roughness',
    tileSizeMeters: 10,
    tint: '#ffffff',
    normalScale: [0.5, 0.5],
    roughness: 1,
    metalness: 0,
    anisotropy: 4,
    fallbackColor: '#7d7655',
  };

  beforeAll(() => {
    loadCount = 0;
    disposed.clear();
    loaded.length = 0;
  });
  afterAll(() => {
    for (const t of loaded) t.dispose();
  });

  it('base color is sRGB; normal and roughness stay linear', () => {
    const factory = new TerrainMaterialFactory({ assets: fakeAssets, textureLoader: fakeLoader });
    const material = factory.create(pbrProfile);
    expect(material.map!.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(material.normalMap!.colorSpace).not.toBe(THREE.SRGBColorSpace);
    expect(material.roughnessMap!.colorSpace).not.toBe(THREE.SRGBColorSpace);
    factory.dispose();
  });

  it('maps use repeat wrapping, profile tile size, tint, and normal scale', () => {
    const factory = new TerrainMaterialFactory({ assets: fakeAssets, textureLoader: fakeLoader });
    const material = factory.create(pbrProfile);
    expect(material.map!.wrapS).toBe(THREE.RepeatWrapping);
    expect(material.map!.wrapT).toBe(THREE.RepeatWrapping);
    expect(material.map!.repeat.x).toBeCloseTo(0.1);
    expect(material.map!.repeat.y).toBeCloseTo(0.1);
    expect(material.map!.anisotropy).toBe(4);
    expect(material.color.getHexString()).toBe('ffffff');
    expect(material.normalScale.x).toBeCloseTo(0.5);
    expect(material.roughness).toBe(1);
    expect(material.metalness).toBe(0);
    factory.dispose();
  });

  it('missing optional maps preserve a valid material', () => {
    const factory = new TerrainMaterialFactory({ assets: fakeAssets, textureLoader: fakeLoader });
    const material = factory.create({ ...pbrProfile, normalAssetId: undefined, roughnessAssetId: undefined });
    expect(material.map).toBeDefined();
    expect(material.normalMap).toBeNull();
    expect(material.roughnessMap).toBeNull();
    factory.dispose();
  });

  it('missing base color preserves the fallback color', () => {
    const factory = new TerrainMaterialFactory({ assets: fakeAssets, textureLoader: fakeLoader });
    const material = factory.create({ ...pbrProfile, baseColorAssetId: 'texture.missing.baseColor' });
    expect(material.map).toBeNull();
    expect(material.color.getHexString()).toBe('7d7655');
    factory.dispose();
  });

  it('repeated profile creation reuses cached textures', () => {
    const factory = new TerrainMaterialFactory({ assets: fakeAssets, textureLoader: fakeLoader });
    loadCount = 0;
    factory.create(pbrProfile);
    const first = loadCount;
    factory.create(pbrProfile);
    expect(loadCount).toBe(first);
    factory.dispose();
  });

  it('dispose releases each owned texture once', () => {
    const factory = new TerrainMaterialFactory({ assets: fakeAssets, textureLoader: fakeLoader });
    factory.create(pbrProfile);
    const owned = new Set(loaded);
    factory.dispose();
    for (const tex of owned) expect(disposed.has(tex)).toBe(true);
  });
});
