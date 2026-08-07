import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export interface GlbColorStats {
  meshCount: number;
  sampledVertices: number;
  saturation: number;
  value: number;
  luminance: number;
}

/**
 * Measure the visible linear base-color signal in a GLB. Source Quaternius
 * files use material colors; Horde Ready files bake the same signal into
 * COLOR_0. Measuring both paths catches accidental color-space conversion.
 */
export async function measureGlbColor(file: string): Promise<GlbColorStats> {
  const bytes = readFileSync(file);
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const resourcePath = pathToFileURL(path.dirname(file) + path.sep).href;
  const gltf = await new GLTFLoader().parseAsync(data, resourcePath);
  let meshCount = 0;
  let sampledVertices = 0;
  let saturation = 0;
  let value = 0;
  let luminance = 0;
  const effective = new THREE.Color();

  gltf.scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    meshCount++;
    const position = mesh.geometry.getAttribute('position');
    if (!position) return;
    const color = mesh.geometry.getAttribute('color');
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    // The source pack uses one material per mesh. Treat a multi-material mesh
    // as invalid for this audit instead of silently measuring the wrong slot.
    if (materials.length !== 1) {
      throw new Error(`${file}: mesh '${mesh.name}' has ${materials.length} materials`);
    }
    const material = materials[0] as THREE.MeshStandardMaterial;
    const base = material.color ?? new THREE.Color(1, 1, 1);
    const count = color?.count ?? position.count;
    for (let i = 0; i < count; i++) {
      effective.setRGB(
        base.r * (color?.getX(i) ?? 1),
        base.g * (color?.getY(i) ?? 1),
        base.b * (color?.getZ(i) ?? 1),
      );
      const max = Math.max(effective.r, effective.g, effective.b);
      const min = Math.min(effective.r, effective.g, effective.b);
      saturation += max <= 1e-9 ? 0 : (max - min) / max;
      value += max;
      luminance += 0.2126 * effective.r + 0.7152 * effective.g + 0.0722 * effective.b;
      sampledVertices++;
    }
  });

  const denominator = Math.max(1, sampledVertices);
  return {
    meshCount,
    sampledVertices,
    saturation: saturation / denominator,
    value: value / denominator,
    luminance: luminance / denominator,
  };
}

export function colorRatio(actual: number, source: number): number {
  return source <= 1e-9 ? 1 : actual / source;
}
