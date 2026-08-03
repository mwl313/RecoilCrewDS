/**
 * Deterministic retry + known-safe fallback.
 *
 * Attempts 0..retryLimit-1 in ascending order; the first candidate that
 * passes validation wins. If every attempt fails, the fixed fallback map is
 * built and returned with `fallbackUsed: true` — a round can always start.
 */
import { ARENA_GENERATOR_VERSION, composeArenaBaseSeed, composeArenaCandidateSeed, hash32 } from './seed';
import {
  finalizeTerrainForLayout,
  generateTerrain,
  type GeneratedArena,
  type RetryReport,
} from './generator';
import { generateMapLayout } from './layout';
import { validateArena, type ValidationReport } from './validation';
import { validatePhase2 } from './validation2';
import type { MapGenerationBundle } from './profiles';
import { resolveSlopeRules } from './profiles';

export interface GenerateArenaOptions {
  roomCode: string;
  matchIndex: number;
  mapId: string;
  /** Resolved primary map + terrain + validation profiles. */
  bundle: MapGenerationBundle;
  /** Resolved fallback bundle (from map.fallbackMapId). */
  fallbackBundle: MapGenerationBundle;
  generatorVersion?: number;
  now?: () => number;
  /** Optional per-attempt callback (tests/reports observe retry order). */
  onAttempt?: (attempt: number, candidateSeed: number, ok: boolean) => void;
}

export interface BuildArenaCandidateOptions {
  baseSeed: number;
  candidateSeed: number;
  attempt: number;
  mapId: string;
  bundle: MapGenerationBundle;
  generatorVersion: number;
  fallbackUsed: boolean;
  now?: () => number;
}

export function generateArenaWithRetry(options: GenerateArenaOptions): GeneratedArena {
  const version = options.generatorVersion ?? ARENA_GENERATOR_VERSION;
  const now = options.now ?? (() => performanceNow());
  const map = options.bundle.map;
  const baseSeed = composeArenaBaseSeed({
    roomCode: options.roomCode,
    matchIndex: options.matchIndex,
    profileId: map.id,
    generatorVersion: version,
  });

  const retryReport: RetryReport = { attempts: [], fallbackUsed: false };
  for (let attempt = 0; attempt < options.bundle.terrainProfile.retryLimit; attempt++) {
    const candidateSeed = composeArenaCandidateSeed(baseSeed, attempt);
    const arena = buildArenaCandidate({
      baseSeed,
      candidateSeed,
      attempt,
      mapId: map.id,
      bundle: options.bundle,
      generatorVersion: version,
      fallbackUsed: false,
      now,
    });
    const phase1 = validateArena(arena, options.bundle.validationProfile);
    const phase2 = validatePhase2(arena);
    arena.validation = phase1;
    const ok = phase1.ok && phase2.ok;
    if (!phase2.ok) {
      arena.validation = {
        ...phase1,
        ok: false,
        errors: [...phase1.errors, ...phase2.errors.slice(0, 6)],
      };
    }
    retryReport.attempts.push({
      attempt,
      candidateSeed,
      ok,
      errors: [...phase1.errors, ...phase2.errors].slice(0, 12),
      warnings: [...phase1.warnings, ...phase2.warnings].slice(0, 12),
    });
    options.onAttempt?.(attempt, candidateSeed, ok);
    if (ok) {
      arena.retryReport = retryReport;
      return arena;
    }
  }

  // All attempts failed: fixed known-safe fallback (same runtime interface).
  const fallback = options.fallbackBundle;
  const fallbackSeed = hash32('arena-fallback', baseSeed, version);
  const arena = buildArenaCandidate({
    baseSeed,
    candidateSeed: fallbackSeed,
    attempt: options.bundle.terrainProfile.retryLimit,
    mapId: fallback.map.id,
    bundle: fallback,
    generatorVersion: version,
    fallbackUsed: true,
    now,
  });
  const phase1 = validateArena(arena, fallback.validationProfile);
  const phase2 = validatePhase2(arena);
  arena.validation = phase1.ok && phase2.ok ? phase1 : { ...phase1, ok: false, errors: [...phase1.errors, ...phase2.errors] };
  retryReport.fallbackUsed = true;
  arena.retryReport = retryReport;
  return arena;
}

/** Build one exact candidate (also used by client reconstruction). */
export function buildArenaCandidate(options: BuildArenaCandidateOptions): GeneratedArena {
  const map = options.bundle.map;
  const now = options.now ?? (() => performanceNow());
  const t0 = now();
  const terrain = generateTerrain({
    seed: options.candidateSeed,
    widthMeters: map.widthMeters,
    depthMeters: map.depthMeters,
    cellSize: map.cellSize,
    terrainProfile: options.bundle.terrainProfile,
  });
  const terrainSeedChecksum = terrain.heightfield.checksum();
  const layout = generateMapLayout({
    candidateSeed: options.candidateSeed,
    hf: terrain.heightfield,
    flags: terrain.terrainFlags,
    slopeRules: resolveSlopeRules(options.bundle.terrainProfile),
    features: terrain.macroFeatures,
    widthMeters: map.widthMeters,
    depthMeters: map.depthMeters,
    furnitureSet: options.bundle.furnitureSet,
    densityProfile: options.bundle.densityProfile,
    landmarks: options.bundle.landmarks,
  });
  const finalized = finalizeTerrainForLayout(
    terrain.heightfield,
    terrain.terrainFlags,
    terrain.accessCorridors,
    layout,
    options.bundle.terrainProfile,
    terrain.cliffFeatures,
  );
  const generationMs = now() - t0;
  const report: ValidationReport = {
    ok: false,
    errors: [],
    warnings: [],
    metrics: {
      generationMs,
      heightMin: terrain.heightfield.minHeight(),
      heightMax: terrain.heightfield.maxHeight(),
      maxSlope: terrain.heightfield.maxSlope(),
      checksum: terrain.heightfield.checksum(),
      featureCount: terrain.macroFeatures.length,
      driveableRatio: finalized.terrainMetrics.driveableRatio,
      riskyRatio: finalized.terrainMetrics.riskyRatio,
      blockedRatio: finalized.terrainMetrics.blockedRatio,
      cliffCount: finalized.terrainMetrics.cliffCount,
      cliffEdgeLength: finalized.terrainMetrics.cliffEdgeLength,
      largestDrop: finalized.terrainMetrics.largestDrop,
    },
  };
  return {
    baseSeed: options.baseSeed,
    candidateSeed: options.candidateSeed,
    attempt: options.attempt,
    profileId: options.bundle.terrainProfile.id,
    mapId: options.mapId,
    generatorVersion: options.generatorVersion,
    widthMeters: map.widthMeters,
    depthMeters: map.depthMeters,
    cellSize: map.cellSize,
    originX: -map.widthMeters / 2,
    originZ: -map.depthMeters / 2,
    heightfield: terrain.heightfield,
    macroFeatures: terrain.macroFeatures,
    cliffFeatures: terrain.cliffFeatures,
    cliffMasks: finalized.cliffMasks,
    cliffEdges: finalized.cliffEdges,
    accessCorridors: terrain.accessCorridors,
    slopes: finalized.slopes,
    steepMask: terrain.steepMask,
    terrainFlags: finalized.terrainFlags,
    terrainMetrics: finalized.terrainMetrics,
    terrainProfile: options.bundle.terrainProfile,
    validation: report,
    fallbackUsed: options.fallbackUsed,
    source: 'generated',
    terrainSeedChecksum,
    layout,
  };
}

function performanceNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
