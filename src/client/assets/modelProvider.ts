import * as THREE from 'three';
import { FallbackAssetFactory } from './fallbackAssetFactory';

export interface GltfLoaderLike {
  load(
    url: string,
    onLoad: (gltf: { scene: THREE.Object3D }) => void,
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
  private readonly prototypes = new Map<string, THREE.Object3D>();
  private readonly loading = new Map<string, Promise<THREE.Object3D>>();

  constructor(
    private readonly fallbacks: FallbackAssetFactory,
    private readonly gltfLoaderFactory: GltfLoaderFactory = async () => {
      const mod = await import('three/addons/loaders/GLTFLoader.js');
      return new mod.GLTFLoader();
    },
  ) {}

  registerFile(id: string, file: string): void {
    this.files.set(id, file);
    this.prototypes.delete(id);
    this.loading.delete(id);
  }

  getFile(id: string): string | null {
    return this.files.get(id) ?? null;
  }

  hasPrototype(id: string): boolean {
    return this.prototypes.has(id);
  }

  /** Synchronous cached prototype (available after getPrototype resolved). */
  getPrototypeSync(id: string): THREE.Object3D | undefined {
    return this.prototypes.get(id);
  }

  /** Await the cached prototype (loads through GLB or fallback). */
  getPrototype(id: string): Promise<THREE.Object3D> {
    const cached = this.prototypes.get(id);
    if (cached) return Promise.resolve(cached);
    const inFlight = this.loading.get(id);
    if (inFlight) return inFlight;
    const promise = this.load(id);
    this.loading.set(id, promise);
    promise.then((proto) => {
      this.prototypes.set(id, proto);
      this.loading.delete(id);
    });
    return promise;
  }

  private async load(id: string): Promise<THREE.Object3D> {
    const file = this.files.get(id);
    if (!file) return Promise.resolve(this.fallbacks.model(id));
    const loader = await this.gltfLoaderFactory();
    return new Promise((resolve) => {
      loader.load(
        file,
        (gltf) => resolve(gltf.scene),
        undefined,
        () => {
          console.warn(`[assets] GLB failed for '${id}' (${file}); using procedural fallback`);
          resolve(this.fallbacks.model(id));
        },
      );
    });
  }
}
