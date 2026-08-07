#!/usr/bin/env tsx
/**
 * Quality milestone enemy-capacity benchmark.
 *
 * Separates authoritative simulation, enemy AI, client interpolation,
 * replication bandwidth, snapshot size, projectile/XP pressure, memory, and
 * state growth for the fixed 100/150/200/300/500/750 population ladder.
 *
 * Usage:
 *   npm run test:horde:benchmark
 *   npm run test:horde:benchmark -- --json=docs/quality/evidence/enemy-capacity-server.json
 */
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { Match } from '../src/shared/sim/match';
import { interpolateMatchState } from '../src/shared/net/interpolation';
import { HordeReplicationTracker } from '../src/shared/net/horde/hordeReplication';
import type { EnemyState, MatchState } from '../src/shared/types';
import type { SpawnOwnership } from '../src/shared/horde/spawnOwnership';

const COUNTS = [100, 150, 200, 300, 500, 750] as const;
const TICKS = 180;
const DT = 1 / 30;
const POLICY = {
  id: 'horde.replicationPolicy.capacityBenchmark',
  behaviors: [],
  nearHz: 15,
  midHz: 8,
  farHz: 2,
  sectorHz: 1.5,
};

interface ScenarioResult {
  count: number;
  scenario: 'baseline' | 'combatPressure';
  serverStep: Percentiles;
  enemyAi: Percentiles;
  interpolation: Percentiles;
  spawnMs: number;
  snapshotBytes: number;
  enemyBytes: number;
  snapshotBytesPerSecondAt20Hz: number;
  hordeReplicationBytesPerSecond: number;
  replicationSerializeMs: Percentiles;
  projectiles: number;
  xpShards: number;
  eliteCount: number;
  bossCount: number;
  heapDeltaMb: number;
  stateGrowth: { enemies: number; shells: number; xpShards: number };
}

interface Percentiles { p50: number; p95: number; p99: number }

const results: ScenarioResult[] = [];
console.log('=== Recoil Crew enemy-capacity benchmark ===');
console.log('count scenario step(p50/p95/p99) AI(p50/p95/p99) interp(p50/p95/p99) replKB/s snapshotKB heapMB growth(E/S/XP)');
for (const count of COUNTS) {
  for (const scenario of ['baseline', 'combatPressure'] as const) {
    const result = runScenario(count, scenario);
    results.push(result);
    const p = (v: Percentiles) => `${v.p50.toFixed(3)}/${v.p95.toFixed(3)}/${v.p99.toFixed(3)}`;
    console.log(
      `${count} ${scenario} ${p(result.serverStep)} ${p(result.enemyAi)} ${p(result.interpolation)} ` +
      `${(result.hordeReplicationBytesPerSecond / 1024).toFixed(1)} ${(result.snapshotBytes / 1024).toFixed(1)} ` +
      `${result.heapDeltaMb.toFixed(1)} ${result.stateGrowth.enemies}/${result.stateGrowth.shells}/${result.stateGrowth.xpShards}`,
    );
  }
}

const payload = {
  format: 2,
  capturedAt: new Date().toISOString(),
  runtime: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    tickRateHz: 30,
    snapshotReferenceRateHz: 20,
    ticksPerScenario: TICKS,
  },
  results,
};
const jsonPath = process.argv.find((arg) => arg.startsWith('--json='))?.slice('--json='.length);
if (jsonPath) {
  writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`wrote ${jsonPath}`);
}
console.log('PASS');

function runScenario(count: number, scenario: 'baseline' | 'combatPressure'): ScenarioResult {
  const match = makeMatch();
  const heapStart = process.memoryUsage().heapUsed;
  const spawnStart = performance.now();
  populate(match, count, scenario);
  if (scenario === 'combatPressure') addCombatPressure(match, count);
  const spawnMs = performance.now() - spawnStart;
  const initial = stateCounts(match.state);
  const bytes = snapshotBytes(match.state);
  const replication = benchmarkReplication(match.state.enemies, match.state.tank.x, match.state.tank.z);
  const interpolation = benchmarkInterpolation(match.state);

  const full: number[] = [];
  for (let i = 0; i < TICKS; i++) {
    const t0 = performance.now();
    match.step(DT);
    match.takeEvents();
    full.push(performance.now() - t0);
  }

  const aiMatch = makeMatch();
  populate(aiMatch, count, scenario);
  const ai: number[] = [];
  for (let i = 0; i < TICKS; i++) {
    const t0 = performance.now();
    aiMatch.runtime.systems.enemies.update(DT);
    ai.push(performance.now() - t0);
  }
  const final = stateCounts(match.state);
  const heapDeltaMb = (process.memoryUsage().heapUsed - heapStart) / 1048576;
  return {
    count,
    scenario,
    serverStep: percentiles(full),
    enemyAi: percentiles(ai),
    interpolation,
    spawnMs: round(spawnMs),
    snapshotBytes: bytes.total,
    enemyBytes: bytes.enemies,
    snapshotBytesPerSecondAt20Hz: bytes.total * 20,
    hordeReplicationBytesPerSecond: round(replication.bytesPerSecond),
    replicationSerializeMs: percentiles(replication.serializeMs),
    projectiles: initial.shells,
    xpShards: initial.xpShards,
    eliteCount: match.state.enemies.filter((enemy) => enemy.ownership?.priority === 1).length,
    bossCount: match.state.enemies.filter((enemy) => enemy.ownership?.priority === 2).length,
    heapDeltaMb: round(heapDeltaMb),
    stateGrowth: {
      enemies: final.enemies - initial.enemies,
      shells: final.shells - initial.shells,
      xpShards: final.xpShards - initial.xpShards,
    },
  };
}

function makeMatch(): Match {
  const match = new Match('quality-capacity-bench', 'none');
  (match.runtime.systems.spawnDirector as unknown as { step: () => void }).step = () => undefined;
  return match;
}

function populate(match: Match, count: number, scenario: 'baseline' | 'combatPressure'): void {
  const random = mulberry32(0xc0ffee + count + (scenario === 'combatPressure' ? 99 : 0));
  const common = match.runtime.systems.enemies.defById('enemy.scrapBug')!;
  match.state.enemies = [];
  for (let i = 0; i < count; i++) {
    const angle = random() * Math.PI * 2;
    const radius = scenario === 'combatPressure' ? 24 + random() * 58 : 35 + random() * 90;
    const ownership: SpawnOwnership | undefined = i === count - 2
      ? { populationClass: 'wave', waveId: 1, leaderId: -1, packInstanceId: 1, spawnAnchorId: null, purgeOnLeaderDeath: false, priority: 1 }
      : i === count - 1
        ? { populationClass: 'boss', waveId: 2, leaderId: -1, packInstanceId: 2, spawnAnchorId: null, purgeOnLeaderDeath: false, priority: 2 }
        : undefined;
    match.runtime.systems.enemies.spawnEnemyDef(
      common,
      match.state.tank.x + Math.sin(angle) * radius,
      match.state.tank.z + Math.cos(angle) * radius,
      ownership,
    );
  }
}

function addCombatPressure(match: Match, count: number): void {
  const projectileCount = Math.min(240, Math.ceil(count * 0.3));
  for (let i = 0; i < projectileCount; i++) {
    const angle = (i / projectileCount) * Math.PI * 2;
    match.runtime.systems.projectiles.spawn(
      match.state.tank.x + Math.sin(angle) * 55,
      5 + (i % 4),
      match.state.tank.z + Math.cos(angle) * 55,
      Math.sin(angle), 0, Math.cos(angle), 0.4, 'enemy', 30,
      undefined,
      { team: 'enemy', damage: 1, splashRadius: 0.5, ownerEnemyId: (i % count) + 1 },
    );
  }
  const xpCount = Math.min(400, count);
  for (let i = 0; i < xpCount; i++) {
    const angle = (i / xpCount) * Math.PI * 2;
    const radius = 30 + (i % 20);
    match.state.xpShards.push({
      id: match.state.nextXpShardId++, value: 1,
      x: match.state.tank.x + Math.sin(angle) * radius,
      y: 0.6,
      z: match.state.tank.z + Math.cos(angle) * radius,
      vx: 0, vy: 0, vz: 0, age: 0, collected: false,
    });
  }
}

function benchmarkInterpolation(state: MatchState): Percentiles {
  const a = structuredClone(state);
  const b = structuredClone(state);
  for (const enemy of b.enemies) {
    enemy.x += 0.2;
    enemy.z -= 0.1;
    enemy.yaw += 0.02;
  }
  const samples: number[] = [];
  for (let i = 0; i < 120; i++) {
    const t0 = performance.now();
    interpolateMatchState(a, b, (i % 10) / 10);
    samples.push(performance.now() - t0);
  }
  return percentiles(samples);
}

function benchmarkReplication(enemies: EnemyState[], tankX: number, tankZ: number): { bytesPerSecond: number; serializeMs: number[] } {
  const tracker = new HordeReplicationTracker(POLICY);
  let bytes = 0;
  const serializeMs: number[] = [];
  const duration = 3;
  const frames = Math.round(duration / DT);
  for (let frame = 0; frame < frames; frame++) {
    for (const enemy of enemies) enemy.x += Math.sin(frame * 0.1 + enemy.id) * 0.003;
    const before = tracker.stats.serializeMs;
    const block = tracker.track(enemies, DT, null, (enemy) => {
      if (enemy.ownership?.priority) return 0;
      const distance = Math.hypot(enemy.x - tankX, enemy.z - tankZ);
      return distance < 40 ? 0 : distance < 90 ? 1 : 3;
    });
    bytes += JSON.stringify(block).length;
    serializeMs.push(Math.max(0, tracker.stats.serializeMs - before));
  }
  return { bytesPerSecond: bytes / duration, serializeMs };
}

function snapshotBytes(state: MatchState): { total: number; enemies: number } {
  const total = JSON.stringify(state).length;
  const clone = { ...state, enemies: [] };
  return { total, enemies: total - JSON.stringify(clone).length };
}

function stateCounts(state: MatchState): { enemies: number; shells: number; xpShards: number } {
  return { enemies: state.enemies.length, shells: state.shells.length, xpShards: state.xpShards.length };
}

function percentiles(values: number[]): Percentiles {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => round(sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0);
  return { p50: at(0.5), p95: at(0.95), p99: at(0.99) };
}

function round(value: number): number {
  return Number(value.toFixed(3));
}

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
