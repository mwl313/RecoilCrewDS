import * as THREE from 'three';
import type { AssetService } from '../assets';
import type { InstancedBatchHost, InstancedFodderState } from './instancedEnemyRenderer';

/**
 * Generic asset-to-instanced-geometry adapter (Monster Pack 10).
 *
 * Takes any preloaded rigid model asset (common-far GLBs) and produces one
 * InstancedMesh per source mesh with SHARED geometry and ONE shared material
 * per asset. No GLB hierarchy clone per far enemy; per-instance transform,
 * deterministic phase, and per-instance hit flash are provided through the
 * host contract.
 */
export function createAssetInstancedHost(
  scene: THREE.Scene,
  assets: AssetService,
  assetId: string,
  capacity: number,
  options: { castShadow?: boolean; receiveShadow?: boolean } = {},
): InstancedBatchHost {
  const prototype = assets.model(assetId).clone(true);
  const meshes: THREE.Mesh[] = [];
  prototype.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) meshes.push(mesh);
  });
  if (meshes.length === 0) {
    throw new Error(`asset '${assetId}' contains no meshes for instancing`);
  }
  const sharedMaterial = (meshes[0].material as THREE.MeshStandardMaterial).clone();
  sharedMaterial.emissive = new THREE.Color(0x000000);
  const batches: THREE.InstancedMesh[] = meshes.map((mesh, index) => {
    const instanced = new THREE.InstancedMesh(
      mesh.geometry,
      index === 0 ? sharedMaterial : sharedMaterial,
      capacity,
    );
    instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    instanced.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    instanced.frustumCulled = false;
    instanced.castShadow = options.castShadow ?? false;
    instanced.receiveShadow = options.receiveShadow ?? true;
    instanced.count = 0;
    scene.add(instanced);
    return instanced;
  });
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let active = 0;

  return {
    setTransform(slot, state) {
      if (slot >= capacity) return;
      if (state.deathT > 0) {
        const k = Math.max(0, 1 - state.deathT);
        dummy.position.set(state.x, state.y - state.deathT * 0.9, state.z);
        dummy.rotation.set(0, state.yaw, 0);
        dummy.scale.setScalar(state.scale * k);
      } else {
        dummy.position.set(state.x, state.y, state.z);
        dummy.rotation.set(0, state.yaw, 0);
        dummy.scale.setScalar(state.scale);
      }
      dummy.updateMatrix();
      for (const batch of batches) batch.setMatrixAt(slot, dummy.matrix);
    },
    setColor(slot, r, g, b) {
      if (slot >= capacity) return;
      color.setRGB(r, g, b);
      for (const batch of batches) batch.setColorAt(slot, color);
    },
    setCount(count) {
      active = Math.max(0, Math.min(capacity, count));
      for (const batch of batches) batch.count = active;
    },
    needsUpdate() {
      for (const batch of batches) {
        batch.instanceMatrix.needsUpdate = true;
        if (batch.instanceColor) batch.instanceColor.needsUpdate = true;
      }
    },
  };
}

export { type InstancedBatchHost, type InstancedFodderState };
