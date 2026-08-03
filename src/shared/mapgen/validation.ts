/**
 * Pure map generation validators. Every check is a pure function of the
 * generated arena and its validation profile; results are structured so
 * retries, tests, and reports can consume them without string parsing.
 */
import type { GeneratedArena } from './generator';
import type { ValidationProfileDef } from './profiles';
import { composeArenaCandidateSeed, hash32 } from './seed';
import { generateTerrain } from './generator';

export interface ValidationMetrics {
  generationMs: number;
  heightMin: number;
  heightMax: number;
  maxSlope: number;
  checksum: number;
  featureCount: number;
}

export interface ValidationReport {
  ok: boolean;
  errors: string[];
  warnings: string[];
  metrics: ValidationMetrics;
}

export function validateArena(
  arena: GeneratedArena,
  profile: ValidationProfileDef,
  options: { verifyDeterminism?: boolean } = {},
): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const eps = profile.boundsEpsilon;
  const hf = arena.heightfield;

  // Bounds.
  const expectedX = Math.round(arena.widthMeters / arena.cellSize) + 1;
  const expectedZ = Math.round(arena.depthMeters / arena.cellSize) + 1;
  if (hf.samplesX !== expectedX || hf.samplesZ !== expectedZ) {
    errors.push(`bounds: sample grid ${hf.samplesX}x${hf.samplesZ}, expected ${expectedX}x${expectedZ}`);
  }

  // Finite samples.
  if (!hf.allFinite()) {
    errors.push('finite: heightfield contains non-finite samples');
  }

  // Height range.
  const hMin = hf.minHeight();
  const hMax = hf.maxHeight();
  if (hMin < profile.heightRange.min - eps) {
    errors.push(`height: min ${hMin} below ${profile.heightRange.min}`);
  }
  if (hMax > profile.heightRange.max + eps) {
    errors.push(`height: max ${hMax} above ${profile.heightRange.max}`);
  }

  // Slope limits.
  const worstSlope = hf.maxSlope();
  if (worstSlope > profile.maxSlope + eps) {
    errors.push(`slope: max ${worstSlope.toFixed(4)} exceeds ${profile.maxSlope}`);
  }

  // Feature spacing.
  const features = arena.macroFeatures;
  for (let i = 0; i < features.length; i++) {
    for (let j = i + 1; j < features.length; j++) {
      const a = features[i];
      const b = features[j];
      const required = Math.max(profile.minFeatureSeparation, a.minSeparation, b.minSeparation);
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d < required - eps) {
        errors.push(
          `spacing: ${a.id} (${a.type}) and ${b.id} (${b.type}) distance ${d.toFixed(2)} < ${required}`,
        );
      }
    }
  }

  // Generation time metric.
  if (arena.validation.metrics.generationMs > profile.maxGenerationMs) {
    errors.push(
      `time: generation took ${arena.validation.metrics.generationMs.toFixed(1)}ms > ${profile.maxGenerationMs}ms`,
    );
  }

  // Determinism (optional, expensive): regenerate and compare checksums.
  if (options.verifyDeterminism || profile.checkDeterminism) {
    const regenerated = generateTerrain({
      seed: arena.candidateSeed,
      widthMeters: arena.widthMeters,
      depthMeters: arena.depthMeters,
      cellSize: arena.cellSize,
      terrainProfile: arena.terrainProfile,
    });
    const expected = arena.terrainSeedChecksum ?? hf.checksum();
    if (regenerated.heightfield.checksum() !== expected) {
      errors.push('determinism: regenerated terrain checksum differs');
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    metrics: arena.validation.metrics,
  };
}

/** Determinism check used by the report sweep and tests. */
export function verifyDeterminism(
  baseSeed: number,
  attempt: number,
  build: (seed: number) => number,
): boolean {
  const a = build(composeArenaCandidateSeed(baseSeed, attempt));
  const b = build(composeArenaCandidateSeed(baseSeed, attempt));
  return a === b;
}

/** Stable arena identity hash (seed + version + checksum). */
export function arenaIdentityHash(arena: GeneratedArena): number {
  return hash32(
    'arena-identity',
    arena.candidateSeed,
    arena.generatorVersion,
    arena.heightfield.checksum(),
  );
}
