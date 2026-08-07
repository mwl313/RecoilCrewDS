import { describe, expect, it } from 'vitest';
import { nextThreshold } from '../../src/shared/progression/levelCurve';
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

  it('continues through overflow thresholds and caps cleanly at level 99', () => {
    const m = makeMatch();
    const curve = m.rules.levelCurveContent!;
    expect(nextThreshold(curve, 9)).toBe(355);
    expect(nextThreshold(curve, 10)).toBe(410);

    m.systems.progression.addXp(1_000_000);
    expect(m.state.teamProgression.level).toBe(99);
    expect(m.state.teamProgression.currentXp).toBe(0);
    expect(m.state.teamProgression.pendingLevelUps).toBe(98);

    const totalBeforeCapGrant = m.state.teamProgression.totalXpCollected;
    m.systems.progression.addXp(100);
    expect(m.state.teamProgression.totalXpCollected).toBe(totalBeforeCapGrant);
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
