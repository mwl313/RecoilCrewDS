import * as THREE from 'three';
import type { Heightfield } from '../../shared/mapgen/heightfield';
import type { CliffEdgeSegment } from '../../shared/mapgen/cliffs';

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
      // World-metre UVs: textures are tiled through repeat = 1/tileSizeMeters
      // so material switching never requires rebuilding terrain geometry.
      uvs[i * 2] = wx;
      uvs[i * 2 + 1] = wz;
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

/**
 * Vertical cliff-wall geometry from authoritative edge segments.
 *
 * Every segment becomes a quad from the top edge (authoritative top-sample
 * heights) straight down to the lower ground height. Quads are grouped into
 * the same 4×4 chunk grid as the terrain so frustum culling keeps walls
 * cheap; normals come from the segment direction (outward, downslope).
 * Rendering never mutates the heightfield or the edge data.
 */
export function buildCliffWallChunks(
  hf: Heightfield,
  edges: CliffEdgeSegment[],
  originX: number,
  originZ: number,
): THREE.BufferGeometry[] {
  const chunkCount = TERRAIN_CHUNKS * TERRAIN_CHUNKS;
  const positions = new Float32Array(edges.length * 12);
  const normals = new Float32Array(edges.length * 12);
  const chunkFor = new Int32Array(edges.length);
  const chunkCounts = new Int32Array(chunkCount);
  const chunkW = hf.widthMeters / TERRAIN_CHUNKS;
  const chunkD = hf.depthMeters / TERRAIN_CHUNKS;
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    const midX = (e.ax + e.bx) / 2 + originX;
    const midZ = (e.az + e.bz) / 2 + originZ;
    const gx = Math.min(TERRAIN_CHUNKS - 1, Math.max(0, Math.floor((midX - originX) / chunkW)));
    const gz = Math.min(TERRAIN_CHUNKS - 1, Math.max(0, Math.floor((midZ - originZ) / chunkD)));
    chunkFor[i] = gz * TERRAIN_CHUNKS + gx;
    chunkCounts[chunkFor[i]]++;
    const ox = originX;
    const oz = originZ;
    const ax = e.ax + ox;
    const az = e.az + oz;
    const bx = e.bx + ox;
    const bz = e.bz + oz;
    const topY = e.topY;
    const bottomY = Math.min(e.bottomY, topY);
    positions[i * 12 + 0] = ax;
    positions[i * 12 + 1] = topY;
    positions[i * 12 + 2] = az;
    positions[i * 12 + 3] = bx;
    positions[i * 12 + 4] = topY;
    positions[i * 12 + 5] = bz;
    positions[i * 12 + 6] = bx;
    positions[i * 12 + 7] = bottomY;
    positions[i * 12 + 8] = bz;
    positions[i * 12 + 9] = ax;
    positions[i * 12 + 10] = bottomY;
    positions[i * 12 + 11] = az;
    const nx = e.normalX;
    const nz = e.normalZ;
    for (let v = 0; v < 4; v++) {
      normals[i * 12 + v * 3 + 0] = nx;
      normals[i * 12 + v * 3 + 1] = 0;
      normals[i * 12 + v * 3 + 2] = nz;
    }
  }
  const geometries: THREE.BufferGeometry[] = [];
  const offsets = new Int32Array(chunkCount);
  let acc = 0;
  for (let c = 0; c < chunkCount; c++) {
    offsets[c] = acc;
    acc += chunkCounts[c];
  }
  const order = new Int32Array(edges.length);
  const fill = new Int32Array(chunkCount);
  for (let i = 0; i < edges.length; i++) {
    const c = chunkFor[i];
    order[offsets[c] + fill[c]++] = i;
  }
  for (let c = 0; c < chunkCount; c++) {
    const n = chunkCounts[c];
    if (n === 0) {
      const empty = new THREE.BufferGeometry();
      // Keep a valid empty position attribute so consumers can safely read
      // `geo.attributes.position.count === 0` (e.g. ArenaView wall chunks).
      empty.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
      geometries.push(empty);
      continue;
    }
    const pos = new Float32Array(n * 12);
    const nor = new Float32Array(n * 12);
    const indices: number[] = [];
    for (let k = 0; k < n; k++) {
      const src = order[offsets[c] + k] * 12;
      pos.set(positions.subarray(src, src + 12), k * 12);
      nor.set(normals.subarray(src, src + 12), k * 12);
      const base = k * 4;
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setIndex(indices);
    geo.computeBoundingSphere();
    geometries.push(geo);
  }
  return geometries;
}

/** Default cliff wall material (optional profile cliffMaterialId variants). */
export function cliffWallMaterial(materialId: string | undefined): THREE.MeshStandardMaterial {
  const color = materialId === 'cliffIce' ? 0x9db8c4 : 0x8a7a68;
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.92,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
}
