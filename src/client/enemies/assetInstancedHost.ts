import * as THREE from 'three';
import type { AssetService } from '../assets';
import type { InstancedBatchHost, InstancedFodderState } from './instancedEnemyRenderer';
import { prepareMonsterMaterial } from '../materials/monsterMaterialPolicy';

/**
 * Generic asset-to-instanced-geometry adapter (Monster Pack 10).
 *
 * Takes any preloaded rigid model asset (common-far GLBs) and produces one
 * InstancedMesh per source mesh with shared geometry and source-faithful
 * materials. No GLB hierarchy clone per far enemy; per-instance transform,
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
  prototype.updateMatrixWorld(true);
  const localMatrices = meshes.map((mesh) => mesh.matrixWorld.clone());
  const batches: THREE.InstancedMesh[] = meshes.map((mesh) => {
    const instanced = new THREE.InstancedMesh(
      mesh.geometry,
      cloneMaterialSet(mesh.material),
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
  const composed = new THREE.Matrix4();
  const color = new THREE.Color();
  let active = 0;

  return {
    setTransform(slot, state) {
      if (slot >= capacity) return;
      const wave = Math.sin(state.motionPhase * Math.PI * 2);
      if (state.deathT > 0) {
        const k = Math.max(0, 1 - state.deathT);
        dummy.position.set(state.x, state.y - state.deathT * 0.9, state.z);
        dummy.rotation.set(0, state.yaw, 0);
        dummy.scale.setScalar(state.scale * k);
      } else {
        const bob = state.airborne ? 0 : Math.max(0, wave) * 0.07;
        dummy.position.set(state.x, state.y + bob, state.z);
        dummy.rotation.set(state.attacking ? -0.13 * Math.max(0, wave) : state.airborne ? -0.1 : 0, state.yaw, wave * 0.045);
        dummy.scale.setScalar(state.scale * (state.attacking ? 1 + Math.max(0, wave) * 0.035 : 1));
      }
      dummy.updateMatrix();
      for (let index = 0; index < batches.length; index++) {
        composed.multiplyMatrices(dummy.matrix, localMatrices[index]);
        batches[index].setMatrixAt(slot, composed);
      }
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

function cloneMaterialSet(material: THREE.Material | THREE.Material[]): THREE.Material | THREE.Material[] {
  const cloneOne = (source: THREE.Material): THREE.Material => {
    const clone = source.clone();
    prepareMonsterMaterial(clone);
    const emissiveMaterial = clone as THREE.Material & { emissive?: THREE.Color };
    if (emissiveMaterial.emissive) emissiveMaterial.emissive = new THREE.Color(0x000000);
    return clone;
  };
  return Array.isArray(material) ? material.map(cloneOne) : cloneOne(material);
}

export { type InstancedBatchHost, type InstancedFodderState };
