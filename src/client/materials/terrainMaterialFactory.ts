/**
 * Data-driven terrain material factory (presentation-only).
 *
 * Turns validated terrain-material profiles into THREE materials:
 * - `pbrTextureSet` loads base/normal/roughness maps through the semantic
 *   AssetService, applies profile tint/roughness/metalness/normalScale/
 *   anisotropy, and falls back to a flat fallback color while loading.
 * - `proceduralFallback` draws a deterministic canvas texture from profile
 *   colors (no Math.random).
 *
 * Textures are cached per profile asset and disposed exactly once. The
 * factory is injectable with a fake loader for unit tests.
 */
import * as THREE from 'three';
import type { AssetService } from '../assets/assetService';
import type { TerrainMaterialProfileDef } from '../../shared/mapgen/profiles';

export interface TextureLoaderLike {
  load(
    url: string,
    onLoad?: (texture: THREE.Texture) => void,
    onProgress?: (event: unknown) => void,
    onError?: (error: unknown) => void,
  ): THREE.Texture;
}

export interface TerrainMaterialFactoryOptions {
  assets: AssetService;
  textureLoader?: TextureLoaderLike;
}

export interface TerrainMaterialCreateOptions {
  /**
   * Texture tiling override for geometries with ordinary 0..1 UVs (the
   * legacy ground plane). `texture.repeat` is texture-level state, so an
   * override is only safe when the overridden texture is not shared with
   * materials that need the profile default within the same factory
   * lifetime. Generated terrain chunks always use the profile default.
   */
  repeatOverride?: { x: number; y: number };
}

export class TerrainMaterialFactory {
  private readonly assets: AssetService;
  private readonly loader: TextureLoaderLike;
  private readonly textureCache = new Map<string, THREE.Texture>();
  private disposed = false;

  constructor(options: TerrainMaterialFactoryOptions) {
    this.assets = options.assets;
    this.loader = options.textureLoader ?? new THREE.TextureLoader();
  }

  create(
    profile: TerrainMaterialProfileDef,
    options: TerrainMaterialCreateOptions = {},
  ): THREE.MeshStandardMaterial {
    if (profile.kind === 'proceduralFallback') {
      return this.createProcedural(profile, options);
    }
    return this.createPbr(profile, options);
  }

  private createPbr(
    profile: Extract<TerrainMaterialProfileDef, { kind: 'pbrTextureSet' }>,
    options: TerrainMaterialCreateOptions,
  ): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(profile.tint),
      roughness: profile.roughness,
      metalness: profile.metalness,
      normalScale: new THREE.Vector2(profile.normalScale[0], profile.normalScale[1]),
    });
    const applyTiling = (texture: THREE.Texture): void => {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      const tile = 1 / profile.tileSizeMeters;
      texture.repeat.set(options.repeatOverride?.x ?? tile, options.repeatOverride?.y ?? tile);
      texture.anisotropy = profile.anisotropy;
    };

    this.loadOptionalTexture(
      profile.baseColorAssetId,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        applyTiling(texture);
        material.map = texture;
        // Tint (white for sparse grass) applies without double-darkening the
        // base color because the map is multiplied by material.color.
        material.needsUpdate = true;
      },
      () => {
        material.color = new THREE.Color(profile.fallbackColor);
        material.needsUpdate = true;
      },
      'terrain base color',
    );

    if (profile.normalAssetId) {
      this.loadOptionalTexture(
        profile.normalAssetId,
        (texture) => {
          applyTiling(texture);
          material.normalMap = texture;
          material.needsUpdate = true;
        },
        () => undefined,
        'terrain normal',
      );
    }
    if (profile.roughnessAssetId) {
      this.loadOptionalTexture(
        profile.roughnessAssetId,
        (texture) => {
          applyTiling(texture);
          material.roughnessMap = texture;
          material.needsUpdate = true;
        },
        () => undefined,
        'terrain roughness',
      );
    }
    return material;
  }

  private createProcedural(
    profile: Extract<TerrainMaterialProfileDef, { kind: 'proceduralFallback' }>,
    options: TerrainMaterialCreateOptions,
  ): THREE.MeshStandardMaterial {
    const texture = this.canvasTexture(profile);
    if (options.repeatOverride) {
      texture.repeat.set(options.repeatOverride.x, options.repeatOverride.y);
    }
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: profile.roughness,
      metalness: profile.metalness,
    });
    material.needsUpdate = true;
    return material;
  }

  private canvasTexture(profile: Extract<TerrainMaterialProfileDef, { kind: 'proceduralFallback' }>): THREE.CanvasTexture {
    const key = `procedural:${profile.id}`;
    const cached = this.textureCache.get(key);
    if (cached) return cached as THREE.CanvasTexture;
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = profile.baseColor;
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = profile.gridColor;
    ctx.lineWidth = 2;
    const gap = 32;
    for (let x = 0; x <= 256; x += gap) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 256);
      ctx.stroke();
    }
    for (let y = 0; y <= 256; y += gap) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
    }
    ctx.fillStyle = profile.patchColor;
    for (let i = 0; i < 36; i++) {
      const x = (i * 53) % 256;
      const y = (i * 97) % 256;
      ctx.beginPath();
      ctx.arc(x, y, 3 + (i % 4), 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    const tile = 1 / profile.tileSizeMeters;
    tex.repeat.set(tile, tile);
    this.textureCache.set(key, tex);
    return tex;
  }

  private loadOptionalTexture(
    assetId: string,
    onLoad: (texture: THREE.Texture) => void,
    onError: () => void,
    label: string,
  ): void {
    if (this.disposed) {
      onError();
      return;
    }
    const cached = this.textureCache.get(assetId);
    if (cached) {
      onLoad(cached);
      return;
    }
    const url = this.assets.assetUrl(assetId);
    if (!url) {
      console.warn(`[terrain-material] missing asset url for '${assetId}' (${label}); using fallback`);
      onError();
      return;
    }
    let texture: THREE.Texture;
    try {
      texture = this.loader.load(url, (loaded) => {
        if (this.disposed) return;
        this.textureCache.set(assetId, loaded);
        onLoad(loaded);
      }, undefined, () => {
        if (this.disposed) return;
        console.warn(`[terrain-material] failed to load ${label} '${assetId}' (${url}); using fallback`);
        onError();
      });
    } catch {
      if (this.disposed) return;
      console.warn(`[terrain-material] failed to start loading ${label} '${assetId}' (${url}); using fallback`);
      onError();
      return;
    }
    if (
      texture.image !== undefined &&
      texture.image !== null &&
      !this.textureCache.has(assetId)
    ) {
      // Synchronous fake/successful load path.
      this.textureCache.set(assetId, texture);
      onLoad(texture);
    }
  }

  /** Dispose every owned texture exactly once and clear the cache. */
  dispose(): void {
    this.disposed = true;
    for (const texture of this.textureCache.values()) texture.dispose();
    this.textureCache.clear();
  }
}
