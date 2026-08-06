/**
 * Match-scoped arena world. Every match carries its own world instance;
 * there is no global current arena. The static world delegates to the
 * legacy analytic arena (byte-identical Demo behavior), while generated
 * worlds route all queries through their own heightfield + props.
 */
import {
  ARENA,
  groundHeightAt as staticGroundHeightAt,
  groundNormalAt as staticGroundNormalAt,
  nearestSpawn as staticNearestSpawn,
  obstacleAt as staticObstacleAt,
  rampAt as staticRampAt,
  resolveCircleContacts as staticResolveCircleContacts,
  type BarrelProp,
  type Obstacle,
  type RampDef,
} from '../arena';
import type { CollisionContact } from '../math';
import type { ArenaMetadata } from '../mapgen/arenaSession';
import { createArenaQueries, toArenaProps, type ArenaProps } from '../mapgen/compat';
import type { GeneratedArena } from '../mapgen/generator';
import type { Heightfield } from '../mapgen/heightfield';
import type { GroundQuery } from './groundQuery';

export interface ArenaWorld extends GroundQuery {
  metadata: ArenaMetadata | null;
  obstacleAt(x: number, z: number, elevation?: number): Obstacle | undefined;
  resolveCircleContacts(
    x: number,
    z: number,
    r: number,
    elevation?: number,
  ): { x: number; z: number; contacts: CollisionContact[] };
  resolveCircle(x: number, z: number, r: number): { x: number; z: number; hit: boolean };
  nearestSpawn(x: number, z: number): { x: number; z: number };
  obstacles: Obstacle[];
  barrels: BarrelProp[];
  ramps: RampDef[];
  spawnPoints: { x: number; z: number }[];
  bugSpawns: { x: number; z: number }[];
  towerSpots: { x: number; z: number }[];
  truckRoute: { x: number; z: number }[];
  heightfield?: Heightfield;
  arena?: GeneratedArena;
}

/** Legacy world backed by the static arena module (Demo-faithful). */
export function createStaticArenaWorld(): ArenaWorld {
  return {
    metadata: null,
    groundHeightAt: staticGroundHeightAt,
    groundNormalAt: staticGroundNormalAt,
    ramps: ARENA.ramps,
    half: ARENA.half,
    obstacleAt: staticObstacleAt,
    resolveCircleContacts: staticResolveCircleContacts,
    resolveCircle: (x, z, r) => {
      const res = staticResolveCircleContacts(x, z, r);
      return { x: res.x, z: res.z, hit: res.contacts.length > 0 };
    },
    nearestSpawn: staticNearestSpawn,
    obstacles: ARENA.obstacles,
    barrels: ARENA.barrels,
    spawnPoints: ARENA.spawnPoints,
    bugSpawns: ARENA.bugSpawns,
    towerSpots: ARENA.towerSpots,
    truckRoute: ARENA.truckRoute,
  };
}

/** World backed by a generated arena + its props (Phase 3 path). */
export function createGeneratedArenaWorld(
  arena: GeneratedArena & { props?: ArenaProps },
  metadata: ArenaMetadata | null,
): ArenaWorld {
  const queries = createArenaQueries(arena);
  const props: ArenaProps = arena.props ?? toArenaProps(arena);
  return {
    metadata,
    groundHeightAt: (x, z) => queries.groundHeightAt(x, z),
    groundNormalAt: (x, z) => queries.groundNormalAt(x, z),
    queryTerrainTransition: (fromX, fromZ, toX, toZ) => queries.queryTerrainTransition(fromX, fromZ, toX, toZ),
    terrainFlagsAt: (x, z) => queries.terrainFlagsAt(x, z),
    isDriveableAt: (x, z) => queries.isDriveableAt(x, z),
    isCliffWallAt: (x, z) => queries.isCliffWallAt(x, z),
    isRequiredTraversalAt: (x, z) => queries.isRequiredTraversalAt(x, z),
    ramps: props.ramps,
    half: props.half,
    bounds: props.bounds,
    obstacleAt: (x, z, elevation) => queries.obstacleAt(x, z, elevation),
    resolveCircleContacts: (x, z, r, elevation) => queries.resolveCircleContacts(x, z, r, elevation),
    resolveCircle: (x, z, r) => queries.resolveCircle(x, z, r),
    nearestSpawn: (x, z) => queries.nearestSpawn(x, z),
    obstacles: props.obstacles,
    barrels: props.barrels,
    spawnPoints: props.spawnPoints,
    bugSpawns: props.bugSpawns,
    towerSpots: props.towerSpots,
    truckRoute: props.truckRoute,
    heightfield: arena.heightfield,
    arena,
  };
}
