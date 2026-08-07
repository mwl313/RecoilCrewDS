import { describe, expect, it } from 'vitest';
import { makeMatch, spawnEnemy, killEnemy, step } from './helpers';

describe('XP shards and magnet collection (progression08)', () => {
  it('normal kills spawn XP shards; purge creates none', () => {
    const m = makeMatch();
    const e = spawnEnemy(m);
    killEnemy(m, e.id);
    expect(m.state.xpShards.filter((s) => !s.collected).length).toBe(1);
    expect(m.state.xpShards[0].value).toBe(1);

    const m2 = makeMatch();
    const e2 = spawnEnemy(m2);
    const removed = m2.systems.enemies.purge((x) => x.id === e2.id);
    expect(removed.length).toBe(1);
    expect(m2.state.xpShards.length).toBe(0);
  });

  it('collects once inside the collect radius and increments team XP', () => {
    const m = makeMatch();
    m.systems.xpShards.spawn(5, m.state.tank.x + 0.2, m.state.tank.z);
    step(m, 2);
    // Collected shards are removed from authoritative state (bug-fix
    // phase 5: no unbounded growth); the XP is granted exactly once.
    expect(m.state.xpShards.length).toBe(0);
    expect(m.state.teamProgression.totalXpCollected).toBe(10); // single player xpMultiplier 2
  });

  it('magnet radius pulls shards toward the tank with proximity acceleration', () => {
    const m = makeMatch();
    const t = m.state.tank;
    const magnet = m.rules.resolver.resolve('progression.magnetRadius');
    expect(magnet).toBe(10);
    m.systems.xpShards.spawn(1, t.x + 8.8, t.z);
    m.systems.xpShards.spawn(1, t.x + 9.6, t.z);
    const near = m.state.xpShards[0];
    const far = m.state.xpShards[1];
    step(m, 1);
    expect(Math.abs(near.vx)).toBeGreaterThan(Math.abs(far.vx));
  });

  it('duplicate collection is impossible (collected flag + removal)', () => {
    const m = makeMatch();
    m.systems.xpShards.spawn(1, m.state.tank.x + 0.1, m.state.tank.z);
    step(m, 1);
    const before = m.state.teamProgression.totalXpCollected;
    step(m, 5);
    expect(m.state.teamProgression.totalXpCollected).toBe(before);
  });

  it('MAGNET CORE stacks additively increase the radius', () => {
    const m = makeMatch();
    m.state.teamProgression.relicStacks['relic.magnet_core'] = 2;
    m.systems.progression.projectionRefresh();
    expect(m.rules.resolver.resolve('progression.magnetRadius')).toBeCloseTo(20);
  });
});
