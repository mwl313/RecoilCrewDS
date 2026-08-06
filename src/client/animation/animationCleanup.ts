import * as THREE from 'three';
import type { EnemyAnimationInstance } from './enemyAnimationInstance';
import { animationTelemetry } from './animationTelemetry';

/** Stop, uncache, and drop every reference an animation instance owns. */
export function disposeAnimationInstance(instance: EnemyAnimationInstance): void {
  try {
    instance.mixer.stopAllAction();
    instance.mixer.uncacheRoot(instance.root);
  } catch {
    // Root may already be detached; cleanup must still succeed.
  }
  const actionCount = instance.actions.size;
  instance.actions.clear();
  instance.currentAction = null;
  instance.currentRole = null;
  // SkeletonUtils.clone creates per-instance Skeleton objects. Rendering a
  // skinned mesh lazily allocates a GPU bone texture on each skeleton; mixer
  // cleanup alone does not release it.
  const skeletons = new Set<THREE.Skeleton>();
  instance.root.traverse((object) => {
    const skinned = object as THREE.SkinnedMesh;
    if (skinned.isSkinnedMesh) skeletons.add(skinned.skeleton);
  });
  for (const skeleton of skeletons) skeleton.dispose();
  animationTelemetry.liveMixers = Math.max(0, animationTelemetry.liveMixers - 1);
  animationTelemetry.animationActionCount = Math.max(0, animationTelemetry.animationActionCount - actionCount);
}

/**
 * Dispose materials explicitly owned by an instance (marked by
 * cloneOwnedMaterials). Shared cached prototype materials are never
 * disposed here.
 */
export function disposeOwnedMaterials(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of materials) {
      if (mat.userData?.ownedByInstance === true) {
        mat.dispose();
        animationTelemetry.ownedMaterialClones = Math.max(
          0,
          animationTelemetry.ownedMaterialClones - 1,
        );
      }
    }
  });
}
