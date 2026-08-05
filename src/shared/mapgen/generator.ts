/**
 * Deterministic terrain generation pipeline and the generated arena model.
 *
 * Order (dramatic terrain contract):
 * base → non-cliff macro stamps → broad smoothing → height clamp →
 * cliff feature placement → cliff top/bottom shaping → access corridors →
 * terrain-cost classification → required route graph (layout) → route
 * carving → protected-area correction → mask-aware final smoothing →
 * cliff-edge refresh → layout and optional props → validation.
 * No Math.random(); everything derives from the candidate seed.
 */
import { groundHeightAt as legacyGroundHeightAt } from '../arena';
import { clamp } from '../math';
import { applyMacroFeatures, placeMacroFeatures, type MacroFeatureRecord } from './features';
import {
  applyCliffFeatures,
  carveCliffAccessCorridors,
  cliffEdgeMetrics,
  computeCliffMasks,
  extractCliffEdges,
  placeCliffFeatures,
  type AccessCorridor,
  type CliffEdgeSegment,
  type CliffFeatureRecord,
  type CliffMasks,
} from './cliffs';
import { Heightfield } from './heightfield';
import type { MapLayoutResult } from './layout';
import { mulberry32, type Rng } from './prng';
import { resolveSlopeRules, type SlopeRules, type TerrainProfileDef } from './profiles';
import type { TerrainMaterialProfileDef } from './profiles';
import {
  classifyTerrainFlags,
  markProtectedCircle,
  terrainClassMetrics,
  TerrainFlag,
  type TerrainClassMetrics as TerrainClassMetricsType,
} from './terrainFlags';
import type { ValidationReport } from './validation';
import { distToSegment } from './routes';

export interface TerrainResult {
  heightfield: Heightfield;
  macroFeatures: MacroFeatureRecord[];
  cliffFeatures: CliffFeatureRecord[];
  cliffMasks: CliffMasks;
  cliffEdges: CliffEdgeSegment[];
  accessCorridors: AccessCorridor[];
  slopes: Float32Array;
  steepMask: Uint8Array;
  terrainFlags: Uint32Array;
}

export interface TerrainMetrics {
  driveableRatio: number;
  riskyRatio: number;
  blockedRatio: number;
  cliffCount: number;
  cliffEdgeLength: number;
  largestDrop: number;
}

export interface GeneratedArena {
  baseSeed: number;
  candidateSeed: number;
  attempt: number;
  profileId: string;
  mapId: string;
  generatorVersion: number;
  widthMeters: number;
  depthMeters: number;
  cellSize: number;
  /** World coordinate of the sample at local (0,0) — maps are centered. */
  originX: number;
  originZ: number;
  heightfield: Heightfield;
  macroFeatures: MacroFeatureRecord[];
  cliffFeatures: CliffFeatureRecord[];
  cliffMasks: CliffMasks;
  cliffEdges: CliffEdgeSegment[];
  accessCorridors: AccessCorridor[];
  slopes: Float32Array;
  steepMask: Uint8Array;
  terrainFlags: Uint32Array;
  terrainMetrics: TerrainMetrics;
  terrainProfile: TerrainProfileDef;
  /** Resolved presentation-only terrain material (client rendering). */
  terrainMaterialProfile: TerrainMaterialProfileDef;
  validation: ValidationReport;
  fallbackUsed: boolean;
  source: 'generated' | 'legacy';
  /** Phase 1 terrain checksum before route carving (determinism anchor). */
  terrainSeedChecksum?: number;
  /** Phase 2 layout (routes/zones/spawns/gates/furniture). */
  layout?: MapLayoutResult;
  /** Per-attempt retry diagnostics (production path only). */
  retryReport?: RetryReport;
}

export interface RetryAttemptReport {
  attempt: number;
  candidateSeed: number;
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export interface RetryReport {
  attempts: RetryAttemptReport[];
  fallbackUsed: boolean;
}

export interface GenerateTerrainOptions {
  seed: number;
  widthMeters: number;
  depthMeters: number;
  cellSize: number;
  terrainProfile: TerrainProfileDef;
  now?: () => number;
}

export function generateTerrain(options: GenerateTerrainOptions): TerrainResult {
  const profile = options.terrainProfile;
  const rules = resolveSlopeRules(profile);
  const hf = new Heightfield({
    widthMeters: options.widthMeters,
    depthMeters: options.depthMeters,
    cellSize: options.cellSize,
  });
  const rng: Rng = mulberry32(options.seed);

  let features: MacroFeatureRecord[] = [];
  let cliffFeatures: CliffFeatureRecord[] = [];
  let accessCorridors: AccessCorridor[] = [];
  if (profile.legacySampled) {
    // Fixed known-safe ground: sample the legacy analytic terrain onto the
    // same grid. Everything is driveable; there are no cliffs.
    for (let zi = 0; zi < hf.samplesZ; zi++) {
      for (let xi = 0; xi < hf.samplesX; xi++) {
        const x = xi * hf.cellSize - options.widthMeters / 2;
        const z = zi * hf.cellSize - options.depthMeters / 2;
        hf.setSample(xi, zi, legacyGroundHeightAt(x, z));
      }
    }
  } else {
    // Base.
    hf.samples.fill(profile.baseHeight);
    // Non-cliff macro stamps.
    features = placeMacroFeatures(rng, profile.features, options.widthMeters, options.depthMeters);
    applyMacroFeatures(hf, features);
    // Broad initial smoothing.
    smooth(hf, profile.smoothingPasses);
    clampHeight(hf, profile.heightRange.min, profile.heightRange.max);
    // Dedicated cliffs.
    cliffFeatures = placeCliffFeatures(rng, profile.features, options.widthMeters, options.depthMeters, features);
    if (cliffFeatures.length > 0) {
      applyCliffFeatures(hf, cliffFeatures);
      clampHeight(hf, profile.heightRange.min, profile.heightRange.max);
      accessCorridors = carveCliffAccessCorridors(hf, cliffFeatures, options.widthMeters, options.depthMeters);
    }
  }

  const slopes = hf.slopeGrid();
  const masks = computeCliffMasks(hf, cliffFeatures, rules.cliffMin);
  const terrainFlags = classifyTerrainFlags(slopes, rules, masks);
  const cliffEdges = extractCliffEdges(hf, cliffFeatures, masks);
  const steepMask = new Uint8Array(slopes.length);
  for (let i = 0; i < slopes.length; i++) {
    if (slopes[i] > profile.maxSlope) steepMask[i] = 1;
  }
  return {
    heightfield: hf,
    macroFeatures: features,
    cliffFeatures,
    cliffMasks: masks,
    cliffEdges,
    accessCorridors,
    slopes,
    steepMask,
    terrainFlags,
  };
}

const PROTECTED_FLAG_MASK =
  TerrainFlag.RouteProtected |
  TerrainFlag.SpawnProtected |
  TerrainFlag.GateProtected |
  TerrainFlag.RecoveryProtected |
  TerrainFlag.LandingProtected |
  TerrainFlag.CliffAccess;

/**
 * Post-layout terrain finalization: protected masks, localized correction,
 * mask-aware smoothing, and cliff-edge refresh. Called by the retry builder
 * after the route/layout pass so required traversal is guaranteed driveable
 * without flattening cliffs.
 */
export function finalizeTerrainForLayout(
  hf: Heightfield,
  flags: Uint32Array,
  accessCorridors: AccessCorridor[],
  layout: MapLayoutResult,
  profile: TerrainProfileDef,
  cliffFeatures: CliffFeatureRecord[],
): {
  terrainFlags: Uint32Array;
  cliffMasks: CliffMasks;
  cliffEdges: CliffEdgeSegment[];
  slopes: Float32Array;
  terrainMetrics: TerrainMetrics;
} {
  const rules = resolveSlopeRules(profile);

  // 1. Protected masks: corridors, spawn/gate/recovery/landing clear areas,
  // and cliff access corridors (with a tank/reconciliation buffer).
  const buffer = 2;
  for (const c of layout.corridors) {
    markProtectedCorridor(hf, flags, c.ax, c.az, c.bx, c.bz, c.halfWidth + buffer, TerrainFlag.RouteProtected);
  }
  for (const s of layout.spawns) markProtectedCircle(flags, hf, s.x, s.z, 12, TerrainFlag.SpawnProtected);
  for (const g of layout.gates) markProtectedCircle(flags, hf, g.x, g.z, 10, TerrainFlag.GateProtected);
  for (const r of layout.recovery) markProtectedCircle(flags, hf, r.x, r.z, 12, TerrainFlag.RecoveryProtected);
  for (const r of layout.ramps) markProtectedCircle(flags, hf, r.landingX, r.landingZ, 8, TerrainFlag.LandingProtected);
  for (const a of accessCorridors) {
    markProtectedCorridor(hf, flags, a.ax, a.az, a.bx, a.bz, a.halfWidth + buffer, TerrainFlag.CliffAccess);
  }

  // 2. Localized correction: protected cells are pulled toward driveableMax;
  // cliff-wall cells are excluded. Legacy profiles may opt into whole-map
  // correction (correctAllMap) to keep the old rolling-terrain behavior.
  correctProtectedTerrain(hf, flags, rules, profile.slopeCorrectionIterations, profile.correctAllMap === true);

  // 3. Mask-aware final smoothing (cliff walls excluded so edges survive).
  smoothMaskAware(hf, flags, profile.finalSmoothingPasses ?? 1);

  // 3b. Whole-map profiles (correctAllMap) get a second correction pass after
  // final smoothing so the render-safe neighbor-delta invariant holds even
  // when smoothing redistributes height across steep feature pairs. Localized
  // profiles are untouched and keep their existing behavior.
  if (profile.correctAllMap === true) {
    correctProtectedTerrain(hf, flags, rules, profile.slopeCorrectionIterations, true);
  }

  // 4. Cliff-edge refresh + final classification.
  const slopes = hf.slopeGrid();
  const cliffMasks = computeCliffMasks(hf, cliffFeatures, rules.cliffMin);
  const terrainFlags = classifyTerrainFlags(slopes, rules, cliffMasks);
  for (let i = 0; i < terrainFlags.length; i++) {
    const protectedBits = flags[i] & PROTECTED_FLAG_MASK;
    terrainFlags[i] |= protectedBits;
    if (protectedBits & TerrainFlag.RouteProtected) terrainFlags[i] |= TerrainFlag.Driveable;
    if (protectedBits & TerrainFlag.SpawnProtected) terrainFlags[i] |= TerrainFlag.Driveable;
    if (protectedBits & TerrainFlag.CliffAccess) terrainFlags[i] |= TerrainFlag.Driveable;
  }
  const cliffEdges = extractCliffEdges(hf, cliffFeatures, cliffMasks);
  const classMetrics = terrainClassMetrics(terrainFlags);
  const edgeMetrics = cliffEdgeMetrics(cliffEdges);
  return {
    terrainFlags,
    cliffMasks,
    cliffEdges,
    slopes,
    terrainMetrics: metricsFrom(classMetrics, edgeMetrics.count, edgeMetrics.edgeLength, edgeMetrics.largestDrop),
  };
}

function metricsFrom(
  m: TerrainClassMetricsType,
  cliffCount: number,
  cliffEdgeLength: number,
  largestDrop: number,
): TerrainMetrics {
  return {
    driveableRatio: m.driveableRatio,
    riskyRatio: m.riskyRatio,
    blockedRatio: m.blockedRatio,
    cliffCount,
    cliffEdgeLength,
    largestDrop,
  };
}

function markProtectedCorridor(
  hf: Heightfield,
  flags: Uint32Array,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  halfWidth: number,
  flag: TerrainFlag,
): void {
  const margin = halfWidth;
  const minX = Math.max(0, Math.floor((Math.min(ax, bx) - margin) / hf.cellSize));
  const maxX = Math.min(hf.samplesX - 1, Math.ceil((Math.max(ax, bx) + margin) / hf.cellSize));
  const minZ = Math.max(0, Math.floor((Math.min(az, bz) - margin) / hf.cellSize));
  const maxZ = Math.min(hf.samplesZ - 1, Math.ceil((Math.max(az, bz) + margin) / hf.cellSize));
  for (let zi = minZ; zi <= maxZ; zi++) {
    for (let xi = minX; xi <= maxX; xi++) {
      const wx = xi * hf.cellSize;
      const wz = zi * hf.cellSize;
      if (distToSegment(wx, wz, ax, az, bx, bz) <= halfWidth) {
        const idx = zi * hf.samplesX + xi;
        flags[idx] = (flags[idx] ?? 0) | flag;
      }
    }
  }
}

/**
 * Protected-area slope correction: only pairs involving at least one
 * protected (required-traversal) cell are pulled toward driveableMax, and
 * cliff-wall cells are never modified. With correctAllMap, every cell is
 * treated as protected (legacy whole-map behavior).
 */
function correctProtectedTerrain(
  hf: Heightfield,
  flags: Uint32Array,
  rules: SlopeRules,
  maxIterations: number,
  correctAllMap: boolean,
): void {
  if (maxIterations <= 0) return;
  const allowed = rules.driveableMax * hf.cellSize;
  const samples = hf.samples;
  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;
    for (let zi = 0; zi < hf.samplesZ; zi++) {
      for (let xi = 0; xi < hf.samplesX; xi++) {
        const idx = hf.sampleIndex(xi, zi);
        const f = flags[idx] ?? 0;
        if (!correctAllMap && (f & PROTECTED_FLAG_MASK) === 0) continue;
        if (!correctAllMap && (f & TerrainFlag.CliffWall)) continue;
        const h = samples[idx];
        const neighbors: number[] = [];
        if (xi > 0) neighbors.push(hf.sampleIndex(xi - 1, zi));
        if (xi + 1 < hf.samplesX) neighbors.push(hf.sampleIndex(xi + 1, zi));
        if (zi > 0) neighbors.push(hf.sampleIndex(xi, zi - 1));
        if (zi + 1 < hf.samplesZ) neighbors.push(hf.sampleIndex(xi, zi + 1));
        for (const nIdx of neighbors) {
          if (correctAllMap) {
            // Whole-map mode: procedural slopes are corrected even when the
            // pre-pass classifier flagged them cliff-like, guaranteeing the
            // render-safe neighbor-delta invariant for rolling terrain.
          } else if ((flags[nIdx] ?? 0) & TerrainFlag.CliffWall) {
            // A protected cell next to a wall must not be pulled INTO the
            // wall; only the protected side is adjusted.
            const delta = h - samples[nIdx];
            if (delta > allowed) {
              samples[idx] -= delta - allowed;
              changed = true;
            }
            continue;
          }
          const n = samples[nIdx];
          const delta = h - n;
          if (Math.abs(delta) > allowed) {
            const excess = Math.abs(delta) - allowed;
            const pull = Math.sign(delta) * excess * 0.5;
            samples[idx] = samples[idx] - pull;
            samples[nIdx] = samples[nIdx] + pull;
            changed = true;
          }
        }
      }
    }
    if (!changed) break;
  }
}

/** 3×3 smoothing that never touches cliff-wall cells. */
function smoothMaskAware(hf: Heightfield, flags: Uint32Array, passes: number): void {
  if (passes <= 0) return;
  const src = new Float32Array(hf.samples.length);
  for (let pass = 0; pass < passes; pass++) {
    src.set(hf.samples);
    for (let zi = 0; zi < hf.samplesZ; zi++) {
      for (let xi = 0; xi < hf.samplesX; xi++) {
        const idx = hf.sampleIndex(xi, zi);
        if ((flags[idx] ?? 0) & TerrainFlag.CliffWall) continue;
        let sum = 0;
        let weight = 0;
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = xi + dx;
            const nz = zi + dz;
            if (nx < 0 || nx >= hf.samplesX || nz < 0 || nz >= hf.samplesZ) continue;
            if ((flags[hf.sampleIndex(nx, nz)] ?? 0) & TerrainFlag.CliffWall) continue;
            const w = dx === 0 && dz === 0 ? 4 : dx === 0 || dz === 0 ? 2 : 1;
            sum += src[hf.sampleIndex(nx, nz)] * w;
            weight += w;
          }
        }
        if (weight > 0) hf.samples[idx] = sum / weight;
      }
    }
  }
}

/** 3×3 weighted smoothing (center 4, edge 2, corner 1). */
function smooth(hf: Heightfield, passes: number): void {
  if (passes <= 0) return;
  const src = new Float32Array(hf.samples.length);
  for (let pass = 0; pass < passes; pass++) {
    src.set(hf.samples);
    for (let zi = 0; zi < hf.samplesZ; zi++) {
      for (let xi = 0; xi < hf.samplesX; xi++) {
        let sum = 0;
        let weight = 0;
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = xi + dx;
            const nz = zi + dz;
            if (nx < 0 || nx >= hf.samplesX || nz < 0 || nz >= hf.samplesZ) continue;
            const w = dx === 0 && dz === 0 ? 4 : dx === 0 || dz === 0 ? 2 : 1;
            sum += src[hf.sampleIndex(nx, nz)] * w;
            weight += w;
          }
        }
        hf.samples[hf.sampleIndex(xi, zi)] = sum / weight;
      }
    }
  }
}

function clampHeight(hf: Heightfield, min: number, max: number): void {
  for (let i = 0; i < hf.samples.length; i++) {
    hf.samples[i] = clamp(hf.samples[i], min, max);
  }
}
