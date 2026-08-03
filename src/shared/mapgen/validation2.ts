/**
 * Phase 2 validators: routes, zones, spawns/gates, furniture, barrels,
 * ramps, recovery, and budgets. Pure functions of the generated arena;
 * failures drive the deterministic retry loop.
 */
import type { GeneratedArena } from './generator';
import type { MapLayoutResult } from './layout';
import { distToSegment } from './routes';
import { barrelComponents, validateBarrelLayout, type BarrelLike } from './barrels';
import { validateRamp } from './ramps';
import { SpatialHash } from './spatial';
import { resolveSlopeRules } from './profiles';
import { isCliffWallAt, terrainFlagsAt, TerrainFlag } from './terrainFlags';

export interface Phase2Metrics {
  nodeCount: number;
  edgeCount: number;
  loops: number;
  deadEndRatio: number;
  minCorridorHalfWidth: number;
  maxRouteSlope: number;
  gateCount: number;
  spawnCount: number;
  recoveryCount: number;
  rampCount: number;
  rampSkipped: number;
  objectCount: number;
  colliderCount: number;
  maxBarrelChain: number;
}

export interface Phase2ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  metrics: Phase2Metrics;
}

export function validatePhase2(arena: GeneratedArena): Phase2ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const layout: MapLayoutResult | undefined = arena.layout;
  if (!layout) {
    return {
      ok: false,
      errors: ['layout: generated arena has no Phase 2 layout'],
      warnings: [],
      metrics: emptyMetrics(),
    };
  }
  const { graph, zones, gates, spawns, recovery, ramps, objects, furnitureSet, densityProfile } = layout;
  const hf = arena.heightfield;
  const maxRouteSlope = furnitureSet.maxRouteSlope;
  const minHalfWidth = furnitureSet.routeMinHalfWidth;
  const rules = resolveSlopeRules(arena.terrainProfile);
  let rampSkipped = 0;

  // Route connectivity (BFS from center).
  const adjacency = new Map<string, RouteGraphEdge[]>();
  for (const e of graph.edges) {
    const list = adjacency.get(e.a) ?? [];
    list.push(e);
    adjacency.set(e.a, list);
    const listB = adjacency.get(e.b) ?? [];
    listB.push(e);
    adjacency.set(e.b, listB);
  }
  const seen = new Set<string>([graph.centerNodeId]);
  const queue = [graph.centerNodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const e of adjacency.get(current) ?? []) {
      const next = e.a === current ? e.b : e.a;
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  if (seen.size !== graph.nodes.length) {
    errors.push(`route: graph not fully connected (${seen.size}/${graph.nodes.length} nodes reachable)`);
  }

  // Required-zone reachability + min width + max slope (post-carve).
  let minCorridorHalfWidth = Infinity;
  let maxRouteSlopeActual = 0;
  for (const c of graph.corridors) {
    minCorridorHalfWidth = Math.min(minCorridorHalfWidth, c.halfWidth);
    const steps = Math.max(2, Math.ceil(c.halfWidth * 2 / 8));
    let wallCrossing = false;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = c.ax + (c.bx - c.ax) * t;
      const z = c.az + (c.bz - c.az) * t;
      maxRouteSlopeActual = Math.max(maxRouteSlopeActual, hf.slopeAt(x, z));
      if (terrainFlagsAt(arena.terrainFlags, hf, x, z) & TerrainFlag.CliffWall) wallCrossing = true;
    }
    if (wallCrossing) errors.push(`route: corridor ${c.edgeId} crosses a cliff wall`);
  }
  if (minCorridorHalfWidth < minHalfWidth - 1e-6) {
    errors.push(`route: corridor width ${minCorridorHalfWidth} below ${minHalfWidth}`);
  }
  if (maxRouteSlopeActual > maxRouteSlope * 1.15) {
    errors.push(`route: max slope ${maxRouteSlopeActual.toFixed(3)} above ${maxRouteSlope}`);
  }

  for (const r of [...zones.regions.filter((z) => z.tag === 'spawnSafe' || z.tag === 'enemyGate' || z.tag === 'recovery')]) {
    const reachable = graph.corridors.some(
      (c) => distToSegment(r.x, r.z, c.ax, c.az, c.bx, c.bz) <= 40,
    );
    if (!reachable) errors.push(`zone: ${r.id} (${r.tag}) is not reachable from routes`);
  }

  // Gate connectivity + spawn safety.
  for (const g of gates) {
    if (!pathToCenter(graph, g.nodeId, maxRouteSlope, minHalfWidth)) errors.push(`gate: ${g.id} has no valid route to center`);
    if (isCliffWallAt(arena.terrainFlags, hf, g.x, g.z)) errors.push(`gate: ${g.id} sits on a cliff wall`);
    if (terrainFlagsAt(arena.terrainFlags, hf, g.x, g.z) & TerrainFlag.CliffTop) errors.push(`gate: ${g.id} sits on a cliff top`);
  }
  for (const s of spawns) {
    if (hf.slopeAt(s.x, s.z) > rules.spawnMax) errors.push(`spawn: ${s.id} on steep ground`);
    if (isCliffWallAt(arena.terrainFlags, hf, s.x, s.z)) errors.push(`spawn: ${s.id} sits on a cliff wall`);
    if (terrainFlagsAt(arena.terrainFlags, hf, s.x, s.z) & TerrainFlag.CliffTop) errors.push(`spawn: ${s.id} sits on a cliff top`);
    if (gates.some((g) => Math.hypot(g.x - s.x, g.z - s.z) < 40)) {
      errors.push(`spawn: ${s.id} too close to a gate`);
    }
    let exits = 0;
    for (const c of graph.corridors) {
      if (distToSegment(s.x, s.z, c.ax, c.az, c.bx, c.bz) <= 25) exits++;
    }
    if (exits < 2) errors.push(`spawn: ${s.id} has fewer than two route exits`);
  }
  for (const r of recovery) {
    if (isCliffWallAt(arena.terrainFlags, hf, r.x, r.z)) errors.push(`recovery: ${r.id} sits on a cliff wall`);
    if (terrainFlagsAt(arena.terrainFlags, hf, r.x, r.z) & TerrainFlag.CliffTop) errors.push(`recovery: ${r.id} sits on a cliff top`);
  }

  // Cliff access corridors: every configured access must exist, be
  // driveable, and connect to the required route network.
  for (const feature of arena.cliffFeatures) {
    const corridors = arena.accessCorridors.filter((a) => a.featureId === feature.id);
    if (feature.accessCount > 0 && corridors.length === 0) {
      errors.push(`cliff: ${feature.id} configured access but no corridor exists`);
    }
    for (const a of corridors) {
      const steps = Math.max(3, Math.ceil(Math.hypot(a.bx - a.ax, a.bz - a.az) / 6));
      let worst = 0;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = a.ax + (a.bx - a.ax) * t;
        const z = a.az + (a.bz - a.az) * t;
        worst = Math.max(worst, hf.slopeAt(x, z));
        if (terrainFlagsAt(arena.terrainFlags, hf, x, z) & TerrainFlag.CliffWall) {
          errors.push(`cliff: access corridor ${a.edgeId} crosses a cliff wall`);
        }
      }
      if (worst > feature.accessMaxSlope * 1.3) {
        errors.push(`cliff: access corridor ${a.edgeId} slope ${worst.toFixed(2)} above ${feature.accessMaxSlope}`);
      }
      // The base must sit on driveable ground (the corridor itself is the
      // connection; routes may legally join it). Optional access roads that
      // lead to empty high ground are allowed to be off-network.
      const baseFlags = terrainFlagsAt(arena.terrainFlags, hf, a.bx, a.bz);
      if (baseFlags & (TerrainFlag.Blocked | TerrainFlag.CliffWall)) {
        errors.push(`cliff: access corridor ${a.edgeId} base is blocked`);
      }
    }
    if (feature.accessCount === 0) {
      const topRadius = feature.type === 'escarpment' ? feature.width : feature.radius;
      for (const s of spawns) {
        if (Math.hypot(s.x - feature.x, s.z - feature.z) < topRadius + feature.safetyBuffer) {
          errors.push(`cliff: ${feature.id} has no access but spawn ${s.id} is near its top`);
        }
      }
      for (const g of gates) {
        if (Math.hypot(g.x - feature.x, g.z - feature.z) < topRadius + feature.safetyBuffer) {
          errors.push(`cliff: ${feature.id} has no access but gate ${g.id} is near its top`);
        }
      }
      for (const r of recovery) {
        if (Math.hypot(r.x - feature.x, r.z - feature.z) < topRadius + feature.safetyBuffer) {
          errors.push(`cliff: ${feature.id} has no access but recovery ${r.id} is near its top`);
        }
      }
      if (objects.some((o) => Math.hypot(o.x - feature.x, o.z - feature.z) < topRadius)) {
        warnings.push(`cliff: ${feature.id} has no access but objects sit on its top (optional)`);
      }
    }
  }

  // Dead ends + loops.
  const degree = new Map<string, number>(graph.nodes.map((n) => [n.id, 0]));
  for (const e of graph.edges) {
    degree.set(e.a, (degree.get(e.a) ?? 0) + 1);
    degree.set(e.b, (degree.get(e.b) ?? 0) + 1);
  }
  let dead = 0;
  let count = 0;
  for (const n of graph.nodes) {
    if (n.tags.includes('gate')) continue;
    count++;
    if ((degree.get(n.id) ?? 0) <= 1) dead++;
  }
  const deadEndRatio = count === 0 ? 0 : dead / count;
  if (graph.loops < 2) errors.push(`route: only ${graph.loops} loop(s), need >= 2`);
  if (deadEndRatio > 0.35) errors.push(`route: dead-end ratio ${deadEndRatio.toFixed(2)} > 0.35`);

  // Placement overlap + route intrusion.
  const spatial = new SpatialHash({ cellSize: 16, minX: 0, minZ: 0, maxX: arena.widthMeters, maxZ: arena.depthMeters });
  for (const o of objects) spatial.insert(o.id, o.x, o.z);
  for (const o of objects) {
    for (const near of spatial.queryCircle(o.x, o.z, o.radius + 1)) {
      if (near <= o.id) continue;
      const other = objects.find((x) => x.id === near)!;
      if (Math.hypot(other.x - o.x, other.z - o.z) < o.radius + other.radius) {
        warnings.push(`furniture: ${o.id} overlaps ${near} (optional placement softened)`);
      }
    }
    if (o.collider) {
      const d = corridorDistance(graph, o.x, o.z);
      if (d < furnitureSet.routeClearance - 1) {
        errors.push(`furniture: ${o.id} intrudes a required route corridor`);
      }
    }
  }

  // Barrel layout.
  const barrels: BarrelLike[] = objects
    .filter((o) => o.kind === 'barrel')
    .map((o) => ({ id: o.id, x: o.x, z: o.z }));
  const barrelErrors = validateBarrelLayout({
    barrels,
    minSpacing: furnitureSet.barrel.minSpacing,
    chainRadius: furnitureSet.barrel.chainRadius,
    maxChain: densityProfile.budgets.maxBarrelChain,
    excluded: [
      ...spawns.map((s) => ({ id: s.id, x: s.x, z: s.z, radius: 20 })),
      ...recovery.map((r) => ({ id: r.id, x: r.x, z: r.z, radius: 12 })),
      ...ramps.map((r) => ({ id: r.id, x: r.landingX, z: r.landingZ, radius: 8 })),
    ],
    corridorDistance: (x, z) => corridorDistance(graph, x, z),
    routeClearance: furnitureSet.routeClearance,
  });
  warnings.push(...barrelErrors);
  const { maxSize: maxBarrelChain } = barrelComponents(barrels, furnitureSet.barrel.chainRadius);

  // Ramp revalidation.
  for (const ramp of ramps) {
    const landing = validateRamp(ramp, { hf, graph, widthMeters: arena.widthMeters, depthMeters: arena.depthMeters });
    if (!landing) {
      warnings.push(`ramp: ${ramp.id} skipped (failed approach/flight/landing validation)`);
      rampSkipped++;
    }
  }

  // Optional content soft-fail: underfilled furniture is a warning, not a
  // candidate killer; decorations never reject.
  for (const m of layout.placementMetrics) {
    if (m.kind !== 'decoration' && m.requested > 0 && m.placed < m.requested) {
      warnings.push(`furniture: ${m.kind} underfilled (${m.placed}/${m.requested})`);
    }
  }

  // Recovery availability.
  if (recovery.length < 2) errors.push(`recovery: only ${recovery.length} zones, need >= 2`);

  // Budgets.
  const counts = {
    barrels: barrels.length,
    crates: objects.filter((o) => o.kind === 'crate').length,
    ramps: ramps.length,
    medium: objects.filter((o) => o.kind === 'medium').length,
    decorations: objects.filter((o) => o.kind === 'decoration').length,
  };
  if (objects.length > densityProfile.budgets.maxObjects) errors.push(`budget: objects ${objects.length} > ${densityProfile.budgets.maxObjects}`);
  if (counts.barrels > densityProfile.budgets.maxBarrels) errors.push(`budget: barrels ${counts.barrels} > ${densityProfile.budgets.maxBarrels}`);
  if (counts.crates > densityProfile.budgets.maxCrates) errors.push(`budget: crates ${counts.crates} > ${densityProfile.budgets.maxCrates}`);
  if (counts.ramps > densityProfile.budgets.maxRamps) errors.push(`budget: ramps ${counts.ramps} > ${densityProfile.budgets.maxRamps}`);
  if (counts.medium > densityProfile.budgets.maxMedium) errors.push(`budget: medium ${counts.medium} > ${densityProfile.budgets.maxMedium}`);
  if (counts.decorations > densityProfile.budgets.maxDecorations) errors.push(`budget: decorations ${counts.decorations} > ${densityProfile.budgets.maxDecorations}`);
  const colliders = objects.filter((o) => o.collider).length;
  if (colliders > densityProfile.budgets.maxColliders) errors.push(`budget: colliders ${colliders} > ${densityProfile.budgets.maxColliders}`);

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    metrics: {
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      loops: graph.loops,
      deadEndRatio,
      minCorridorHalfWidth,
      maxRouteSlope: maxRouteSlopeActual,
      gateCount: gates.length,
      spawnCount: spawns.length,
      recoveryCount: recovery.length,
      rampCount: ramps.length,
      rampSkipped,
      objectCount: objects.length,
      colliderCount: colliders,
      maxBarrelChain,
    },
  };
}

type RouteGraphEdge = { a: string; b: string; slope: number; halfWidth: number };

function pathToCenter(
  graph: { centerNodeId: string; edges: RouteGraphEdge[] },
  start: string,
  maxRouteSlope: number,
  minHalfWidth: number,
): boolean {
  if (start === graph.centerNodeId) return true;
  const adjacency = new Map<string, RouteGraphEdge[]>();
  for (const e of graph.edges) {
    const list = adjacency.get(e.a) ?? [];
    list.push(e);
    adjacency.set(e.a, list);
    const listB = adjacency.get(e.b) ?? [];
    listB.push(e);
    adjacency.set(e.b, listB);
  }
  const queue = [start];
  const seen = new Set([start]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const e of adjacency.get(current) ?? []) {
      const next = e.a === current ? e.b : e.a;
      if (seen.has(next)) continue;
      if (e.slope > maxRouteSlope || e.halfWidth < minHalfWidth) continue;
      if (next === graph.centerNodeId) return true;
      seen.add(next);
      queue.push(next);
    }
  }
  return false;
}

function corridorDistance(
  graph: { corridors: Array<{ ax: number; az: number; bx: number; bz: number; halfWidth: number }> },
  x: number,
  z: number,
): number {
  let best = Infinity;
  for (const c of graph.corridors) {
    best = Math.min(best, distToSegment(x, z, c.ax, c.az, c.bx, c.bz) - c.halfWidth);
  }
  return best;
}

function emptyMetrics(): Phase2Metrics {
  return {
    nodeCount: 0,
    edgeCount: 0,
    loops: 0,
    deadEndRatio: 0,
    minCorridorHalfWidth: 0,
    maxRouteSlope: 0,
    gateCount: 0,
    spawnCount: 0,
    recoveryCount: 0,
    rampCount: 0,
    rampSkipped: 0,
    objectCount: 0,
    colliderCount: 0,
    maxBarrelChain: 0,
  };
}
