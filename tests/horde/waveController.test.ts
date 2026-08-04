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
