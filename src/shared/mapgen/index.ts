export { ARENA_GENERATOR_VERSION, composeArenaBaseSeed, composeArenaCandidateSeed, hash32 } from './seed';
export { forkSeed, forkSubstreams, mulberry32, SUBSTREAM_NAMES, type Rng, type SubstreamName } from './prng';
export { Heightfield, type HeightfieldOptions } from './heightfield';
export {
  applyFeature,
  applyMacroFeatures,
  placeMacroFeatures,
  type FeatureRange,
  type MacroFeatureConfig,
  type MacroFeatureConfigs,
  type MacroFeatureRecord,
  type MacroFeatureType,
} from './features';
export {
  generateTerrain,
  type GeneratedArena,
  type GenerateTerrainOptions,
  type TerrainResult,
} from './generator';
export {
  arenaIdentityHash,
  validateArena,
  verifyDeterminism,
  type ValidationMetrics,
  type ValidationReport,
} from './validation';
export {
  LEGACY_MAP_DEFINITIONS,
  resolveMapBundle,
  type MapDefinitionDef,
  type MapGenerationBundle,
  type TerrainProfileDef,
  type ValidationProfileDef,
} from './profiles';
export { generateArenaWithRetry, type GenerateArenaOptions } from './retry';
export {
  buildLegacyArenaModel,
  createArenaQueries,
  legacyQueryParity,
  toArenaProps,
  type ArenaProps,
  type ArenaQueries,
} from './compat';
export { SpatialHash, type SpatialEntry } from './spatial';
export {
  buildRouteGraph,
  buildWaypointCandidates,
  carveRoutes,
  distToSegment,
  segmentSlope,
  DEFAULT_ROUTE_PROFILE,
  type RouteCorridor,
  type RouteEdge,
  type RouteGraph,
  type RouteNode,
  type RouteNodeTag,
  type RouteProfile,
} from './routes';
export {
  ZONE_TAGS,
  classifyZones,
  findRegions,
  ZoneGrid,
  type ZoneClassification,
  type ZoneRegion,
  type ZoneTag,
} from './zones';
export {
  buildGateCandidates,
  buildSpawnCandidates,
  nearestNode,
  selectHordeGates,
  selectPlayerSpawns,
  type GateCandidate,
  type HordeGate,
  type PlayerSpawn,
} from './spawns';
export { MOVEMENT_BOUNDS, placeRamps, validateRamp, type GeneratedRamp, type LandingResult } from './ramps';
export { barrelComponents, validateBarrelLayout, type BarrelComponent, type BarrelLike } from './barrels';
export { findRecoveryZones } from './recovery';
export {
  placeFurniture,
  type Exclusion,
  type FurnitureEntryDef,
  type FurnitureKind,
  type FurnitureOptions,
  type GeneratedObject,
} from './furniture';
export { generateMapLayout, type GenerateLayoutOptions, type MapLayoutResult } from './layout';
export { validatePhase2, type Phase2Metrics, type Phase2ValidationResult } from './validation2';
export {
  LEGACY_MAP_LAYOUT_DEFINITIONS,
  type DensityProfileDef,
  type FurnitureSetDef,
  type LandmarkDef,
} from './phase2Profiles';

/**
 * Phase 1 keeps normal gameplay on the fixed hand-built arena. Set this to
 * true only when Phase 3 wires a generated arena instance through the match
 * (server generates -> checksum -> clients regenerate -> queries swap).
 */
export const MAP_GENERATION_ENABLED = false;
