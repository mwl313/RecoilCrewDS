/**
 * Semantic zone classification for generated maps.
 *
 * A coarse zone grid (25 m cells) labels every cell with a primary tag, and
 * ZoneRegion records carry the gameplay-facing regions (openCombat,
 * rampPark, resource, spawnSafe, enemyGate, recovery). Placement and future
 * gameplay request tags instead of fixed coordinates.
 */
import type { Heightfield } from './heightfield';
import type { MacroFeatureRecord } from './features';
import type { RouteGraph } from './routes';
import { distToSegment } from './routes';

export const ZONE_TAGS = [
  'flat',
  'slope',
  'highland',
  'valley',
  'basin',
  'transit',
  'openCombat',
  'rampPark',
  'resource',
  'spawnSafe',
  'enemyGate',
  'recovery',
] as const;

export type ZoneTag = (typeof ZONE_TAGS)[number];

export interface ZoneRegion {
  id: string;
  tag: ZoneTag;
  x: number;
  z: number;
  radius: number;
}

export class ZoneGrid {
  readonly cellSize: number;
  readonly cellsX: number;
  readonly cellsZ: number;
  readonly tags: Uint8Array;
  private readonly tagIndex = new Map<ZoneTag, number>(ZONE_TAGS.map((t, i) => [t, i]));

  constructor(cellSize: number, widthMeters: number, depthMeters: number) {
    this.cellSize = cellSize;
    this.cellsX = Math.round(widthMeters / cellSize);
    this.cellsZ = Math.round(depthMeters / cellSize);
    this.tags = new Uint8Array(this.cellsX * this.cellsZ);
  }

  setTagAt(x: number, z: number, tag: ZoneTag): void {
    const xi = Math.floor(x / this.cellSize);
    const zi = Math.floor(z / this.cellSize);
    if (xi < 0 || xi >= this.cellsX || zi < 0 || zi >= this.cellsZ) return;
    this.tags[zi * this.cellsX + xi] = this.tagIndex.get(tag)!;
  }

  tagAt(x: number, z: number): ZoneTag {
    const xi = Math.max(0, Math.min(this.cellsX - 1, Math.floor(x / this.cellSize)));
    const zi = Math.max(0, Math.min(this.cellsZ - 1, Math.floor(z / this.cellSize)));
    return ZONE_TAGS[this.tags[zi * this.cellsX + xi]];
  }
}

export interface ZoneClassification {
  grid: ZoneGrid;
  regions: ZoneRegion[];
  openCombatRegions: ZoneRegion[];
}

export function classifyZones(options: {
  hf: Heightfield;
  graph: RouteGraph;
  features: MacroFeatureRecord[];
  widthMeters: number;
  depthMeters: number;
}): ZoneClassification {
  const grid = new ZoneGrid(25, options.widthMeters, options.depthMeters);
  const regions: ZoneRegion[] = [];
  let regionId = 0;
  const addRegion = (tag: ZoneTag, x: number, z: number, radius: number) => {
    regions.push({ id: `zone.${regionId++}`, tag, x, z, radius });
  };

  // Basin regions from basin features.
  for (const f of options.features) {
    if (f.type === 'basin') addRegion('basin', f.x, f.z, f.radius);
    if (f.type === 'plateau') addRegion('resource', f.x, f.z, f.radius * 0.8);
    if (f.type === 'valley') addRegion('valley', f.x, f.z, f.width);
  }

  // Primary tag per cell.
  for (let zi = 0; zi < grid.cellsZ; zi++) {
    for (let xi = 0; xi < grid.cellsX; xi++) {
      const x = (xi + 0.5) * grid.cellSize;
      const z = (zi + 0.5) * grid.cellSize;
      let tag: ZoneTag = 'flat';
      const slope = options.hf.slopeAt(x, z);
      const h = options.hf.heightAt(x, z);
      const inCorridor = options.graph.corridors.some(
        (c) => distToSegment(x, z, c.ax, c.az, c.bx, c.bz) <= c.halfWidth,
      );
      const nearBasin = regions.some(
        (r) => r.tag === 'basin' && Math.hypot(r.x - x, r.z - z) <= r.radius,
      );
      const nearValley = regions.some(
        (r) => r.tag === 'valley' && Math.hypot(r.x - x, r.z - z) <= r.radius,
      );
      if (inCorridor) tag = 'transit';
      else if (nearBasin) tag = 'basin';
      else if (h >= 3 && slope <= 0.2) tag = 'highland';
      else if (nearValley || h <= -1.5) tag = 'valley';
      else if (slope > 0.15) tag = 'slope';
      grid.setTagAt(x, z, tag);
    }
  }

  // Open combat: connected flat cell components of meaningful size.
  const openCombatRegions = findOpenCombatRegions(grid);
  for (const r of openCombatRegions) regions.push(r);

  return { grid, regions, openCombatRegions };
}

/** Flat cell components (4-neighbour flood fill) with area >= 4 cells. */
function findOpenCombatRegions(grid: ZoneGrid): ZoneRegion[] {
  const visited = new Uint8Array(grid.tags.length);
  const out: ZoneRegion[] = [];
  let id = 0;
  const stack: number[] = [];
  for (let i = 0; i < grid.tags.length; i++) {
    if (visited[i] || grid.tags[i] !== ZONE_TAGS.indexOf('flat')) continue;
    stack.push(i);
    visited[i] = 1;
    let sumX = 0;
    let sumZ = 0;
    let count = 0;
    while (stack.length > 0) {
      const idx = stack.pop()!;
      const xi = idx % grid.cellsX;
      const zi = Math.floor(idx / grid.cellsX);
      sumX += (xi + 0.5) * grid.cellSize;
      sumZ += (zi + 0.5) * grid.cellSize;
      count++;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = xi + dx;
        const nz = zi + dz;
        if (nx < 0 || nx >= grid.cellsX || nz < 0 || nz >= grid.cellsZ) continue;
        const nIdx = nz * grid.cellsX + nx;
        if (visited[nIdx] || grid.tags[nIdx] !== ZONE_TAGS.indexOf('flat')) continue;
        visited[nIdx] = 1;
        stack.push(nIdx);
      }
    }
    if (count >= 4) {
      out.push({
        id: `openCombat.${id++}`,
        tag: 'openCombat',
        x: sumX / count,
        z: sumZ / count,
        radius: Math.sqrt(count) * grid.cellSize * 0.7,
      });
    }
  }
  return out;
}

export function findRegions(regions: ZoneRegion[], tag: ZoneTag): ZoneRegion[] {
  return regions.filter((r) => r.tag === tag);
}
