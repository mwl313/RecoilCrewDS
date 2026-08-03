/**
 * Legacy arena compatibility.
 *
 * buildLegacyArenaModel() wraps the static hand-built ARENA into the same
 * GeneratedArena runtime interface (heightfield sampled from the legacy
 * analytic ground + the fixed prop lists), and createArenaQueries() exposes
 * the classic query surface parameterized by a generated arena. Existing
 * simulation callers keep importing src/shared/arena unchanged until the
 * Phase 3 online activation wires an arena instance through the match.
 */
import {
  ARENA,
  groundHeightAt as legacyGroundHeightAt,
  type BarrelProp,
  type Obstacle,
  type RampDef,
} from '../arena';
import { clamp, pointInBox, resolveCircleBox } from '../math';
import { Heightfield } from './heightfield';
import type { GeneratedArena } from './generator';
import { GENERATED_MAP_PROFILES } from '../../generated/mapProfiles.generated';

export interface ArenaProps {
  obstacles: Obstacle[];
  barrels: BarrelProp[];
  ramps: RampDef[];
  spawnPoints: { x: number; z: number }[];
  bugSpawns: { x: number; z: number }[];
  towerSpots: { x: number; z: number }[];
  truckRoute: { x: number; z: number }[];
  half: number;
}

export interface ArenaQueries {
  groundHeightAt(x: number, z: number): number;
  groundNormalAt(x: number, z: number): { nx: number; ny: number; nz: number };
  slopeAt(x: number, z: number): number;
  obstacleAt(x: number, z: number): Obstacle | undefined;
  resolveCircle(x: number, z: number, r: number): { x: number; z: number; hit: boolean };
  resolveCircleContacts(
    x: number,
    z: number,
    r: number,
  ): { x: number; z: number; contacts: ReturnType<typeof resolveCircleBox>[] };
  rampAt(x: number, z: number): RampDef | undefined;
  nearestSpawn(x: number, z: number): { x: number; z: number };
  /** Boundary clamp half-size (arena.half equivalent). */
  boundsHalf(): number;
}

/** Wrap the fixed hand-built arena into the generated runtime model. */
export function buildLegacyArenaModel(): GeneratedArena & { props: ArenaProps } {
  const widthMeters = ARENA.half * 2;
  const depthMeters = ARENA.half * 2;
  const cellSize = 4;
  const hf = new Heightfield({ widthMeters, depthMeters, cellSize });
  for (let zi = 0; zi < hf.samplesZ; zi++) {
    for (let xi = 0; xi < hf.samplesX; xi++) {
      const x = xi * cellSize - widthMeters / 2;
      const z = zi * cellSize - depthMeters / 2;
      hf.setSample(xi, zi, legacyGroundHeightAt(x, z));
    }
  }
  const slopes = hf.slopeGrid();
  const profile = GENERATED_MAP_PROFILES['map.fallbackLegacy'].terrainProfile;
  const validation = {
    ok: true,
    errors: [] as string[],
    warnings: [] as string[],
    metrics: {
      generationMs: 0,
      heightMin: hf.minHeight(),
      heightMax: hf.maxHeight(),
      maxSlope: hf.maxSlope(),
      checksum: hf.checksum(),
      featureCount: 0,
    },
  };
  const props: ArenaProps = {
    obstacles: ARENA.obstacles.map((o) => ({ ...o })),
    barrels: ARENA.barrels.map((b) => ({ ...b })),
    ramps: ARENA.ramps.map((r) => ({ ...r })),
    spawnPoints: ARENA.spawnPoints.map((s) => ({ ...s })),
    bugSpawns: ARENA.bugSpawns.map((s) => ({ ...s })),
    towerSpots: ARENA.towerSpots.map((s) => ({ ...s })),
    truckRoute: ARENA.truckRoute.map((s) => ({ ...s })),
    half: ARENA.half,
  };
  return {
    baseSeed: 0,
    candidateSeed: 0,
    attempt: 0,
    profileId: profile.id,
    mapId: 'map.fallbackLegacy',
    generatorVersion: 0,
    widthMeters,
    depthMeters,
    cellSize,
    originX: -widthMeters / 2,
    originZ: -depthMeters / 2,
    heightfield: hf,
    macroFeatures: [],
    slopes,
    steepMask: new Uint8Array(slopes.length),
    terrainProfile: profile,
    validation,
    fallbackUsed: false,
    source: 'legacy',
    props,
  };
}

/**
 * Convert a generated Phase 2 arena into the classic prop surface
 * (ArenaProps). Coordinates are translated from map-local (0..size) to
 * world (centered at origin). Phase 3 wires this behind the feature flag.
 */
export function toArenaProps(arena: GeneratedArena): ArenaProps {
  const layout = arena.layout;
  const obstacles: Obstacle[] = [];
  const barrels: BarrelProp[] = [];
  const ramps: RampDef[] = [];
  const spawnPoints: { x: number; z: number }[] = [];
  const bugSpawns: { x: number; z: number }[] = [];
  const towerSpots: { x: number; z: number }[] = [];
  const truckRoute: { x: number; z: number }[] = [];
  const ox = arena.originX;
  const oz = arena.originZ;
  const toWorld = (x: number, z: number) => ({ x: x + ox, z: z + oz });

  if (layout) {
    for (const o of layout.objects) {
      // Crates are authoritative colliders (they must not disappear between
      // generation, world conversion, and rendering).
      if (!o.collider || o.kind === 'barrel') continue;
      const p = toWorld(o.x, o.z);
      obstacles.push({
        id: o.id,
        x: p.x,
        z: p.z,
        w: o.w ?? 4,
        d: o.d ?? 4,
        h: o.h ?? 2.4,
        type: (o.obstacleType ?? 'container') as Obstacle['type'],
      });
    }
    for (const o of layout.objects) {
      if (o.kind !== 'barrel') continue;
      const p = toWorld(o.x, o.z);
      barrels.push({ id: barrels.length, x: p.x, z: p.z });
    }
    for (const r of layout.ramps) {
      const base = toWorld(r.x, r.z);
      const top = toWorld(r.landingX, r.landingZ);
      const len = Math.hypot(top.x - base.x, top.z - base.z) || 1;
      ramps.push({
        id: r.id,
        x: base.x,
        z: base.z,
        w: r.w,
        d: r.d,
        dirX: r.dirX,
        dirZ: r.dirZ,
        rise: r.rise,
        baseY: r.baseY,
      });
    }
    for (const s of layout.spawns) {
      const p = toWorld(s.x, s.z);
      spawnPoints.push(p);
    }
    for (const g of layout.gates) {
      const p = toWorld(g.x, g.z);
      bugSpawns.push(p);
    }
  }
  return {
    obstacles,
    barrels,
    ramps,
    spawnPoints,
    bugSpawns,
    towerSpots,
    truckRoute,
    half: Math.min(arena.widthMeters, arena.depthMeters) / 2,
  };
}

/** Classic query surface parameterized by a generated arena. */
export function createArenaQueries(arena: GeneratedArena & { props?: ArenaProps }): ArenaQueries {
  const props: ArenaProps = arena.props ?? {
    obstacles: [],
    barrels: [],
    ramps: [],
    spawnPoints: [{ x: 0, z: 0 }],
    bugSpawns: [],
    towerSpots: [],
    truckRoute: [],
    half: Math.min(arena.widthMeters, arena.depthMeters) / 2,
  };
  const toLocalX = (x: number) => x - arena.originX;
  const toLocalZ = (z: number) => z - arena.originZ;
  const boundsHalf = () => props.half;

  return {
    groundHeightAt(x: number, z: number): number {
      return arena.heightfield.heightAt(toLocalX(x), toLocalZ(z));
    },
    groundNormalAt(x: number, z: number) {
      return arena.heightfield.normalAt(toLocalX(x), toLocalZ(z));
    },
    slopeAt(x: number, z: number): number {
      return arena.heightfield.slopeAt(toLocalX(x), toLocalZ(z));
    },
    obstacleAt(x: number, z: number): Obstacle | undefined {
      for (const o of props.obstacles) {
        if (pointInBox(x, z, o.x, o.z, o.w, o.d)) return o;
      }
      return undefined;
    },
    resolveCircle(x: number, z: number, r: number) {
      const res = this.resolveCircleContacts(x, z, r);
      return { x: res.x, z: res.z, hit: res.contacts.length > 0 };
    },
    resolveCircleContacts(x: number, z: number, r: number) {
      let outX = x;
      let outZ = z;
      const contacts: ReturnType<typeof resolveCircleBox>[] = [];
      for (const o of props.obstacles) {
        const res = resolveCircleBox(outX, outZ, r, o.x, o.z, o.w, o.d, o.id);
        if (res.hit) {
          outX = res.x;
          outZ = res.z;
          contacts.push(res);
        }
      }
      const half = props.half - 0.5;
      outX = clamp(outX, -half, half);
      outZ = clamp(outZ, -half, half);
      return { x: outX, z: outZ, contacts };
    },
    rampAt(x: number, z: number): RampDef | undefined {
      for (const r of props.ramps) {
        if (pointInBox(x, z, r.x, r.z, r.w, r.d)) return r;
      }
      return undefined;
    },
    nearestSpawn(x: number, z: number): { x: number; z: number } {
      let best = props.spawnPoints[0];
      let bestD = Infinity;
      for (const s of props.spawnPoints) {
        const d = (s.x - x) ** 2 + (s.z - z) ** 2;
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
      return best;
    },
    boundsHalf,
  };
}

/** Parity helper: legacy adapter queries must equal the static arena. */
export function legacyQueryParity(): {
  ground: (x: number, z: number) => number;
  obstacle: (x: number, z: number) => Obstacle | undefined;
  circle: (x: number, z: number, r: number) => { x: number; z: number; hit: boolean };
  ramp: (x: number, z: number) => RampDef | undefined;
  spawn: (x: number, z: number) => { x: number; z: number };
} {
  const model = buildLegacyArenaModel();
  const queries = createArenaQueries(model);
  return {
    ground: (x, z) => queries.groundHeightAt(x, z),
    obstacle: (x, z) => queries.obstacleAt(x, z),
    circle: (x, z, r) => queries.resolveCircle(x, z, r),
    ramp: (x, z) => queries.rampAt(x, z),
    spawn: (x, z) => queries.nearestSpawn(x, z),
  };
}
