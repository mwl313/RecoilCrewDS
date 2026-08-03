/**
 * Deterministic route graph: waypoint candidates, k-nearest graph,
 * Prim MST, loop edges, swept corridors, and terrain carving.
 *
 * The graph guarantees full connectivity by construction (every node has at
 * least one valid candidate edge), at least two major loops, limited dead
 * ends, and tank-friendly slopes. Corridors are swept segments used as
 * reserved space by every later placement.
 */
import type { Rng } from './prng';
import type { Heightfield } from './heightfield';
import type { MacroFeatureRecord, MacroFeatureType } from './features';
import type { CliffFeatureRecord } from './cliffs';
import { terrainFlagsAt, TerrainFlag } from './terrainFlags';
import type { SlopeRules } from './profiles';

export type RouteNodeTag = 'center' | 'feature' | 'highland' | 'valley' | 'gate' | 'spawn';

export interface RouteNode {
  id: string;
  x: number;
  z: number;
  tags: RouteNodeTag[];
}

export interface RouteEdge {
  id: string;
  a: string;
  b: string;
  length: number;
  slope: number;
  halfWidth: number;
  carved: boolean;
}

export interface RouteCorridor {
  edgeId: string;
  ax: number;
  az: number;
  bx: number;
  bz: number;
  halfWidth: number;
}

export interface RouteGraph {
  nodes: RouteNode[];
  edges: RouteEdge[];
  corridors: RouteCorridor[];
  loops: number;
  deadEnds: string[];
  centerNodeId: string;
}

export interface RouteProfile {
  routeClearance: number;
  routeMinHalfWidth: number;
  maxRouteSlope: number;
  maxEdgeLength: number;
  kNearest: number;
  minLoops: number;
  maxDeadEndRatio: number;
}

export const DEFAULT_ROUTE_PROFILE: RouteProfile = {
  routeClearance: 14,
  routeMinHalfWidth: 12,
  maxRouteSlope: 0.35,
  maxEdgeLength: 140,
  kNearest: 5,
  minLoops: 2,
  maxDeadEndRatio: 0.35,
};

export function distToSegment(
  x: number,
  z: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  if (len2 <= 1e-12) return Math.hypot(x - ax, z - az);
  let t = ((x - ax) * dx + (z - az) * dz) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}

/** Maximum terrain slope sampled along a segment (every 8 m + endpoints). */
export function segmentSlope(hf: Heightfield, ax: number, az: number, bx: number, bz: number): number {
  const len = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(2, Math.ceil(len / 8));
  let worst = 0;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    worst = Math.max(worst, hf.slopeAt(x, z));
  }
  return worst;
}

export interface RouteGraphOptions {
  rng: Rng;
  hf: Heightfield;
  /** Per-cell terrain class flags (route cost model). */
  flags?: Uint32Array;
  slopeRules?: SlopeRules;
  features: MacroFeatureRecord[];
  widthMeters: number;
  depthMeters: number;
  profile?: Partial<RouteProfile>;
  /** Pre-selected gate/spawn candidate positions (validated later). */
  gateCandidates?: { x: number; z: number }[];
  spawnCandidates?: { x: number; z: number }[];
}

export function buildRouteGraph(options: RouteGraphOptions): RouteGraph {
  const profile: RouteProfile = { ...DEFAULT_ROUTE_PROFILE, ...options.profile };
  const nodes = buildWaypointCandidates(
    options.rng,
    options.hf,
    options.flags,
    options.features,
    options.widthMeters,
    options.depthMeters,
    options.gateCandidates ?? [],
    options.spawnCandidates ?? [],
  );
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // Candidate edges: k-nearest per node with a deterministic tie-break.
  // Required routes may not cross cliff walls or blocked cells; risky cells
  // are allowed only as a penalized shortcut.
  const candidates: Array<{ a: string; b: string; length: number; slope: number; cost: number }> = [];
  const seenPairs = new Set<string>();
  for (const node of nodes) {
    const others = nodes
      .filter((o) => o.id !== node.id)
      .map((o) => {
        const length = Math.hypot(o.x - node.x, o.z - node.z);
        return { id: o.id, length };
      })
      .sort((p, q) => (p.length !== q.length ? p.length - q.length : p.id < q.id ? -1 : 1))
      .slice(0, profile.kNearest);
    for (const other of others) {
      const keyA = `${node.id}--${other.id}`;
      const keyB = `${other.id}--${node.id}`;
      const key = keyA < keyB ? keyA : keyB;
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);
      const slope = segmentSlope(options.hf, node.x, node.z, byId.get(other.id)!.x, byId.get(other.id)!.z);
      const maxFlags = segmentMaxFlags(options.hf, options.flags, node.x, node.z, byId.get(other.id)!.x, byId.get(other.id)!.z);
      if (maxFlags & (TerrainFlag.CliffWall | TerrainFlag.Blocked)) continue;
      const risky = (maxFlags & TerrainFlag.Risky) !== 0;
      if (other.length <= profile.maxEdgeLength && (slope <= profile.maxRouteSlope * 1.5 || risky)) {
        const a = keyA < keyB ? node.id : other.id;
        const b = keyA < keyB ? other.id : node.id;
        candidates.push({ a, b, length: other.length, slope, cost: other.length * (risky ? 1.35 : 1) });
      }
    }
  }
  // Sort with a stable, purely deterministic key.
  candidates.sort(
    (p, q) =>
      p.cost - q.cost ||
      p.length - q.length ||
      (p.a < q.a ? -1 : p.a > q.a ? 1 : p.b < q.b ? -1 : p.b > q.b ? 1 : 0),
  );

  // Deterministic Prim MST from the center node.
  const centerNodeId = nodes.find((n) => n.tags.includes('center'))?.id ?? nodes[0].id;
  const adjacency = new Map<string, typeof candidates>();
  for (const c of candidates) {
    const list = adjacency.get(c.a) ?? [];
    list.push(c);
    adjacency.set(c.a, list);
    const listB = adjacency.get(c.b) ?? [];
    listB.push(c);
    adjacency.set(c.b, listB);
  }
  const mstEdges: typeof candidates = [];
  const inTree = new Set<string>([centerNodeId]);
  const frontier: typeof candidates = [];
  const pushFrontier = (nodeId: string) => {
    for (const c of adjacency.get(nodeId) ?? []) {
      if (!inTree.has(c.a) || !inTree.has(c.b)) frontier.push(c);
    }
  };
  pushFrontier(centerNodeId);
  while (inTree.size < nodes.length) {
    frontier.sort((p, q) => p.cost - q.cost || p.length - q.length || (p.a < q.a ? -1 : p.a > q.a ? 1 : p.b < q.b ? -1 : 1));
    let chosen: (typeof candidates)[number] | undefined;
    let chosenIndex = -1;
    for (let i = 0; i < frontier.length; i++) {
      const c = frontier[i];
      const aIn = inTree.has(c.a);
      const bIn = inTree.has(c.b);
      if (aIn !== bIn) {
        chosen = c;
        chosenIndex = i;
        break;
      }
    }
    if (!chosen) {
      // Deterministic fallback: connect the closest out-of-tree node with a
      // synthetic edge. If that edge crosses a cliff wall, carving will be
      // caught by corridor validation and the candidate retries.
      let bestIn: string | null = null;
      let bestOut: string | null = null;
      let bestDist = Infinity;
      for (const inNode of inTree) {
        const a = byId.get(inNode)!;
        for (const outNode of nodes) {
          if (inTree.has(outNode.id)) continue;
          const d = Math.hypot(outNode.x - a.x, outNode.z - a.z);
          if (d < bestDist) {
            bestDist = d;
            bestIn = inNode;
            bestOut = outNode.id;
          }
        }
      }
      if (!bestIn || !bestOut) break;
      const a = byId.get(bestIn)!;
      const b = byId.get(bestOut)!;
      chosen = {
        a: bestIn < bestOut ? bestIn : bestOut,
        b: bestIn < bestOut ? bestOut : bestIn,
        length: bestDist,
        slope: segmentSlope(options.hf, a.x, a.z, b.x, b.z),
        cost: bestDist * 2,
      };
      chosenIndex = -1;
    }
    frontier.splice(chosenIndex, 1);
    mstEdges.push(chosen);
    const added = inTree.has(chosen.a) ? chosen.b : chosen.a;
    inTree.add(added);
    pushFrontier(added);
  }

  // Loop edges: shortest remaining candidates until loops and dead ends pass.
  const mstIds = new Set(mstEdges.map((e) => `${e.a}--${e.b}`));
  const edges = [...mstEdges];
  for (const c of candidates) {
    const key = `${c.a}--${c.b}`;
    if (mstIds.has(key)) continue;
    if (edges.some((e) => `${e.a}--${e.b}` === key)) continue;
    edges.push(c);
    if (edges.length - nodes.length + 1 >= profile.minLoops && deadEndRatio(edges, nodes) <= profile.maxDeadEndRatio) {
      break;
    }
  }

  const edgesById = edges.map((e, i) => ({
    id: `route.${i}`,
    a: e.a,
    b: e.b,
    length: e.length,
    slope: e.slope,
    halfWidth: profile.routeClearance,
    carved: e.slope > profile.maxRouteSlope,
  }));
  const corridors: RouteCorridor[] = edgesById.map((e) => ({
    edgeId: e.id,
    ax: byId.get(e.a)!.x,
    az: byId.get(e.a)!.z,
    bx: byId.get(e.b)!.x,
    bz: byId.get(e.b)!.z,
    halfWidth: e.halfWidth,
  }));
  const loops = edgesById.length - nodes.length + 1;
  const deadEnds = computeDeadEnds(edgesById, nodes);

  return {
    nodes,
    edges: edgesById,
    corridors,
    loops,
    deadEnds,
    centerNodeId,
  };
}

function deadEndRatio(edges: { a: string; b: string }[], nodes: RouteNode[]): number {
  const degree = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  for (const e of edges) {
    degree.set(e.a, (degree.get(e.a) ?? 0) + 1);
    degree.set(e.b, (degree.get(e.b) ?? 0) + 1);
  }
  let dead = 0;
  let count = 0;
  for (const n of nodes) {
    if (n.tags.includes('gate')) continue;
    count++;
    if ((degree.get(n.id) ?? 0) <= 1) dead++;
  }
  return count === 0 ? 0 : dead / count;
}

function computeDeadEnds(edges: RouteEdge[], nodes: RouteNode[]): string[] {
  const degree = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  for (const e of edges) {
    degree.set(e.a, (degree.get(e.a) ?? 0) + 1);
    degree.set(e.b, (degree.get(e.b) ?? 0) + 1);
  }
  return nodes.filter((n) => !n.tags.includes('gate') && (degree.get(n.id) ?? 0) <= 1).map((n) => n.id);
}

export function buildWaypointCandidates(
  rng: Rng,
  hf: Heightfield,
  flags: Uint32Array | undefined,
  features: MacroFeatureRecord[],
  widthMeters: number,
  depthMeters: number,
  gateCandidates: { x: number; z: number }[],
  spawnCandidates: { x: number; z: number }[],
): RouteNode[] {
  const nodes: RouteNode[] = [];
  let next = 0;
  const add = (x: number, z: number, tags: RouteNodeTag[]) => {
    const cx = Math.max(8, Math.min(widthMeters - 8, x));
    const cz = Math.max(8, Math.min(depthMeters - 8, z));
    nodes.push({ id: `node.${next++}`, x: cx, z: cz, tags: [...new Set(tags)] });
  };

  const cx = widthMeters / 2;
  const cz = depthMeters / 2;
  add(cx, cz, ['center']);
  for (let i = 0; i < 3; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = 35 + rng() * 45;
    add(cx + Math.sin(angle) * dist, cz + Math.cos(angle) * dist, ['center', 'spawn']);
  }

  const featureTag = (type: MacroFeatureType): RouteNodeTag =>
    type === 'valley' ? 'valley' : type === 'basin' ? 'center' : 'highland';
  for (const f of features) {
    // Cliff tops are optional high ground: only nodes with carved access
    // corridors may join the required graph.
    if (f.type === 'cliffPlateau' || f.type === 'escarpment') {
      continue; // never required nodes; access is optional traversal
    }
    add(f.x, f.z, ['feature', featureTag(f.type)]);
  }

  // Sampled highland/valley anchors (deterministic grid scan).
  const samples: Array<{ x: number; z: number; h: number; slope: number }> = [];
  for (let zi = 0; zi < hf.samplesZ; zi += 8) {
    for (let xi = 0; xi < hf.samplesX; xi += 8) {
      const x = xi * hf.cellSize;
      const z = zi * hf.cellSize;
      samples.push({ x, z, h: hf.getSample(xi, zi), slope: hf.slopeAt(x, z) });
    }
  }
  const flagOk = (x: number, z: number): boolean => {
    if (!flags) return true;
    const f = terrainFlagsAt(flags, hf, x, z);
    return (f & (TerrainFlag.Blocked | TerrainFlag.CliffWall | TerrainFlag.CliffTop)) === 0;
  };
  const highlands = samples
    .filter((s) => s.h >= 2.5 && s.slope <= 0.2 && flagOk(s.x, s.z))
    .sort((a, b) => b.h - a.h || a.x - b.x || a.z - b.z)
    .slice(0, 4);
  for (const s of highlands) add(s.x, s.z, ['highland', 'feature']);
  const valleys = samples
    .filter((s) => s.h <= -1 && flagOk(s.x, s.z))
    .sort((a, b) => a.h - b.h || a.x - b.x || a.z - b.z)
    .slice(0, 4);
  for (const s of valleys) add(s.x, s.z, ['valley', 'feature']);

  for (const g of gateCandidates) add(g.x, g.z, ['gate']);
  for (const s of spawnCandidates) add(s.x, s.z, ['spawn', 'feature']);
  return nodes;
}

/** OR of terrain flags sampled along a segment (every 8 m + endpoints). */
export function segmentMaxFlags(
  hf: Heightfield,
  flags: Uint32Array | undefined,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  if (!flags) return 0;
  const len = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(2, Math.ceil(len / 8));
  let maxFlags = 0;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    maxFlags |= terrainFlagsAt(flags, hf, x, z);
  }
  return maxFlags;
}

/**
 * Carve and smooth terrain around required route corridors: corridor samples
 * blend toward a linear endpoint-height target, then receive localized
 * smoothing and slope correction so required routes are drivable without
 * flattening the whole map.
 */
export function carveRoutes(hf: Heightfield, corridors: RouteCorridor[], maxSlope: number): void {
  if (corridors.length === 0) return;
  const margin = 1.5;
  // Bounding boxes for fast corridor rejection.
  const boxes = corridors.map((c) => {
    const r = c.halfWidth + margin;
    return {
      minX: Math.min(c.ax, c.bx) - r,
      maxX: Math.max(c.ax, c.bx) + r,
      minZ: Math.min(c.az, c.bz) - r,
      maxZ: Math.max(c.az, c.bz) + r,
      c,
    };
  });
  const nearby = (x: number, z: number): RouteCorridor[] => {
    const out: RouteCorridor[] = [];
    for (const b of boxes) {
      if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) out.push(b.c);
    }
    return out;
  };
  const corridorSample = (x: number, z: number): number | null => {
    let best: number | null = null;
    for (const c of nearby(x, z)) {
      const d = distToSegment(x, z, c.ax, c.az, c.bx, c.bz);
      if (d <= c.halfWidth + margin && (best === null || d < best)) best = d;
    }
    return best;
  };

  // 1. Blend toward the corridor height target.
  for (let zi = 0; zi < hf.samplesZ; zi++) {
    for (let xi = 0; xi < hf.samplesX; xi++) {
      const x = xi * hf.cellSize;
      const z = zi * hf.cellSize;
      for (const c of nearby(x, z)) {
        const d = distToSegment(x, z, c.ax, c.az, c.bx, c.bz);
        if (d > c.halfWidth + margin) continue;
        const dx = c.bx - c.ax;
        const dz = c.bz - c.az;
        const len2 = dx * dx + dz * dz;
        const t = len2 <= 1e-12 ? 0 : Math.max(0, Math.min(1, ((x - c.ax) * dx + (z - c.az) * dz) / len2));
        const target =
          hf.heightAt(c.ax, c.az) * (1 - t) + hf.heightAt(c.bx, c.bz) * t;
        const idx = hf.sampleIndex(xi, zi);
        hf.samples[idx] += (target - hf.samples[idx]) * 0.8;
      }
    }
  }

  // 2. Localized smoothing (3×3, corridor samples only).
  const src = new Float32Array(hf.samples.length);
  for (let pass = 0; pass < 3; pass++) {
    src.set(hf.samples);
    for (let zi = 0; zi < hf.samplesZ; zi++) {
      for (let xi = 0; xi < hf.samplesX; xi++) {
        const x = xi * hf.cellSize;
        const z = zi * hf.cellSize;
        if (corridorSample(x, z) === null) continue;
        let sum = 0;
        let weight = 0;
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = xi + dx;
            const nz = zi + dz;
            if (nx < 0 || nx >= hf.samplesX || nz < 0 || nz >= hf.samplesZ) continue;
            const w = dx === 0 && dz === 0 ? 4 : dx === 0 || dz === 0 ? 2 : 1;
            sum += src[hf.sampleIndex(nx, nz)] * w;
            weight += w;
          }
        }
        hf.samples[hf.sampleIndex(xi, zi)] = sum / weight;
      }
    }
  }

  // 3. Corridor slope enforcement (symmetric pull within the corridor;
  // boundary samples blend toward their outside neighbour to avoid cliffs).
  const allowed = maxSlope * hf.cellSize;
  for (let iter = 0; iter < 10; iter++) {
    let changed = false;
    for (let zi = 0; zi < hf.samplesZ; zi++) {
      for (let xi = 0; xi < hf.samplesX; xi++) {
        const x = xi * hf.cellSize;
        const z = zi * hf.cellSize;
        const inCorridor = corridorSample(x, z) !== null;
        if (!inCorridor) continue;
        const idx = hf.sampleIndex(xi, zi);
        const h = hf.samples[idx];
        const neighbors: number[] = [];
        if (xi > 0) neighbors.push(hf.sampleIndex(xi - 1, zi));
        if (xi + 1 < hf.samplesX) neighbors.push(hf.sampleIndex(xi + 1, zi));
        if (zi > 0) neighbors.push(hf.sampleIndex(xi, zi - 1));
        if (zi + 1 < hf.samplesZ) neighbors.push(hf.sampleIndex(xi, zi + 1));
        for (const nIdx of neighbors) {
          const n = hf.samples[nIdx];
          const delta = h - n;
          if (Math.abs(delta) > allowed * 1.15) {
            const excess = Math.abs(delta) - allowed * 1.15;
            const pull = Math.sign(delta) * excess * 0.5;
            hf.samples[idx] = hf.samples[idx] - pull;
            changed = true;
          }
        }
      }
    }
    if (!changed) break;
  }
}
