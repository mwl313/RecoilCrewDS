import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import type { LoadedModelAsset } from '../assets/loadedModelAsset';

/** A per-enemy model instance with an independent skeleton when skinned. */
export interface LoadedModelInstance {
  root: THREE.Object3D;
  source: LoadedModelAsset;
  skinned: boolean;
}

export interface ModelInstanceOptions {
  /**
   * Clone the instance's mesh materials. Required when the caller mutates
   * materials per instance (hit flash). Defaults to false so rigid shared
   * paths pay no cloning cost.
   */
  cloneMaterials?: boolean;
}

/**
 * Safe model instance creation:
 *
 * - Rigid models use `Object3D.clone(true)` (cheap, no skeleton work).
 * - Skinned models use `SkeletonUtils.clone`, which rebinds skeletons so two
 *   instances never share bone transforms.
 *
 * Geometry and clip data are shared; only the object/bone hierarchy is
 * duplicated (plus optionally materials).
 */
export function createModelInstanceRoot(
  source: LoadedModelAsset,
  options: ModelInstanceOptions = {},
): THREE.Object3D {
  const skinned = source.hasSkinnedMesh;
  const root = skinned ? cloneSkeleton(source.scene) : source.scene.clone(true);
  if (options.cloneMaterials) cloneOwnedMaterials(root);
  return root;
}

export function buildModelInstance(
  source: LoadedModelAsset,
  options: ModelInstanceOptions = {},
): LoadedModelInstance {
  return {
    root: createModelInstanceRoot(source, options),
    source,
    skinned: source.hasSkinnedMesh,
  };
}

/**
 * Clone every mesh material on an instance so per-instance mutation (hit
 * flash, emissive telegraphs) can never leak into the cached prototype or
 * sibling instances.
 */
export function cloneOwnedMaterials(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map((m) => m.clone());
    } else {
      mesh.material = mesh.material.clone();
    }
  });
}
