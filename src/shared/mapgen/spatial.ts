/**
 * Deterministic spatial hash for mapgen placement and nearby queries.
 *
 * Objects are bucketed by cell; circle/rectangle queries visit only the
 * intersecting buckets. Iteration order is deterministic (sorted bucket
 * keys, sorted ids) so generation is reproducible across Node/browser.
 */

export interface SpatialEntry {
  id: string;
  x: number;
  z: number;
}

export class SpatialHash {
  private readonly buckets = new Map<string, SpatialEntry[]>();
  private readonly byId = new Map<string, SpatialEntry>();
  readonly cellSize: number;
  readonly minX: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxZ: number;

  constructor(options: {
    cellSize: number;
    minX: number;
    minZ: number;
    maxX: number;
    maxZ: number;
  }) {
    this.cellSize = options.cellSize;
    this.minX = options.minX;
    this.minZ = options.minZ;
    this.maxX = options.maxX;
    this.maxZ = options.maxZ;
  }

  insert(id: string, x: number, z: number): void {
    this.byId.set(id, { id, x, z });
    for (const key of this.bucketKeysFor(x, z, 0)) {
      const list = this.buckets.get(key) ?? [];
      list.push({ id, x, z });
      this.buckets.set(key, list);
    }
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  get(id: string): SpatialEntry | undefined {
    return this.byId.get(id);
  }

  get size(): number {
    return this.byId.size;
  }

  /** All ids whose entry is within `radius` of (x, z), sorted. */
  queryCircle(x: number, z: number, radius: number): string[] {
    const out = new Set<string>();
    for (const key of this.bucketKeysFor(x, z, radius)) {
      for (const entry of this.buckets.get(key) ?? []) {
        const dx = entry.x - x;
        const dz = entry.z - z;
        if (dx * dx + dz * dz <= radius * radius) out.add(entry.id);
      }
    }
    return [...out].sort();
  }

  /** All entries in buckets overlapping the axis-aligned rectangle, sorted. */
  queryRect(x0: number, z0: number, x1: number, z1: number): string[] {
    const out = new Set<string>();
    const minBx = Math.floor(Math.min(x0, x1) / this.cellSize);
    const maxBx = Math.floor(Math.max(x0, x1) / this.cellSize);
    const minBz = Math.floor(Math.min(z0, z1) / this.cellSize);
    const maxBz = Math.floor(Math.max(z0, z1) / this.cellSize);
    for (let bz = minBz; bz <= maxBz; bz++) {
      for (let bx = minBx; bx <= maxBx; bx++) {
        for (const entry of this.buckets.get(`${bx},${bz}`) ?? []) {
          if (entry.x >= Math.min(x0, x1) && entry.x <= Math.max(x0, x1) &&
              entry.z >= Math.min(z0, z1) && entry.z <= Math.max(z0, z1)) {
            out.add(entry.id);
          }
        }
      }
    }
    return [...out].sort();
  }

  /** Nearest entry distance to (x, z) within the query radius (∞ if none). */
  nearestDistance(x: number, z: number, radius: number): number {
    let best = Infinity;
    for (const id of this.queryCircle(x, z, radius)) {
      const e = this.byId.get(id)!;
      const d = Math.hypot(e.x - x, e.z - z);
      if (d < best) best = d;
    }
    return best;
  }

  /** Deterministic snapshot of all entries. */
  entries(): SpatialEntry[] {
    return [...this.byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  clear(): void {
    this.buckets.clear();
    this.byId.clear();
  }

  private bucketKeysFor(x: number, z: number, radius: number): string[] {
    const bx = Math.floor(x / this.cellSize);
    const bz = Math.floor(z / this.cellSize);
    const span = Math.max(0, Math.ceil(radius / this.cellSize));
    const keys: string[] = [];
    for (let dz = -span; dz <= span; dz++) {
      for (let dx = -span; dx <= span; dx++) {
        keys.push(`${bx + dx},${bz + dz}`);
      }
    }
    return keys.sort();
  }
}
