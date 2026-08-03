/**
 * Phase 2/3 content-facing profile types: landmarks, furniture sets, and
 * density profiles. Authoritative values come from validated content; the
 * client-safe data comes from the auto-generated bundle
 * (src/generated/mapProfiles.generated.ts). No hand-maintained mirror.
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
  /** Master switch: false still generates terrain/routes/zones/spawns/gates. */
  objectPlacement: { enabled: boolean };
  /** Data-driven light poles (explicit toggle; not hardcoded). */
  lightPoles: { enabled: boolean; count: number };
  ramps: {
    enabled: boolean;
    count: number;
    length: [number, number];
    width: [number, number];
    rise: [number, number];
    minSpacing: number;
  };
  barrel: {
    enabled: boolean;
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
