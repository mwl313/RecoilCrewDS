import type { SpawnPackDefinition } from '../content/schemas/horde';
import { forkSeed, mulberry32, type Rng } from '../mapgen/prng';
import type { SystemContext } from '../sim/systems/systemContext';
import type { SpawnAnchor } from './spawnAnchors';
import { resolveMonsterDimensions } from '../monsters/monsterNormalization';
import { isOrdinaryPressure } from '../enemies/enemyClassification';
import { resolveArenaBounds } from '../sim/arenaBounds';

export interface SpawnPlan {
  anchor: SpawnAnchor;
  positions: Array<{ x: number; z: number }>;
  seed: number;
  packId: string;
}

export const ANGULAR_PRESSURE_SECTORS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export type AngularPressureSector = (typeof ANGULAR_PRESSURE_SECTORS)[number];

export interface SpawnSubgroupPlan {
  anchor: SpawnAnchor;
  positions: Array<{ x: number; z: number }>;
  startIndex: number;
  count: number;
  delaySeconds: number;
  angularSector: number;
}

export interface MultiAnchorSpawnPlan extends SpawnPlan {
  subgroups: SpawnSubgroupPlan[];
}

export interface PressurePlanOptions {
  minDistance?: number;
  maxDistance?: number;
  preferredDistance?: number;
  forceOffCamera?: boolean;
  interceptionBias?: boolean;
  preferredSector?: number;
}

export interface AngularPressureTelemetry {
  counts: number[];
  recentWeights: number[];
  lastUsedAt: number[];
  lastDirections: AngularPressureSector[];
}

const SAFE_TAGS = new Set(['spawnSafe', 'recovery']);
export const PRESSURE_SPAWN_BOUNDARY_INSET = 3;

/**
 * Core Loop 06 M4: deterministic, terrain-aware spawn planning. The planner
 * validates anchors against the tank position, the anchor policy, pack
 * requirements, and cliff/route reachability, then lays out the pack
 * formation from an authoritative per-decision PRNG substream. The same
 * match seed + authoritative state always produces the same plan.
 */
export class SpawnPlanner {
  private readonly angularLastUsed = Array<number>(8).fill(-Infinity);
  private readonly angularRecentWeight = Array<number>(8).fill(0);
  private readonly lastDirections: AngularPressureSector[] = [];
  private decisionSequence = 0;

  constructor(
    private readonly ctx: SystemContext,
    private readonly seed: number,
    private readonly anchors: SpawnAnchor[],
  ) {}

  plan(pack: SpawnPackDefinition, populationClass: string): SpawnPlan | null {
    const policy = this.ctx.horde?.resolved.policies.anchor;
    const tank = this.ctx.state.tank;
    const valid: SpawnAnchor[] = [];
    for (const anchor of this.anchors) {
      if (!this.anchorValid(pack, anchor, tank.x, tank.z, policy?.visibleNearField ?? 18)) continue;
      valid.push(anchor);
    }
    if (valid.length === 0) return null;
    const best = this.scoreAndPick(
      pack,
      populationClass,
      valid,
      tank.x,
      tank.z,
      policy?.preferredTankDistance ?? 70,
    );
    if (!best) return null;
    best.lastUsedAt = this.ctx.state.time;
    const seed = forkSeed(
      this.seed,
      `spawn.${pack.id}.${populationClass}.${this.ctx.state.nextEnemyId}`,
    );
    const rng = mulberry32(seed);
    return {
      anchor: best,
      positions: this.formationPositions(pack, best, tank.x, tank.z, rng),
      seed,
      packId: pack.id,
    };
  }

  /**
   * Atomically plans a complete pack over two or three separated pressure
   * directions. Nothing is marked used until every subgroup has a valid
   * anchor, so callers can reserve the whole pack or reject it cleanly.
   */
  planMulti(
    pack: SpawnPackDefinition,
    populationClass: string,
    options: PressurePlanOptions = {},
  ): MultiAnchorSpawnPlan | null {
    const total = pack.entries.reduce((sum, entry) => sum + Math.max(0, Math.floor(entry.count)), 0);
    if (total <= 0) return null;
    const sizes = splitPackSizes(total, pack.formation);
    const seed = forkSeed(
      this.seed,
      `pressure.${pack.id}.${populationClass}.${this.ctx.state.nextEnemyId}.${this.decisionSequence++}`,
    );
    const rng = mulberry32(seed);
    for (const sectors of this.separatedSectorCandidates(sizes.length, options)) {
      const subgroups: SpawnSubgroupPlan[] = [];
      let startIndex = 0;
      for (let i = 0; i < sizes.length; i++) {
        const count = sizes[i];
        const ranged = this.groupPrefersRanged(pack, startIndex, count);
        const anchor = this.dynamicPressureAnchor(
          count,
          sectors[i],
          {
            ...options,
            minDistance: options.minDistance ?? (ranged ? 50 : 42),
            maxDistance: options.maxDistance ?? (ranged ? 70 : 62),
            preferredDistance: options.preferredDistance ?? (ranged ? 60 : 54),
          },
          rng,
        );
        if (!anchor) break;
        subgroups.push({
          anchor,
          positions: this.formationPositionsForCount(pack, anchor, count, rng),
          startIndex,
          count,
          delaySeconds: subgroupDelay(i, rng),
          angularSector: sectors[i],
        });
        startIndex += count;
      }
      if (subgroups.length !== sizes.length) continue;
      for (const subgroup of subgroups) this.commitAngularUse(subgroup.angularSector, subgroup.anchor);
      return {
        anchor: subgroups[0].anchor,
        positions: subgroups.flatMap((subgroup) => subgroup.positions),
        seed,
        packId: pack.id,
        subgroups,
      };
    }
    return null;
  }

  /** Replan one deferred subgroup without changing the original reservation. */
  replanSubgroup(
    pack: SpawnPackDefinition,
    count: number,
    preferredSector: number,
    options: PressurePlanOptions = {},
  ): SpawnSubgroupPlan | null {
    const seed = forkSeed(this.seed, `pressure.replan.${pack.id}.${this.decisionSequence++}.${preferredSector}`);
    const rng = mulberry32(seed);
    const sectors = this.pickSeparatedSectors(1, { ...options, preferredSector });
    const sector = sectors[0];
    if (sector === undefined) return null;
    const anchor = this.dynamicPressureAnchor(count, sector, { ...options, forceOffCamera: true }, rng);
    if (!anchor) return null;
    this.commitAngularUse(sector, anchor);
    return {
      anchor,
      positions: this.formationPositionsForCount(pack, anchor, count, rng),
      startIndex: 0,
      count,
      delaySeconds: 0,
      angularSector: sector,
    };
  }

  /** Generic valid point for recycling or same-entity persistent re-entry. */
  pressurePoint(count: number, options: PressurePlanOptions = {}): SpawnSubgroupPlan | null {
    const seed = forkSeed(this.seed, `pressure.point.${this.decisionSequence++}.${count}`);
    const rng = mulberry32(seed);
    const sectors = this.pickSeparatedSectors(1, options);
    const sector = sectors[0];
    if (sector === undefined) return null;
    const anchor = this.dynamicPressureAnchor(count, sector, options, rng);
    if (!anchor) return null;
    const positions: Array<{ x: number; z: number }> = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / Math.max(1, count)) * Math.PI * 2;
      const radius = 2 + (i % 3) * 1.5;
      positions.push({ x: anchor.x + Math.sin(angle) * radius, z: anchor.z + Math.cos(angle) * radius });
    }
    this.commitAngularUse(sector, anchor);
    return {
      anchor,
      positions: this.keepPositionsInsideBoundary(positions),
      startIndex: 0,
      count,
      delaySeconds: 0,
      angularSector: sector,
    };
  }

  revalidateSubgroup(plan: SpawnSubgroupPlan, options: PressurePlanOptions = {}): boolean {
    return this.pressurePointValid(
      plan.anchor.x,
      plan.anchor.z,
      options.minDistance ?? 40,
      options.maxDistance ?? 72,
      options.forceOffCamera ?? true,
    );
  }

  isOffCamera(x: number, z: number): boolean {
    const tank = this.ctx.state.tank;
    const dx = x - tank.x;
    const dz = z - tank.z;
    const distance = Math.hypot(dx, dz) || 1;
    const visibleNear = this.ctx.horde?.resolved.policies.anchor.visibleNearField ?? 23;
    if (distance <= visibleNear + 8) return false;
    const forwardX = Math.sin(tank.yaw);
    const forwardZ = Math.cos(tank.yaw);
    const dot = (dx / distance) * forwardX + (dz / distance) * forwardZ;
    return distance > 85 || dot < 0.75;
  }

  angularTelemetry(): AngularPressureTelemetry {
    return {
      counts: this.angularCounts(),
      recentWeights: this.angularRecentWeight.map((weight, i) => this.decayedWeight(weight, i)),
      lastUsedAt: [...this.angularLastUsed],
      lastDirections: [...this.lastDirections],
    };
  }

  private separatedSectorCandidates(count: number, options: PressurePlanOptions): number[][] {
    const sectors = Array.from({ length: 8 }, (_, index) => index).filter((sector) => {
      if (!(options.forceOffCamera ?? true)) return true;
      const distance = options.preferredDistance ?? 54;
      const angle = sector * (Math.PI / 4);
      const tank = this.ctx.state.tank;
      return this.isOffCamera(tank.x + Math.sin(angle) * distance, tank.z + Math.cos(angle) * distance);
    });
    const combinations: number[][] = [];
    const visit = (start: number, selected: number[]): void => {
      if (selected.length === count) {
        combinations.push([...selected]);
        return;
      }
      for (let i = start; i < sectors.length; i++) {
        const sector = sectors[i];
        if (selected.some((other) => {
          const separation = circularSectorDistance(sector, other);
          return separation < 2 || separation > 3;
        })) continue;
        selected.push(sector);
        visit(i + 1, selected);
        selected.pop();
      }
    };
    visit(0, []);
    const counts = this.angularCounts();
    const score = (selection: number[]): number => selection.reduce((sum, sector) => {
      const recent = this.decayedWeight(this.angularRecentWeight[sector], sector);
      const preferred = options.preferredSector === undefined
        ? 0
        : circularSectorDistance(sector, options.preferredSector) * 5;
      return sum + counts[sector] * 12 + recent * 5 + preferred;
    }, 0);
    combinations.sort((a, b) => score(a) - score(b) || a.join(',').localeCompare(b.join(',')));
    return combinations;
  }

  private pickSeparatedSectors(count: number, options: PressurePlanOptions): number[] {
    const nearby = this.angularCounts();
    const selected: number[] = [];
    for (let group = 0; group < count; group++) {
      let best = -1;
      let bestScore = Infinity;
      for (let sector = 0; sector < 8; sector++) {
        if (options.forceOffCamera ?? true) {
          const distance = options.preferredDistance ?? 54;
          const angle = sector * (Math.PI / 4);
          const tank = this.ctx.state.tank;
          if (!this.isOffCamera(tank.x + Math.sin(angle) * distance, tank.z + Math.cos(angle) * distance)) continue;
        }
        if (selected.some((other) => {
          const separation = circularSectorDistance(sector, other);
          return separation < 2 || separation > 3;
        })) continue;
        const recent = this.decayedWeight(this.angularRecentWeight[sector], sector);
        const age = this.ctx.state.time - this.angularLastUsed[sector];
        const recentUsePenalty = Number.isFinite(age) && age < 6 ? (6 - age) * 2 : 0;
        let score = nearby[sector] * 12 + recent * 5 + recentUsePenalty;
        if (options.preferredSector !== undefined) {
          score += circularSectorDistance(sector, options.preferredSector) * 5;
        }
        if (options.interceptionBias) {
          const tank = this.ctx.state.tank;
          const speed = Math.hypot(tank.vx, tank.vz);
          if (speed > 1) {
            const escapeSector = angleToSector(Math.atan2(tank.vx, tank.vz));
            score += circularSectorDistance(sector, escapeSector) * 4;
          }
        }
        if (score < bestScore || (score === bestScore && sector < best)) {
          best = sector;
          bestScore = score;
        }
      }
      if (best < 0) break;
      selected.push(best);
    }
    return selected;
  }

  private dynamicPressureAnchor(
    count: number,
    sector: number,
    options: PressurePlanOptions,
    rng: Rng,
  ): SpawnAnchor | null {
    let minDistance = options.minDistance ?? 42;
    let maxDistance = options.maxDistance ?? 62;
    let preferredDistance = Math.max(minDistance, Math.min(maxDistance, options.preferredDistance ?? 54));
    // The legacy 80m-wide demo arena cannot physically contain the
    // production annulus. Compress only that compatibility world while
    // retaining the same visible-near-field safety boundary.
    if (this.ctx.world.metadata === null && this.ctx.world.half < 80) {
      const visibleNear = this.ctx.horde?.resolved.policies.anchor.visibleNearField ?? 23;
      minDistance = Math.max(visibleNear + 1, Math.min(minDistance, 25));
      maxDistance = Math.max(minDistance + 4, Math.min(maxDistance, this.ctx.world.half - 5));
      preferredDistance = Math.max(minDistance, Math.min(maxDistance, 30));
    }
    const baseAngle = sector * (Math.PI / 4);
    const angleJitter = (rng() - 0.5) * 0.12;
    const distances = [preferredDistance, minDistance + (maxDistance - minDistance) * 0.35, maxDistance - 1];
    const offsets = [0, -Math.PI / 18, Math.PI / 18, -Math.PI / 9, Math.PI / 9];
    const tank = this.ctx.state.tank;
    for (const distance of distances) {
      for (const offset of offsets) {
        const angle = baseAngle + angleJitter + offset;
        const x = tank.x + Math.sin(angle) * distance;
        const z = tank.z + Math.cos(angle) * distance;
        if (!this.pressurePointValid(x, z, minDistance, maxDistance, options.forceOffCamera ?? true)) continue;
        return {
          id: `pressure.${this.decisionSequence}.${ANGULAR_PRESSURE_SECTORS[sector]}.${Math.round(distance)}`,
          type: 'regional',
          x,
          z,
          regionId: null,
          terrainTag: this.terrainTagAt(x, z),
          tags: ['pressure', 'angular', ANGULAR_PRESSURE_SECTORS[sector].toLowerCase()],
          capacity: Math.max(1, count),
          minTankDistance: minDistance,
          maxTankDistance: maxDistance,
          cameraExposure: this.isOffCamera(x, z) ? 0 : 1,
          lastUsedAt: this.ctx.state.time,
          reachable: true,
        };
      }
    }

    // Static map anchors remain a deterministic fallback when the local
    // annulus is too obstructed.
    const fallback = this.anchors
      .filter((anchor) => {
        if (!anchor.reachable || SAFE_TAGS.has(anchor.terrainTag) || anchor.capacity < count) return false;
        const distance = Math.hypot(anchor.x - tank.x, anchor.z - tank.z);
        if (distance < minDistance || distance > maxDistance) return false;
        if (circularSectorDistance(angleToSector(Math.atan2(anchor.x - tank.x, anchor.z - tank.z)), sector) > 1) return false;
        return this.pressurePointValid(anchor.x, anchor.z, minDistance, maxDistance, options.forceOffCamera ?? true);
      })
      .sort((a, b) =>
        Math.abs(Math.hypot(a.x - tank.x, a.z - tank.z) - preferredDistance) -
          Math.abs(Math.hypot(b.x - tank.x, b.z - tank.z) - preferredDistance) ||
        a.id.localeCompare(b.id),
      )[0];
    return fallback ?? null;
  }

  private pressurePointValid(
    x: number,
    z: number,
    minDistance: number,
    maxDistance: number,
    forceOffCamera: boolean,
  ): boolean {
    const tank = this.ctx.state.tank;
    const distance = Math.hypot(x - tank.x, z - tank.z);
    if (distance < minDistance || distance > maxDistance) return false;
    const world = this.ctx.world;
    const bounds = world.bounds ?? { minX: -world.half, maxX: world.half, minZ: -world.half, maxZ: world.half };
    if (
      x < bounds.minX + PRESSURE_SPAWN_BOUNDARY_INSET ||
      x > bounds.maxX - PRESSURE_SPAWN_BOUNDARY_INSET ||
      z < bounds.minZ + PRESSURE_SPAWN_BOUNDARY_INSET ||
      z > bounds.maxZ - PRESSURE_SPAWN_BOUNDARY_INSET
    ) return false;
    if (SAFE_TAGS.has(this.terrainTagAt(x, z))) return false;
    if (world.isDriveableAt && !world.isDriveableAt(x, z)) return false;
    if (world.isCliffWallAt?.(x, z)) return false;
    if (world.obstacleAt(x, z, world.groundHeightAt(x, z))) return false;
    if (this.ctx.flowField && !Number.isFinite(this.ctx.flowField.costAt(x, z))) return false;
    if (forceOffCamera && !this.isOffCamera(x, z)) return false;
    return true;
  }

  private terrainTagAt(x: number, z: number): string {
    const arena = this.ctx.world.arena;
    const ox = arena?.originX ?? 0;
    const oz = arena?.originZ ?? 0;
    return arena?.layout?.zones.grid.tagAt(x - ox, z - oz) ?? 'flat';
  }

  private angularCounts(): number[] {
    const counts = Array<number>(8).fill(0);
    const tank = this.ctx.state.tank;
    for (const enemy of this.ctx.state.enemies) {
      if (!isOrdinaryPressure(enemy)) continue;
      const dx = enemy.x - tank.x;
      const dz = enemy.z - tank.z;
      if (Math.hypot(dx, dz) > 70) continue;
      counts[angleToSector(Math.atan2(dx, dz))]++;
    }
    for (const sector of this.ctx.hordeSectors?.sectors.values() ?? []) {
      const dx = sector.centerX - tank.x;
      const dz = sector.centerZ - tank.z;
      if (Math.hypot(dx, dz) > 70) continue;
      counts[angleToSector(Math.atan2(dx, dz))] += sector.count;
    }
    return counts;
  }

  private commitAngularUse(sector: number, anchor: SpawnAnchor): void {
    this.angularRecentWeight[sector] = this.decayedWeight(this.angularRecentWeight[sector], sector) + 1;
    this.angularLastUsed[sector] = this.ctx.state.time;
    anchor.lastUsedAt = this.ctx.state.time;
    const direction = ANGULAR_PRESSURE_SECTORS[sector];
    this.lastDirections.push(direction);
    if (this.lastDirections.length > 8) this.lastDirections.shift();
  }

  private decayedWeight(weight: number, sector: number): number {
    const age = this.ctx.state.time - this.angularLastUsed[sector];
    if (!Number.isFinite(age) || age <= 0) return weight;
    return weight * Math.exp(-age / 8);
  }

  private groupPrefersRanged(pack: SpawnPackDefinition, start: number, count: number): boolean {
    const roles: string[] = [];
    for (const entry of pack.entries) {
      for (let i = 0; i < entry.count; i++) roles.push(entry.formationRole ?? '');
    }
    return roles.slice(start, start + count).some((role) => /support|range|skirmish/i.test(role));
  }

  private formationPositionsForCount(
    pack: SpawnPackDefinition,
    anchor: SpawnAnchor,
    count: number,
    rng: Rng,
  ): Array<{ x: number; z: number }> {
    const out: Array<{ x: number; z: number }> = [];
    const tank = this.ctx.state.tank;
    const toTank = Math.atan2(tank.x - anchor.x, tank.z - anchor.z);
    const cos = Math.cos(toTank);
    const sin = Math.sin(toTank);
    for (let i = 0; i < count; i++) {
      const offset = this.offsetFor(pack.formation, i, count, pack.spacing || 2, pack.radius || 8, rng, toTank);
      out.push({
        x: anchor.x + offset.x * cos - offset.z * sin,
        z: anchor.z + offset.x * sin + offset.z * cos,
      });
    }
    return this.keepPositionsInsideBoundary(out);
  }

  private anchorValid(
    pack: SpawnPackDefinition,
    anchor: SpawnAnchor,
    tx: number,
    tz: number,
    visibleNearField: number,
  ): boolean {
    if (!anchor.reachable) return false;
    if (SAFE_TAGS.has(anchor.terrainTag)) return false;
    if (anchor.capacity < pack.entityCost) return false;
    const d = Math.hypot(anchor.x - tx, anchor.z - tz);
    const min = pack.anchorRequirements?.minimumTankDistance ?? anchor.minTankDistance;
    const max = pack.anchorRequirements?.maximumTankDistance ?? anchor.maxTankDistance;
    if (d < Math.max(min, visibleNearField)) return false;
    if (d > max) return false;
    const requirementTags = pack.anchorRequirements?.regionTags ?? [];
    if (requirementTags.length > 0 && !requirementTags.some((t) => anchor.tags.includes(t))) return false;
    const terrainTags = pack.anchorRequirements?.terrainTags ?? [];
    if (terrainTags.length > 0 && !terrainTags.includes(anchor.terrainTag)) return false;
    const cooldown = Math.max(pack.cooldownSeconds ?? 0, 0);
    if (anchor.lastUsedAt + cooldown > this.ctx.state.time) return false;
    if (this.cliffBlocked(tx, tz, anchor.x, anchor.z)) return false;
    return true;
  }

  private cliffBlocked(ax: number, az: number, bx: number, bz: number): boolean {
    const world = this.ctx.world;
    if (!world.isCliffWallAt) return false;
    const dist = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(2, Math.min(24, Math.ceil(dist / 4)));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (world.isCliffWallAt(ax + (bx - ax) * t, az + (bz - az) * t)) return true;
    }
    return false;
  }

  private scoreAndPick(
    pack: SpawnPackDefinition,
    populationClass: string,
    candidates: SpawnAnchor[],
    tx: number,
    tz: number,
    preferredTankDistance: number,
  ): SpawnAnchor | null {
    const preferredTypes = preferredAnchorTypes(pack.tags, populationClass);
    let best: SpawnAnchor | null = null;
    let bestScore = Infinity;
    for (const anchor of candidates) {
      const d = Math.hypot(anchor.x - tx, anchor.z - tz);
      const typeScore = preferredTypes.includes(anchor.type) ? 0 : preferredTypes.length;
      const tagOverlap = pack.tags.filter((t) => anchor.tags.includes(t)).length;
      const score =
        typeScore * 100 -
        tagOverlap * 10 +
        Math.abs(d - preferredTankDistance) / 100 +
        anchor.cameraExposure * 5;
      if (score < bestScore) {
        bestScore = score;
        best = anchor;
      }
    }
    return best;
  }

  private formationPositions(
    pack: SpawnPackDefinition,
    anchor: SpawnAnchor,
    tx: number,
    tz: number,
    rng: Rng,
  ): Array<{ x: number; z: number }> {
    const out: Array<{ x: number; z: number }> = [];
    const clearanceRadii: number[] = [];
    const toTank = Math.atan2(tx - anchor.x, tz - anchor.z);
    const cos = Math.cos(toTank);
    const sin = Math.sin(toTank);
    const resolvedEntries = pack.entries.flatMap((entry) => {
      const enemyId = entry.enemyId;
      const def = enemyId ? this.ctx.enemies.defById(enemyId) : undefined;
      const clearance = def?.type === 'monster'
        ? resolveMonsterDimensions(def.id, def.sizeClass, def.tier, def.optionalVariantScale).spawnClearanceRadius
        : 0;
      return Array.from({ length: entry.count }, () => clearance);
    });
    const maximumClearanceDiameter = resolvedEntries.length > 0
      ? Math.max(...resolvedEntries) * 2
      : 0;
    const spacing = Math.max(pack.spacing || 2, maximumClearanceDiameter);
    const radius = pack.radius || 8;
    for (let i = 0; i < resolvedEntries.length; i++) {
      const offset = this.offsetFor(pack.formation, i, resolvedEntries.length, spacing, radius, rng, toTank);
      // Rotate the local offset toward the tank.
      const lx = offset.x * cos - offset.z * sin;
      const lz = offset.x * sin + offset.z * cos;
      out.push({ x: anchor.x + lx, z: anchor.z + lz });
      clearanceRadii.push(resolvedEntries[i]);
    }
    return this.keepPositionsInsideBoundary(enforceSpawnClearance(out, clearanceRadii));
  }

  /**
   * Preserve formation spacing by translating the complete group into the
   * pressure spawn strip. This closes the case where a valid anchor was
   * inside the bounds but one of its formation offsets was outside.
   */
  private keepPositionsInsideBoundary(
    positions: Array<{ x: number; z: number }>,
  ): Array<{ x: number; z: number }> {
    if (positions.length === 0) return positions;
    const bounds = resolveArenaBounds(this.ctx.world);
    const minX = bounds.minX + PRESSURE_SPAWN_BOUNDARY_INSET;
    const maxX = bounds.maxX - PRESSURE_SPAWN_BOUNDARY_INSET;
    const minZ = bounds.minZ + PRESSURE_SPAWN_BOUNDARY_INSET;
    const maxZ = bounds.maxZ - PRESSURE_SPAWN_BOUNDARY_INSET;
    let groupMinX = Infinity;
    let groupMaxX = -Infinity;
    let groupMinZ = Infinity;
    let groupMaxZ = -Infinity;
    for (const position of positions) {
      groupMinX = Math.min(groupMinX, position.x);
      groupMaxX = Math.max(groupMaxX, position.x);
      groupMinZ = Math.min(groupMinZ, position.z);
      groupMaxZ = Math.max(groupMaxZ, position.z);
    }
    let dx = groupMinX < minX ? minX - groupMinX : 0;
    if (groupMaxX + dx > maxX) dx += maxX - (groupMaxX + dx);
    let dz = groupMinZ < minZ ? minZ - groupMinZ : 0;
    if (groupMaxZ + dz > maxZ) dz += maxZ - (groupMaxZ + dz);
    return positions.map((position) => ({
      x: Math.max(minX, Math.min(maxX, position.x + dx)),
      z: Math.max(minZ, Math.min(maxZ, position.z + dz)),
    }));
  }

  private offsetFor(
    formation: SpawnPackDefinition['formation'],
    i: number,
    count: number,
    spacing: number,
    radius: number,
    rng: Rng,
    toTank: number,
  ): { x: number; z: number } {
    switch (formation) {
      case 'line': {
        return { x: (i - (count - 1) / 2) * spacing, z: 0 };
      }
      case 'column':
        return { x: 0, z: (i - (count - 1) / 2) * spacing };
      case 'arc': {
        const t = count <= 1 ? 0 : (i / (count - 1)) * Math.PI - Math.PI / 2;
        return { x: Math.cos(t) * radius, z: Math.sin(t) * radius * 0.6 };
      }
      case 'ring': {
        const a = (i / Math.max(1, count)) * Math.PI * 2;
        return { x: Math.cos(a) * radius, z: Math.sin(a) * radius };
      }
      case 'pincer': {
        const side = i % 2 === 0 ? -1 : 1;
        const t = Math.floor(i / 2) / Math.max(1, Math.ceil(count / 2));
        return { x: side * (3 + t * radius * 0.7), z: t * spacing * 2 };
      }
      case 'scatter':
        return { x: (rng() * 2 - 1) * radius, z: (rng() * 2 - 1) * radius };
      case 'cluster':
      default:
        return {
          x: Math.cos(toTank + rng() * 2 - 1) * (rng() * radius),
          z: Math.sin(toTank + rng() * 2 - 1) * (rng() * radius),
        };
    }
  }
}

/** Deterministic no-overlap pass driven by each body's resolved clearance. */
export function enforceSpawnClearance(
  positions: readonly { x: number; z: number }[],
  clearanceRadii: readonly number[],
): Array<{ x: number; z: number }> {
  const out = positions.map((position) => ({ ...position }));
  for (let i = 0; i < out.length; i++) {
    for (let pass = 0; pass < out.length; pass++) {
      let moved = false;
      for (let j = 0; j < i; j++) {
        const required = (clearanceRadii[i] ?? 0) + (clearanceRadii[j] ?? 0);
        if (required <= 0) continue;
        let dx = out[i].x - out[j].x;
        let dz = out[i].z - out[j].z;
        let distance = Math.hypot(dx, dz);
        if (distance + 1e-6 >= required) continue;
        if (distance < 1e-6) {
          const angle = ((i * 37 + j * 17) % 360) * (Math.PI / 180);
          dx = Math.sin(angle);
          dz = Math.cos(angle);
          distance = 1;
        }
        const push = required - distance + 0.001;
        out[i].x += (dx / distance) * push;
        out[i].z += (dz / distance) * push;
        moved = true;
      }
      if (!moved) break;
    }
  }
  return out;
}

function preferredAnchorTypes(packTags: string[], populationClass: string): SpawnAnchorTypeList {
  if (populationClass === 'boss' || packTags.includes('boss')) return ['boss', 'eliteFormation', 'perimeter'];
  if (populationClass === 'wave' || packTags.includes('wave')) return ['eliteFormation', 'perimeter', 'regional'];
  if (packTags.includes('farming')) return ['regional', 'perimeter', 'accessRoad', 'valley'];
  return ['regional', 'perimeter', 'accessRoad'];
}

type SpawnAnchorTypeList = Array<
  'perimeter' | 'regional' | 'accessRoad' | 'valley' | 'cliffTop' | 'cliffBottom' | 'eliteFormation' | 'boss' | 'specialist'
>;

function splitPackSizes(total: number, formation: SpawnPackDefinition['formation']): number[] {
  if (total <= 5) return [total];
  if (total === 6) return formation === 'scatter' ? [2, 2, 2] : [3, 3];
  if (total === 7) return [3, 2, 2];
  if (total === 8 && formation === 'pincer') return [4, 4];
  if (total === 8) return [3, 3, 2];
  const first = Math.ceil(total / 3);
  const second = Math.ceil((total - first) / 2);
  return [first, second, total - first - second].filter((count) => count > 0);
}

function subgroupDelay(index: number, rng: Rng): number {
  if (index === 0) return 0;
  if (index === 1) return 0.12 + rng() * 0.1;
  return 0.24 + rng() * 0.14;
}

function circularSectorDistance(a: number, b: number): number {
  const delta = Math.abs(a - b) % 8;
  return Math.min(delta, 8 - delta);
}

function angleToSector(angle: number): number {
  const normalized = (angle + Math.PI * 2) % (Math.PI * 2);
  return Math.round(normalized / (Math.PI / 4)) % 8;
}
