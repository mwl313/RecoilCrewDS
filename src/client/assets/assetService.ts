import * as THREE from 'three';
import { AssetManifestLoader } from './assetManifestLoader';
import { AssetInstanceFactory, buildTankRig, getMuzzleWorld } from './assetInstanceFactory';
import { AssetTransformResolver } from './assetTransformResolver';
import { FallbackAssetFactory } from './fallbackAssetFactory';
import { ModelProvider } from './modelProvider';
import type { GltfLoaderFactory } from './modelProvider';
import type { LoadedModelAsset } from './loadedModelAsset';
import type { LoadedModelInstance } from '../animation/animatedModelInstanceFactory';
import { PresentationCatalog, type CameraImpulsePresentation, type IconPresentation } from './presentationCatalog';
import type { AudioSpec, TankRig, UiTheme, VfxSpec } from './types';
import { PRESENTATION_ASSET_CATALOG } from '../../generated/presentationContent.generated';
import { assertResolvableAssetId, resolveProjectAsset } from '../../shared/assetCatalog';
import type { TankRigDefinition } from '../../shared/content/schemas/tank';

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
    // Register project assets BEFORE preload: catalog-driven fallbacks and
    // transforms must be known before the synchronous model lookup runs.
    const projectModels = PRESENTATION_ASSET_CATALOG.project.filter((p) => p.kind === 'model');
    for (const asset of projectModels) {
      service.instances.registerProject(asset);
      if (asset.file) service.models.registerFile(asset.id, asset.file);
    }
    // Preload every model referenced at runtime: built-in presentation
    // models, project files, and project catalog fallbacks.
    const preloadIds = new Set<string>(service.presentation.models);
    for (const asset of projectModels) {
      if (asset.file) preloadIds.add(asset.id);
      if (asset.fallbackAssetId) preloadIds.add(asset.fallbackAssetId);
    }
    await service.instances.preloadModels([...preloadIds]);
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

  /** Immutable cached model asset (scene + clips + skinned flag). */
  modelAsset(id: string): LoadedModelAsset {
    return this.instances.instanceModelAsset(id);
  }

  /** Safe per-instance clone with independent bones when skinned. */
  createModelInstance(id: string, options?: { cloneMaterials?: boolean }): LoadedModelInstance {
    return this.instances.createModelInstance(id, options);
  }

  /**
   * Resolve a project asset to its file URL (images/textures and any
   * file-backed asset). Returns null for built-ins or file-less placeholders.
   */
  assetUrl(id: string): string | null {
    const def = PRESENTATION_ASSET_CATALOG.project.find((p) => p.id === id);
    return def?.file ?? null;
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

  tankRig(rig?: TankRigDefinition): TankRig {
    return this.instances.buildTankRig(rig);
  }
}
