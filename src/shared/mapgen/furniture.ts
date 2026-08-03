/**
 * Ordered furniture placement: large obstacles -> barrels -> crates ->
 * medium furniture -> decorations. Every authoritative placement uses the
 * spatial hash for overlap/spacing and rejects required-corridor intrusion
 * and exclusion zones (spawns, gates, landings, recovery).
 */
import type { Rng } from './prng';
import type { Heightfield } from './heightfield';
import type { RouteGraph } from './routes';
import { distToSegment } from './routes';
import type { ZoneGrid, ZoneRegion, ZoneTag } from './zones';
import { findRegions } from './zones';
import type { PlayerSpawn, HordeGate } from './spawns';
import type { GeneratedRamp } from './ramps';
import { SpatialHash } from './spatial';

export type FurnitureKind = 'largeObstacle' | 'barrel' | 'crate' | 'ramp' | 'medium' | 'decoration';

export interface FurnitureEntryDef {
  kind: FurnitureKind;
  assetId: string;
  obstacleType?: string;
  count: number;
  minSpacing: number;
  clearance: number;
  zoneTags: ZoneTag[];
  slopeMax: number;
  collider: boolean;
}

export interface GeneratedObject {
  id: string;
  kind: FurnitureKind;
  assetId: string;
  obstacleType?: string;
  x: number;
  z: number;
  yaw: number;
  w?: number;
  d?: number;
  h?: number;
  radius: number;
  collider: boolean;
  zoneTag: ZoneTag;
}

export interface Exclusion {
  id: string;
  x: number;
  z: number;
  radius: number;
}

export interface FurnitureOptions {
  rng: Rng;
  hf: Heightfield;
  graph: RouteGraph;
  zoneGrid: ZoneGrid;
  regions: ZoneRegion[];
  spawns: PlayerSpawn[];
  gates: HordeGate[];
  ramps: GeneratedRamp[];
  recovery: ZoneRegion[];
  widthMeters: number;
  depthMeters: number;
  routeClearance: number;
  entries: FurnitureEntryDef[];
  budgets: {
    maxObjects: number;
    maxColliders: number;
    maxBarrels: number;
    maxCrates: number;
    maxMedium: number;
    maxDecorations: number;
  };
}

const OBJECT_SIZE: Record<FurnitureKind, { w: [number, number]; d: [number, number]; h: [number, number]; radius: number }> = {
  largeObstacle: { w: [5, 9], d: [4, 8], h: [2.2, 4.5], radius: 3 },
  barrel: { w: [1, 1], d: [1, 1], h: [1, 1.2], radius: 1 },
  crate: { w: [2, 3], d: [2, 3], h: [1.4, 2.2], radius: 1.5 },
  medium: { w: [3, 5], d: [3, 5], h: [1.4, 2.6], radius: 2 },
  decoration: { w: [0.8, 1.4], d: [0.8, 1.4], h: [0.8, 1.6], radius: 0.7 },
  ramp: { w: [8, 12], d: [8, 14], h: [1, 2.5], radius: 4 },
};

export function placeFurniture(options: FurnitureOptions): GeneratedObject[] {
  const spatial = new SpatialHash({
    cellSize: 8,
    minX: 0,
    minZ: 0,
    maxX: options.widthMeters,
    maxZ: options.depthMeters,
  });
  const objects: GeneratedObject[] = [];
  const counts = { largeObstacle: 0, barrel: 0, crate: 0, medium: 0, decoration: 0, ramp: 0 };

  const exclusions: Exclusion[] = [
    ...options.spawns.map((s) => ({ id: `spawnSafe.${s.id}`, x: s.x, z: s.z, radius: 12 })),
    ...options.gates.map((g) => ({ id: `enemyGate.${g.id}`, x: g.x, z: g.z, radius: 10 })),
    ...options.recovery.map((r) => ({ id: r.id, x: r.x, z: r.z, radius: 12 })),
    ...options.ramps.map((r) => ({ id: `landing.${r.id}`, x: r.landingX, z: r.landingZ, radius: 7 })),
  ];

  const corridorDistance = (x: number, z: number): number => {
    let best = Infinity;
    for (const c of options.graph.corridors) {
      best = Math.min(best, distToSegment(x, z, c.ax, c.az, c.bx, c.bz) - c.halfWidth);
    }
    return best;
  };

  const order: FurnitureKind[] = ['largeObstacle', 'barrel', 'crate', 'medium', 'decoration'];
  for (const kind of order) {
    const entry = options.entries.find((e) => e.kind === kind);
    if (!entry || entry.count <= 0) continue;
    const size = OBJECT_SIZE[kind];
    const budgetKey =
      kind === 'largeObstacle' ? 'maxObjects' :
      kind === 'barrel' ? 'maxBarrels' :
      kind === 'crate' ? 'maxCrates' :
      kind === 'medium' ? 'maxMedium' : 'maxDecorations';
    const budget = options.budgets[budgetKey];
    const target = Math.min(entry.count, budget);
    const regionPool = entry.zoneTags.flatMap((tag) => findRegions(options.regions, tag));
    const attempts = target * 24;
    for (let i = 0; i < attempts && counts[kind] < target; i++) {
      const candidate = sampleCandidate(options.rng, entry, regionPool, options);
      if (!candidate) continue;
      const { x, z } = candidate;
      const margin = 6;
      if (x < margin || x > options.widthMeters - margin || z < margin || z > options.depthMeters - margin) continue;
      if (options.hf.slopeAt(x, z) > entry.slopeMax) continue;
      if (!pointHasZoneTag(options, entry.zoneTags, x, z)) continue;
      if (exclusions.some((e) => Math.hypot(e.x - x, e.z - z) < e.radius + size.radius)) continue;
      if (corridorDistance(x, z) < options.routeClearance) continue;
      const minGap = entry.minSpacing + size.radius;
      let spaced = true;
      for (const near of spatial.queryCircle(x, z, minGap)) {
        const other = objects.find((o) => o.id === near)!;
        if (Math.hypot(other.x - x, other.z - z) < (entry.minSpacing + other.radius)) {
          spaced = false;
          break;
        }
      }
      if (!spaced) continue;
      const w = size.w[0] + (size.w[1] - size.w[0]) * options.rng();
      const d = size.d[0] + (size.d[1] - size.d[0]) * options.rng();
      const h = size.h[0] + (size.h[1] - size.h[0]) * options.rng();
      const obj: GeneratedObject = {
        id: `${kind}.${counts[kind]}`,
        kind,
        assetId: entry.assetId,
        obstacleType: entry.obstacleType,
        x,
        z,
        yaw: options.rng() * Math.PI,
        w,
        d,
        h,
        radius: size.radius,
        collider: entry.collider,
        zoneTag: options.zoneGrid.tagAt(x, z),
      };
      spatial.insert(obj.id, x, z);
      objects.push(obj);
      counts[kind]++;
      if (obj.collider && objects.filter((o) => o.collider).length >= options.budgets.maxColliders) break;
    }
  }
  return objects;
}

function sampleCandidate(
  rng: Rng,
  entry: FurnitureEntryDef,
  regionPool: ZoneRegion[],
  options: Pick<FurnitureOptions, 'widthMeters' | 'depthMeters'>,
): { x: number; z: number } | null {
  if (regionPool.length > 0) {
    const region = regionPool[Math.floor(rng() * regionPool.length)];
    const angle = rng() * Math.PI * 2;
    const radius = rng() * Math.max(1, region.radius);
    return {
      x: region.x + Math.cos(angle) * radius,
      z: region.z + Math.sin(angle) * radius,
    };
  }
  if (entry.zoneTags.includes('flat') || entry.zoneTags.length === 0) {
    return {
      x: rng() * options.widthMeters,
      z: rng() * options.depthMeters,
    };
  }
  return null;
}

function pointHasZoneTag(
  options: Pick<FurnitureOptions, 'regions' | 'zoneGrid'>,
  tags: ZoneTag[],
  x: number,
  z: number,
): boolean {
  for (const tag of tags) {
    for (const r of options.regions) {
      if (r.tag === tag && Math.hypot(r.x - x, r.z - z) <= r.radius) return true;
    }
    if (options.zoneGrid.tagAt(x, z) === tag) return true;
  }
  return false;
}
