import * as THREE from 'three';
import type { Heightfield } from '../../shared/mapgen/heightfield';

export const TERRAIN_CHUNKS = 4;
export const CELLS_PER_CHUNK = 25;

/**
 * Deterministic chunked terrain geometry from the authoritative heightfield
 * (shared by the game ArenaView and Map Lab). Vertices/normals agree with
 * groundHeightAt/groundNormalAt; rendering never mutates the heightfield.
 */
export function buildChunkGeometry(
  hf: Heightfield,
  cx: number,
  cz: number,
  step: number,
  originX: number,
  originZ: number,
): THREE.BufferGeometry {
  const cells = CELLS_PER_CHUNK;
  const verts = Math.floor(cells / step) + 1;
  const positions = new Float32Array(verts * verts * 3);
  const normals = new Float32Array(verts * verts * 3);
  const uvs = new Float32Array(verts * verts * 2);
  const indices: number[] = [];
  const startXi = cx * cells;
  const startZi = cz * cells;
  for (let zi = 0; zi < verts; zi++) {
    for (let xi = 0; xi < verts; xi++) {
      const sx = startXi + xi * step;
      const sz = startZi + zi * step;
      const i = zi * verts + xi;
      const wx = sx * hf.cellSize + originX;
      const wz = sz * hf.cellSize + originZ;
      positions[i * 3] = wx;
      positions[i * 3 + 1] = hf.getSample(sx, sz);
      positions[i * 3 + 2] = wz;
      const n = hf.normalAt(sx * hf.cellSize, sz * hf.cellSize);
      normals[i * 3] = n.nx;
      normals[i * 3 + 1] = n.ny;
      normals[i * 3 + 2] = n.nz;
      uvs[i * 2] = wx / 4;
      uvs[i * 2 + 1] = wz / 4;
    }
  }
  for (let zi = 0; zi < verts - 1; zi++) {
    for (let xi = 0; xi < verts - 1; xi++) {
      const a = zi * verts + xi;
      const b = a + 1;
      const c = a + verts;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

export interface TerrainChunk {
  mesh: THREE.Mesh;
  full: THREE.BufferGeometry;
  half: THREE.BufferGeometry;
  center: THREE.Vector3;
  isHalf: boolean;
}

export function buildTerrainChunks(hf: Heightfield, half: number, material: THREE.Material): TerrainChunk[] {
  const chunks: TerrainChunk[] = [];
  const originX = -half;
  const originZ = -half;
  for (let cz = 0; cz < TERRAIN_CHUNKS; cz++) {
    for (let cx = 0; cx < TERRAIN_CHUNKS; cx++) {
      const full = buildChunkGeometry(hf, cx, cz, 1, originX, originZ);
      const halfGeo = buildChunkGeometry(hf, cx, cz, 2, originX, originZ);
      const mesh = new THREE.Mesh(full, material);
      mesh.frustumCulled = true;
      mesh.receiveShadow = true;
      chunks.push({
        mesh,
        full,
        half: halfGeo,
        center: new THREE.Vector3(originX + (cx + 0.5) * CELLS_PER_CHUNK * hf.cellSize, 0, originZ + (cz + 0.5) * CELLS_PER_CHUNK * hf.cellSize),
        isHalf: false,
      });
    }
  }
  return chunks;
}

export const LOD_FAR = 150;
export const LOD_NEAR = 130;

/** Per-frame LOD swap (cheap geometry reference changes). */
export function updateChunkLod(chunks: TerrainChunk[], cameraPosition: THREE.Vector3): void {
  for (const chunk of chunks) {
    const d = chunk.center.distanceTo(cameraPosition);
    const wantHalf = d > LOD_FAR || (chunk.isHalf && d > LOD_NEAR);
    if (wantHalf !== chunk.isHalf) {
      chunk.mesh.geometry = wantHalf ? chunk.half : chunk.full;
      chunk.isHalf = wantHalf;
    }
  }
}
