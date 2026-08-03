/**
 * Arena session: server-side authoritative selection and client-side
 * deterministic reconstruction with a checksum gate.
 *
 * The server selects a room/match seed, generates, validates, and publishes
 * metadata. The client regenerates the exact candidate (same seed/attempt/
 * fallback flag — never re-runs retry) and compares checksums before any
 * gameplay can start.
 */
import type { ContentPack } from '../content/contentPack';
import type { ArenaWorld } from '../sim/arenaWorld';
import { createGeneratedArenaWorld } from '../sim/arenaWorld';
import { buildLegacyArenaModel, toArenaProps, type ArenaProps } from './compat';
import type { GeneratedArena } from './generator';
import { resolveMapBundle, type MapGenerationBundle } from './profiles';
import { GENERATED_MAP_PROFILES } from '../../generated/mapProfiles.generated';
import { ARENA_GENERATOR_VERSION } from './seed';
import { buildArenaCandidate, generateArenaWithRetry } from './retry';
import { validateArena } from './validation';
import { validatePhase2 } from './validation2';

export interface ArenaMetadata {
  mapProfileId: string;
  arenaBaseSeed: number;
  arenaCandidateSeed: number;
  arenaAttempt: number;
  arenaGeneratorVersion: number;
  arenaChecksum: number;
  arenaFallbackUsed: boolean;
}

export interface ArenaSessionResult {
  arena: GeneratedArena & { props?: ArenaProps };
  world: ArenaWorld;
  metadata: ArenaMetadata;
  generationMs: number;
}

export interface ArenaSessionOptions {
  roomCode: string;
  matchIndex: number;
  bundle: MapGenerationBundle;
  fallbackBundle: MapGenerationBundle;
  generatorVersion?: number;
  now?: () => number;
}

/** Server/authoritative selection (also used by Practice). */
export function selectArenaSession(options: ArenaSessionOptions): ArenaSessionResult {
  const now = options.now ?? (() => performanceNow());
  const t0 = now();
  const arena = generateArenaWithRetry({
    roomCode: options.roomCode,
    matchIndex: options.matchIndex,
    mapId: options.bundle.map.id,
    bundle: options.bundle,
    fallbackBundle: options.fallbackBundle,
    generatorVersion: options.generatorVersion,
    now,
  });
  attachProps(arena);
  const metadata = metadataFromArena(arena);
  const world = createGeneratedArenaWorld(arena, metadata);
  return { arena, world, metadata, generationMs: now() - t0 };
}

/** Resolve the primary map bundle from a validated content pack. */
export function selectArenaSessionFromPack(
  pack: ContentPack,
  options: Omit<ArenaSessionOptions, 'bundle' | 'fallbackBundle'>,
): ArenaSessionResult {
  const bundle = resolveMapBundle(pack, 'map.arena400Primary');
  const fallbackBundle = resolveMapBundle(pack, bundle.map.fallbackMapId!);
  return selectArenaSession({ ...options, bundle, fallbackBundle });
}

/** Client-safe bundle resolution (mirrors validated content, parity-tested). */
export function resolveClientMapBundle(mapId = 'map.arena400Primary'): {
  bundle: MapGenerationBundle;
  fallbackBundle: MapGenerationBundle;
} {
  const bundle = GENERATED_MAP_PROFILES[mapId];
  const fallbackBundle = GENERATED_MAP_PROFILES[bundle.map.fallbackMapId!];
  if (!bundle || !fallbackBundle) throw new Error(`client map bundle missing for ${mapId}`);
  return { bundle, fallbackBundle };
}

export type ReconstructionResult =
  | { ok: true; session: ArenaSessionResult }
  | { ok: false; reason: 'version' | 'profile' | 'checksum' | 'validation' };

/** Client-side reconstruction + checksum/version/profile gate. */
export function reconstructArenaSession(
  metadata: ArenaMetadata,
  bundle: MapGenerationBundle,
  fallbackBundle: MapGenerationBundle,
  now?: () => number,
): ReconstructionResult {
  if (metadata.arenaGeneratorVersion !== ARENA_GENERATOR_VERSION) {
    return { ok: false, reason: 'version' };
  }
  if (metadata.arenaFallbackUsed && metadata.mapProfileId !== fallbackBundle.map.id) {
    return { ok: false, reason: 'profile' };
  }
  if (!metadata.arenaFallbackUsed && metadata.mapProfileId !== bundle.map.id) {
    return { ok: false, reason: 'profile' };
  }
  const used = metadata.arenaFallbackUsed ? fallbackBundle : bundle;
  const arena = buildArenaCandidate({
    baseSeed: metadata.arenaBaseSeed,
    candidateSeed: metadata.arenaCandidateSeed,
    attempt: metadata.arenaAttempt,
    mapId: metadata.mapProfileId,
    bundle: used,
    generatorVersion: metadata.arenaGeneratorVersion,
    fallbackUsed: metadata.arenaFallbackUsed,
    now,
  });
  if (arena.heightfield.checksum() !== metadata.arenaChecksum) {
    return { ok: false, reason: 'checksum' };
  }
  const validationBundle = used.validationProfile;
  const report = validateArena(arena, validationBundle);
  const report2 = validatePhase2(arena);
  if (!report.ok || !report2.ok) {
    return { ok: false, reason: 'validation' };
  }
  attachProps(arena);
  const world = createGeneratedArenaWorld(arena, metadata);
  return { ok: true, session: { arena, world, metadata, generationMs: arena.validation.metrics.generationMs } };
}

export function metadataFromArena(arena: GeneratedArena): ArenaMetadata {
  return {
    mapProfileId: arena.mapId,
    arenaBaseSeed: arena.baseSeed,
    arenaCandidateSeed: arena.candidateSeed,
    arenaAttempt: arena.attempt,
    arenaGeneratorVersion: arena.generatorVersion,
    arenaChecksum: arena.heightfield.checksum(),
    arenaFallbackUsed: arena.fallbackUsed,
  };
}

/** Attach props: generated layout props, or the fixed static prop set. */
export function attachProps(arena: GeneratedArena & { props?: ArenaProps }): void {
  if (arena.fallbackUsed) {
    arena.props = buildLegacyArenaModel().props;
  } else {
    arena.props = toArenaProps(arena);
  }
}

function performanceNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
