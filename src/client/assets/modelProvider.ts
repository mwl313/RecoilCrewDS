import * as THREE from 'three';
import { FallbackAssetFactory } from './fallbackAssetFactory';
import { buildLoadedModelAsset, type LoadedModelAsset } from './loadedModelAsset';

export interface GltfLoaderLike {
  load(
    url: string,
    onLoad: (gltf: { scene: THREE.Object3D; animations?: THREE.AnimationClip[] }) => void,
    onProgress?: unknown,
    onError?: (err: unknown) => void,
  ): void;
}

export type GltfLoaderFactory = () => Promise<GltfLoaderLike>;

/**
 * Model provider: resolves a semantic model id to a cached prototype. When
 * the manifest registered a file, the GLB is loaded through the loader
 * (injectable for tests) and cached; loader failures and missing files fall
 * back to the registered procedural factory.
 */
export class ModelProvider {
  private readonly files = new Map<string, string>();
  private readonly assets = new Map<string, LoadedModelAsset>();
  private readonly loading = new Map<string, Promise<LoadedModelAsset>>();

  constructor(
    private readonly fallbacks: FallbackAssetFactory,
    private readonly gltfLoaderFactory: GltfLoaderFactory = async () => {
      const mod = await import('three/addons/loaders/GLTFLoader.js');
      return new mod.GLTFLoader();
    },
  ) {}

  registerFile(id: string, file: string): void {
    this.files.set(id, file);
    this.assets.delete(id);
    this.loading.delete(id);
  }

  getFile(id: string): string | null {
    return this.files.get(id) ?? null;
  }

  hasPrototype(id: string): boolean {
    return this.assets.has(id);
  }

  /** Synchronous cached prototype (available after getPrototype resolved). */
  getPrototypeSync(id: string): THREE.Object3D | undefined {
    return this.assets.get(id)?.scene;
  }

  /** Await the cached prototype (loads through GLB or fallback). */
  getPrototype(id: string): Promise<THREE.Object3D> {
    return this.getModelAsset(id).then((asset) => asset.scene);
  }

  /** Synchronous cached model asset (available after getModelAsset resolved). */
  getModelAssetSync(id: string): LoadedModelAsset | undefined {
    return this.assets.get(id);
  }

  /**
   * Await the cached immutable model asset (GLB scene + animation clips +
   * skinned flag, or the procedural fallback asset). Concurrent requests for
   * the same id share one load.
   */
  getModelAsset(id: string): Promise<LoadedModelAsset> {
    const cached = this.assets.get(id);
    if (cached) return Promise.resolve(cached);
    const inFlight = this.loading.get(id);
    if (inFlight) return inFlight;
    const promise = this.load(id);
    this.loading.set(id, promise);
    promise.then((asset) => {
      this.assets.set(id, asset);
      this.loading.delete(id);
    });
    return promise;
  }

  private async load(id: string): Promise<LoadedModelAsset> {
    const file = this.files.get(id);
    if (!file) return Promise.resolve(buildLoadedModelAsset(id, this.fallbacks.model(id)));
    const loader = await this.gltfLoaderFactory();
    return new Promise((resolve) => {
      loader.load(
        file,
        (gltf) => resolve(buildLoadedModelAsset(id, gltf.scene, gltf.animations ?? [])),
        undefined,
        () => {
          console.warn(`[assets] GLB failed for '${id}' (${file}); using procedural fallback`);
          resolve(buildLoadedModelAsset(id, this.fallbacks.model(id)));
        },
      );
    });
  }
}
