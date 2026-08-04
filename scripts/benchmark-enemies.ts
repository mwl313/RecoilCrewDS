#!/usr/bin/env tsx
/**
 * Deterministic enemy benchmark harness (Core Loop 06 M0).
 *
 * Creates controlled populations directly in a Match (no live random
 * spawning), stubs the legacy spawn director, and measures:
 *   - full authoritative tick p50/p95/p99 (match.step)
 *   - EnemySystem-only update p50/p95/p99
 *   - spawn time for the whole population
 *   - full-state JSON snapshot bytes and enemy-only bytes
 *
 * Usage: npm run test:horde:benchmark [--scenario stationary|dense]
 */
import { performance } from 'node:perf_hooks';
import { Match } from '../src/shared/sim/match';

const LADDER = [25, 50, 75, 100, 150, 200, 250, 300, 400, 500];
const TICKS = 240;
const DT = 1 / 30;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function makeMatch(): Match {
  const m = new Match('bench', 'none');
  // Disable the legacy Demo spawn director so populations stay controlled.
  (m.runtime.systems.spawnDirector as unknown as { step: () => void }).step = () => undefined;
  return m;
}

function populate(match: Match, count: number, scenario: 'stationary' | 'dense'): number {
  const rand = mulberry32(0x0c0ffee + count);
  const def = match.runtime.systems.enemies.defById('enemy.scrapBug')!;
  match.state.enemies = [];
  const t0 = performance.now();
  for (let i = 0; i < count; i++) {
    let x: number;
    let z: number;
    if (scenario === 'dense') {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * 16;
      x = match.state.tank.x + Math.sin(a) * r;
      z = match.state.tank.z + Math.cos(a) * r;
    } else {
      x = match.state.tank.x + (rand() - 0.5) * 160;
      z = match.state.tank.z + (rand() - 0.5) * 160;
    }
    match.runtime.systems.enemies.spawnEnemyDef(def, x, z);
  }
  return performance.now() - t0;
}

function snapshotBytes(match: Match): { total: number; enemyBytes: number } {
  const full = JSON.stringify(match.state).length;
  const enemies = match.state.enemies;
  match.state.enemies = [];
  const base = JSON.stringify(match.state).length;
  match.state.enemies = enemies;
  return { total: full, enemyBytes: full - base };
}

function runScenario(scenario: 'stationary' | 'dense'): void {
  console.log(`\n=== scenario: ${scenario} ===`);
  console.log('count\ttick p50\tp95\tp99\t\tenemyOnly p50\tp95\tp99\tspawnMs\tjsonBytes\tenemyBytes');
  for (const count of LADDER) {
    const match = makeMatch();
    const spawnMs = populate(match, count, scenario);
    const { total, enemyBytes } = snapshotBytes(match);

    // Full authoritative tick.
    const full: number[] = [];
    for (let i = 0; i < TICKS; i++) {
      const t0 = performance.now();
      match.step(DT);
      match.takeEvents();
      full.push(performance.now() - t0);
    }
    full.sort((a, b) => a - b);

    // EnemySystem-only update (fresh match, same population).
    const m2 = makeMatch();
    populate(m2, count, scenario);
    const enemyOnly: number[] = [];
    for (let i = 0; i < TICKS; i++) {
      const t0 = performance.now();
      m2.runtime.systems.enemies.update(DT);
      enemyOnly.push(performance.now() - t0);
    }
    enemyOnly.sort((a, b) => a - b);

    const fmt = (v: number): string => v.toFixed(3);
    console.log(
      `${count}\t${fmt(percentile(full, 50))}\t${fmt(percentile(full, 95))}\t${fmt(percentile(full, 99))}\t` +
        `\t${fmt(percentile(enemyOnly, 50))}\t${fmt(percentile(enemyOnly, 95))}\t${fmt(percentile(enemyOnly, 99))}\t` +
        `${spawnMs.toFixed(1)}\t${total}\t${enemyBytes}`,
    );
  }
}

const arg = process.argv.find((a) => a.startsWith('--scenario='))?.split('=')[1];
if (arg === 'dense') runScenario('dense');
else runScenario('stationary');
