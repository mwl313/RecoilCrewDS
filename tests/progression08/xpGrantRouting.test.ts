import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ContentLoader } from '../../src/shared/content/contentLoader';
import { MatchRuntime } from '../../src/shared/sim/matchRuntime';
import { makeMatch, spawnEnemy, killEnemy, resolveAllOffers, step, revealChest, completeRelicReveal } from './helpers';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CONTENT_ROOT = path.join(ROOT, 'content');

function loadRealPackRecords(): { manifest: unknown; files: Record<string, unknown> } {
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

function leaderMatch(id: string) {
  const m = makeMatch('mode.singlePlayerScoreAttack', id);
  const leader = spawnEnemy(m, 'enemy.scrapBug', 5, 5);
  leader.ownership = {
    populationClass: 'wave',
    waveId: 1,
    leaderId: leader.id,
    packInstanceId: 0,
    spawnAnchorId: null,
    purgeOnLeaderDeath: false,
  };
  return { m, leader };
}

function bossMatch(id: string) {
  const m = makeMatch('mode.singlePlayerScoreAttack', id);
  const boss = spawnEnemy(m, 'enemy.scrapBug', 5, 5);
  boss.ownership = {
    populationClass: 'boss',
    waveId: 1,
    leaderId: boss.id,
    packInstanceId: 0,
    spawnAnchorId: null,
    purgeOnLeaderDeath: false,
  };
  return { m, boss };
}

describe('unified XP grant routing (progression08 hardening)', () => {
  it('wave leader XP crossing a threshold starts upgrade selection immediately', () => {
    const { m, leader } = leaderMatch('leader-threshold');
    const before = m.state.teamProgression.totalXpCollected;
    killEnemy(m, leader.id, 'cannon');
    expect(m.state.teamProgression.totalXpCollected).toBeGreaterThan(before);
    expect(m.state.teamProgression.pendingLevelUps).toBeGreaterThan(0);
    expect(m.state.matchFlow).toBe('upgradeSelection');
    expect(m.state.teamProgression.activeSelection?.kind).toBe('upgrade');
    expect(m.systems.progression.telemetry.xpCollectedPerMinute).toBeGreaterThan(0);
    resolveAllOffers(m);
    expect(m.state.matchFlow).toBe('playing');
    expect(m.state.teamProgression.pendingLevelUps).toBe(0);
  });

  it('elite leader reward uses the shared grant path (telemetry + event)', () => {
    const { m, leader } = leaderMatch('leader-elite');
    const events: string[] = [];
    m.eventBus.subscribe('progressionEvent', (p: { type: string }) => events.push(p.type));
    killEnemy(m, leader.id, 'cannon');
    expect(m.state.teamProgression.totalXpCollected).toBeGreaterThan(0);
    m.eventBus.drain();
    expect(events).toContain('xpCollected');
  });

  it('multiple thresholds from one leader reward queue sequentially', () => {
    const { m, leader } = leaderMatch('leader-multi');
    killEnemy(m, leader.id, 'cannon');
    // elite 40 × single-player multiplier 2 = 80 XP → crosses 20 and 45.
    expect(m.state.teamProgression.pendingLevelUps).toBe(2);
    expect(m.state.matchFlow).toBe('upgradeSelection');
    resolveAllOffers(m);
    expect(m.state.teamProgression.pendingLevelUps).toBe(0);
    expect(m.state.matchFlow).toBe('playing');
  });

  it('boss XP records but terminal clear wins and cannot deadlock', () => {
    const { m, boss } = bossMatch('boss-terminal');
    killEnemy(m, boss.id, 'cannon');
    expect(m.state.teamProgression.totalXpCollected).toBeGreaterThan(0);
    m.state.matchFlow = 'clear';
    m.state.phase = 'results';
    m.checkProgressionTimeout(Date.now() + 60_000);
    expect(m.state.matchFlow).toBe('clear');
    expect(m.state.teamProgression.activeSelection).toBeNull();
    expect(m.state.teamProgression.pendingLevelUps).toBeGreaterThanOrEqual(0);
  });

  it('terminal state prevents a new selection even when XP would cross a threshold', () => {
    const m = makeMatch('mode.singlePlayerScoreAttack', 'terminal-xp');
    m.state.matchFlow = 'gameOver';
    m.state.phase = 'results';
    const before = m.state.teamProgression.totalXpCollected;
    m.systems.progression.addXp(200);
    expect(m.state.teamProgression.totalXpCollected).toBe(before);
    expect(m.state.teamProgression.activeSelection).toBeNull();
    expect(m.state.matchFlow).toBe('gameOver');
  });

  it('shard collection, leader, and boss rewards update telemetry', () => {
    // Shard path.
    const shardMatch = makeMatch('mode.singlePlayerScoreAttack', 'telemetry-shard');
    shardMatch.systems.xpShards.spawn(1, shardMatch.state.tank.x + 0.2, shardMatch.state.tank.z);
    step(shardMatch, 2);
    const shardXp = shardMatch.systems.progression.telemetry.xpCollectedPerMinute;
    expect(shardXp).toBeGreaterThan(0);

    // Leader path.
    const { m: leaderM, leader: leaderE } = leaderMatch('telemetry-leader');
    killEnemy(leaderM, leaderE.id, 'cannon');
    expect(leaderM.systems.progression.telemetry.xpCollectedPerMinute).toBeGreaterThan(0);

    // Boss path.
    const { m: bossM, boss: bossE } = bossMatch('telemetry-boss');
    killEnemy(bossM, bossE.id, 'cannon');
    expect(bossM.systems.progression.telemetry.xpCollectedPerMinute).toBeGreaterThan(0);
  });

  it('exhausted unique-only pools do not manufacture a duplicate or grant XP', () => {
    const { manifest, files } = loadRealPackRecords();
    (files['relic-pools/main.json'] as { relicIds: string[] }).relicIds = ['relic.phase_dash'];
    const pack = new ContentLoader().loadFromRecords(manifest, files);
    const m = MatchRuntime.fromContentPack(pack, 'duplicate-xp', 'none', 'mode.singlePlayerScoreAttack');
    const before = m.state.teamProgression.totalXpCollected;
    const c1 = m.systems.progression.spawnChest('map', 3, 3);
    const r1 = revealChest(m, c1, 1000);
    expect(r1?.duplicateConverted).toBe(false);
    completeRelicReveal(m);
    const c2 = m.systems.progression.spawnChest('map', 4, 4);
    c2.lifecycle = 'closed';
    expect(m.openProgressionChest(c2.id, 5000)).toBeNull();
    expect(m.state.teamProgression.totalXpCollected).toBe(before);
    expect(m.takeEvents()).not.toContainEqual(expect.objectContaining({ type: 'xpGained' }));
  });
});
