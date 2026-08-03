/**
 * Single generator adapter for Map Lab. The UI only talks to this module;
 * it wraps the exact production and exact-candidate paths used by the game
 * and tests (no duplicated generation/validation algorithms).
 */
import {
  attachProps,
  metadataFromArena,
  selectArenaSession,
  type ArenaMetadata,
} from '@app/shared/mapgen/arenaSession';
import type { GeneratedArena } from '@app/shared/mapgen/generator';
import { Heightfield } from '@app/shared/mapgen/heightfield';
import type { MapGenerationBundle } from '@app/shared/mapgen/profiles';
import { buildArenaCandidate } from '@app/shared/mapgen/retry';
import { composeArenaBaseSeed, composeArenaCandidateSeed } from '@app/shared/mapgen/seed';
import { validateArena } from '@app/shared/mapgen/validation';
import { validatePhase2 } from '@app/shared/mapgen/validation2';
import { issuesFromValidationReports, type MapValidationIssue } from '@app/shared/mapgen/validationIssues';

export interface MapLabGenerateRequest {
  requestId: number;
  mode: 'production' | 'exactCandidate';
  roomCode: string;
  matchIndex: number;
  generatorVersion: number;
  workingBundle: MapGenerationBundle;
  fallbackBundle: MapGenerationBundle;
  exactBaseSeed?: number;
  exactCandidateSeed?: number;
  exactAttempt?: number;
}

/** Structured-clone-safe arena payload (Heightfield samples transferable). */
export interface SerializedArena {
  arena: Omit<GeneratedArena, 'heightfield'> & {
    heightfield: {
      samples: Float32Array;
      widthMeters: number;
      depthMeters: number;
      cellSize: number;
      samplesX: number;
      samplesZ: number;
    };
  };
  metadata: ArenaMetadata;
}

export interface MapLabGenerateResult {
  requestId: number;
  ok: boolean;
  error?: string;
  arena?: SerializedArena;
  generationMs?: number;
  issues?: MapValidationIssue[];
}

export function serializeArena(arena: GeneratedArena): SerializedArena {
  const hf = arena.heightfield;
  return {
    arena: {
      ...arena,
      heightfield: {
        samples: hf.samples,
        widthMeters: hf.widthMeters,
        depthMeters: hf.depthMeters,
        cellSize: hf.cellSize,
        samplesX: hf.samplesX,
        samplesZ: hf.samplesZ,
      },
    },
    metadata: metadataFromArena(arena),
  };
}

export function deserializeArena(payload: SerializedArena['arena']): GeneratedArena {
  const { heightfield, ...rest } = payload;
  const hf = new Heightfield(
    {
      widthMeters: heightfield.widthMeters,
      depthMeters: heightfield.depthMeters,
      cellSize: heightfield.cellSize,
    },
    heightfield.samples,
  );
  return { ...rest, heightfield: hf } as GeneratedArena;
}

export function generateMapLabResult(request: MapLabGenerateRequest): MapLabGenerateResult {
  const t0 = performanceNow();
  try {
    if (request.mode === 'production') {
      const session = selectArenaSession({
        roomCode: request.roomCode,
        matchIndex: request.matchIndex,
        bundle: request.workingBundle,
        fallbackBundle: request.fallbackBundle,
        generatorVersion: request.generatorVersion,
      });
      return {
        requestId: request.requestId,
        ok: true,
        arena: serializeArena(session.arena),
        generationMs: performanceNow() - t0,
        issues: issuesFromValidationReports(session.arena),
      };
    }

    // Exact candidate: reproduce a specific (possibly failing) candidate.
    const baseSeed =
      request.exactBaseSeed ??
      composeArenaBaseSeed({
        roomCode: request.roomCode,
        matchIndex: request.matchIndex,
        profileId: request.workingBundle.map.id,
        generatorVersion: request.generatorVersion,
      });
    const attempt = request.exactAttempt ?? 0;
    const candidateSeed =
      request.exactCandidateSeed ?? composeArenaCandidateSeed(baseSeed, attempt);
    const arena = buildArenaCandidate({
      baseSeed,
      candidateSeed,
      attempt,
      mapId: request.workingBundle.map.id,
      bundle: request.workingBundle,
      generatorVersion: request.generatorVersion,
      fallbackUsed: false,
    });
    const phase1 = validateArena(arena, request.workingBundle.validationProfile);
    const phase2 = validatePhase2(arena);
    arena.validation = {
      ...phase1,
      ok: phase1.ok && phase2.ok,
      errors: [...phase1.errors, ...phase2.errors],
    };
    attachProps(arena);
    return {
      requestId: request.requestId,
      ok: arena.validation.ok,
      arena: serializeArena(arena),
      generationMs: performanceNow() - t0,
      issues: issuesFromValidationReports(arena),
    };
  } catch (error) {
    return {
      requestId: request.requestId,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      generationMs: performanceNow() - t0,
    };
  }
}

function performanceNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
