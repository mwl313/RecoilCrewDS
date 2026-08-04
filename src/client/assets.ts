/**
 * Semantic asset barrel. Phase 5: assets are an awaited service; models are
 * cached prototypes cloned per instance and transformed by manifest
 * metadata. Procedural fallbacks remain registered behavior only.
 */
export { AssetService } from './assets/assetService';
export { buildTankRig, getMuzzleWorld } from './assets/assetInstanceFactory';
export type { LoadedModelAsset } from './assets/loadedModelAsset';
export { detectSkinnedMesh, buildLoadedModelAsset } from './assets/loadedModelAsset';
export type { LoadedModelInstance, ModelInstanceOptions } from './animation/animatedModelInstanceFactory';
export { createModelInstanceRoot, buildModelInstance, cloneOwnedMaterials } from './animation/animatedModelInstanceFactory';
export { AssetManifestLoader, type ManifestAssetEntry, type ManifestLoadResult } from './assets/assetManifestLoader';
export { AssetTransformResolver } from './assets/assetTransformResolver';
export { FallbackAssetFactory } from './assets/fallbackAssetFactory';
export { ModelProvider, type GltfLoaderFactory, type GltfLoaderLike } from './assets/modelProvider';
export { AssetInstanceFactory } from './assets/assetInstanceFactory';
export { PresentationCatalog, type AudioPresentation, type CameraImpulsePresentation, type IconPresentation, type UiPresentation, type VfxPresentation } from './assets/presentationCatalog';
export type { AudioSpec, TankRig, UiTheme, VfxSpec } from './assets/types';
