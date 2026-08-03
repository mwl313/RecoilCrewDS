import {
  ARENA,
  groundHeightAt as staticGroundHeightAt,
  groundNormalAt as staticGroundNormalAt,
  resolveCircleContacts as staticResolveCircleContacts,
  type RampDef,
} from '../arena';
import type { CollisionContact } from '../math';
import type { TerrainTransition } from '../mapgen/terrainTraversal';

/** Ground/topology queries used by tank kinematics and prediction. */
export interface GroundQuery {
  groundHeightAt(x: number, z: number): number;
  groundNormalAt(x: number, z: number): { nx: number; ny: number; nz: number };
  ramps: RampDef[];
  half: number;
  resolveCircleContacts(
    x: number,
    z: number,
    r: number,
  ): { x: number; z: number; contacts: CollisionContact[] };
  /** Cliff/step transition query (absent on the legacy analytic arena). */
  queryTerrainTransition?(fromX: number, fromZ: number, toX: number, toZ: number): TerrainTransition | null;
  terrainFlagsAt?(x: number, z: number): number | undefined;
  isDriveableAt?(x: number, z: number): boolean;
  isCliffWallAt?(x: number, z: number): boolean;
  isRequiredTraversalAt?(x: number, z: number): boolean;
}

/** The legacy analytic ground (used when no generated arena is supplied). */
export const STATIC_GROUND_QUERY: GroundQuery = {
  groundHeightAt: staticGroundHeightAt,
  groundNormalAt: staticGroundNormalAt,
  ramps: ARENA.ramps,
  half: ARENA.half,
  resolveCircleContacts: staticResolveCircleContacts,
};
