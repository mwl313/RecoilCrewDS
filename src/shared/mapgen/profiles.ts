/**
 * Structural map/terrain/validation profile types shared by the generator.
 *
 * The authoritative values come from validated content JSON
 * (content/maps, content/terrain-profiles, content/validation-profiles,
 * content/furniture-sets, content/density-profiles, content/landmarks).
 * The server resolves bundles with `resolveMapBundle`; the client-safe path
 * uses the auto-generated module (src/generated/mapProfiles.generated.ts,
 * built by `npm run generate:map-profiles`). There is no hand-maintained
 * mirror anymore.
 */
import type { ContentPack } from '../content/contentPack';
import type { FeatureRange, MacroFeatureConfigs } from './features';
import type { DensityProfileDef, FurnitureSetDef, LandmarkDef } from './phase2Profiles';

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
  const furnitureSet = pack.getFurnitureSet(map.furnitureSetId);
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
      id: furnitureSet.id,
      label: furnitureSet.label,
      routeClearance: furnitureSet.routeClearance,
      routeMinHalfWidth: furnitureSet.routeMinHalfWidth,
      maxRouteSlope: furnitureSet.maxRouteSlope,
      landmarks: [...furnitureSet.landmarks],
      objectPlacement: { ...furnitureSet.objectPlacement },
      lightPoles: { ...furnitureSet.lightPoles },
      ramps: { ...furnitureSet.ramps },
      barrel: { ...furnitureSet.barrel },
      entries: furnitureSet.entries.map((e) => ({
        enabled: e.enabled,
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
    landmarks: furnitureSet.landmarks
      .map((id) => {
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
