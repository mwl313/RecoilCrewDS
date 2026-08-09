import type { ArenaWorld } from '../sim/arenaWorld';
import type { HordeNavigationPolicyDefinition } from '../content/schemas/horde';
import { TerrainFlag } from '../mapgen/terrainFlags';

/**
 * Core Loop 06 M7: one low-resolution reverse flow field from the tank.
 * Ordinary horde enemies read `direction()` instead of running individual
 * A*. The field is rebuilt at most `fieldRefreshHz` times per second and
 * whenever the tank crosses into a new traversal cell.
 */
export interface FlowFieldCell {
  cost: number;
  dirX: number;
  dirZ: number;
  bestNeighbour: number;
  terrain: number;
  region: number;
}

export class HordeFlowField {
  readonly cellSize: number;
  readonly cellsX: number;
  readonly cellsZ: number;
  private readonly costs = new Float32Array(0);
  private readonly dirX = new Float32Array(0);
  private readonly dirZ = new Float32Array(0);
  private readonly best = new Int32Array(0);
  private readonly terrain = new Uint8Array(0);
  private readonly region = new Uint32Array(0);
  private lastTankCellX = Infinity;
  private lastTankCellZ = Infinity;
  private refreshCooldown = 0;
  private readonly minX: number;
  private readonly minZ: number;

  constructor(
    private readonly world: ArenaWorld,
    private readonly policy: HordeNavigationPolicyDefinition,
  ) {
    this.cellSize = Math.max(1, policy.cellSize);
    const bounds = world.bounds ?? {
      minX: -world.half,
      maxX: world.half,
      minZ: -world.half,
      maxZ: world.half,
    };
    this.minX = bounds.minX;
    this.minZ = bounds.minZ;
    this.cellsX = Math.max(2, Math.ceil((bounds.maxX - bounds.minX) / this.cellSize));
    this.cellsZ = Math.max(2, Math.ceil((bounds.maxZ - bounds.minZ) / this.cellSize));
    const n = this.cellsX * this.cellsZ;
    this.costs = new Float32Array(n);
    this.dirX = new Float32Array(n);
    this.dirZ = new Float32Array(n);
    this.best = new Int32Array(n);
    this.terrain = new Uint8Array(n);
    this.region = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      this.costs[i] = Infinity;
      this.best[i] = -1;
    }
    this.computeTerrain();
  }

  /**
   * Refresh when the tank enters a new cell, crosses a region, or the
   * rate limit allows. Returns true when the field was rebuilt.
   */
  update(tankX: number, tankZ: number, dt: number): boolean {
    this.refreshCooldown -= dt;
    const cx = this.cellX(tankX);
    const cz = this.cellZ(tankZ);
    if (cx === this.lastTankCellX && cz === this.lastTankCellZ && this.refreshCooldown > 0) return false;
    this.lastTankCellX = cx;
    this.lastTankCellZ = cz;
    this.refreshCooldown = 1 / Math.max(0.5, this.policy.fieldRefreshHz);
    this.rebuild(tankX, tankZ);
    return true;
  }

  /** Persistent recovery may request an immediate route refresh. */
  forceRefresh(tankX: number, tankZ: number): void {
    this.lastTankCellX = this.cellX(tankX);
    this.lastTankCellZ = this.cellZ(tankZ);
    this.refreshCooldown = 1 / Math.max(0.5, this.policy.fieldRefreshHz);
    this.rebuild(tankX, tankZ);
  }

  direction(x: number, z: number): { x: number; z: number } | null {
    const i = this.indexAt(x, z);
    if (i < 0 || !Number.isFinite(this.costs[i])) return null;
    return { x: this.dirX[i], z: this.dirZ[i] };
  }

  costAt(x: number, z: number): number {
    const i = this.indexAt(x, z);
    return i < 0 ? Infinity : this.costs[i];
  }

  regionAt(x: number, z: number): number {
    const i = this.indexAt(x, z);
    return i < 0 ? 0 : this.region[i];
  }

  terrainAt(x: number, z: number): number {
    const i = this.indexAt(x, z);
    return i < 0 ? 1 : this.terrain[i];
  }

  bestNeighbourIndex(x: number, z: number): number {
    const i = this.indexAt(x, z);
    return i < 0 ? -1 : this.best[i];
  }

  private rebuild(tankX: number, tankZ: number): void {
    const n = this.cellsX * this.cellsZ;
    for (let i = 0; i < n; i++) {
      this.costs[i] = Infinity;
      this.best[i] = -1;
      this.dirX[i] = 0;
      this.dirZ[i] = 0;
    }
    const start = this.indexAt(tankX, tankZ);
    if (start < 0) return;
    // Multi-source BFS over 8-connected driveable cells. Cost is metres
    // plus a terrain penalty for risky cells; walls are impassable.
    const queue = new Int32Array(n);
    let head = 0;
    let tail = 0;
    this.costs[start] = 0;
    queue[tail++] = start;
    const terrainCost = [1, 1, 1.5, Infinity, Infinity];
    while (head < tail) {
      const cur = queue[head++];
      const cx = cur % this.cellsX;
      const cz = Math.floor(cur / this.cellsX);
      const cost = this.costs[cur];
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dz === 0) continue;
          const nx = cx + dx;
          const nz = cz + dz;
          if (nx < 0 || nx >= this.cellsX || nz < 0 || nz >= this.cellsZ) continue;
          const ni = nz * this.cellsX + nx;
          const t = this.terrain[ni];
          const step = terrainCost[t] ?? 1;
          if (!Number.isFinite(step)) continue;
          const diag = dx !== 0 && dz !== 0;
          const nc = cost + (diag ? Math.SQRT2 : 1) * this.cellSize * step;
          if (nc < this.costs[ni]) {
            this.costs[ni] = nc;
            this.best[ni] = cur;
            queue[tail++] = ni;
          }
        }
      }
    }
    // Derive flow direction from the best neighbour (points downhill).
    for (let zi = 0; zi < this.cellsZ; zi++) {
      for (let xi = 0; xi < this.cellsX; xi++) {
        const i = zi * this.cellsX + xi;
        if (!Number.isFinite(this.costs[i])) continue;
        const b = this.best[i];
        if (b < 0) continue;
        const bx = b % this.cellsX;
        const bz = Math.floor(b / this.cellsX);
        const len = Math.hypot(bx - xi, bz - zi) || 1;
        this.dirX[i] = (bx - xi) / len;
        this.dirZ[i] = (bz - zi) / len;
      }
    }
    this.labelRegions();
  }

  private labelRegions(): void {
    const n = this.cellsX * this.cellsZ;
    let regionId = 0;
    for (let i = 0; i < n; i++) {
      if (!Number.isFinite(this.costs[i]) || this.region[i] !== 0) continue;
      regionId++;
      const queue = new Int32Array(n);
      let head = 0;
      let tail = 0;
      queue[tail++] = i;
      this.region[i] = regionId;
      while (head < tail) {
        const cur = queue[head++];
        const cx = cur % this.cellsX;
        const cz = Math.floor(cur / this.cellsX);
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dz === 0) continue;
            const nx = cx + dx;
            const nz = cz + dz;
            if (nx < 0 || nx >= this.cellsX || nz < 0 || nz >= this.cellsZ) continue;
            const ni = nz * this.cellsX + nx;
            if (!Number.isFinite(this.costs[ni]) || this.region[ni] !== 0) continue;
            this.region[ni] = regionId;
            queue[tail++] = ni;
          }
        }
      }
    }
  }

  private computeTerrain(): void {
    const n = this.cellsX * this.cellsZ;
    for (let zi = 0; zi < this.cellsZ; zi++) {
      for (let xi = 0; xi < this.cellsX; xi++) {
        const x = this.minX + (xi + 0.5) * this.cellSize;
        const z = this.minZ + (zi + 0.5) * this.cellSize;
        const i = zi * this.cellsX + xi;
        const flags = this.flagsAt(x, z);
        if ((flags & TerrainFlag.CliffWall) !== 0) {
          this.terrain[i] = 3; // impassable wall
        } else if ((flags & TerrainFlag.Blocked) !== 0) {
          this.terrain[i] = 4; // blocked
        } else if ((flags & TerrainFlag.Risky) !== 0) {
          this.terrain[i] = 2; // risky
        } else {
          this.terrain[i] = 1;
        }
      }
    }
  }

  private flagsAt(x: number, z: number): number {
    const hf = this.world.heightfield;
    const flags = this.world.arena?.terrainFlags;
    if (hf && flags) {
      const ox = this.world.arena?.originX ?? 0;
      const oz = this.world.arena?.originZ ?? 0;
      const gx = Math.max(0, Math.min(hf.samplesX - 1, Math.round(hf.localX(x - ox) / hf.cellSize)));
      const gz = Math.max(0, Math.min(hf.samplesZ - 1, Math.round(hf.localZ(z - oz) / hf.cellSize)));
      return flags[gz * hf.samplesX + gx] ?? 0;
    }
    return this.world.terrainFlagsAt?.(x, z) ?? 0;
  }

  private indexAt(x: number, z: number): number {
    const cx = this.cellX(x);
    const cz = this.cellZ(z);
    if (cx < 0 || cx >= this.cellsX || cz < 0 || cz >= this.cellsZ) return -1;
    return cz * this.cellsX + cx;
  }

  private cellX(x: number): number {
    return Math.floor((x - this.minX) / this.cellSize);
  }

  private cellZ(z: number): number {
    return Math.floor((z - this.minZ) / this.cellSize);
  }
}
