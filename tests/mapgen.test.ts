import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  groundHeightAt as staticGroundHeightAt,
  nearestSpawn as staticNearestSpawn,
  obstacleAt as staticObstacleAt,
  rampAt as staticRampAt,
  resolveCircle as staticResolveCircle,
} from '../src/shared/arena';
import { loadContentPackFromFilesystem } from '../src/shared/content/contentLoader';
import { ContentLoader } from '../src/shared/content/contentLoader';
import { ContentValidationError } from '../src/shared/content/errors';
import {
  ARENA_GENERATOR_VERSION,
  composeArenaBaseSeed,
  composeArenaCandidateSeed,
  hash32,
} from '../src/shared/mapgen/seed';
import { forkSeed, mulberry32 } from '../src/shared/mapgen/prng';
import {
  buildLegacyArenaModel,
  createArenaQueries,
} from '../src/shared/mapgen/compat';
import { generateTerrain, type GeneratedArena } from '../src/shared/mapgen/generator';
import { resolveMapBundle } from '../src/shared/mapgen/profiles';
import {
  GENERATED_MAP_PROFILES,
  MAP_PROFILE_SOURCE_HASH,
} from '../src/generated/mapProfiles.generated';
import {
  computeMapProfileSourceHash,
  readGeneratedSourceHash,
} from '../scripts/generate-map-profile-bundle';
import { generateArenaWithRetry } from '../src/shared/mapgen/retry';
import { validateArena } from '../src/shared/mapgen/validation';
import type { TerrainProfileDef } from '../src/shared/mapgen/profiles';

const CONTENT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../content');
const pack = loadContentPackFromFilesystem(CONTENT_ROOT);
const PRIMARY = resolveMapBundle(pack, 'map.arena400Primary');
const FALLBACK = resolveMapBundle(pack, 'map.fallbackLegacy');

function generateRoom(roomCode: string, matchIndex = 0): GeneratedArena {
  return generateArenaWithRetry({
    roomCode,
    matchIndex,
    mapId: PRIMARY.map.id,
    bundle: PRIMARY,
    fallbackBundle: FALLBACK,
  });
}

describe('seed pipeline', () => {
  it('hash32 has fixed expected values (stable across restarts)', () => {
    expect(hash32('hello')).toBe(3570176842);
    expect(hash32('arena-seed', 'ABCDEF', 0, 'map.arena400Primary', 1)).toBe(225852939);
  });

  it('composeArenaBaseSeed has fixed expected values', () => {
    expect(
      composeArenaBaseSeed({
        roomCode: 'ABCDEF',
        matchIndex: 0,
        profileId: 'map.arena400Primary',
        generatorVersion: ARENA_GENERATOR_VERSION,
      }),
    ).toBe(1908796446);
    expect(
      composeArenaBaseSeed({
        roomCode: 'ABCDEF',
        matchIndex: 1,
        profileId: 'map.arena400Primary',
        generatorVersion: ARENA_GENERATOR_VERSION,
      }),
    ).toBe(1767293821);
    expect(
      composeArenaBaseSeed({
        roomCode: 'ABCDEF',
        matchIndex: 0,
        profileId: 'map.fallbackLegacy',
        generatorVersion: ARENA_GENERATOR_VERSION,
      }),
    ).toBe(3351201938);
  });

  it('attempt seeds are deterministic, distinct, and ordered', () => {
    const base = composeArenaBaseSeed({
      roomCode: 'ABCDEF',
      matchIndex: 0,
      profileId: 'map.arena400Primary',
      generatorVersion: ARENA_GENERATOR_VERSION,
    });
    const attempts = [0, 1, 2, 3, 4, 5, 6, 7].map((a) => composeArenaCandidateSeed(base, a));
    expect(attempts[0]).toBe(1171264819);
    expect(attempts[1]).toBe(3098122808);
    expect(new Set(attempts).size).toBe(8);
    expect(attempts).toEqual([0, 1, 2, 3, 4, 5, 6, 7].map((a) => composeArenaCandidateSeed(base, a)));
  });

  it('rematch, profile, and version each change the seed', () => {
    const a = generateRoom('ABCDEF', 0).baseSeed;
    const b = generateRoom('ABCDEF', 1).baseSeed;
    expect(b).not.toBe(a);
    const differentProfile = composeArenaBaseSeed({
      roomCode: 'ABCDEF',
      matchIndex: 0,
      profileId: 'map.fallbackLegacy',
      generatorVersion: ARENA_GENERATOR_VERSION,
    });
    expect(differentProfile).not.toBe(a);
    const differentVersion = composeArenaBaseSeed({
      roomCode: 'ABCDEF',
      matchIndex: 0,
      profileId: 'map.arena400Primary',
      generatorVersion: ARENA_GENERATOR_VERSION + 1,
    });
    expect(differentVersion).not.toBe(a);
  });
});

describe('PRNG and substreams', () => {
  it('mulberry32 produces the fixed expected sequence', () => {
    const r = mulberry32(1);
    expect(r()).toBeCloseTo(0.6270739406, 9);
    expect(r()).toBeCloseTo(0.0027357212, 9);
    expect(r()).toBeCloseTo(0.52744704, 9);
    expect(r()).toBeCloseTo(0.9810509675, 9);
    expect(r()).toBeCloseTo(0.9683778982, 9);
  });

  it('named forks are stable and independent', () => {
    expect(forkSeed(12345, 'terrain')).toBe(2854112738);
    expect(forkSeed(12345, 'routes')).toBe(3504197308);
    expect(forkSeed(12345, 'furniture')).toBe(461773013);
    expect(forkSeed(12345, 'spawns')).toBe(669987627);
    const names = ['terrain', 'routes', 'furniture', 'spawns'];
    expect(new Set(names.map((n) => forkSeed(12345, n))).size).toBe(4);
    // Terrain stream is identical regardless of other substreams.
    const terrain1 = [0, 1, 2].map(() => mulberry32(forkSeed(999, 'terrain'))());
    void mulberry32(forkSeed(999, 'routes'));
    void mulberry32(forkSeed(999, 'furniture'));
    const terrain2 = [0, 1, 2].map(() => mulberry32(forkSeed(999, 'terrain'))());
    expect(terrain1).toEqual(terrain2);
  });
});

describe('content definitions', () => {
  it('loads the new map/terrain/validation categories from the pack', () => {
    expect([...pack.ids('maps')].sort()).toEqual([
      'map.arena400Primary',
      'map.cliffArena',
      'map.dramaticHighlands',
      'map.fallbackLegacy',
      'map.megaBonkHighlands',
      'map.rocketJumpHighlands',
    ]);
    expect([...pack.ids('terrainProfiles')].sort()).toEqual([
      'terrainProfile.cliffArena',
      'terrainProfile.dramaticHighlands',
      'terrainProfile.fallback',
      'terrainProfile.megaBonkHighlands',
      'terrainProfile.primary',
      'terrainProfile.rocketJumpHighlands',
    ]);
    expect([...pack.ids('validationProfiles')].sort()).toEqual([
      'validationProfile.cliffArena',
      'validationProfile.dramaticHighlands',
      'validationProfile.fallback',
      'validationProfile.megaBonkHighlands',
      'validationProfile.primary',
      'validationProfile.rocketJumpHighlands',
    ]);
  });

  it('generated client bundles deep-equal server-resolved bundles (single source)', () => {
    expect(GENERATED_MAP_PROFILES['map.arena400Primary']).toEqual(PRIMARY);
    expect(GENERATED_MAP_PROFILES['map.fallbackLegacy']).toEqual(FALLBACK);
    expect([...Object.keys(GENERATED_MAP_PROFILES)].sort()).toEqual([...pack.ids('maps')].sort());
  });

  it('detects a stale generated bundle (run npm run generate:map-profiles)', () => {
    expect(MAP_PROFILE_SOURCE_HASH).toBe(readGeneratedSourceHash());
    expect(computeMapProfileSourceHash(CONTENT_ROOT)).toBe(readGeneratedSourceHash());
  });

  it('rejects map definitions with missing profile references', () => {
    const { manifest, files } = loadRealPackRecords();
    const map = JSON.parse(JSON.stringify(files['maps/arena_400_primary.json'])) as { terrainProfileId: string };
    map.terrainProfileId = 'terrainProfile.missing';
    files['maps/arena_400_primary.json'] = map;
    let error = '';
    try {
      new ContentLoader().loadFromRecords(manifest, files);
    } catch (err) {
      if (err instanceof ContentValidationError) error = err.issues.join(' | ');
      else error = (err as Error).message;
    }
    expect(error).toContain('terrainProfile.missing');
  });
});

describe('heightfield terrain', () => {
  it('generates 101×101 finite samples for the 400×400 map', () => {
    const arena = generateRoom('HEIGHT01');
    expect(arena.fallbackUsed).toBe(false);
    expect(arena.heightfield.samplesX).toBe(101);
    expect(arena.heightfield.samplesZ).toBe(101);
    expect(arena.heightfield.samples.length).toBe(101 * 101);
    expect(arena.heightfield.allFinite()).toBe(true);
    expect(arena.validation.ok).toBe(true);
  });

  it('heights stay inside the profile bounds', () => {
    for (const room of ['BOUND01', 'BOUND02', 'BOUND03']) {
      const arena = generateRoom(room);
      expect(arena.validation.metrics.heightMin).toBeGreaterThanOrEqual(-5);
      expect(arena.validation.metrics.heightMax).toBeLessThanOrEqual(10);
    }
  });

  it('max slope respects the profile limit', () => {
    const arena = generateRoom('SLOPE01');
    expect(arena.heightfield.maxSlope()).toBeLessThanOrEqual(PRIMARY.terrainProfile.maxSlope + 1e-6);
  });

  it('same seed produces byte-identical terrain; different seeds vary', () => {
    const a = generateRoom('IDENT01');
    const b = generateRoom('IDENT01');
    expect(a.heightfield.checksum()).toBe(b.heightfield.checksum());
    expect(a.heightfield.samples).toEqual(b.heightfield.samples);
    expect(a.macroFeatures).toEqual(b.macroFeatures);

    const c = generateRoom('IDENT02');
    expect(c.heightfield.checksum()).not.toBe(a.heightfield.checksum());
    let anyDifferent = false;
    for (let i = 0; i < a.heightfield.samples.length; i++) {
      if (a.heightfield.samples[i] !== c.heightfield.samples[i]) {
        anyDifferent = true;
        break;
      }
    }
    expect(anyDifferent).toBe(true);
  });

  it('deterministic interpolation: query values are stable and border-safe', () => {
    const arena = generateRoom('QUERY01');
    const q = arena.heightfield;
    expect(q.heightAt(10, 10)).toBeCloseTo(q.heightAt(10, 10), 9);
    expect(q.heightAt(-500, 200)).toBeCloseTo(q.heightAt(0, 200), 9); // clamped border
    expect(q.heightAt(900, 900)).toBeCloseTo(q.heightAt(400, 400), 9);
    for (const [x, z] of [[0, 0], [399, 399], [200, 200], [-1, 50], [50, -1], [401, 399]]) {
      expect(Number.isFinite(q.heightAt(x, z))).toBe(true);
      expect(Number.isFinite(q.slopeAt(x, z))).toBe(true);
    }
  });

  it('rematch changes the generated terrain', () => {
    const a = generateRoom('REMATCH1', 0);
    const b = generateRoom('REMATCH1', 1);
    expect(b.baseSeed).not.toBe(a.baseSeed);
    expect(b.heightfield.checksum()).not.toBe(a.heightfield.checksum());
  });
});

describe('macro features', () => {
  it('places all five feature types with valid spacing', () => {
    const arena = generateRoom('FEAT01');
    const types = new Set(arena.macroFeatures.map((f) => f.type));
    expect(types).toEqual(new Set(['basin', 'ridge', 'plateau', 'valley', 'hill']));
    expect(arena.macroFeatures.length).toBe(
      PRIMARY.terrainProfile.features.basin.count +
        PRIMARY.terrainProfile.features.ridge.count +
        PRIMARY.terrainProfile.features.plateau.count +
        PRIMARY.terrainProfile.features.valley.count +
        PRIMARY.terrainProfile.features.hill.count,
    );
    for (let i = 0; i < arena.macroFeatures.length; i++) {
      for (let j = i + 1; j < arena.macroFeatures.length; j++) {
        const a = arena.macroFeatures[i];
        const b = arena.macroFeatures[j];
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        expect(d).toBeGreaterThanOrEqual(Math.max(a.minSeparation, b.minSeparation) - 1e-6);
      }
    }
  });

  it('validator rejects spacing violations', () => {
    const arena = generateRoom('SPACE01');
    const violated: GeneratedArena = {
      ...arena,
      macroFeatures: [
        arena.macroFeatures[0],
        { ...arena.macroFeatures[1], x: arena.macroFeatures[0].x + 1, z: arena.macroFeatures[0].z },
      ],
    };
    const report = validateArena(violated, PRIMARY.validationProfile);
    expect(report.ok).toBe(false);
    expect(report.errors.some((e) => e.startsWith('spacing:'))).toBe(true);
  });

  it('terrain changes when furniture-only logic changes (substream isolation)', () => {
    // Later phases consume the furniture fork; the terrain fork must be
    // unaffected. Phase 1 terrain (pre-carve) re-derived from the same
    // candidate seed matches the arena's recorded terrain checksum, even
    // though routes/furniture forks were consumed during generation.
    const arena = generateRoom('FORK01');
    const direct = generateTerrain({
      seed: arena.candidateSeed,
      widthMeters: 400,
      depthMeters: 400,
      cellSize: 4,
      terrainProfile: PRIMARY.terrainProfile,
    });
    expect(direct.heightfield.checksum()).toBe(arena.terrainSeedChecksum);
  });
});

describe('validation', () => {
  it('reports structured metrics', () => {
    const arena = generateRoom('METRIC01');
    expect(arena.validation.metrics.featureCount).toBe(13);
    expect(arena.validation.metrics.checksum).toBeGreaterThan(0);
    expect(arena.validation.metrics.generationMs).toBeGreaterThanOrEqual(0);
    expect(arena.validation.errors).toEqual([]);
    expect(arena.validation.warnings).toEqual([]);
  });

  it('regeneration determinism check passes for the same seed', () => {
    const arena = generateRoom('DETER01');
    const report = validateArena(arena, PRIMARY.validationProfile, { verifyDeterminism: true });
    expect(report.ok).toBe(true);
  });
});

describe('retry and fallback', () => {
  function impossibleProfile(): TerrainProfileDef {
    return {
      ...PRIMARY.terrainProfile,
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
  }

  function impossibleValidation() {
    return { ...PRIMARY.validationProfile, heightRange: { min: 100, max: 200 } };
  }

  it('retries attempts 0..7 in deterministic order before falling back', () => {
    const attempts: number[] = [];
    const seeds: number[] = [];
    const baseSeed = composeArenaBaseSeed({
      roomCode: 'RETRY01',
      matchIndex: 0,
      profileId: 'map.arena400Primary',
      generatorVersion: ARENA_GENERATOR_VERSION,
    });
    const arena = generateArenaWithRetry({
      roomCode: 'RETRY01',
      matchIndex: 0,
      mapId: PRIMARY.map.id,
      bundle: { ...PRIMARY, terrainProfile: impossibleProfile(), validationProfile: impossibleValidation() },
      fallbackBundle: FALLBACK,
      onAttempt: (attempt, seed, ok) => {
        attempts.push(attempt);
        seeds.push(seed);
        expect(seed).toBe(composeArenaCandidateSeed(baseSeed, attempt));
        expect(ok).toBe(false);
      },
    });
    expect(attempts).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(new Set(seeds).size).toBe(8);
    expect(arena.fallbackUsed).toBe(true);
    expect(arena.attempt).toBe(8);
    expect(arena.mapId).toBe('map.fallbackLegacy');
    expect(arena.validation.ok).toBe(true);
  });

  it('forced fallback is a stable known-safe arena', () => {
    const a = generateArenaWithRetry({
      roomCode: 'FORCE01',
      matchIndex: 0,
      mapId: PRIMARY.map.id,
      bundle: { ...PRIMARY, terrainProfile: impossibleProfile(), validationProfile: impossibleValidation() },
      fallbackBundle: FALLBACK,
    });
    const b = generateArenaWithRetry({
      roomCode: 'FORCE01',
      matchIndex: 0,
      mapId: PRIMARY.map.id,
      bundle: { ...PRIMARY, terrainProfile: impossibleProfile(), validationProfile: impossibleValidation() },
      fallbackBundle: FALLBACK,
    });
    expect(a.fallbackUsed).toBe(true);
    expect(a.heightfield.checksum()).toBe(b.heightfield.checksum());
    expect(a.terrainProfile.id).toBe('terrainProfile.fallback');
    expect(a.heightfield.maxSlope()).toBeLessThanOrEqual(FALLBACK.validationProfile.maxSlope + 1e-6);
  });

  it('normal generation reports no fallback and attempt 0', () => {
    const arena = generateRoom('NORMAL01');
    expect(arena.fallbackUsed).toBe(false);
    expect(arena.attempt).toBe(0);
    expect(arena.source).toBe('generated');
  });
});

describe('legacy arena compatibility', () => {
  it('legacy model queries match the static arena functions', () => {
    const queries = createArenaQueries(buildLegacyArenaModel());
    const points: Array<[number, number]> = [
      [-6, 10], [6, -10], [0, 0], [0, -4], [28, 8], [-4, -8], [0, -29], [-32, 14],
      [30, -26], [-40, -40], [39, 0], [-39, 39], [20, 20], [-25, -30],
    ];
    for (const [x, z] of points) {
      expect(queries.groundHeightAt(x, z)).toBeCloseTo(staticGroundHeightAt(x, z), 6);
    }
    expect(queries.obstacleAt(0, 17)?.id).toBe(staticObstacleAt(0, 17)?.id);
    expect(queries.obstacleAt(12, 12)).toBeUndefined();
    expect(queries.rampAt(0, -29)?.id).toBe(staticRampAt(0, -29)?.id);
    const c1 = queries.resolveCircle(26, 13, 1.35);
    const c2 = staticResolveCircle(26, 13, 1.35);
    expect(c1).toEqual(c2);
    expect(queries.nearestSpawn(30, 30)).toEqual(staticNearestSpawn(30, 30));
    expect(queries.boundsHalf()).toBe(40);
  });

  it('legacy ground normal matches the static function', () => {
    const queries = createArenaQueries(buildLegacyArenaModel());
    const n = queries.groundNormalAt(-6, 10);
    expect(Number.isFinite(n.nx)).toBe(true);
    expect(Math.abs(Math.hypot(n.nx, n.ny, n.nz) - 1)).toBeLessThan(1e-9);
  });
});

describe('rocket-jump highlands render-safe terrain (map polish)', () => {
  const ROCKET_BUNDLE = resolveMapBundle(pack, 'map.rocketJumpHighlands');
  const ROCKET_FALLBACK = resolveMapBundle(pack, 'map.fallbackLegacy');

  function rocketRoom(roomCode: string): GeneratedArena {
    return generateArenaWithRetry({
      roomCode,
      matchIndex: 0,
      mapId: ROCKET_BUNDLE.map.id,
      bundle: ROCKET_BUNDLE,
      fallbackBundle: ROCKET_FALLBACK,
    });
  }

  it('keeps whole-map safe-slope correction active and dedicated cliffs disabled', () => {
    expect(ROCKET_BUNDLE.terrainProfile.correctAllMap).toBe(true);
    expect(ROCKET_BUNDLE.terrainProfile.smoothingPasses).toBe(2);
    expect(ROCKET_BUNDLE.terrainProfile.finalSmoothingPasses).toBe(2);
    expect(ROCKET_BUNDLE.terrainProfile.features.cliffPlateau?.count).toBe(0);
    expect(ROCKET_BUNDLE.terrainProfile.features.escarpment?.count).toBe(0);
    expect(ROCKET_BUNDLE.terrainProfile.maxSlope).toBe(0.9);
  });

  it('all height samples are finite and stay inside the configured range', () => {
    for (const room of ['POLISH01', 'POLISH02', 'POLISH03']) {
      const arena = rocketRoom(room);
      expect(arena.fallbackUsed).toBe(false);
      expect(arena.heightfield.allFinite()).toBe(true);
      expect(arena.validation.metrics.heightMin).toBeGreaterThanOrEqual(-10);
      expect(arena.validation.metrics.heightMax).toBeLessThanOrEqual(22);
    }
  });

  it('neighboring height deltas stay within maxSlope × cellSize + epsilon', () => {
    const maxDelta = 0.9 * 4 + 1e-6;
    for (const room of ['POLISH04', 'POLISH05', 'POLISH06', 'POLISH07', 'POLISH08']) {
      const arena = rocketRoom(room);
      const hf = arena.heightfield;
      for (let zi = 0; zi < hf.samplesZ; zi++) {
        for (let xi = 0; xi < hf.samplesX; xi++) {
          const h = hf.getSample(xi, zi);
          if (xi + 1 < hf.samplesX) {
            expect(Math.abs(h - hf.getSample(xi + 1, zi))).toBeLessThanOrEqual(maxDelta);
          }
          if (zi + 1 < hf.samplesZ) {
            expect(Math.abs(h - hf.getSample(xi, zi + 1))).toBeLessThanOrEqual(maxDelta);
          }
        }
      }
    }
  });

  it('same seed produces the same checksum', () => {
    expect(rocketRoom('POLISH09').heightfield.checksum()).toBe(rocketRoom('POLISH09').heightfield.checksum());
  });

  it('100-seed qualification uses no fallback', () => {
    for (let i = 0; i < 100; i++) {
      const arena = rocketRoom(`POLISH${100 + i}`);
      expect(arena.fallbackUsed).toBe(false);
    }
  }, 30000);
});

function loadRealPackRecords(): { manifest: unknown; files: Record<string, unknown> } {
  const manifest = JSON.parse(readFileSync(path.join(CONTENT_ROOT, 'manifest.json'), 'utf8'));
  const files: Record<string, unknown> = {};
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs, rel);
      else if (entry.name.endsWith('.json')) files[rel] = JSON.parse(readFileSync(abs, 'utf8'));
    }
  };
  walk(CONTENT_ROOT, '');
  return { manifest, files };
}
