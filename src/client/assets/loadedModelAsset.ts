import * as THREE from 'three';

/**
 * Immutable cached model asset. The scene is the shared prototype; animation
 * clips are shared immutable data; `hasSkinnedMesh` selects the safe clone
 * path. Instances must never mutate the prototype scene or its materials.
 */
export interface LoadedModelAsset {
  id: string;
  scene: THREE.Object3D;
  animations: readonly THREE.AnimationClip[];
  hasSkinnedMesh: boolean;
}

/** True when the scene contains at least one SkinnedMesh. */
export function detectSkinnedMesh(root: THREE.Object3D): boolean {
  let found = false;
  root.traverse((obj) => {
    const mesh = obj as THREE.SkinnedMesh;
    if (mesh.isSkinnedMesh) found = true;
  });
  return found;
}

/** Wrap a loader result (GLB scene + optional clips) into a model asset. */
export function buildLoadedModelAsset(
  id: string,
  scene: THREE.Object3D,
  animations: readonly THREE.AnimationClip[] = [],
): LoadedModelAsset {
  return {
    id,
    scene,
    animations: animations.slice(),
    hasSkinnedMesh: detectSkinnedMesh(scene),
  };
}

/** Collect every material referenced by an instance (owned or shared). */
export function collectMaterials(root: THREE.Object3D): THREE.MeshStandardMaterial[] {
  const out: THREE.MeshStandardMaterial[] = [];
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of materials) {
      if (mat && (mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
        out.push(mat as THREE.MeshStandardMaterial);
      }
    }
  });
  return out;
}
