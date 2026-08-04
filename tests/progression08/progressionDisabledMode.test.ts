import { describe, expect, it } from 'vitest';
import { makeMatch, spawnEnemy, killEnemy } from './helpers';

function demoMatch(id = 'demo-disabled'): ReturnType<typeof makeMatch> {
  return makeMatch('mode.demoScoreAttack', id);
}

describe('progression-disabled mode (progression08 hardening)', () => {
  it('enemy kills produce no XP shards, chests, rewards, or telemetry', () => {
    const m = demoMatch();
    const events: string[] = [];
    m.eventBus.subscribe('progressionEvent', (p: { type: string }) => events.push(p.type));
    const e = spawnEnemy(m);
    killEnemy(m, e.id, 'cannon');
    expect(m.state.xpShards.length).toBe(0);
    expect(m.state.chests.length).toBe(0);
    expect(m.state.teamProgression.totalXpCollected).toBe(0);
    expect(m.state.teamProgression.level).toBe(1);
    expect(m.state.matchFlow).toBe('playing');
    expect(m.systems.progression.telemetry.xpCollectedPerMinute).toBe(0);
    expect(m.systems.progression.telemetry.chestsPerStage).toBe(0);
    expect(Object.keys(m.systems.progression.telemetry.relicDistribution)).toEqual([]);
    expect(Object.keys(m.systems.progression.telemetry.triggerActivations)).toEqual([]);
    m.eventBus.drain();
    expect(events).toEqual([]);
  });

  it('addXp is a no-op in disabled modes', () => {
    const m = demoMatch();
    m.systems.progression.addXp(50, 1, 2, 3);
    expect(m.state.teamProgression.totalXpCollected).toBe(0);
    expect(m.state.teamProgression.pendingLevelUps).toBe(0);
    expect(m.state.teamProgression.activeSelection).toBeNull();
    expect(m.systems.progression.telemetry.xpCollectedPerMinute).toBe(0);
  });

  it('spawnChest cannot create an active progression chest and openChest is inert', () => {
    const m = demoMatch();
    const chest = m.systems.progression.spawnChest('map', 1, 1);
    expect(m.state.chests.length).toBe(0);
    expect(m.openProgressionChest(chest.id, 0)).toBeNull();
    expect(m.state.teamProgression.treasureChestsOpened).toBe(0);
    expect(m.state.teamProgression.relicAcquisitionSequence).toBe(0);
  });

  it('missed-shard and trigger notifications do not mutate telemetry', () => {
    const m = demoMatch();
    m.systems.progression.noteMissedShard(7);
    expect(m.systems.progression.telemetry.xpMissed).toBe(0);
    m.state.teamProgression.relicStacks['relic.heat_sink'] = 1;
    m.systems.progression.notifyCannonFired();
    expect(Object.keys(m.systems.progression.telemetry.triggerActivations)).toEqual([]);
    m.systems.progression.notifyWipeout();
    expect(m.systems.progression.telemetry.levelUpTimes).toEqual([]);
  });

  it('wave events do not dispatch relic triggers or rewards', () => {
    const m = demoMatch();
    m.state.teamProgression.relicStacks['relic.safe_haven'] = 2;
    m.state.tank.integrity = 50;
    m.eventBus.emit('waveEvent', { type: 'wavePurged', waveId: 1 });
    m.eventBus.drain();
    expect(m.state.tank.integrity).toBe(50);
    expect(m.systems.progression.telemetry.triggerActivations).toEqual({});
  });
});
