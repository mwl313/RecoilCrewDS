/**
 * Player spawns and horde gates for generated maps.
 *
 * Spawns: 3-4 central candidates with low slope, clearance, ≥2 route
 * exits, camera clearance, gate separation, and route connectivity.
 * Gates: 6-8 edge candidates with clear ground, route connection, a broad
 * corridor to center, and separation — open enough for direct-follow AI.
 */
import type { Rng } from './prng';
import type { Heightfield } from './heightfield';
import type { RouteGraph } from './routes';
import { distToSegment } from './routes';

export interface HordeGate {
  id: string;
  x: number;
  z: number;
  nodeId: string;
}

export interface PlayerSpawn {
  id: string;
  x: number;
  z: number;
  nodeId: string;
}

export interface SpawnOptions {
  rng: Rng;
  hf: Heightfield;
  graph: RouteGraph;
  widthMeters: number;
  depthMeters: number;
  centerX: number;
  centerZ: number;
}

export interface GateCandidate {
  x: number;
  z: number;
  angle: number;
}

export function buildGateCandidates(rng: Rng, widthMeters: number, depthMeters: number): GateCandidate[] {
  const candidates: GateCandidate[] = [];
  for (let i = 0; i < 14; i++) {
    const angle = (i / 14) * Math.PI * 2 + rng() * 0.18;
    const inset = 22 + rng() * 10;
    candidates.push({
      x: widthMeters / 2 + Math.sin(angle) * (widthMeters / 2 - inset),
      z: depthMeters / 2 + Math.cos(angle) * (depthMeters / 2 - inset),
      angle,
    });
  }
  return candidates.sort((a, b) => a.angle - b.angle);
}

export function selectHordeGates(options: SpawnOptions, candidates: GateCandidate[]): HordeGate[] {
  const { hf, graph, centerX, centerZ } = options;
  const chosen: HordeGate[] = [];
  for (const c of candidates) {
    if (chosen.length >= 8) break;
    if (!gateCandidateValid(c.x, c.z, options)) continue;
    const node = nearestNode(graph, c.x, c.z);
    if (!node || !node.tags.includes('gate')) continue;
    if (chosen.some((g) => Math.hypot(g.x - c.x, g.z - c.z) < 60)) continue;
    if (!broadRouteToCenter(graph, node.id, centerX, centerZ, hf)) continue;
    chosen.push({ id: `gate.${chosen.length}`, x: c.x, z: c.z, nodeId: node.id });
  }
  return chosen.slice(0, 8);
}

function gateCandidateValid(x: number, z: number, options: SpawnOptions): boolean {
  const { hf, widthMeters, depthMeters } = options;
  const margin = 12;
  if (x < margin || x > widthMeters - margin || z < margin || z > depthMeters - margin) return false;
  if (hf.slopeAt(x, z) > 0.2) return false;
  const h = hf.heightAt(x, z);
  if (h < -3 || h > 8) return false;
  // Clear radius: bounded slope and height variance (no cliff/wall).
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const px = x + Math.cos(a) * 8;
    const pz = z + Math.sin(a) * 8;
    if (hf.slopeAt(px, pz) > 0.25) return false;
    if (Math.abs(hf.heightAt(px, pz) - h) > 2) return false;
  }
  return true;
}

export function buildSpawnCandidates(rng: Rng, centerX: number, centerZ: number, count = 14): Array<{ x: number; z: number }> {
  const candidates: Array<{ x: number; z: number }> = [];
  for (let i = 0; i < count; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = 45 + rng() * 65;
    candidates.push({
      x: centerX + Math.sin(angle) * dist,
      z: centerZ + Math.cos(angle) * dist,
    });
  }
  return candidates;
}

export function selectPlayerSpawns(
  options: SpawnOptions,
  gates: HordeGate[],
  candidates: Array<{ x: number; z: number }>,
  count = 4,
): PlayerSpawn[] {
  const { graph } = options;
  const chosen: PlayerSpawn[] = [];
  for (const c of candidates) {
    if (chosen.length >= count) break;
    if (!spawnCandidateValid(c.x, c.z, options, gates)) continue;
    const node = nearestNode(graph, c.x, c.z);
    if (!node) continue;
    if (chosen.some((s) => Math.hypot(s.x - c.x, s.z - c.z) < 40)) continue;
    chosen.push({ id: `spawn.${chosen.length}`, x: c.x, z: c.z, nodeId: node.id });
  }
  return chosen;
}

function spawnCandidateValid(
  x: number,
  z: number,
  options: SpawnOptions,
  gates: HordeGate[],
): boolean {
  const { hf, widthMeters, depthMeters, graph } = options;
  const margin = 20;
  if (x < margin || x > widthMeters - margin || z < margin || z > depthMeters - margin) return false;
  if (hf.slopeAt(x, z) > 0.15) return false;
  const h = hf.heightAt(x, z);
  // Clear radius + camera clearance (no cliff/edge within 7 m).
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const px = x + Math.cos(a) * 7;
    const pz = z + Math.sin(a) * 7;
    if (hf.slopeAt(px, pz) > 0.2) return false;
    if (Math.abs(hf.heightAt(px, pz) - h) > 2) return false;
  }
  // Route connectivity + at least two distinct route exits.
  const exits = new Set<string>();
  for (const c of graph.corridors) {
    if (distToSegment(x, z, c.ax, c.az, c.bx, c.bz) <= 25) exits.add(c.edgeId);
  }
  if (exits.size < 2) return false;
  if (gates.some((g) => Math.hypot(g.x - x, g.z - z) < 40)) return false;
  return true;
}

/** BFS path from a node to the center; every edge must be route-worthy. */
function broadRouteToCenter(
  graph: RouteGraph,
  startNodeId: string,
  centerX: number,
  centerZ: number,
  hf: Heightfield,
): boolean {
  const centerNode = nearestNode(graph, centerX, centerZ);
  if (!centerNode) return false;
  const adjacency = new Map<string, RouteGraph['edges']>();
  for (const e of graph.edges) {
    const list = adjacency.get(e.a) ?? [];
    list.push(e);
    adjacency.set(e.a, list);
    const listB = adjacency.get(e.b) ?? [];
    listB.push(e);
    adjacency.set(e.b, listB);
  }
  const queue = [startNodeId];
  const seen = new Set([startNodeId]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === centerNode.id) return true;
    for (const e of adjacency.get(current) ?? []) {
      const next = e.a === current ? e.b : e.a;
      if (seen.has(next)) continue;
      if (e.slope > 0.35) continue;
      if (e.halfWidth < 12) continue;
      const node = graph.nodes.find((n) => n.id === next)!;
      if (hf.slopeAt(node.x, node.z) > 0.35) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return false;
}

export function nearestNode(graph: RouteGraph, x: number, z: number): RouteGraph['nodes'][number] | undefined {
  let best: RouteGraph['nodes'][number] | undefined;
  let bestD = Infinity;
  for (const n of graph.nodes) {
    const d = Math.hypot(n.x - x, n.z - z);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}
