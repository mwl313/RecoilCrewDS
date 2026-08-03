/**
 * Phase 2 content-facing profile types: landmarks, furniture sets, and
 * density profiles. The authoritative values come from validated content;
 * LEGACY_MAP_LAYOUT_DEFINITIONS mirrors them for the client-safe path.
 */
import type { FurnitureEntryDef } from './furniture';
import type { ZoneTag } from './zones';

export interface LandmarkDef {
  id: string;
  zoneTag: ZoneTag;
  source: 'basin' | 'plateau' | 'ridge' | 'valley' | 'hill' | 'center' | 'edge' | 'spawn' | 'recovery';
  count: number;
  priority: number;
  assetId?: string;
}

export interface FurnitureSetDef {
  id: string;
  label?: string;
  routeClearance: number;
  routeMinHalfWidth: number;
  maxRouteSlope: number;
  landmarks: string[];
  ramps: {
    count: number;
    length: [number, number];
    width: [number, number];
    rise: [number, number];
    minSpacing: number;
  };
  barrel: {
    count: number;
    minSpacing: number;
    chainRadius: number;
    maxChain: number;
  };
  entries: FurnitureEntryDef[];
}

export interface DensityProfileDef {
  id: string;
  label?: string;
  budgets: {
    maxObjects: number;
    maxColliders: number;
    maxBarrels: number;
    maxCrates: number;
    maxRamps: number;
    maxMedium: number;
    maxDecorations: number;
    maxBarrelChain: number;
  };
}

/** Client-safe mirror of the shipped Phase 2 layout definitions. */
export const LEGACY_MAP_LAYOUT_DEFINITIONS = {
  'furnitureSet.primary': {
    id: 'furnitureSet.primary',
    label: 'Primary 400m Furniture',
    routeClearance: 14,
    routeMinHalfWidth: 12,
    maxRouteSlope: 0.35,
    landmarks: [
      'landmark.basinCenter',
      'landmark.resourcePlateau',
      'landmark.rampPark',
      'landmark.openCombat',
    ],
    ramps: { count: 4, length: [8, 14], width: [8, 12], rise: [0.8, 2.2], minSpacing: 60 },
    barrel: { count: 16, minSpacing: 10, chainRadius: 8, maxChain: 3 },
    entries: [
      { kind: 'largeObstacle', assetId: 'prop.container', obstacleType: 'container', count: 8, minSpacing: 16, clearance: 2, zoneTags: ['openCombat', 'resource'], slopeMax: 0.15, collider: true },
      { kind: 'largeObstacle', assetId: 'prop.barrier', obstacleType: 'barrier', count: 6, minSpacing: 14, clearance: 1.5, zoneTags: ['openCombat', 'flat'], slopeMax: 0.18, collider: true },
      { kind: 'barrel', assetId: 'prop.explosiveBarrel', count: 16, minSpacing: 10, clearance: 1.5, zoneTags: ['openCombat', 'flat'], slopeMax: 0.2, collider: true },
      { kind: 'crate', assetId: 'prop.container', obstacleType: 'scrapPile', count: 8, minSpacing: 12, clearance: 1.5, zoneTags: ['resource', 'highland'], slopeMax: 0.22, collider: true },
      { kind: 'medium', assetId: 'prop.tire', obstacleType: 'tires', count: 10, minSpacing: 10, clearance: 1, zoneTags: ['flat', 'slope'], slopeMax: 0.2, collider: true },
      { kind: 'decoration', assetId: 'prop.tire', count: 18, minSpacing: 4, clearance: 0.5, zoneTags: ['flat', 'slope', 'openCombat'], slopeMax: 0.3, collider: false },
    ],
  } as FurnitureSetDef,
  'furnitureSet.fallback': {
    id: 'furnitureSet.fallback',
    label: 'Legacy Fallback Furniture',
    routeClearance: 14,
    routeMinHalfWidth: 12,
    maxRouteSlope: 0.35,
    landmarks: [],
    ramps: { count: 0, length: [8, 12], width: [8, 10], rise: [1, 2], minSpacing: 60 },
    barrel: { count: 0, minSpacing: 10, chainRadius: 8, maxChain: 3 },
    entries: [],
  } as FurnitureSetDef,
  'densityProfile.primary': {
    id: 'densityProfile.primary',
    label: 'Primary 400m Density',
    budgets: {
      maxObjects: 80,
      maxColliders: 60,
      maxBarrels: 20,
      maxCrates: 12,
      maxRamps: 6,
      maxMedium: 14,
      maxDecorations: 24,
      maxBarrelChain: 3,
    },
  } as DensityProfileDef,
  'densityProfile.fallback': {
    id: 'densityProfile.fallback',
    label: 'Legacy Fallback Density',
    budgets: {
      maxObjects: 0,
      maxColliders: 0,
      maxBarrels: 0,
      maxCrates: 0,
      maxRamps: 0,
      maxMedium: 0,
      maxDecorations: 0,
      maxBarrelChain: 3,
    },
  } as DensityProfileDef,
  landmarks: {
    'landmark.basinCenter': { id: 'landmark.basinCenter', zoneTag: 'basin', source: 'basin', count: 1, priority: 10 } as LandmarkDef,
    'landmark.resourcePlateau': { id: 'landmark.resourcePlateau', zoneTag: 'resource', source: 'plateau', count: 3, priority: 8 } as LandmarkDef,
    'landmark.rampPark': { id: 'landmark.rampPark', zoneTag: 'rampPark', source: 'ridge', count: 2, priority: 6 } as LandmarkDef,
    'landmark.openCombat': { id: 'landmark.openCombat', zoneTag: 'openCombat', source: 'center', count: 2, priority: 4 } as LandmarkDef,
  },
} as const;
