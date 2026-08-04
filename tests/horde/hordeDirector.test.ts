import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ContentLoader } from '../../src/shared/content/contentLoader';
import type { ContentPack } from '../../src/shared/content/contentPack';
import { hordeDirectorSchema, spawnPackSchema, waveSchema } from '../../src/shared/content/schemas/horde';
import { Match } from '../../src/shared/sim/match';
import { selectArenaSession } from '../../src/shared/mapgen/arenaSession';
import { resolveMapBundle } from '../../src/shared/mapgen/profiles';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CONTENT_ROOT = path.join(ROOT, 'content');

function readRecords(): { manifest: unknown; files: Record<string, unknown> } {
  const manifest = JSON.parse(fs.readFileSync(path.join(CONTENT_ROOT, 'manifest.json'), 'utf8'));
  const files: Record<string, unknown> = {};
  const walk = (dir: string, prefix: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs, rel);
      else if (entry.name.endsWith('.json')) files[rel] = JSON.parse(fs.readFileSync(abs, 'utf8'));
    }
  };
  walk(CONTENT_ROOT, '');
  return { manifest, files };
}

function packWithStageEnforced(enforceStage = true): ContentPack {
  const { manifest, files } = readRecords();
  files['horde/director.json'] = { ...(files['horde/director.json'] as object), enforceStage };
  return new ContentLoader().loadFromRecords(manifest, files);
}

const DT = 1 / 30;

function step(m: Match, seconds: number): void {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    m.step(DT);
    // Keep the stage-flow tests focused on progression: ambient enemies
    // can legitimately kill an AFK tank, so reset integrity each frame.
    m.state.tank.integrity = m.runtime.cfg.tank.maxIntegrity;
    m.state.tank.deadT = 0;
  }
  m.runtime.eventBus.drain();
}

function killLeader(m: Match): void {
  const horde = m.runtime.systems.horde;
  expect(horde?.currentWaveId).not.toBeNull();
  const runtime = m.runtime.systems.waves.waves.get(horde!.currentWaveId!);
  expect(runtime).toBeDefined();
  const leader = m.state.enemies.find((e) => e.id === runtime!.leaderId);
  expect(leader).toBeDefined();
  m.damageEnemy(leader!, 999, 'cannon');
  m.step(DT);
  m.runtime.eventBus.drain();
}

describe('horde content graph', () => {
  it('resolves the shared horde.mainStage director from content', () => {
    const pack = packWithStageEnforced(false);
    const m = new Match('horde-graph', 'none', pack);
    const horde = m.runtime.systems.horde;
    expect(horde).not.toBeNull();
    const r = horde!.resolved;
    expect(r.def.id).toBe('horde.mainStage');
    expect(r.stageSequence.farmingCountdownSeconds).toBe(180);
    expect(r.stageSequence.triggers.map((t) => t.waveId)).toEqual(['wave.vanguard', 'wave.encirclement']);
    expect(r.limits.hardEntityCap).toBeGreaterThan(0);
    expect(r.waves.has('wave.vanguard')).toBe(true);
    expect(r.waves.has('wave.encirclement')).toBe(true);
    expect(r.bossWave.id).toBe('horde.bossWave.main');
    expect(r.rewardTables.has('reward.main')).toBe(true);
    expect(r.policies.navigation.fieldRefreshHz).toBeGreaterThan(0);
    expect(r.policies.lod.tier0Enter).toBeLessThan(r.policies.lod.tier1Enter);
  });

  it('both gameplay modes reference the same horde director definition', () => {
    const pack = packWithStageEnforced(false);
    const demo = new Match('mode-demo', 'none', pack, undefined, 'mode.demoScoreAttack');
    const solo = new Match('mode-solo', 'none', pack, undefined, 'mode.singlePlayerScoreAttack');
    expect(demo.rules.hordeDirector).toEqual(solo.rules.hordeDirector);
    expect(demo.rules.hordeDirector?.id).toBe('horde.mainStage');
    expect(demo.runtime.systems.horde?.resolved.def).toEqual(solo.runtime.systems.horde?.resolved.def);
  });

  it('rejects malformed horde definitions at schema time', () => {
    const badDirector = hordeDirectorSchema.safeParse({
      ...(readRecords().files['horde/director.json'] as object),
      navigationPolicyId: 'nav.wrong',
    });
    expect(badDirector.success).toBe(false);

    const badPack = spawnPackSchema.safeParse({
      id: 'pack.empty',
      tags: ['farming'],
      entries: [],
      threatCost: 1,
      entityCost: 1,
      formation: 'cluster',
      spacing: 2,
      radius: 3,
    });
    expect(badPack.success).toBe(false);

    const badWave = waveSchema.safeParse({
      id: 'wave.bad',
      leaderEnemyId: 'enemy.rammer',
      openingPackIds: [],
      reinforcementPackIds: [],
      openingThreat: 1,
      reinforcementThreat: 1,
      reinforcementThreatPerSecond: 1,
      maximumActiveWaveThreat: 10,
      maximumActiveWaveEntities: 10,
      approachPolicyId: 'nav.bad',
      rewardTableId: 'reward.main',
      purgeWaveCohortOnLeaderDeath: true,
    });
    expect(badWave.success).toBe(false);
  });
});

describe('HordeDirector with stage enforcement', () => {
  it('accumulates a bounded farming budget and spawns ambient packs', () => {
    const enforced = packWithStageEnforced(true);
    const bundle = resolveMapBundle(enforced, 'map.arena400Primary');
    const fallbackBundle = bundle.map.fallbackMapId ? resolveMapBundle(enforced, bundle.map.fallbackMapId) : bundle;
    const session = selectArenaSession({ roomCode: 'HFARM01', matchIndex: 0, bundle, fallbackBundle });
    const m = new Match('horde-farm', 'none', enforced, session.world, 'mode.demoScoreAttack');
    step(m, 10);
    m.state.tank.integrity = m.runtime.cfg.tank.maxIntegrity;
    m.state.tank.deadT = 0;
    const horde = m.runtime.systems.horde!;
    expect(horde.spawnBudget).toBeGreaterThan(0);
    expect(horde.spawnBudget).toBeLessThanOrEqual(horde.resolved.limits.maximumStoredBudget);
    expect(m.state.enemies.some((e) => e.ownership?.populationClass === 'ambient')).toBe(true);
    expect(horde.lastSelectedPack).toBe('pack.wanderingCluster');
  });

  it('opens wave.vanguard at 120 remaining with a leader and opening cohort', () => {
    const m = new Match('horde-wave1', 'none', packWithStageEnforced(true));
    step(m, 60 + DT);
    expect(m.runtime.systems.stage.state.phase).toBe('wave1');
    expect(m.runtime.systems.stage.state.farmingTimeRemaining).toBeCloseTo(120, 5);
    const horde = m.runtime.systems.horde!;
    expect(horde.currentWaveId).not.toBeNull();
    const runtime = m.runtime.systems.waves.waves.get(horde.currentWaveId!);
    expect(runtime?.definitionId).toBe('wave.vanguard');
    expect(runtime?.state).toBe('active');
    const leader = m.state.enemies.find((e) => e.id === runtime!.leaderId);
    expect(leader?.ownership?.populationClass).toBe('wave');
    expect(leader?.ownership?.leaderId).toBe(leader?.id);
    expect(m.state.enemies.filter((e) => e.ownership?.waveId === runtime!.waveId && e.id !== leader?.id).length).toBeGreaterThan(0);
    expect(m.state.enemies.filter((e) => e.ownership?.waveId === runtime!.waveId && e.ownership?.purgeOnLeaderDeath).length).toBeGreaterThan(0);
  });

  it('spends a finite reinforcement reserve and stops after leader death', () => {
    const m = new Match('horde-reinf', 'none', packWithStageEnforced(true));
    step(m, 60 + DT);
    const horde = m.runtime.systems.horde!;
    const runtime = m.runtime.systems.waves.waves.get(horde.currentWaveId!);
    const reserveBefore = runtime!.reinforcementThreatRemaining;
    step(m, 6);
    expect(runtime!.reinforcementThreatRemaining).toBeLessThan(reserveBefore);
    const waveEntities = m.state.enemies.filter((e) => e.ownership?.waveId === runtime!.waveId && e.alive).length;
    expect(waveEntities).toBeGreaterThan(0);
    killLeader(m);
    expect(runtime!.state).toBe('complete');
    expect(m.runtime.systems.stage.state.phase).toBe('farming2');
    expect(m.runtime.systems.stage.state.farmingTimeRemaining).toBeLessThanOrEqual(120);
    expect(m.runtime.systems.stage.state.farmingTimeRemaining).toBeGreaterThan(119.9);
    expect(m.state.enemies.some((e) => e.ownership?.waveId === runtime!.waveId && e.alive)).toBe(false);
    expect(m.runtime.systems.waves.spendReinforcement(runtime!.waveId, 6, 'enemy.scrapBug', 2)).toBe(false);
  });

  it('runs wave2 then boss wave and clears the stage on boss death', () => {
    const m = new Match('horde-full', 'none', packWithStageEnforced(true));
    step(m, 60 + DT);
    killLeader(m);
    expect(m.runtime.systems.stage.state.phase).toBe('farming2');
    step(m, 60 + DT);
    expect(m.runtime.systems.stage.state.phase).toBe('wave2');
    expect(m.runtime.systems.horde!.currentWaveId).not.toBeNull();
    const wave2 = m.runtime.systems.waves.waves.get(m.runtime.systems.horde!.currentWaveId!);
    expect(wave2?.definitionId).toBe('wave.encirclement');
    killLeader(m);
    expect(m.runtime.systems.stage.state.phase).toBe('farming3');
    step(m, 60 + DT);
    expect(m.runtime.systems.stage.state.phase).toBe('bossWave');
    const bossRuntime = m.runtime.systems.waves.waves.get(m.runtime.systems.horde!.currentWaveId!);
    expect(bossRuntime?.definitionId).toBe('horde.bossWave.main');
    const boss = m.state.enemies.find((e) => e.id === bossRuntime!.leaderId);
    expect(boss?.ownership?.populationClass).toBe('boss');
    killLeader(m);
    expect(m.runtime.systems.stage.state.phase).toBe('clear');
    m.step(DT);
    m.runtime.eventBus.drain();
    expect(m.state.phase).toBe('results');
  });

  it('tank death during farming immediately game-overs', () => {
    const m = new Match('horde-death', 'none', packWithStageEnforced(true));
    step(m, 5);
    m.damageTank(999, 'enemy');
    m.step(DT);
    m.runtime.eventBus.drain();
    expect(m.runtime.systems.stage.state.phase).toBe('gameOver');
    expect(m.state.phase).toBe('results');
  });
});
