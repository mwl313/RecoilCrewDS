import * as THREE from 'three';
import { AssetManifestLoader } from './assetManifestLoader';
import { AssetInstanceFactory, buildTankRig, getMuzzleWorld } from './assetInstanceFactory';
import { AssetTransformResolver } from './assetTransformResolver';
import { FallbackAssetFactory } from './fallbackAssetFactory';
import { ModelProvider } from './modelProvider';
import type { GltfLoaderFactory } from './modelProvider';
import { PresentationCatalog, type CameraImpulsePresentation, type IconPresentation } from './presentationCatalog';
import type { AudioSpec, TankRig, UiTheme, VfxSpec } from './types';
import { PRESENTATION_ASSET_CATALOG } from '../../generated/presentationContent.generated';
import { assertResolvableAssetId, resolveProjectAsset } from '../../shared/assetCatalog';

export { buildTankRig, getMuzzleWorld };

/**
 * Semantic asset service. `load()` must be awaited before any dependent game
 * construction: it loads the manifest, resolves every presentation model to
 * a cached prototype (custom GLBs or registered fallbacks), and exposes
 * synchronous semantic lookups for models, VFX, audio, themes, icons, and
 * camera impulses.
 */
export class AssetService {
  readonly presentation: PresentationCatalog;
  readonly manifestLoader: AssetManifestLoader;
  readonly fallbacks: FallbackAssetFactory;
  readonly models: ModelProvider;
  readonly transforms: AssetTransformResolver;
  readonly instances: AssetInstanceFactory;
  manifestLoaded = false;

  private constructor(private readonly gltfLoaderFactory?: GltfLoaderFactory) {
    this.presentation = new PresentationCatalog();
    this.manifestLoader = new AssetManifestLoader();
    this.fallbacks = new FallbackAssetFactory();
    this.models = new ModelProvider(this.fallbacks, this.gltfLoaderFactory);
    this.transforms = new AssetTransformResolver();
    this.instances = new AssetInstanceFactory(
      this.models,
      this.fallbacks,
      this.transforms,
      (id) => this.presentation.vfxFor(id),
      (id) => this.presentation.uiFor(id),
      (id) => this.presentation.audioFor(id),
    );
  }

  static async load(options: { gltfLoaderFactory?: GltfLoaderFactory } = {}): Promise<AssetService> {
    const service = new AssetService(options.gltfLoaderFactory);
    const manifest = await service.manifestLoader.load('/assets/manifest.json', PRESENTATION_ASSET_CATALOG);
    service.manifestLoaded = manifest.loaded;
    for (const entry of manifest.entries) {
      if (entry.category === 'model' && typeof entry.file === 'string') {
        service.models.registerFile(entry.id, entry.file);
      }
      service.instances.registerMetadata(entry);
    }
    await service.instances.preloadModels(service.presentation.models);
    // Project custom models referenced by scenes resolve with documented
    // placeholder policy (file → manifest override → built-in fallback).
    for (const asset of PRESENTATION_ASSET_CATALOG.project) {
      if (asset.kind === 'model' && asset.file) service.models.registerFile(asset.id, asset.file);
    }
    return service;
  }

  /** Assert + resolve a project asset definition (throws for unknowns). */
  projectAsset(id: string): ReturnType<typeof resolveProjectAsset> {
    assertResolvableAssetId(id, PRESENTATION_ASSET_CATALOG);
    return resolveProjectAsset(id, PRESENTATION_ASSET_CATALOG);
  }

  model(id: string): THREE.Object3D {
    return this.instances.instanceModel(id);
  }

  vfx(id: string): VfxSpec {
    return this.instances.vfxSpec(id);
  }

  ui(id: string): UiTheme {
    return this.instances.uiTheme(id);
  }

  audio(id: string): AudioSpec {
    return this.instances.audioSpec(id);
  }

  icon(id: string): IconPresentation {
    return this.presentation.iconFor(id);
  }

  cameraImpulse(id: string): CameraImpulsePresentation {
    return this.presentation.cameraImpulseFor(id);
  }

  tankRig(): TankRig {
    return this.instances.buildTankRig();
  }
}
