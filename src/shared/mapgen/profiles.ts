/**
 * Structural map/terrain/validation profile types shared by the generator.
 *
 * The authoritative values come from validated content JSON
 * (content/maps, content/terrain-profiles, content/validation-profiles);
 * LEGACY_MAP_DEFINITIONS mirrors the same values for the client-safe path
 * (parity-tested), keeping fs/zod out of the browser bundle.
 */
import type { ContentPack } from '../content/contentPack';
import type { FeatureRange, MacroFeatureConfigs } from './features';
import {
  LEGACY_MAP_LAYOUT_DEFINITIONS,
  type DensityProfileDef,
  type FurnitureSetDef,
  type LandmarkDef,
} from './phase2Profiles';

export interface TerrainProfileDef {
  id: string;
  label?: string;
  baseHeight: number;
  heightRange: { min: number; max: number };
  maxSlope: number;
  smoothingPasses: number;
  slopeCorrectionIterations: number;
  retryLimit: number;
  maxGenerationMs: number;
  /** Sample the legacy analytic ground instead of generated features. */
  legacySampled: boolean;
  features: MacroFeatureConfigs;
}

export interface ValidationProfileDef {
  id: string;
  label?: string;
  heightRange: { min: number; max: number };
  maxSlope: number;
  minFeatureSeparation: number;
  maxGenerationMs: number;
  boundsEpsilon: number;
  checkDeterminism: boolean;
}

export interface MapDefinitionDef {
  id: string;
  label?: string;
  widthMeters: number;
  depthMeters: number;
  cellSize: number;
  terrainProfileId: string;
  validationProfileId: string;
  fallbackMapId: string | null;
  isFallback: boolean;
  furnitureSetId: string;
  densityProfileId: string;
}

export interface MapGenerationBundle {
  map: MapDefinitionDef;
  terrainProfile: TerrainProfileDef;
  validationProfile: ValidationProfileDef;
  furnitureSet: FurnitureSetDef;
  densityProfile: DensityProfileDef;
  landmarks: LandmarkDef[];
}

/** Resolve a map + its profiles from a validated content pack. */
export function resolveMapBundle(pack: ContentPack, mapId: string): MapGenerationBundle {
  const map = pack.getMap(mapId);
  const terrainProfile = pack.getTerrainProfile(map.terrainProfileId);
  const validationProfile = pack.getValidationProfile(map.validationProfileId);
  return {
    map: {
      id: map.id,
      label: map.label,
      widthMeters: map.widthMeters,
      depthMeters: map.depthMeters,
      cellSize: map.cellSize,
      terrainProfileId: map.terrainProfileId,
      validationProfileId: map.validationProfileId,
      fallbackMapId: map.fallbackMapId ?? null,
      isFallback: map.isFallback,
      furnitureSetId: map.furnitureSetId,
      densityProfileId: map.densityProfileId,
    },
    terrainProfile: {
      id: terrainProfile.id,
      label: terrainProfile.label,
      baseHeight: terrainProfile.baseHeight,
      heightRange: { ...terrainProfile.heightRange },
      maxSlope: terrainProfile.maxSlope,
      smoothingPasses: terrainProfile.smoothingPasses,
      slopeCorrectionIterations: terrainProfile.slopeCorrectionIterations,
      retryLimit: terrainProfile.retryLimit,
      maxGenerationMs: terrainProfile.maxGenerationMs,
      legacySampled: terrainProfile.legacySampled,
      features: {
        basin: toFeatureConfig(terrainProfile.features.basin),
        ridge: toFeatureConfig(terrainProfile.features.ridge),
        plateau: toFeatureConfig(terrainProfile.features.plateau),
        valley: toFeatureConfig(terrainProfile.features.valley),
        hill: toFeatureConfig(terrainProfile.features.hill),
      },
    },
    validationProfile: {
      id: validationProfile.id,
      label: validationProfile.label,
      heightRange: { ...validationProfile.heightRange },
      maxSlope: validationProfile.maxSlope,
      minFeatureSeparation: validationProfile.minFeatureSeparation,
      maxGenerationMs: validationProfile.maxGenerationMs,
      boundsEpsilon: validationProfile.boundsEpsilon,
      checkDeterminism: validationProfile.checkDeterminism,
    },
    furnitureSet: {
      id: pack.getFurnitureSet(map.furnitureSetId).id,
      label: pack.getFurnitureSet(map.furnitureSetId).label,
      routeClearance: pack.getFurnitureSet(map.furnitureSetId).routeClearance,
      routeMinHalfWidth: pack.getFurnitureSet(map.furnitureSetId).routeMinHalfWidth,
      maxRouteSlope: pack.getFurnitureSet(map.furnitureSetId).maxRouteSlope,
      landmarks: [...pack.getFurnitureSet(map.furnitureSetId).landmarks],
      ramps: { ...pack.getFurnitureSet(map.furnitureSetId).ramps },
      barrel: { ...pack.getFurnitureSet(map.furnitureSetId).barrel },
      entries: pack.getFurnitureSet(map.furnitureSetId).entries.map((e) => ({
        kind: e.kind,
        assetId: e.assetId,
        obstacleType: e.obstacleType,
        count: e.count,
        minSpacing: e.minSpacing,
        clearance: e.clearance,
        zoneTags: [...e.zoneTags],
        slopeMax: e.slopeMax,
        collider: e.collider,
      })),
    },
    densityProfile: {
      id: pack.getDensityProfile(map.densityProfileId).id,
      label: pack.getDensityProfile(map.densityProfileId).label,
      budgets: { ...pack.getDensityProfile(map.densityProfileId).budgets },
    },
    landmarks: pack
      .getFurnitureSet(map.furnitureSetId)
      .landmarks.map((id) => {
        const l = pack.getLandmark(id);
        return {
          id: l.id,
          zoneTag: l.zoneTag,
          source: l.source,
          count: l.count,
          priority: l.priority,
          assetId: l.assetId,
        };
      })
      .sort((a, b) => a.priority - b.priority),
  };
}

function toFeatureConfig(cfg: {
  count: number;
  minSeparation: number;
  radius?: [number, number];
  depth?: [number, number];
  height?: [number, number];
  length?: [number, number];
  width?: [number, number];
  falloff: number;
}): MacroFeatureConfigs[keyof MacroFeatureConfigs] {
  return {
    count: cfg.count,
    minSeparation: cfg.minSeparation,
    radius: toRange(cfg.radius),
    depth: toRange(cfg.depth),
    height: toRange(cfg.height),
    length: toRange(cfg.length),
    width: toRange(cfg.width),
    falloff: cfg.falloff,
  };
}

function toRange(value: [number, number] | undefined): FeatureRange | undefined {
  return value ? { min: value[0], max: value[1] } : undefined;
}

/** Client-safe mirror of the shipped primary map bundle. */
export const LEGACY_MAP_DEFINITIONS: Record<string, MapGenerationBundle> = {
  'map.arena400Primary': {
    map: {
      id: 'map.arena400Primary',
      label: 'Primary 400m Map',
      widthMeters: 400,
      depthMeters: 400,
      cellSize: 4,
      terrainProfileId: 'terrainProfile.primary',
      validationProfileId: 'validationProfile.primary',
      fallbackMapId: 'map.fallbackLegacy',
      isFallback: false,
      furnitureSetId: 'furnitureSet.primary',
      densityProfileId: 'densityProfile.primary',
    },
    terrainProfile: {
      id: 'terrainProfile.primary',
      label: 'Primary 400m Terrain',
      baseHeight: 0,
      heightRange: { min: -5, max: 10 },
      maxSlope: 0.5,
      smoothingPasses: 2,
      slopeCorrectionIterations: 48,
      retryLimit: 8,
      maxGenerationMs: 500,
      legacySampled: false,
      features: {
        basin: { count: 1, minSeparation: 60, radius: { min: 28, max: 45 }, depth: { min: 2.5, max: 4.5 }, falloff: 0.35 },
        ridge: { count: 2, minSeparation: 70, length: { min: 90, max: 160 }, width: { min: 18, max: 30 }, height: { min: 2.5, max: 4.5 }, falloff: 0.3 },
        plateau: { count: 3, minSeparation: 60, radius: { min: 20, max: 35 }, height: { min: 3, max: 5 }, falloff: 0.25 },
        valley: { count: 2, minSeparation: 70, length: { min: 80, max: 150 }, width: { min: 20, max: 34 }, depth: { min: 2, max: 3.5 }, falloff: 0.3 },
        hill: { count: 5, minSeparation: 25, radius: { min: 10, max: 22 }, height: { min: 1.2, max: 3 }, falloff: 0.3 },
      },
    },
    validationProfile: {
      id: 'validationProfile.primary',
      label: 'Primary 400m Validation',
      heightRange: { min: -5, max: 10 },
      maxSlope: 0.5,
      minFeatureSeparation: 20,
      maxGenerationMs: 500,
      boundsEpsilon: 1e-6,
      checkDeterminism: false,
    },
    furnitureSet: LEGACY_MAP_LAYOUT_DEFINITIONS['furnitureSet.primary'],
    densityProfile: LEGACY_MAP_LAYOUT_DEFINITIONS['densityProfile.primary'],
    landmarks: [
      LEGACY_MAP_LAYOUT_DEFINITIONS.landmarks['landmark.openCombat'],
      LEGACY_MAP_LAYOUT_DEFINITIONS.landmarks['landmark.rampPark'],
      LEGACY_MAP_LAYOUT_DEFINITIONS.landmarks['landmark.resourcePlateau'],
      LEGACY_MAP_LAYOUT_DEFINITIONS.landmarks['landmark.basinCenter'],
    ],
  },
  'map.fallbackLegacy': {
    map: {
      id: 'map.fallbackLegacy',
      label: 'Legacy Fixed Arena Fallback',
      widthMeters: 400,
      depthMeters: 400,
      cellSize: 4,
      terrainProfileId: 'terrainProfile.fallback',
      validationProfileId: 'validationProfile.fallback',
      fallbackMapId: null,
      isFallback: true,
      furnitureSetId: 'furnitureSet.fallback',
      densityProfileId: 'densityProfile.fallback',
    },
    terrainProfile: {
      id: 'terrainProfile.fallback',
      label: 'Legacy Fixed Arena Terrain',
      baseHeight: 0,
      heightRange: { min: -5, max: 10 },
      maxSlope: 0.75,
      smoothingPasses: 0,
      slopeCorrectionIterations: 0,
      retryLimit: 8,
      maxGenerationMs: 500,
      legacySampled: true,
      features: {
        basin: { count: 0, minSeparation: 0, falloff: 0 },
        ridge: { count: 0, minSeparation: 0, falloff: 0 },
        plateau: { count: 0, minSeparation: 0, falloff: 0 },
        valley: { count: 0, minSeparation: 0, falloff: 0 },
        hill: { count: 0, minSeparation: 0, falloff: 0 },
      },
    },
    validationProfile: {
      id: 'validationProfile.fallback',
      label: 'Legacy Fallback Validation',
      heightRange: { min: -5, max: 10 },
      maxSlope: 0.75,
      minFeatureSeparation: 0,
      maxGenerationMs: 500,
      boundsEpsilon: 1e-6,
      checkDeterminism: true,
    },
    furnitureSet: LEGACY_MAP_LAYOUT_DEFINITIONS['furnitureSet.fallback'],
    densityProfile: LEGACY_MAP_LAYOUT_DEFINITIONS['densityProfile.fallback'],
    landmarks: [],
  },
};
