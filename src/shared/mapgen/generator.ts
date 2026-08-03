/**
 * Deterministic terrain generation pipeline and the generated arena model.
 *
 * Order (per spec §5): base → macro stamps → smoothing → height clamp →
 * iterative slope correction → final smoothing → slope classification.
 * No Math.random(); everything derives from the candidate seed.
 */
import { groundHeightAt as legacyGroundHeightAt } from '../arena';
import { clamp } from '../math';
import { applyMacroFeatures, placeMacroFeatures, type MacroFeatureRecord } from './features';
import { Heightfield } from './heightfield';
import type { MapLayoutResult } from './layout';
import { mulberry32, type Rng } from './prng';
import type { TerrainProfileDef } from './profiles';
import type { ValidationReport } from './validation';

export interface TerrainResult {
  heightfield: Heightfield;
  macroFeatures: MacroFeatureRecord[];
  slopes: Float32Array;
  steepMask: Uint8Array;
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
  slopes: Float32Array;
  steepMask: Uint8Array;
  terrainProfile: TerrainProfileDef;
  validation: ValidationReport;
  fallbackUsed: boolean;
  source: 'generated' | 'legacy';
  /** Phase 1 terrain checksum before route carving (determinism anchor). */
  terrainSeedChecksum?: number;
  /** Phase 2 layout (routes/zones/spawns/gates/furniture). */
  layout?: MapLayoutResult;
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
  const hf = new Heightfield({
    widthMeters: options.widthMeters,
    depthMeters: options.depthMeters,
    cellSize: options.cellSize,
  });
  const rng: Rng = mulberry32(options.seed);

  let features: MacroFeatureRecord[] = [];
  if (profile.legacySampled) {
    // Fixed known-safe ground: sample the legacy analytic terrain (flat 0,
    // center bowl, three ramps) onto the same grid.
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
    // Macro feature stamps.
    features = placeMacroFeatures(rng, profile.features, options.widthMeters, options.depthMeters);
    applyMacroFeatures(hf, features);
    // Smoothing.
    smooth(hf, profile.smoothingPasses);
    // Height clamp.
    clampHeight(hf, profile.heightRange.min, profile.heightRange.max);
    // Iterative slope correction.
    correctSlopes(hf, profile.maxSlope, profile.slopeCorrectionIterations);
    // Final smoothing + clamp (keeps bounds and limits stable).
    smooth(hf, 1);
    clampHeight(hf, profile.heightRange.min, profile.heightRange.max);
  }

  // Slope classification.
  const slopes = hf.slopeGrid();
  const steepMask = new Uint8Array(slopes.length);
  for (let i = 0; i < slopes.length; i++) {
    if (slopes[i] > profile.maxSlope) steepMask[i] = 1;
  }
  return { heightfield: hf, macroFeatures: features, slopes, steepMask };
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

/**
 * Symmetric slope correction: when two neighbours exceed the limit, both are
 * pulled toward each other by half the excess. Converges within a few passes
 * for smooth terrain; the iteration cap keeps the worst case bounded.
 */
function correctSlopes(hf: Heightfield, maxSlope: number, maxIterations: number): void {
  if (maxIterations <= 0) return;
  const allowed = maxSlope * hf.cellSize;
  const samples = hf.samples;
  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;
    for (let zi = 0; zi < hf.samplesZ; zi++) {
      for (let xi = 0; xi < hf.samplesX; xi++) {
        const idx = hf.sampleIndex(xi, zi);
        const h = samples[idx];
        const neighbors: Array<[number, number]> = [];
        if (xi > 0) neighbors.push([hf.sampleIndex(xi - 1, zi), -1]);
        if (xi + 1 < hf.samplesX) neighbors.push([hf.sampleIndex(xi + 1, zi), 1]);
        if (zi > 0) neighbors.push([hf.sampleIndex(xi, zi - 1), -1]);
        if (zi + 1 < hf.samplesZ) neighbors.push([hf.sampleIndex(xi, zi + 1), 1]);
        for (const [nIdx] of neighbors) {
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
