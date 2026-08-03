import * as THREE from 'three';
import type { Collider } from './arenaView';
import { netcodeMetrics } from './netcode/netcodeMetrics';

/**
 * Spatialized camera/aim collision (Milestone 5).
 *
 * - Uniform grid over world bounds; queries return only nearby candidates.
 * - Colliders carry a pre-expanded AABB (camera radius baked at arena
 *   construction) so the hot path never clones/expands boxes.
 * - Contiguous cliff edge boxes are merged into far fewer camera proxies.
 */
export interface CameraCollisionQuery {
  /** Candidate colliders near `center` within `radius`. */
  query(center: THREE.Vector3, radius: number): readonly Collider[];
  rawCount: number;
  proxyCount: number;
}

const CAMERA_RADIUS = 0.3;
const CELL = 16;

export function expandCollider(c: Collider): THREE.Box3 {
  return c.box.clone().expandByScalar(CAMERA_RADIUS + 0.01);
}

/** Greedy merge of adjacent cliff boxes into longer camera proxies. */
export function mergeCliffProxies(cliffBoxes: Collider[]): Collider[] {
  const merged: Collider[] = [];
  for (const c of cliffBoxes) {
    const box = c.box.clone();
    let absorbed = false;
    for (const m of merged) {
      const yOverlap = box.min.y < m.box.max.y + 0.25 && box.max.y > m.box.min.y - 0.25;
      const xGap = Math.max(0, Math.max(box.min.x, m.box.min.x) - Math.min(box.max.x, m.box.max.x));
      const zGap = Math.max(0, Math.max(box.min.z, m.box.min.z) - Math.min(box.max.z, m.box.max.z));
      const xOverlap = box.min.x < m.box.max.x && box.max.x > m.box.min.x;
      const zOverlap = box.min.z < m.box.max.z && box.max.z > m.box.min.z;
      if (yOverlap && ((xOverlap && zGap <= 0.25) || (zOverlap && xGap <= 0.25))) {
        m.box.min.min(box.min);
        m.box.max.max(box.max);
        absorbed = true;
        break;
      }
    }
    if (!absorbed) merged.push({ box, type: c.type });
  }
  return merged.map((m) => ({
    box: m.box,
    type: m.type,
    expanded: m.box.clone().expandByScalar(CAMERA_RADIUS + 0.01),
  }));
}

export function buildCameraCollisionIndex(colliders: readonly Collider[]): CameraCollisionQuery {
  const raw: Collider[] = [];
  const cliff: Collider[] = [];
  for (const c of colliders) {
    if (c.type === 'cliff') cliff.push(c);
    else raw.push(c);
  }
  const proxies = [...raw, ...mergeCliffProxies(cliff)];
  const cells = new Map<string, number[]>();
  const key = (cx: number, cz: number): string => `${cx},${cz}`;
  for (let i = 0; i < proxies.length; i++) {
    const expanded = proxies[i].expanded ?? expandCollider(proxies[i]);
    proxies[i].expanded = expanded;
    const minX = Math.floor(expanded.min.x / CELL);
    const maxX = Math.floor(expanded.max.x / CELL);
    const minZ = Math.floor(expanded.min.z / CELL);
    const maxZ = Math.floor(expanded.max.z / CELL);
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cz = minZ; cz <= maxZ; cz++) {
        const k = key(cx, cz);
        const list = cells.get(k);
        if (list) list.push(i);
        else cells.set(k, [i]);
      }
    }
  }
  const query = (center: THREE.Vector3, radius: number): readonly Collider[] => {
    const out: Collider[] = [];
    const minX = Math.floor((center.x - radius) / CELL);
    const maxX = Math.floor((center.x + radius) / CELL);
    const minZ = Math.floor((center.z - radius) / CELL);
    const maxZ = Math.floor((center.z + radius) / CELL);
    const seen = new Set<number>();
    let tests = 0;
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cz = minZ; cz <= maxZ; cz++) {
        for (const idx of cells.get(key(cx, cz)) ?? []) {
          if (seen.has(idx)) continue;
          seen.add(idx);
          tests++;
          out.push(proxies[idx]);
        }
      }
    }
    netcodeMetrics.colliderCandidates = out.length;
    netcodeMetrics.colliderTests = tests;
    return out;
  };
  return { query, rawCount: colliders.length, proxyCount: proxies.length };
}
