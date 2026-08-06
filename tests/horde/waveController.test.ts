import { describe, expect, it } from 'vitest';
import { Match } from '../../src/shared/sim/match';
import { WaveController } from '../../src/shared/horde/waveController';

function makeWave(opts: Partial<Parameters<WaveController['openWave']>[0]> = {}) {
  const m = new Match('wave-test', 'none');
  const c = m.runtime.systems.waves;
  const runtime = c.openWave({
    definitionId: 'wave.1',
    leaderEnemyId: 'enemy.rammer',
    openingThreat: 8,
    reinforcementThreat: 20,
    reinforcementThreatPerSecond: 1,
    maximumActiveWaveThreat: 50,
    maximumActiveWaveEntities: 30,
    ...opts,
  });
  return { m, c, runtime };
}

describe('WaveController ownership and lifecycle', () => {
  it('openWave designates a leader with wave ownership', () => {
    const { m, runtime } = makeWave();
    const leader = m.state.enemies.find((e) => e.id === runtime.leaderId)!;
    expect(leader).toBeDefined();
    expect(leader.ownership?.populationClass).toBe('wave');
    expect(leader.ownership?.waveId).toBe(runtime.waveId);
    expect(leader.ownership?.leaderId).toBe(leader.id);
    expect(leader.ownership?.purgeOnLeaderDeath).toBe(false);
  });

  it('spawnCohort tags purgeable enemies and ambient survives purge', () => {
    const { m, c, runtime } = makeWave();
    c.spawnCohort(runtime.waveId, 'enemy.scrapBug', 4, 4);
    // A second wave with its own cohort.
    const second = c.openWave({
      definitionId: 'wave.2',
      leaderEnemyId: 'enemy.rammer',
      openingThreat: 8,
      reinforcementThreat: 20,
      reinforcementThreatPerSecond: 1,
      maximumActiveWaveThreat: 50,
      maximumActiveWaveEntities: 30,
    });
    c.spawnCohort(second.waveId, 'enemy.scrapBug', 3, 3);
    // Ambient: an enemy with no ownership.
    const ambient = m.runtime.systems.enemies.spawnEnemyDef(m.runtime.systems.enemies.defById('enemy.scrapBug')!, 20, 20);

    const before = m.state.enemies.length;
    const purged = c.purge(runtime.waveId);
    expect(purged).toBe(4); // cohort only; the leader dies by kill, not purge
    expect(m.state.enemies.length).toBe(before - 4);
    expect(m.state.enemies.some((e) => e.id === ambient!.id)).toBe(true);
    expect(m.state.enemies.some((e) => e.ownership?.waveId === second.waveId)).toBe(true);
  });

  it('purge yields no XP, drops, kill hooks, or Dash/cannon credit', () => {
    const { m, c, runtime } = makeWave();
    c.spawnCohort(runtime.waveId, 'enemy.scrapBug', 4, 4);
    const scoreBefore = m.state.stats.score;
    const killsBefore = m.state.stats.kills;
    const eventsBefore = m.takeEvents().length;
    const purged = c.purgeWave(runtime.waveId);
    expect(purged).toBeGreaterThan(0);
    const after = m.takeEvents();
    expect(m.state.stats.score).toBe(scoreBefore);
    expect(m.state.stats.kills).toBe(killsBefore);
    expect(m.state.stats.dashKills).toBe(0);
    expect(m.state.pickups.filter((p) => !p.collected).length).toBe(0);
    expect(after.filter((e) => e.type === 'kill').length).toBe(0);
    expect(after.length).toBe(0);
    expect(m.state.stats.scrapCollected).toBe(0);
    expect(eventsBefore).toBe(0);
  });

  it('normally killed leader purges the cohort and fires the reward once', () => {
    const { m, c, runtime } = makeWave();
    c.spawnCohort(runtime.waveId, 'enemy.scrapBug', 4, 4);
    // Advance the stage into wave1 so the leader-death callback resumes it.
    for (let i = 0; i < 1801; i++) m.runtime.systems.stage.step({ dt: 1 / 30, tankDead: false });
    expect(m.runtime.systems.stage.state.phase).toBe('wave1');
    const leader = m.state.enemies.find((e) => e.id === runtime.leaderId)!;
    m.damageEnemy(leader, 999, 'cannon');
    m.step(1 / 30);
    const events = m.takeEvents();
    expect(runtime.state).toBe('complete');
    expect(m.state.enemies.some((e) => e.alive && e.ownership?.waveId === runtime.waveId)).toBe(false);
    expect(events.some((e) => e.label === `WAVE ${runtime.waveId} CLEARED`)).toBe(true);
    expect(events.filter((e) => e.label === `WAVE ${runtime.waveId} CLEARED`).length).toBe(1);
    // The stage director was notified to resume the farming countdown.
    expect(m.runtime.systems.stage.state.phase).toBe('farming2');
  });

  it('reinforcement reserve is finite and stops after leader death', () => {
    const { m, c, runtime } = makeWave();
    expect(c.spendReinforcement(runtime.waveId, 6, 'enemy.scrapBug', 2)).toBe(true);
    expect(runtime.reinforcementThreatRemaining).toBe(14);
    expect(c.spendReinforcement(runtime.waveId, 20, 'enemy.scrapBug', 5)).toBe(false); // exceeds reserve
    const leader = m.state.enemies.find((e) => e.id === runtime.leaderId)!;
    m.damageEnemy(leader, 999, 'cannon');
    m.step(1 / 30);
    m.takeEvents();
    expect(c.spendReinforcement(runtime.waveId, 6, 'enemy.scrapBug', 2)).toBe(false);
  });

  it('keeps a two-elite wave active until every selected leader dies', () => {
    const { m, runtime } = makeWave({
      leaderEnemyIds: ['enemy.rammer', 'enemy.gunTower'],
    });
    expect(runtime.leaderIds).toHaveLength(2);
    const [firstId, secondId] = runtime.leaderIds;
    const first = m.state.enemies.find((e) => e.id === firstId)!;
    const second = m.state.enemies.find((e) => e.id === secondId)!;
    m.damageEnemy(first, 999, 'cannon');
    expect(runtime.state).toBe('active');
    expect(second.alive).toBe(true);
    m.damageEnemy(second, 999, 'cannon');
    expect(runtime.state).toBe('complete');
  });

  it('reinforcement packs spawn every authored entry atomically', () => {
    const { m, c, runtime } = makeWave();
    const entries = [
      { enemyId: 'enemy.scrapBug', count: 2, formationRole: 'line' },
      { enemyId: 'enemy.rammer', count: 3, formationRole: 'support' },
    ];
    expect(c.spendReinforcementPack(runtime.waveId, 6, entries)).toBe(true);
    const waveEnemies = m.state.enemies.filter((e) => e.ownership?.waveId === runtime.waveId);
    const cohort = waveEnemies.filter((e) => e.id !== runtime.leaderId);
    expect(cohort.filter((e) => e.defId === 'enemy.scrapBug').length).toBe(2);
    expect(cohort.filter((e) => e.defId === 'enemy.rammer').length).toBe(3);
    expect(cohort.every((e) => e.ownership?.purgeOnLeaderDeath === true)).toBe(true);
    const packInstanceIds = new Set(cohort.map((e) => e.ownership?.packInstanceId));
    expect(packInstanceIds.size).toBe(1);
    expect(cohort.find((e) => e.defId === 'enemy.scrapBug')?.ownership?.formationRole).toBe('line');
    expect(cohort.find((e) => e.defId === 'enemy.rammer')?.ownership?.formationRole).toBe('support');
  });

  it('reinforcement packs are all-or-none under entity-cap pressure', () => {
    const { m, c, runtime } = makeWave();
    // Legacy match: horde is null, so the cap fallback is 200. Fill it so
    // only the first entry of a two-entry pack would fit under the old
    // sequential algorithm.
    runtime.activeWaveEntities = 199;
    const before = m.state.enemies.length;
    const beforeReserve = runtime.reinforcementThreatRemaining;
    const partial = [
      { enemyId: 'enemy.scrapBug', count: 1, formationRole: 'line' },
      { enemyId: 'enemy.rammer', count: 1, formationRole: 'support' },
    ];
    expect(c.spendReinforcementPack(runtime.waveId, 2, partial)).toBe(false);
    expect(m.state.enemies.length).toBe(before);
    expect(runtime.reinforcementThreatRemaining).toBe(beforeReserve);
  });

  it('reinforcement packs reject unknown definitions before spawning anything', () => {
    const { m, c, runtime } = makeWave();
    const before = m.state.enemies.length;
    expect(
      c.spendReinforcementPack(runtime.waveId, 2, [
        { enemyId: 'enemy.scrapBug', count: 1 },
        { enemyId: 'enemy.doesNotExist', count: 1 },
      ]),
    ).toBe(false);
    expect(m.state.enemies.length).toBe(before);
  });

  it('multiple wave IDs are ownership-isolated', () => {
    const { m, c, runtime } = makeWave();
    c.spawnCohort(runtime.waveId, 'enemy.scrapBug', 4, 4);
    const second = c.openWave({
      definitionId: 'wave.2',
      leaderEnemyId: 'enemy.rammer',
      openingThreat: 8,
      reinforcementThreat: 20,
      reinforcementThreatPerSecond: 1,
      maximumActiveWaveThreat: 50,
      maximumActiveWaveEntities: 30,
    });
    c.spawnCohort(second.waveId, 'enemy.scrapBug', 3, 3);
    const leader = m.state.enemies.find((e) => e.id === runtime.leaderId)!;
    m.damageEnemy(leader, 999, 'cannon');
    m.step(1 / 30);
    m.takeEvents();
    expect(m.state.enemies.some((e) => e.ownership?.waveId === second.waveId)).toBe(true);
    expect(m.state.enemies.some((e) => e.alive && e.ownership?.waveId === runtime.waveId)).toBe(false);
  });
});
