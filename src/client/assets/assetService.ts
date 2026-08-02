import * as THREE from 'three';
import { AssetManifestLoader } from './assetManifestLoader';
import { AssetInstanceFactory, buildTankRig, getMuzzleWorld } from './assetInstanceFactory';
import { AssetTransformResolver } from './assetTransformResolver';
import { FallbackAssetFactory } from './fallbackAssetFactory';
import { ModelProvider } from './modelProvider';
import type { GltfLoaderFactory } from './modelProvider';
import { PresentationCatalog, type CameraImpulsePresentation, type IconPresentation } from './presentationCatalog';
import type { AudioSpec, TankRig, UiTheme, VfxSpec } from './types';

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
    const manifest = await service.manifestLoader.load();
    service.manifestLoaded = manifest.loaded;
    for (const entry of manifest.entries) {
      if (entry.category === 'model' && typeof entry.file === 'string') {
        service.models.registerFile(entry.id, entry.file);
      }
      service.instances.registerMetadata(entry);
    }
    await service.instances.preloadModels(service.presentation.models);
    return service;
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
