import type { ArenaWorld } from '../sim/arenaWorld';

/**
 * Core Loop 06 M4: terrain-aware spawn anchors derived deterministically
 * from the generated arena layout. Anchors are derived at runtime from
 * validated map metadata (gates, zones, cliff edges, route corridors) so
 * map checksums stay stable while horde spawning becomes terrain-aware.
 */
export type SpawnAnchorType =
  | 'perimeter'
  | 'regional'
  | 'accessRoad'
  | 'valley'
  | 'cliffTop'
  | 'cliffBottom'
  | 'eliteFormation'
  | 'boss'
  | 'specialist';

export interface SpawnAnchor {
  id: string;
  type: SpawnAnchorType;
  x: number;
  z: number;
  regionId: string | null;
  terrainTag: string;
  tags: string[];
  capacity: number;
  minTankDistance: number;
  maxTankDistance: number;
  /** Static 0..1 exposure heuristic (1 = farthest from map center). */
  cameraExposure: number;
  /** Authoritative sim time of the last accepted plan (mutated by planner). */
  lastUsedAt: number;
  reachable: boolean;
}

export interface SpawnAnchorSet {
  anchors: SpawnAnchor[];
}

export function buildSpawnAnchors(world: ArenaWorld): SpawnAnchorSet {
  const anchors: SpawnAnchor[] = [];
  const layout = world.arena?.layout;
  const arena = world.arena;
  const ox = arena?.originX ?? 0;
  const oz = arena?.originZ ?? 0;
  const toWorld = (x: number, z: number): { x: number; z: number } => ({ x: x + ox, z: z + oz });
  const bounds = world.bounds ?? {
    minX: -world.half,
    maxX: world.half,
    minZ: -world.half,
    maxZ: world.half,
  };
  const half = Math.max(1, (bounds.maxX - bounds.minX) / 2);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;
  const exposure = (x: number, z: number): number =>
    Math.min(1, Math.hypot(x - centerX, z - centerZ) / Math.max(1, half * 0.9));
  const add = (anchor: SpawnAnchor): void => {
    const dup = anchors.some(
      (a) => a.type === anchor.type && Math.hypot(a.x - anchor.x, a.z - anchor.z) < 8,
    );
    if (!dup) anchors.push(anchor);
  };

  // Perimeter anchors from validated horde gates (existing map metadata).
  for (const gate of layout?.gates ?? []) {
    const p = toWorld(gate.x, gate.z);
    add({
      id: gate.id,
      type: 'perimeter',
      x: p.x,
      z: p.z,
      regionId: null,
      terrainTag: zoneTagAt(world, gate.x, gate.z),
      tags: ['perimeter', 'edge', 'gate'],
      capacity: 24,
      minTankDistance: 22,
      maxTankDistance: 160,
      cameraExposure: exposure(p.x, p.z),
      lastUsedAt: -Infinity,
      reachable: gateReachable(world, p.x, p.z),
    });
  }

  // Regional anchors from semantic zone regions (valley/basin/highland).
  for (const region of layout?.zones.regions ?? []) {
    if (region.tag === 'spawnSafe' || region.tag === 'recovery') continue;
    const p = toWorld(region.x, region.z);
    const type: SpawnAnchorType =
      region.tag === 'valley' ? 'valley' : region.tag === 'resource' ? 'regional' : 'regional';
    add({
      id: region.id,
      type,
      x: p.x,
      z: p.z,
      regionId: region.id,
      terrainTag: region.tag,
      tags: ['regional', region.tag, type],
      capacity: Math.max(4, Math.min(20, Math.floor(region.radius / 3))),
      minTankDistance: 20,
      maxTankDistance: 120,
      cameraExposure: exposure(p.x, p.z),
      lastUsedAt: -Infinity,
      reachable: pointReachable(world, p.x, p.z),
    });
  }

  // Cliff top/bottom anchors from validated cliff edge segments. Only
  // features with a carved access corridor are used (not trapped tops).
  const accessedFeatureIds = new Set((world.arena?.accessCorridors ?? []).map((c) => c.featureId));
  for (const edge of arena?.cliffEdges ?? []) {
    if (!accessedFeatureIds.has(edge.featureId)) continue;
    const mx = (edge.ax + edge.bx) / 2;
    const mz = (edge.az + edge.bz) / 2;
    const len = Math.hypot(edge.bx - edge.ax, edge.bz - edge.az);
    const nx = len > 0 ? (edge.normalX ?? 0) : 0;
    const nz = len > 0 ? (edge.normalZ ?? 0) : 0;
    const top = toWorld(mx + nx * 6, mz + nz * 6);
    const bottom = toWorld(mx - nx * 8, mz - nz * 8);
    add({
      id: `anchor.cliffTop.${edge.id}`,
      type: 'cliffTop',
      x: top.x,
      z: top.z,
      regionId: edge.featureId,
      terrainTag: 'highland',
      tags: ['cliff', 'highland', 'top'],
      capacity: 12,
      minTankDistance: 30,
      maxTankDistance: 140,
      cameraExposure: exposure(top.x, top.z),
      lastUsedAt: -Infinity,
      reachable: true,
    });
    add({
      id: `anchor.cliffBottom.${edge.id}`,
      type: 'cliffBottom',
      x: bottom.x,
      z: bottom.z,
      regionId: edge.featureId,
      terrainTag: 'flat',
      tags: ['cliff', 'bottom'],
      capacity: 16,
      minTankDistance: 20,
      maxTankDistance: 110,
      cameraExposure: exposure(bottom.x, bottom.z),
      lastUsedAt: -Infinity,
      reachable: true,
    });
  }

  // Access-road anchors along carved route corridors (spaced midpoints).
  for (const corridor of layout?.graph.corridors ?? []) {
    const mx = (corridor.ax + corridor.bx) / 2;
    const mz = (corridor.az + corridor.bz) / 2;
    const p = toWorld(mx, mz);
    add({
      id: `anchor.road.${corridor.edgeId}`,
      type: 'accessRoad',
      x: p.x,
      z: p.z,
      regionId: null,
      terrainTag: zoneTagAt(world, mx, mz),
      tags: ['road', 'access', 'route'],
      capacity: 20,
      minTankDistance: 18,
      maxTankDistance: 130,
      cameraExposure: exposure(p.x, p.z),
      lastUsedAt: -Infinity,
      reachable: true,
    });
  }

  // Elite/boss/specialist anchors: farthest valid perimeter + regional
  // anchors (authoritative gameplay uses these for crisis leaders).
  const sorted = [...anchors].sort(
    (a, b) => b.cameraExposure - a.cameraExposure || a.id.localeCompare(b.id),
  );
  const perimeter = sorted.find((a) => a.type === 'perimeter');
  const regional = sorted.find((a) => a.type === 'regional' || a.type === 'valley');
  if (perimeter) {
    add({
      ...perimeter,
      id: `anchor.elite.${perimeter.id}`,
      type: 'eliteFormation',
      tags: [...perimeter.tags, 'elite', 'formation'],
      capacity: 8,
      minTankDistance: 35,
      maxTankDistance: 150,
    });
  }
  if (perimeter) {
    add({
      ...perimeter,
      id: `anchor.boss.${perimeter.id}`,
      type: 'boss',
      tags: [...perimeter.tags, 'boss'],
      capacity: 10,
      minTankDistance: 40,
      maxTankDistance: 170,
    });
  }
  if (regional) {
    add({
      ...regional,
      id: `anchor.specialist.${regional.id}`,
      type: 'specialist',
      tags: [...regional.tags, 'specialist'],
      capacity: 6,
      minTankDistance: 25,
      maxTankDistance: 100,
    });
  }

  return { anchors };
}

function zoneTagAt(world: ArenaWorld, x: number, z: number): string {
  return world.arena?.layout?.zones.grid.tagAt(x, z) ?? 'flat';
}

function gateReachable(world: ArenaWorld, x: number, z: number): boolean {
  return pointReachable(world, x, z);
}

function pointReachable(world: ArenaWorld, x: number, z: number): boolean {
  const layout = world.arena?.layout;
  if (!layout) return true;
  const ox = world.arena?.originX ?? 0;
  const oz = world.arena?.originZ ?? 0;
  for (const corridor of layout.graph.corridors) {
    if (distToSegment(x, z, corridor.ax + ox, corridor.az + oz, corridor.bx + ox, corridor.bz + oz) <= 24) return true;
  }
  for (const node of layout.graph.nodes) {
    if (Math.hypot(node.x + ox - x, node.z + oz - z) <= 30) return true;
  }
  return false;
}

function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}
