import * as THREE from 'three';
import type { ManifestAssetEntry } from './assetManifestLoader';

/**
 * Applies optional transform/socket/material metadata from the manifest to a
 * cloned model instance. Child names are a presentation concern only:
 * gameplay never queries them.
 */
export class AssetTransformResolver {
  /** Semantic id -> optional child name for sockets (presentation layer). */
  private readonly socketChildNames = new Map<string, string>([['enemy.gunTower', 'towerHead']]);

  apply(instance: THREE.Object3D, id: string, metadata?: ManifestAssetEntry['transform'], materials?: ManifestAssetEntry['materials']): void {
    if (metadata) {
      if (metadata.scale !== undefined) {
        if (typeof metadata.scale === 'number') instance.scale.setScalar(metadata.scale);
        else instance.scale.set(metadata.scale.x ?? 1, metadata.scale.y ?? 1, metadata.scale.z ?? 1);
      }
      if (metadata.position) instance.position.set(metadata.position.x ?? 0, metadata.position.y ?? 0, metadata.position.z ?? 0);
      if (metadata.rotation) instance.rotation.set(metadata.rotation.x ?? 0, metadata.rotation.y ?? 0, metadata.rotation.z ?? 0);
    }
    if (materials) {
      instance.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const override of materials) {
          for (const material of meshMaterials) {
            const mat = material as THREE.MeshStandardMaterial;
            if (!mat?.isMeshStandardMaterial) continue;
            if (override.match && !mesh.name.includes(override.match) && !mat.name.includes(override.match)) continue;
            if (override.color !== undefined) mat.color.setHex(override.color);
            if (override.emissive !== undefined) mat.emissive.setHex(override.emissive);
            if (override.emissiveIntensity !== undefined) mat.emissiveIntensity = override.emissiveIntensity;
            if (override.roughness !== undefined) mat.roughness = override.roughness;
            if (override.metalness !== undefined) mat.metalness = override.metalness;
          }
        }
      });
    }
  }

  /** Presentation-only socket lookup (semantic id -> optional child name). */
  socketNameFor(id: string): string | null {
    return this.socketChildNames.get(id) ?? null;
  }
}
