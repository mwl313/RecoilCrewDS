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
import type { ModeDefinition } from '../content/schemas/mode';
import type { FeatureRange, MacroFeatureConfig, MacroFeatureConfigs } from './features';
import type { DensityProfileDef, FurnitureSetDef, LandmarkDef } from './phase2Profiles';

export interface TerrainProfileDef {
  id: string;
  label?: string;
  baseHeight: number;
  heightRange: { min: number; max: number };
  maxSlope: number;
  /** Purpose-split slope categories; derived from maxSlope when absent. */
  slopeRules?: SlopeRules;
  /** Legacy opt-in: correct the whole map instead of only protected cells. */
  correctAllMap?: boolean;
  /** Mask-aware final smoothing passes (default 1). */
  finalSmoothingPasses?: number;
  /** Presentation material id for cliff walls (rendering only). */
  cliffMaterialId?: string;
  smoothingPasses: number;
  slopeCorrectionIterations: number;
  retryLimit: number;
  maxGenerationMs: number;
  /** Sample the legacy analytic ground instead of generated features. */
  legacySampled: boolean;
  features: MacroFeatureConfigs;
}

/**
 * Resolved terrain material profile (validated content, presentation-only).
 * Plain serializable shape so it travels through the generated client bundle
 * without carrying content-registry bookkeeping fields.
 */
export type TerrainMaterialProfileDef =
  | {
      id: string;
      label?: string;
      kind: 'pbrTextureSet';
      baseColorAssetId: string;
      normalAssetId?: string;
      roughnessAssetId?: string;
      tileSizeMeters: number;
      tint: string;
      normalScale: [number, number];
      roughness: number;
      metalness: number;
      anisotropy: number;
      fallbackColor: string;
    }
  | {
      id: string;
      label?: string;
      kind: 'proceduralFallback';
      tileSizeMeters: number;
      baseColor: string;
      gridColor: string;
      patchColor: string;
      roughness: number;
      metalness: number;
    };

export interface SlopeRules {
  driveableMax: number;
  riskyMax: number;
  blockedMin: number;
  cliffMin: number;
  spawnMax: number;
  recoveryMax: number;
  landingMax: number;
  maxStepUp: number;
}

/** Back-compatible slope rules derived from the legacy single maxSlope. */
export function resolveSlopeRules(profile: TerrainProfileDef): SlopeRules {
  if (profile.slopeRules) return profile.slopeRules;
  const m = profile.maxSlope;
  return {
    driveableMax: m,
    riskyMax: m * 1.6,
    blockedMin: m * 1.6,
    cliffMin: m * 2.4,
    spawnMax: 0.2,
    recoveryMax: 0.18,
    landingMax: 0.25,
    maxStepUp: 0.8,
  };
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
  terrainMaterialProfileId: string;
  validationProfileId: string;
  fallbackMapId: string | null;
  isFallback: boolean;
  furnitureSetId: string;
  densityProfileId: string;
  /** Optional isolated authored-city layer; production maps omit this. */
  urbanPrototypeId?: 'urban200' | 'urban400';
}

export interface MapGenerationBundle {
  map: MapDefinitionDef;
  terrainProfile: TerrainProfileDef;
  terrainMaterialProfile: TerrainMaterialProfileDef;
  validationProfile: ValidationProfileDef;
  furnitureSet: FurnitureSetDef;
  densityProfile: DensityProfileDef;
  landmarks: LandmarkDef[];
}

/**
 * Which map profile a pack's active mode asks the game to load. Modes may
 * declare `mapProfileId`; without it the game keeps the legacy primary map.
 * Server selection, the generated client bundle, Single Player, and Map Lab all
 * resolve through this single function.
 */
export function resolveDefaultMapProfileId(pack: ContentPack, modeId = pack.modeId): string {
  const mode = pack.get<ModeDefinition>('modes', modeId);
  return mode?.mapProfileId ?? 'map.arena400Primary';
}

/** Resolve a map + its profiles from a validated content pack. */
export function resolveMapBundle(pack: ContentPack, mapId: string): MapGenerationBundle {
  const map = pack.getMap(mapId);
  const terrainProfile = pack.getTerrainProfile(map.terrainProfileId);
  const terrainMaterialProfile = toTerrainMaterialProfileDef(pack.getTerrainMaterialProfile(map.terrainMaterialProfileId));
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
      terrainMaterialProfileId: map.terrainMaterialProfileId,
      validationProfileId: map.validationProfileId,
      fallbackMapId: map.fallbackMapId ?? null,
      isFallback: map.isFallback,
      furnitureSetId: map.furnitureSetId,
      densityProfileId: map.densityProfileId,
      urbanPrototypeId: map.urbanPrototypeId,
    },
    terrainMaterialProfile,
    terrainProfile: {
      id: terrainProfile.id,
      label: terrainProfile.label,
      baseHeight: terrainProfile.baseHeight,
      heightRange: { ...terrainProfile.heightRange },
      maxSlope: terrainProfile.maxSlope,
      slopeRules: terrainProfile.slopeRules ? { ...terrainProfile.slopeRules } : undefined,
      correctAllMap: terrainProfile.correctAllMap,
      finalSmoothingPasses: terrainProfile.finalSmoothingPasses,
      cliffMaterialId: terrainProfile.cliffMaterialId,
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
        ...(terrainProfile.features.cliffPlateau ? { cliffPlateau: toFeatureConfig(terrainProfile.features.cliffPlateau) } : {}),
        ...(terrainProfile.features.escarpment ? { escarpment: toFeatureConfig(terrainProfile.features.escarpment) } : {}),
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

function toTerrainMaterialProfileDef(
  profile: {
    id: string;
    label?: string;
    kind: 'pbrTextureSet' | 'proceduralFallback';
    baseColorAssetId?: string;
    normalAssetId?: string;
    roughnessAssetId?: string;
    tileSizeMeters: number;
    tint?: string;
    normalScale?: [number, number];
    roughness: number;
    metalness: number;
    anisotropy?: number;
    fallbackColor?: string;
    baseColor?: string;
    gridColor?: string;
    patchColor?: string;
  },
): TerrainMaterialProfileDef {
  if (profile.kind === 'pbrTextureSet') {
    return {
      id: profile.id,
      label: profile.label,
      kind: 'pbrTextureSet',
      baseColorAssetId: profile.baseColorAssetId!,
      normalAssetId: profile.normalAssetId,
      roughnessAssetId: profile.roughnessAssetId,
      tileSizeMeters: profile.tileSizeMeters,
      tint: profile.tint!,
      normalScale: [...profile.normalScale!] as [number, number],
      roughness: profile.roughness,
      metalness: profile.metalness,
      anisotropy: profile.anisotropy!,
      fallbackColor: profile.fallbackColor!,
    };
  }
  return {
    id: profile.id,
    label: profile.label,
    kind: 'proceduralFallback',
    tileSizeMeters: profile.tileSizeMeters,
    baseColor: profile.baseColor!,
    gridColor: profile.gridColor!,
    patchColor: profile.patchColor!,
    roughness: profile.roughness,
    metalness: profile.metalness,
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
  edgeWidth?: [number, number];
  edgeRoughness?: number;
  accessCount?: number;
  accessWidth?: number;
  accessMaxSlope?: number;
  safetyBuffer?: number;
  boundaryClearance?: number;
  spawnClearance?: number;
}): MacroFeatureConfig {
  return {
    count: cfg.count,
    minSeparation: cfg.minSeparation,
    radius: toRange(cfg.radius),
    depth: toRange(cfg.depth),
    height: toRange(cfg.height),
    length: toRange(cfg.length),
    width: toRange(cfg.width),
    falloff: cfg.falloff,
    edgeWidth: toRange(cfg.edgeWidth),
    edgeRoughness: cfg.edgeRoughness,
    accessCount: cfg.accessCount,
    accessWidth: cfg.accessWidth,
    accessMaxSlope: cfg.accessMaxSlope,
    safetyBuffer: cfg.safetyBuffer,
    boundaryClearance: cfg.boundaryClearance,
    spawnClearance: cfg.spawnClearance,
  };
}

function toRange(value: [number, number] | undefined): FeatureRange | undefined {
  return value ? { min: value[0], max: value[1] } : undefined;
}
