import { describe, expect, it } from 'vitest';
import { makeMatch, spawnEnemy, killEnemy, step } from './helpers';

describe('progression lifecycle (progression08)', () => {
  it('a new match resets XP, level, relics, and capabilities', () => {
    const a = makeMatch('mode.singlePlayerScoreAttack', 'match-a');
    a.systems.progression.addXp(100);
    a.state.teamProgression.relicStacks['relic.magnet_core'] = 1;
    a.systems.capabilities.grant('tank.roadkillContact', 'relic:relic.roadkill');
    const b = makeMatch('mode.singlePlayerScoreAttack', 'match-b');
    expect(b.state.teamProgression.level).toBe(1);
    expect(b.state.teamProgression.totalXpCollected).toBe(0);
    expect(b.state.teamProgression.relicStacks).toEqual({});
    expect(b.state.build.capabilities).not.toContain('tank.roadkillContact');
  });

  it('restart does not duplicate modifiers', () => {
    const m = makeMatch();
    m.systems.progression.addXp(20);
    m.submitProgressionSelection('single', m.state.teamProgression.activeSelection!.offerId, 0);
    const count = m.rules.resolver.modifierCount();
    const fresh = makeMatch();
    expect(fresh.rules.resolver.modifierCount()).toBeLessThanOrEqual(count);
    expect(fresh.rules.resolver.resolve('tank.forwardSpeed')).toBeCloseTo(18);
  });

  it('wave purge releases no rewards and leaves XP untouched', () => {
    const m = makeMatch();
    const initialChestCount = m.state.chests.length;
    const e = spawnEnemy(m);
    m.systems.enemies.purge((x) => x.id === e.id);
    expect(m.state.xpShards.length).toBe(0);
    expect(m.state.chests.length).toBe(initialChestCount);
    expect(m.state.teamProgression.totalXpCollected).toBe(0);
  });

  it('repeated level-ups stay bounded and deterministic', () => {
    const m = makeMatch();
    for (let i = 0; i < 5; i++) {
      m.systems.progression.addXp(100);
      let guard = 0;
      while (m.state.teamProgression.activeSelection && guard++ < 10) {
        const active = m.state.teamProgression.activeSelection!;
        m.submitProgressionSelection('single', active.offerId, 0);
      }
    }
    expect(m.state.teamProgression.level).toBeGreaterThan(1);
    expect(m.state.matchFlow).toBe('playing');
    expect(m.state.teamProgression.pendingLevelUps).toBe(0);
  });
});
