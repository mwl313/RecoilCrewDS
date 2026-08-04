import { describe, expect, it } from 'vitest';
import { makeMatch, resolveAnyOffer, resolveAllOffers } from './helpers';

describe('team experience and queued level-ups (progression08)', () => {
  it('one threshold crossing increments level and queues one offer', () => {
    const m = makeMatch();
    m.systems.progression.addXp(20);
    expect(m.state.teamProgression.level).toBe(2);
    expect(m.state.teamProgression.pendingLevelUps).toBe(1);
    expect(m.state.teamProgression.xpForNextLevel).toBe(45);
    expect(m.state.matchFlow).toBe('upgradeSelection');
    resolveAllOffers(m);
    expect(m.state.teamProgression.pendingLevelUps).toBe(0);
    expect(m.state.matchFlow).toBe('playing');
  });

  it('large XP queues multiple pending level-ups', () => {
    const m = makeMatch();
    m.systems.progression.addXp(50); // xpMultiplier 2 → 100 XP gained
    expect(m.state.teamProgression.level).toBe(3);
    expect(m.state.teamProgression.pendingLevelUps).toBe(2);
  });

  it('pending offers resolve sequentially', () => {
    const m = makeMatch();
    m.systems.progression.addXp(50);
    resolveAnyOffer(m);
    expect(m.state.teamProgression.pendingLevelUps).toBe(1);
    expect(m.state.teamProgression.activeSelection).not.toBeNull();
    resolveAllOffers(m);
    expect(m.state.teamProgression.pendingLevelUps).toBe(0);
    expect(m.state.matchFlow).toBe('playing');
  });

  it('terminal states suppress new XP', () => {
    const m = makeMatch();
    m.state.phase = 'results';
    const before = m.state.teamProgression.totalXpCollected;
    m.systems.progression.addXp(50);
    expect(m.state.teamProgression.totalXpCollected).toBe(before);
  });
});
