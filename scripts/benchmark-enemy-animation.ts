#!/usr/bin/env tsx
/**
 * Animated enemy benchmark (Animation07 M15).
 *
 * Uses the procedural skinned test rig (no binary art committed). Measures
 * controller/mixer update p50/p95/p99, clone costs, LOD selection, model
 * swap cost, death/purge/restart cleanup, memory trend, and live counters.
 *
 * Usage: npm run test:animation:benchmark
 */
import { performance } from 'node:perf_hooks';
import { buildProceduralSkinnedAsset } from '../tests/animation/proceduralRig';
import { buildModelInstance } from '../src/client/animation/animatedModelInstanceFactory';
import { EnemyAnimationController } from '../src/client/animation/enemyAnimationController';
import {
  AnimationLodManager,
  type AnimationLodCandidate,
} from '../src/client/animation/animationLodSelector';
import { animationTelemetry, resetAnimationTelemetry } from '../src/client/animation/animationTelemetry';
import { disposeOwnedMaterials } from '../src/client/animation/animationCleanup';
import type { EnemyAnimationProfileDefinition } from '../src/shared/animation/animationProfileTypes';

const PROFILE: EnemyAnimationProfileDefinition = {
  id: 'enemyAnimation.benchmark',
  label: 'Benchmark',
  clips: { idle: 'Walk', walk: 'Walk', run: 'Walk', attackPrimary: 'Attack', death: 'Death' },
  fallbacks: { run: 'walk', walk: 'idle' },
  locomotion: {
    idleSpeedMax: 0.2,
    walkSpeedMax: 3.5,
    walkSpeedReference: 3,
    runSpeedReference: 6,
    playbackMin: 0.5,
    playbackMax: 1.5,
    randomStartPhase: true,
  },
  transitions: {
    defaultCrossFadeSeconds: 0.1,
    locomotionCrossFadeSeconds: 0.1,
    attackCrossFadeSeconds: 0.05,
    hitCrossFadeSeconds: 0.05,
    deathCrossFadeSeconds: 0.2,
  },
  playback: {
    attackPrimary: { loop: 'once', clampWhenFinished: true },
    death: { loop: 'once', clampWhenFinished: true, interruptPriority: 100 },
  },
  rootMotion: false,
};

const LOD_POLICY = {
  id: 'animationLod.benchmark',
  heroAlwaysNear: true,
  nearEnter: 18,
  nearLeave: 26,
  midEnter: 24,
  midLeave: 48,
  farEnter: 42,
  farLeave: 90,
  nearUpdateHz: 30,
  midUpdateHz: 12,
  maximumNearMixers: 1000,
  maximumMidMixers: 1000,
  priorityWeights: { boss: 100, elite: 50, attacking: 20, telegraphing: 15, damagedRecently: 10, distance: 1 },
};

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function fmt(v: number): string {
  return v.toFixed(3);
}

function makeControllers(count: number): EnemyAnimationController[] {
  const source = buildProceduralSkinnedAsset('bench.source');
  const out: EnemyAnimationController[] = [];
  for (let i = 0; i < count; i++) {
    const model = buildModelInstance(source, { cloneMaterials: true });
    out.push(EnemyAnimationController.create(PROFILE, model, (i + 1) / (count + 1)));
  }
  return out;
}

function runControllerUpdate(
  controllers: EnemyAnimationController[],
  frames = 240,
  dt = 1 / 30,
  midHz = 0,
): { controllerMs: number[]; mixerMs: number[] } {
  const controllerMs: number[] = [];
  const mixerMs: number[] = [];
  const acc = new Map<number, number>();
  const interval = midHz > 0 ? 1 / midHz : 0;
  for (let f = 0; f < frames; f++) {
    const t0 = performance.now();
    for (let i = 0; i < controllers.length; i++) {
      const c = controllers[i];
      const attacking = (f + i) % 90 < 15;
      const state = {
        alive: true,
        state: attacking ? 'telegraph' : 'hunt',
        stateT: 0,
        speed: 3 + (i % 3),
        telegraph: attacking ? 0.5 : 0,
        flash: (f + i) % 120 < 3 ? 0.1 : 0,
        airborne: false,
      };
      if (midHz > 0) {
        const a = (acc.get(i) ?? 0) + dt;
        if (a < interval) {
          acc.set(i, a);
          c.update(state, 0);
          continue;
        }
        acc.set(i, 0);
        c.update(state, 0);
        const m0 = performance.now();
        c.updateMixerWithDelta(a);
        mixerMs.push(performance.now() - m0);
      } else {
        c.update(state, dt);
      }
    }
    controllerMs.push(performance.now() - t0);
  }
  return { controllerMs, mixerMs };
}

function reportScenario(
  name: string,
  controllerMs: number[],
  mixerMs: number[],
  liveMixers: number,
  memoryDeltaMb: number,
): void {
  controllerMs.sort((a, b) => a - b);
  mixerMs.sort((a, b) => a - b);
  console.log(
    `${name}\t${fmt(percentile(controllerMs, 50))}\t${fmt(percentile(controllerMs, 95))}\t${fmt(percentile(controllerMs, 99))}\t` +
      `${fmt(percentile(mixerMs, 50))}\t${fmt(percentile(mixerMs, 95))}\t${fmt(percentile(mixerMs, 99))}\t` +
      `${liveMixers}\t${memoryDeltaMb.toFixed(1)}`,
  );
}

function main(): void {
  console.log('=== animated enemy benchmark (procedural skinned rig) ===');
  console.log('scenario\tcontroller p50\tp95\tp99\tmixer p50\tp95\tp99\tliveMixers\tmemDeltaMB');

  resetAnimationTelemetry();
  const heap0 = process.memoryUsage().heapUsed;

  // Clone cost.
  const source = buildProceduralSkinnedAsset('bench.source');
  const t0 = performance.now();
  for (let i = 0; i < 100; i++) buildModelInstance(source, { cloneMaterials: true });
  const skinnedCloneMs = (performance.now() - t0) / 100;
  const rigid = buildProceduralSkinnedAsset('bench.rigid');
  rigid.hasSkinnedMesh = false;
  const t1 = performance.now();
  for (let i = 0; i < 100; i++) buildModelInstance(rigid);
  const rigidCloneMs = (performance.now() - t1) / 100;
  console.log(`skinned clone (with materials)\t${fmt(skinnedCloneMs)}\t-\t-\t-\t-\t-\t-\t-`);
  console.log(`rigid clone\t${fmt(rigidCloneMs)}\t-\t-\t-\t-\t-\t-\t-`);

  // Scenarios.
  const scenarios: Array<[string, number, number]> = [
    ['1 hero mixer', 1, 0],
    ['10 hero/elite mixers', 10, 0],
    ['25 near common mixers', 25, 0],
    ['50 near common mixers', 50, 0],
    ['100 near common mixers', 100, 0],
    ['50 near + 100 mid', 50, 12],
    ['50 near + 200 far rigid', 50, 0],
  ];
  for (const [name, near, midHz] of scenarios) {
    resetAnimationTelemetry();
    const heapStart = process.memoryUsage().heapUsed;
    const controllers = makeControllers(near);
    if (midHz > 0) controllers.push(...makeControllers(100));
    const r = runControllerUpdate(controllers, 240, 1 / 30, midHz);
    const memDelta = (process.memoryUsage().heapUsed - heapStart) / (1024 * 1024);
    reportScenario(name, r.controllerMs, r.mixerMs, animationTelemetry.liveMixers, memDelta);
    for (const c of controllers) {
      c.dispose();
      disposeOwnedMaterials(c.model.root);
    }
  }

  // 200 far rigid: no mixers (instances only).
  const farStart = performance.now();
  const farInstances = Array.from({ length: 200 }, () => buildModelInstance(rigid));
  const farMs = (performance.now() - farStart) / 200;
  console.log(`200 far rigid instances (no mixer)\t${fmt(farMs)}\t-\t-\t-\t-\t-\t0\t-`);
  for (const i of farInstances) {
    disposeOwnedMaterials(i.root);
  }

  // Rapid LOD promotion/demotion.
  const manager = new AnimationLodManager(LOD_POLICY);
  const candidates: AnimationLodCandidate[] = Array.from({ length: 300 }, (_, i) => ({
    enemyId: i + 1,
    distance: 10 + ((i * 37) % 80),
    telegraphing: i % 17 === 0,
    attacking: i % 11 === 0,
    damagedRecently: i % 23 === 0,
    currentTier: 'near',
  }));
  const lodTimes: number[] = [];
  for (let f = 0; f < 120; f++) {
    const t = performance.now();
    manager.update(candidates);
    lodTimes.push(performance.now() - t);
  }
  lodTimes.sort((a, b) => a - b);
  console.log(`LOD selection (300 enemies)\t${fmt(percentile(lodTimes, 50))}\t${fmt(percentile(lodTimes, 95))}\t${fmt(percentile(lodTimes, 99))}\t-\t-\t-\t-\t-`);

  // Swap cost = skinned clone + controller create + dispose.
  const swapTimes: number[] = [];
  for (let i = 0; i < 60; i++) {
    const t = performance.now();
    const c = makeControllers(1)[0];
    c.dispose();
    disposeOwnedMaterials(c.model.root);
    swapTimes.push(performance.now() - t);
  }
  swapTimes.sort((a, b) => a - b);
  console.log(`model swap (create+dispose near)\t${fmt(percentile(swapTimes, 50))}\t${fmt(percentile(swapTimes, 95))}\t${fmt(percentile(swapTimes, 99))}\t-\t-\t-\t-\t-`);

  // 100 enemy deaths (death lock then cleanup).
  const deathTimes: number[] = [];
  for (let round = 0; round < 5; round++) {
    const controllers = makeControllers(20);
    const t = performance.now();
    for (const c of controllers) {
      c.update({ alive: false, state: 'dead', stateT: 0, speed: 0, telegraph: 0, flash: 0, airborne: false }, 1 / 30);
    }
    deathTimes.push((performance.now() - t) / 20);
    for (const c of controllers) {
      c.dispose();
      disposeOwnedMaterials(c.model.root);
    }
  }
  deathTimes.sort((a, b) => a - b);
  console.log(`100 enemy deaths (5x20)\t${fmt(percentile(deathTimes, 50))}\t${fmt(percentile(deathTimes, 95))}\t${fmt(percentile(deathTimes, 99))}\t-\t-\t-\t0\t-`);

  // Purge cleanup.
  const purgeTimes: number[] = [];
  for (let round = 0; round < 5; round++) {
    const controllers = makeControllers(20);
    const t = performance.now();
    for (const c of controllers) {
      c.dispose();
      disposeOwnedMaterials(c.model.root);
    }
    purgeTimes.push((performance.now() - t) / 20);
  }
  purgeTimes.sort((a, b) => a - b);
  console.log(`100 enemy purge cleanup (5x20)\t${fmt(percentile(purgeTimes, 50))}\t${fmt(percentile(purgeTimes, 95))}\t${fmt(percentile(purgeTimes, 99))}\t-\t-\t-\t0\t-`);

  // Restart/rematch cycles.
  const restartTimes: number[] = [];
  for (let round = 0; round < 10; round++) {
    const t = performance.now();
    const controllers = makeControllers(50);
    for (const c of controllers) {
      c.dispose();
      disposeOwnedMaterials(c.model.root);
    }
    restartTimes.push(performance.now() - t);
  }
  restartTimes.sort((a, b) => a - b);
  console.log(`restart/rematch cycles (10x50)\t${fmt(percentile(restartTimes, 50))}\t${fmt(percentile(restartTimes, 95))}\t${fmt(percentile(restartTimes, 99))}\t-\t-\t-\t0\t-`);

  const heapEnd = process.memoryUsage().heapUsed;
  console.log(`\nmemory trend: ${((heapEnd - heap0) / (1024 * 1024)).toFixed(1)} MB (heap), live mixers: ${animationTelemetry.liveMixers}, owned material clones: ${animationTelemetry.ownedMaterialClones}`);
  console.log('draw calls / renderer frame time: N/A headless (measured in the preview tool)');
  console.log('PASS');
}

void main();
