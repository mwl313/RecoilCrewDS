/**
 * Map Generation Phase 1 sweep report.
 *
 * Generates the primary 400×400 map for a room-code sweep, records retries,
 * fallbacks, and generation-time percentiles, verifies determinism for the
 * first seed, and exits non-zero on any failure.
 *
 * Usage: npm run test:maps  (also runs tests/mapgen.test.ts first)
 */
import { loadContentPackFromFilesystem } from '../src/shared/content/contentLoader';
import { generateArenaWithRetry } from '../src/shared/mapgen/retry';
import { resolveMapBundle } from '../src/shared/mapgen/profiles';
import { generateTerrain } from '../src/shared/mapgen/generator';

const pack = loadContentPackFromFilesystem('content');
const bundle = resolveMapBundle(pack, 'map.arena400Primary');
const fallbackBundle = resolveMapBundle(pack, bundle.map.fallbackMapId!);

const RUNS = 64;
const times: number[] = [];
let retries = 0;
let fallbacks = 0;
let maxSlope = 0;
let hMin = Infinity;
let hMax = -Infinity;
let determinismOk = true;

for (let i = 0; i < RUNS; i++) {
  const roomCode = `MAP${String(i).padStart(4, '0')}`;
  const arena = generateArenaWithRetry({
    roomCode,
    matchIndex: 0,
    mapId: bundle.map.id,
    bundle,
    fallbackBundle,
  });
  if (!arena.validation.ok) {
    console.error(`[mapgen] FAIL room ${roomCode}: ${arena.validation.errors.join(' | ')}`);
    process.exit(1);
  }
  if (arena.fallbackUsed) fallbacks++;
  else if (arena.attempt > 0) retries++;
  times.push(arena.validation.metrics.generationMs);
  maxSlope = Math.max(maxSlope, arena.validation.metrics.maxSlope);
  hMin = Math.min(hMin, arena.validation.metrics.heightMin);
  hMax = Math.max(hMax, arena.validation.metrics.heightMax);

  if (i === 0) {
    // Determinism double-check: regenerate the accepted candidate.
    const regenerated = generateTerrain({
      seed: arena.candidateSeed,
      widthMeters: arena.widthMeters,
      depthMeters: arena.depthMeters,
      cellSize: arena.cellSize,
      terrainProfile: arena.terrainProfile,
    });
    // Phase 1 terrain is the pre-carve heightfield; route carving (Phase 2)
    // intentionally mutates the stored field afterwards.
    determinismOk = regenerated.heightfield.checksum() === arena.terrainSeedChecksum;
  }
}

times.sort((a, b) => a - b);
const p50 = times[Math.floor(times.length * 0.5)];
const p95 = times[Math.floor(times.length * 0.95)];

console.log(`[mapgen] runs: ${RUNS} success: ${RUNS - fallbacks}/${RUNS} retries: ${retries} fallback: ${fallbacks}`);
console.log(`[mapgen] generation ms — p50: ${p50.toFixed(1)} p95: ${p95.toFixed(1)} min: ${times[0].toFixed(1)} max: ${times[times.length - 1].toFixed(1)}`);
console.log(`[mapgen] height min: ${hMin.toFixed(2)} max: ${hMax.toFixed(2)}`);
console.log(`[mapgen] maximum slope: ${maxSlope.toFixed(4)} (limit ${bundle.validationProfile.maxSlope})`);
console.log(`[mapgen] determinism recheck: ${determinismOk ? 'PASS' : 'FAIL'}`);

if (!determinismOk || fallbacks > 0) {
  console.error('[mapgen] REPORT FAIL');
  process.exit(1);
}
console.log('[mapgen] REPORT PASS');
