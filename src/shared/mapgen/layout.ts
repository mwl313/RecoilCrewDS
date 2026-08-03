/**
 * Phase 2 layout orchestrator: route graph -> carving -> zones -> gates ->
 * player spawns -> recovery zones -> ramps -> furniture.
 *
 * All streams derive from named PRNG substreams of the candidate seed, so
 * terrain (Phase 1) never changes when this layer changes.
 */
import { forkSeed, mulberry32 } from './prng';
import type { Heightfield } from './heightfield';
import type { MacroFeatureRecord } from './features';
import { buildRouteGraph, carveRoutes, type RouteCorridor, type RouteGraph } from './routes';
import { classifyZones, type ZoneClassification, type ZoneRegion } from './zones';
import {
  buildGateCandidates,
  buildSpawnCandidates,
  selectHordeGates,
  selectPlayerSpawns,
  type HordeGate,
  type PlayerSpawn,
} from './spawns';
import { placeRamps, type GeneratedRamp } from './ramps';
import { placeFurniture, type GeneratedObject } from './furniture';
import { findRecoveryZones } from './recovery';
import type { DensityProfileDef, FurnitureSetDef, LandmarkDef } from './phase2Profiles';

export interface MapLayoutResult {
  graph: RouteGraph;
  corridors: RouteCorridor[];
  zones: ZoneClassification;
  gates: HordeGate[];
  spawns: PlayerSpawn[];
  recovery: ZoneRegion[];
  ramps: GeneratedRamp[];
  objects: GeneratedObject[];
  furnitureSet: FurnitureSetDef;
  densityProfile: DensityProfileDef;
}

export interface GenerateLayoutOptions {
  candidateSeed: number;
  hf: Heightfield;
  features: MacroFeatureRecord[];
  widthMeters: number;
  depthMeters: number;
  furnitureSet: FurnitureSetDef;
  densityProfile: DensityProfileDef;
  landmarks: LandmarkDef[];
}

export function generateMapLayout(options: GenerateLayoutOptions): MapLayoutResult {
  const routesRng = mulberry32(forkSeed(options.candidateSeed, 'routes'));
  const spawnsRng = mulberry32(forkSeed(options.candidateSeed, 'spawns'));
  const furnitureRng = mulberry32(forkSeed(options.candidateSeed, 'furniture'));
  const centerX = options.widthMeters / 2;
  const centerZ = options.depthMeters / 2;

  const gateCandidates = buildGateCandidates(spawnsRng, options.widthMeters, options.depthMeters);
  const spawnCandidates = buildSpawnCandidates(spawnsRng, centerX, centerZ);

  const graph = buildRouteGraph({
    rng: routesRng,
    hf: options.hf,
    features: options.features,
    widthMeters: options.widthMeters,
    depthMeters: options.depthMeters,
    gateCandidates,
    spawnCandidates,
    profile: {
      routeClearance: options.furnitureSet.routeClearance,
      routeMinHalfWidth: options.furnitureSet.routeMinHalfWidth,
      maxRouteSlope: options.furnitureSet.maxRouteSlope,
    },
  });

  // Carve required corridors before gates/spawns/zones validate terrain.
  carveRoutes(options.hf, graph.corridors, options.furnitureSet.maxRouteSlope);

  const gates = selectHordeGates(
    { rng: spawnsRng, hf: options.hf, graph, widthMeters: options.widthMeters, depthMeters: options.depthMeters, centerX, centerZ },
    gateCandidates,
  );
  const spawns = selectPlayerSpawns(
    { rng: spawnsRng, hf: options.hf, graph, widthMeters: options.widthMeters, depthMeters: options.depthMeters, centerX, centerZ },
    gates,
    spawnCandidates,
    4,
  );

  const zones = classifyZones({
    hf: options.hf,
    graph,
    features: options.features,
    widthMeters: options.widthMeters,
    depthMeters: options.depthMeters,
  });

  // Landmark-anchored regions (ramp parks from ridges/plateaus, resource
  // anchors from plateaus) plus spawn/gate/recovery tags.
  for (const landmark of options.landmarks) {
    const sources = options.features.filter((f) => f.type === landmark.source);
    for (const feature of sources.slice(0, landmark.count)) {
      zones.regions.push({
        id: `${landmark.id}.${feature.id}`,
        tag: landmark.zoneTag,
        x: feature.x,
        z: feature.z,
        radius: Math.max(feature.radius, feature.width) * 1.1,
      });
    }
    if (landmark.source === 'center' && landmark.zoneTag === 'openCombat') {
      zones.regions.push({
        id: `${landmark.id}.center`,
        tag: landmark.zoneTag,
        x: centerX,
        z: centerZ,
        radius: 60,
      });
    }
  }
  for (const s of spawns) zones.regions.push({ id: `spawnSafe.${s.id}`, tag: 'spawnSafe', x: s.x, z: s.z, radius: 12 });
  for (const g of gates) zones.regions.push({ id: `enemyGate.${g.id}`, tag: 'enemyGate', x: g.x, z: g.z, radius: 10 });

  const recovery = findRecoveryZones({
    rng: spawnsRng,
    hf: options.hf,
    graph,
    gates,
    widthMeters: options.widthMeters,
    depthMeters: options.depthMeters,
    count: 4,
  });
  for (const r of recovery) zones.regions.push(r);

  const ramps = placeRamps({
    rng: furnitureRng,
    hf: options.hf,
    graph,
    zones: zones.regions,
    widthMeters: options.widthMeters,
    depthMeters: options.depthMeters,
    count: options.furnitureSet.ramps.count,
    lengthRange: options.furnitureSet.ramps.length,
    widthRange: options.furnitureSet.ramps.width,
    riseRange: options.furnitureSet.ramps.rise,
    minSpacing: options.furnitureSet.ramps.minSpacing,
  });

  const objects = placeFurniture({
    rng: furnitureRng,
    hf: options.hf,
    graph,
    zoneGrid: zones.grid,
    regions: zones.regions,
    spawns,
    gates,
    ramps,
    recovery,
    widthMeters: options.widthMeters,
    depthMeters: options.depthMeters,
    routeClearance: options.furnitureSet.routeClearance,
    entries: options.furnitureSet.entries,
    budgets: options.densityProfile.budgets,
  });

  return {
    graph,
    corridors: graph.corridors,
    zones,
    gates,
    spawns,
    recovery,
    ramps,
    objects,
    furnitureSet: options.furnitureSet,
    densityProfile: options.densityProfile,
  };
}
