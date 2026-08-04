import type { EnemyState } from '../types';

/**
 * Core Loop 06 M5: uniform spatial hash for enemy area queries. All
 * collision/splash/contact queries route through this index instead of
 * scanning the whole population. Query outputs are written into caller
 * (or internal reusable) arrays so hot loops stay allocation-free.
 */
export class EnemySpatialIndex {
  private readonly cells = new Map<number, EnemyState[]>();
  private readonly cellSize: number;
  /** Reusable scratch used when the caller does not provide an output. */
  readonly results: EnemyState[] = [];

  constructor(cellSize = 6) {
    this.cellSize = Math.max(1, cellSize);
  }

  /** Rebuild the whole index from authoritative state (O(n), once per tick). */
  rebuild(enemies: readonly EnemyState[]): void {
    this.clear();
    for (const e of enemies) {
      if (!e.alive) continue;
      this.insert(e);
    }
  }

  clear(): void {
    this.cells.clear();
  }

  insert(enemy: EnemyState): void {
    const key = this.key(enemy.x, enemy.z);
    let bucket = this.cells.get(key);
    if (!bucket) {
      bucket = [];
      this.cells.set(key, bucket);
    }
    bucket.push(enemy);
  }

  remove(enemy: EnemyState): boolean {
    const key = this.key(enemy.x, enemy.z);
    const bucket = this.cells.get(key);
    if (!bucket) return false;
    const i = bucket.indexOf(enemy);
    if (i < 0) return false;
    bucket.splice(i, 1);
    if (bucket.length === 0) this.cells.delete(key);
    return true;
  }

  move(enemy: EnemyState, oldX: number, oldZ: number): void {
    if (this.key(oldX, oldZ) === this.key(enemy.x, enemy.z)) return;
    const oldKey = this.key(oldX, oldZ);
    const bucket = this.cells.get(oldKey);
    if (bucket) {
      const i = bucket.indexOf(enemy);
      if (i >= 0) {
        bucket.splice(i, 1);
        if (bucket.length === 0) this.cells.delete(oldKey);
      }
    }
    this.insert(enemy);
  }

  /** Circle query; writes into `out` when provided, else the shared scratch. */
  queryCircle(x: number, z: number, radius: number, out?: EnemyState[]): EnemyState[] {
    const target = out ?? this.results;
    target.length = 0;
    const r = Math.max(0, radius);
    const r2 = r * r;
    const minX = Math.floor((x - r) / this.cellSize);
    const maxX = Math.floor((x + r) / this.cellSize);
    const minZ = Math.floor((z - r) / this.cellSize);
    const maxZ = Math.floor((z + r) / this.cellSize);
    for (let cz = minZ; cz <= maxZ; cz++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const bucket = this.cells.get(this.keyFromCell(cx, cz));
        if (!bucket) continue;
        for (const e of bucket) {
          const dx = e.x - x;
          const dz = e.z - z;
          if (dx * dx + dz * dz <= r2) target.push(e);
        }
      }
    }
    return target;
  }

  /** AABB query; writes into `out` when provided, else the shared scratch. */
  queryAabb(minX: number, minZ: number, maxX: number, maxZ: number, out?: EnemyState[]): EnemyState[] {
    const target = out ?? this.results;
    target.length = 0;
    const cMinX = Math.floor(minX / this.cellSize);
    const cMaxX = Math.floor(maxX / this.cellSize);
    const cMinZ = Math.floor(minZ / this.cellSize);
    const cMaxZ = Math.floor(maxZ / this.cellSize);
    for (let cz = cMinZ; cz <= cMaxZ; cz++) {
      for (let cx = cMinX; cx <= cMaxX; cx++) {
        const bucket = this.cells.get(this.keyFromCell(cx, cz));
        if (!bucket) continue;
        for (const e of bucket) {
          if (e.x >= minX && e.x <= maxX && e.z >= minZ && e.z <= maxZ) target.push(e);
        }
      }
    }
    return target;
  }

  /** Cells touched by a ray segment (used for line-of-sight-style queries). */
  queryRayCells(ax: number, az: number, bx: number, bz: number, out?: EnemyState[]): EnemyState[] {
    const target = out ?? this.results;
    target.length = 0;
    const dx = bx - ax;
    const dz = bz - az;
    const dist = Math.max(1, Math.hypot(dx, dz));
    const steps = Math.max(2, Math.min(64, Math.ceil(dist / this.cellSize)));
    const seen = new Set<EnemyState>();
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = ax + dx * t;
      const z = az + dz * t;
      const bucket = this.cells.get(this.key(x, z));
      if (!bucket) continue;
      for (const e of bucket) {
        if (!seen.has(e)) {
          seen.add(e);
          target.push(e);
        }
      }
    }
    return target;
  }

  get cellCount(): number {
    return this.cells.size;
  }

  private key(x: number, z: number): number {
    return this.keyFromCell(Math.floor(x / this.cellSize), Math.floor(z / this.cellSize));
  }

  private keyFromCell(cx: number, cz: number): number {
    // Bijective-ish 32-bit hash of the cell pair (deterministic).
    const h = (cx * 0x9e3779b1) ^ (cz * 0x85ebca77);
    return h >>> 0;
  }
}
