/**
 * 1000-seed Map Generation Phase 2 sweep.
 *
 * Reports retries, fallback count, loops, route widths/slopes, barrel chain
 * size, ramps, object counts, and generation-time percentiles. Verifies
 * full-pipeline determinism for the first seed. Exits non-zero on failure.
 *
 * Usage: npm run test:maps:sweep
 */
import { loadContentPackFromFilesystem } from '../src/shared/content/contentLoader';
import { resolveMapBundle } from '../src/shared/mapgen/profiles';
import { generateArenaWithRetry } from '../src/shared/mapgen/retry';
import { validatePhase2 } from '../src/shared/mapgen/validation2';
import type { GeneratedArena } from '../src/shared/mapgen/generator';

const RUNS = 1000;
const pack = loadContentPackFromFilesystem('content');
const bundle = resolveMapBundle(pack, 'map.arena400Primary');
const fallbackBundle = resolveMapBundle(pack, bundle.map.fallbackMapId!);

const times: number[] = [];
const loops: number[] = [];
const slopes: number[] = [];
const barrelChains: number[] = [];
const rampCounts: number[] = [];
const objectCounts: number[] = [];
const colliderCounts: number[] = [];
let retries = 0;
let fallbacks = 0;
let minWidth = Infinity;
let maxBarrelChain = 0;
let determinismOk = true;
let firstKey = '';

for (let i = 0; i < RUNS; i++) {
  const roomCode = `SWEEP${String(i).padStart(4, '0')}`;
  const arena = generateArenaWithRetry({
    roomCode,
    matchIndex: 0,
    mapId: bundle.map.id,
    bundle,
    fallbackBundle,
  });
  if (!arena.validation.ok) {
    console.error(`[sweep] FAIL room ${roomCode}: ${arena.validation.errors.slice(0, 3).join(' | ')}`);
    process.exit(1);
  }
  if (arena.fallbackUsed) fallbacks++;
  else if (arena.attempt > 0) retries++;
  const layout = arena.layout!;
  const report = validatePhase2(arena);
  if (!report.ok) {
    console.error(`[sweep] PHASE2 FAIL room ${roomCode}: ${report.errors.slice(0, 3).join(' | ')}`);
    process.exit(1);
  }
  times.push(arena.validation.metrics.generationMs);
  loops.push(layout.graph.loops);
  slopes.push(report.metrics.maxRouteSlope);
  barrelChains.push(report.metrics.maxBarrelChain);
  rampCounts.push(layout.ramps.length);
  objectCounts.push(layout.objects.length);
  colliderCounts.push(layout.objects.filter((o) => o.collider).length);
  minWidth = Math.min(minWidth, report.metrics.minCorridorHalfWidth);
  maxBarrelChain = Math.max(maxBarrelChain, report.metrics.maxBarrelChain);

  if (i === 0) {
    firstKey = layoutKey(arena);
    const regenerated = generateArenaWithRetry({
      roomCode,
      matchIndex: 0,
      mapId: bundle.map.id,
      bundle,
      fallbackBundle,
    });
    determinismOk =
      regenerated.heightfield.checksum() === arena.heightfield.checksum() &&
      layoutKey(regenerated) === firstKey;
  }
}

times.sort((a, b) => a - b);
loops.sort((a, b) => a - b);
slopes.sort((a, b) => a - b);
objectCounts.sort((a, b) => a - b);
const p50 = times[Math.floor(times.length * 0.5)];
const p95 = times[Math.floor(times.length * 0.95)];
const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;

console.log(`[sweep] runs: ${RUNS} success: ${RUNS - fallbacks}/${RUNS} retries: ${retries} fallback: ${fallbacks}`);
console.log(`[sweep] generation ms — p50: ${p50.toFixed(1)} p95: ${p95.toFixed(1)} max: ${times[times.length - 1].toFixed(1)}`);
console.log(`[sweep] loops — min: ${loops[0]} max: ${loops[loops.length - 1]} avg: ${avg(loops).toFixed(2)}`);
console.log(`[sweep] route half-width min: ${minWidth.toFixed(1)} (limit ${bundle.furnitureSet.routeMinHalfWidth})`);
console.log(`[sweep] max route slope: ${slopes[slopes.length - 1].toFixed(4)} (limit ${bundle.furnitureSet.maxRouteSlope})`);
console.log(`[sweep] max barrel chain: ${maxBarrelChain} (limit ${bundle.densityProfile.budgets.maxBarrelChain})`);
console.log(`[sweep] ramps — min: ${Math.min(...rampCounts)} avg: ${avg(rampCounts).toFixed(1)} max: ${Math.max(...rampCounts)}`);
console.log(`[sweep] objects — avg: ${avg(objectCounts).toFixed(1)} max: ${objectCounts[objectCounts.length - 1]} (budget ${bundle.densityProfile.budgets.maxObjects})`);
console.log(`[sweep] colliders — avg: ${avg(colliderCounts).toFixed(1)} max: ${Math.max(...colliderCounts)} (budget ${bundle.densityProfile.budgets.maxColliders})`);
console.log(`[sweep] determinism recheck: ${determinismOk ? 'PASS' : 'FAIL'}`);

if (!determinismOk || fallbacks > 0 || maxBarrelChain > bundle.densityProfile.budgets.maxBarrelChain) {
  console.error('[sweep] REPORT FAIL');
  process.exit(1);
}
console.log('[sweep] REPORT PASS');

function layoutKey(arena: GeneratedArena): string {
  const layout = arena.layout!;
  const gates = layout.gates.map((g) => `${g.id}@${g.x.toFixed(3)},${g.z.toFixed(3)}`).join('|');
  const objects = layout.objects
    .map((o) => `${o.id}@${o.x.toFixed(3)},${o.z.toFixed(3)}`)
    .join('|');
  const ramps = layout.ramps
    .map((r) => `${r.id}@${r.x.toFixed(3)},${r.z.toFixed(3)}:${r.dirX.toFixed(3)},${r.dirZ.toFixed(3)}`)
    .join('|');
  return `${gates}#${ramps}#${objects}`;
}
