import * as THREE from 'three';

export interface MonsterMaterialAudit {
  materialCount: number;
  texturedBaseColors: number;
  srgbBaseColors: number;
  vertexColorMaterials: number;
  flatShadedMaterials: number;
  maxMetalness: number;
  minRoughness: number;
  maxAoIntensity: number;
}

/**
 * Common low-poly monster material policy. It corrects PBR interpretation,
 * never paints over source color, and preserves both vertex colors and the
 * source flat/smooth shading choice.
 */
export function prepareMonsterMaterials(root: THREE.Object3D): MonsterMaterialAudit {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) prepareMonsterMaterial(material);
  });
  return auditMonsterMaterials(root);
}

export function prepareMonsterMaterial(material: THREE.Material): void {
  const pbr = material as THREE.MeshStandardMaterial;
  if (!pbr.isMeshStandardMaterial) return;
  // Base-color and emissive textures are color data. GLTFLoader normally sets
  // this already; the explicit assignment protects custom/fallback loaders.
  if (pbr.map) pbr.map.colorSpace = THREE.SRGBColorSpace;
  if (pbr.emissiveMap) pbr.emissiveMap.colorSpace = THREE.SRGBColorSpace;
  pbr.metalness = Math.min(pbr.metalness, 0.08);
  pbr.roughness = Math.max(pbr.roughness, 0.68);
  pbr.aoMapIntensity = Math.min(pbr.aoMapIntensity, 0.5);
  pbr.needsUpdate = true;
}

export function auditMonsterMaterials(root: THREE.Object3D): MonsterMaterialAudit {
  const seen = new Set<THREE.Material>();
  const result: MonsterMaterialAudit = {
    materialCount: 0,
    texturedBaseColors: 0,
    srgbBaseColors: 0,
    vertexColorMaterials: 0,
    flatShadedMaterials: 0,
    maxMetalness: 0,
    minRoughness: 1,
    maxAoIntensity: 0,
  };
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (seen.has(material)) continue;
      seen.add(material);
      const pbr = material as THREE.MeshStandardMaterial;
      if (!pbr.isMeshStandardMaterial) continue;
      result.materialCount++;
      if (pbr.map) {
        result.texturedBaseColors++;
        if (pbr.map.colorSpace === THREE.SRGBColorSpace) result.srgbBaseColors++;
      }
      if (pbr.vertexColors) result.vertexColorMaterials++;
      if (pbr.flatShading) result.flatShadedMaterials++;
      result.maxMetalness = Math.max(result.maxMetalness, pbr.metalness);
      result.minRoughness = Math.min(result.minRoughness, pbr.roughness);
      result.maxAoIntensity = Math.max(result.maxAoIntensity, pbr.aoMapIntensity);
    }
  });
  return result;
}
