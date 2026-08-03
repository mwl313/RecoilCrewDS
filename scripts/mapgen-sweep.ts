/**
 * Deterministic seed sweep across every map profile.
 *
 * Reports accepted maps, retry distribution, fallback rate, terrain-class
 * ratios, cliff counts/edge length/largest drop, access corridors, required
 * route slope, loops, widths, barrels, ramps, objects, and generation-time
 * percentiles. Verifies full-pipeline determinism for the first seed of
 * every profile. Exits non-zero on failure.
 *
 * Usage: npm run test:maps:sweep        (default run counts)
 *        npm run test:maps:sweep:full   (per-profile full run)
 */
import { loadContentPackFromFilesystem } from '../src/shared/content/contentLoader';
import { resolveMapBundle } from '../src/shared/mapgen/profiles';
import { generateArenaWithRetry } from '../src/shared/mapgen/retry';
import { validatePhase2 } from '../src/shared/mapgen/validation2';
import type { GeneratedArena } from '../src/shared/mapgen/generator';

const FULL = process.argv.includes('--full');
const RUNS_PER_PROFILE = FULL ? 1000 : 350;
const PROFILE_IDS = ['map.arena400Primary', 'map.dramaticHighlands', 'map.cliffArena'];
const pack = loadContentPackFromFilesystem('content');

function layoutKey(arena: GeneratedArena): string {
  const layout = arena.layout;
  if (!layout) return arena.heightfield.checksum().toString();
  return [
    arena.heightfield.checksum(),
    arena.terrainFlags ? hashU32(arena.terrainFlags) : 0,
    arena.cliffEdges.length,
    layout.graph.edges.length,
    layout.spawns.map((s) => `${s.x.toFixed(2)},${s.z.toFixed(2)}`).join('|'),
    layout.gates.map((g) => `${g.x.toFixed(2)},${g.z.toFixed(2)}`).join('|'),
  ].join(':');
}

function hashU32(values: Uint32Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < values.length; i++) {
    h ^= values[i] & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (values[i] >>> 8) & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (values[i] >>> 16) & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (values[i] >>> 24) & 0xff;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

interface ProfileStats {
  runs: number;
  fallbacks: number;
  retries: number;
  times: number[];
  driveable: number[];
  risky: number[];
  blocked: number[];
  cliffEdges: number[];
  cliffLengths: number[];
  largestDrops: number[];
  accessCounts: number[];
  routeSlopes: number[];
  loops: number[];
  widths: number[];
  barrelChains: number[];
  rampCounts: number[];
  objectCounts: number[];
  minWidth: number;
  maxBarrelChain: number;
}

function emptyStats(): ProfileStats {
  return {
    runs: 0,
    fallbacks: 0,
    retries: 0,
    times: [],
    driveable: [],
    risky: [],
    blocked: [],
    cliffEdges: [],
    cliffLengths: [],
    largestDrops: [],
    accessCounts: [],
    routeSlopes: [],
    loops: [],
    widths: [],
    barrelChains: [],
    rampCounts: [],
    objectCounts: [],
    minWidth: Infinity,
    maxBarrelChain: 0,
  };
}

const stats = new Map<string, ProfileStats>(PROFILE_IDS.map((id) => [id, emptyStats()]));

for (const profileId of PROFILE_IDS) {
  const bundle = resolveMapBundle(pack, profileId);
  const fallbackBundle = resolveMapBundle(pack, bundle.map.fallbackMapId!);
  const s = stats.get(profileId)!;
  let firstKey = '';
  for (let i = 0; i < RUNS_PER_PROFILE; i++) {
    const roomCode = `${profileId.replace(/\W/g, '').slice(-6)}${String(i).padStart(4, '0')}`;
    const arena = generateArenaWithRetry({
      roomCode,
      matchIndex: 0,
      mapId: bundle.map.id,
      bundle,
      fallbackBundle,
    });
    if (!arena.validation.ok) {
      console.error(`[sweep] FAIL room ${roomCode} (${profileId}): ${arena.validation.errors.slice(0, 3).join(' | ')}`);
      process.exit(1);
    }
    const report = validatePhase2(arena);
    if (!report.ok) {
      console.error(`[sweep] PHASE2 FAIL room ${roomCode} (${profileId}): ${report.errors.slice(0, 3).join(' | ')}`);
      process.exit(1);
    }
    s.runs++;
    if (arena.fallbackUsed) s.fallbacks++;
    else if (arena.attempt > 0) s.retries++;
    s.times.push(arena.validation.metrics.generationMs);
    s.driveable.push(arena.terrainMetrics.driveableRatio);
    s.risky.push(arena.terrainMetrics.riskyRatio);
    s.blocked.push(arena.terrainMetrics.blockedRatio);
    s.cliffEdges.push(arena.terrainMetrics.cliffCount);
    s.cliffLengths.push(arena.terrainMetrics.cliffEdgeLength);
    s.largestDrops.push(arena.terrainMetrics.largestDrop);
    s.accessCounts.push(arena.accessCorridors.length);
    s.routeSlopes.push(report.metrics.maxRouteSlope);
    s.loops.push(report.metrics.loops);
    s.widths.push(report.metrics.minCorridorHalfWidth);
    s.barrelChains.push(report.metrics.maxBarrelChain);
    s.rampCounts.push(arena.layout!.ramps.length);
    s.objectCounts.push(arena.layout!.objects.length);
    s.minWidth = Math.min(s.minWidth, report.metrics.minCorridorHalfWidth);
    s.maxBarrelChain = Math.max(s.maxBarrelChain, report.metrics.maxBarrelChain);
    if (i === 0) {
      firstKey = layoutKey(arena);
      const regenerated = generateArenaWithRetry({
        roomCode,
        matchIndex: 0,
        mapId: bundle.map.id,
        bundle,
        fallbackBundle,
      });
      if (layoutKey(regenerated) !== firstKey) {
        console.error(`[sweep] DETERMINISM FAIL for ${profileId} room ${roomCode}`);
        process.exit(1);
      }
    }
  }
}

for (const profileId of PROFILE_IDS) {
  const s = stats.get(profileId)!;
  const p = (arr: number[], q: number) => {
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  };
  const avg = (arr: number[]) => (arr.length ? arr.reduce((x, v) => x + v, 0) / arr.length : 0);
  console.log(`[sweep] ${profileId}: runs ${s.runs} fallback ${s.fallbacks} retries ${s.retries}`);
  console.log(
    `  gen ms — p50 ${p(s.times, 0.5).toFixed(1)} p95 ${p(s.times, 0.95).toFixed(1)} p99 ${p(s.times, 0.99).toFixed(1)} max ${p(s.times, 1).toFixed(1)}`,
  );
  console.log(
    `  terrain — driveable ${(avg(s.driveable) * 100).toFixed(1)}% risky ${(avg(s.risky) * 100).toFixed(1)}% blocked ${(avg(s.blocked) * 100).toFixed(1)}%`,
  );
  console.log(
    `  cliffs — avg edges ${avg(s.cliffEdges).toFixed(1)} avg length ${avg(s.cliffLengths).toFixed(1)}m max drop ${p(s.largestDrops, 1).toFixed(1)}m access avg ${avg(s.accessCounts).toFixed(2)}`,
  );
  console.log(
    `  routes — max slope ${p(s.routeSlopes, 1).toFixed(3)} min half-width ${s.minWidth.toFixed(1)} loops ${p(s.loops, 1)}`,
  );
  console.log(
    `  objects — ramps avg ${avg(s.rampCounts).toFixed(1)} objects avg ${avg(s.objectCounts).toFixed(1)} max barrel chain ${s.maxBarrelChain}`,
  );
}

console.log('[sweep] determinism recheck: PASS');
console.log('[sweep] REPORT PASS');
