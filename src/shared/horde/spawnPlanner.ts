import type { SpawnPackDefinition } from '../content/schemas/horde';
import { forkSeed, mulberry32, type Rng } from '../mapgen/prng';
import type { SystemContext } from '../sim/systems/systemContext';
import type { SpawnAnchor } from './spawnAnchors';

export interface SpawnPlan {
  anchor: SpawnAnchor;
  positions: Array<{ x: number; z: number }>;
  seed: number;
  packId: string;
}

const SAFE_TAGS = new Set(['spawnSafe', 'recovery']);

/**
 * Core Loop 06 M4: deterministic, terrain-aware spawn planning. The planner
 * validates anchors against the tank position, the anchor policy, pack
 * requirements, and cliff/route reachability, then lays out the pack
 * formation from an authoritative per-decision PRNG substream. The same
 * match seed + authoritative state always produces the same plan.
 */
export class SpawnPlanner {
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
    const toTank = Math.atan2(tx - anchor.x, tz - anchor.z);
    const cos = Math.cos(toTank);
    const sin = Math.sin(toTank);
    const spacing = pack.spacing || 2;
    const radius = pack.radius || 8;
    for (const entry of pack.entries) {
      for (let i = 0; i < entry.count; i++) {
        const offset = this.offsetFor(pack.formation, i, entry.count, spacing, radius, rng, toTank);
        // Rotate the local offset toward the tank.
        const lx = offset.x * cos - offset.z * sin;
        const lz = offset.x * sin + offset.z * cos;
        out.push({ x: anchor.x + lx, z: anchor.z + lz });
      }
    }
    return out;
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
        const t = count <= 1 ? 0 : (i / (count - 1)) * 2 - 1;
        return { x: t * spacing * 0.5, z: 0 };
      }
      case 'column':
        return { x: 0, z: i * spacing };
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

function preferredAnchorTypes(packTags: string[], populationClass: string): SpawnAnchorTypeList {
  if (populationClass === 'boss' || packTags.includes('boss')) return ['boss', 'eliteFormation', 'perimeter'];
  if (populationClass === 'wave' || packTags.includes('wave')) return ['eliteFormation', 'perimeter', 'regional'];
  if (packTags.includes('farming')) return ['regional', 'perimeter', 'accessRoad', 'valley'];
  return ['regional', 'perimeter', 'accessRoad'];
}

type SpawnAnchorTypeList = Array<
  'perimeter' | 'regional' | 'accessRoad' | 'valley' | 'cliffTop' | 'cliffBottom' | 'eliteFormation' | 'boss' | 'specialist'
>;
