import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadContentPackFromFilesystem } from '../../src/shared/content/contentLoader';
import { resolveMapBundle } from '../../src/shared/mapgen/profiles';
import { selectArenaSession } from '../../src/shared/mapgen/arenaSession';
import { composeArenaBaseSeed, composeArenaCandidateSeed } from '../../src/shared/mapgen/seed';
import { buildArenaCandidate } from '../../src/shared/mapgen/retry';
import {
  deserializeArena,
  generateMapLabResult,
  serializeArena,
  type MapLabGenerateRequest,
} from '../../tools/maplab/src/generatorAdapter';

const CONTENT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../content');
const pack = loadContentPackFromFilesystem(CONTENT_ROOT);
const bundle = resolveMapBundle(pack, 'map.arena400Primary');
const fallbackBundle = resolveMapBundle(pack, 'map.fallbackLegacy');

function baseRequest(over: Partial<MapLabGenerateRequest> = {}): MapLabGenerateRequest {
  return {
    requestId: 1,
    mode: 'production',
    roomCode: 'LABTEST',
    matchIndex: 2,
    generatorVersion: 1,
    workingBundle: JSON.parse(JSON.stringify(bundle)),
    fallbackBundle: JSON.parse(JSON.stringify(fallbackBundle)),
    ...over,
  };
}

describe('Map Lab generator adapter', () => {
  it('production mode matches the game session checksum exactly', () => {
    const lab = generateMapLabResult(baseRequest());
    expect(lab.ok).toBe(true);
    const game = selectArenaSession({ roomCode: 'LABTEST', matchIndex: 2, bundle, fallbackBundle, generatorVersion: 1 });
    expect(lab.arena!.metadata.arenaChecksum).toBe(game.metadata.arenaChecksum);
    expect(lab.arena!.metadata.arenaCandidateSeed).toBe(game.metadata.arenaCandidateSeed);
    expect(lab.arena!.metadata.arenaBaseSeed).toBe(game.metadata.arenaBaseSeed);
  });

  it('exact candidate mode reproduces a specific candidate', () => {
    const baseSeed = composeArenaBaseSeed({ roomCode: 'LABTEST', matchIndex: 2, profileId: bundle.map.id, generatorVersion: 1 });
    const candidateSeed = composeArenaCandidateSeed(baseSeed, 3);
    const lab = generateMapLabResult(baseRequest({ mode: 'exactCandidate', exactBaseSeed: baseSeed, exactCandidateSeed: candidateSeed, exactAttempt: 3 }));
    expect(lab.ok).toBe(true);
    const direct = buildArenaCandidate({
      baseSeed,
      candidateSeed,
      attempt: 3,
      mapId: bundle.map.id,
      bundle,
      generatorVersion: 1,
      fallbackUsed: false,
    });
    expect(lab.arena!.arena.heightfield.samples.length).toBe(direct.heightfield.samples.length);
    expect(lab.arena!.arena.heightfield.samples[0]).toBe(direct.heightfield.samples[0]);
  });

  it('retry/fallback parity: impossible validation falls back with metadata', () => {
    const impossible = JSON.parse(JSON.stringify(bundle)) as typeof bundle;
    impossible.validationProfile = { ...impossible.validationProfile, maxSlope: 0.000001 };
    impossible.terrainProfile = {
      ...impossible.terrainProfile,
      slopeCorrectionIterations: 0,
      smoothingPasses: 0,
      features: {
        basin: { count: 1, minSeparation: 60, radius: { min: 30, max: 40 }, depth: { min: 2, max: 3 }, falloff: 0.3 },
        ridge: { count: 1, minSeparation: 70, length: { min: 100, max: 140 }, width: { min: 20, max: 26 }, height: { min: 3, max: 4 }, falloff: 0.3 },
        plateau: { count: 1, minSeparation: 60, radius: { min: 20, max: 30 }, height: { min: 2, max: 3 }, falloff: 0.3 },
        valley: { count: 1, minSeparation: 70, length: { min: 100, max: 140 }, width: { min: 20, max: 26 }, depth: { min: 2, max: 3 }, falloff: 0.3 },
        hill: { count: 1, minSeparation: 30, radius: { min: 10, max: 16 }, height: { min: 1, max: 2 }, falloff: 0.3 },
      },
    };
    const lab = generateMapLabResult(baseRequest({ workingBundle: impossible }));
    expect(lab.ok).toBe(true);
    expect(lab.arena!.metadata.arenaFallbackUsed).toBe(true);
    expect(lab.arena!.metadata.mapProfileId).toBe('map.fallbackLegacy');
  });

  it('working bundle inputs are never mutated', () => {
    const working = JSON.parse(JSON.stringify(bundle));
    const fallback = JSON.parse(JSON.stringify(fallbackBundle));
    const snapshotWorking = JSON.stringify(working);
    const snapshotFallback = JSON.stringify(fallback);
    generateMapLabResult(baseRequest({ workingBundle: working, fallbackBundle: fallback }));
    expect(JSON.stringify(working)).toBe(snapshotWorking);
    expect(JSON.stringify(fallback)).toBe(snapshotFallback);
  });

  it('serialize/deserialize round-trips the heightfield', () => {
    const lab = generateMapLabResult(baseRequest());
    const arena = deserializeArena(lab.arena!.arena);
    expect(arena.heightfield.samplesX).toBe(101);
    expect(arena.heightfield.samples.length).toBe(101 * 101);
    const reserialized = serializeArena(arena);
    expect(reserialized.arena.heightfield.samples[1234]).toBe(lab.arena!.arena.heightfield.samples[1234]);
  });
});
