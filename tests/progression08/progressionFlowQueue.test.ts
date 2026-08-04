import { describe, expect, it } from 'vitest';
import { makeMatch, resolveAllOffers } from './helpers';

describe('serialized progression reward flow (progression08 hardening)', () => {
  it('only one active flow exists: relic reveal wins over a queued level-up', () => {
    const m = makeMatch('mode.singlePlayerScoreAttack', 'queue-relic-first');
    m.state.teamProgression.pendingLevelUps = 1;
    const chest = m.systems.progression.spawnChest('map', 3, 3);
    const result = m.openProgressionChest(chest.id, 0)!;
    expect(m.state.matchFlow).toBe('relicSelection');
    expect(m.state.teamProgression.activeSelection?.kind).toBe('relic');
    // XP granted while the reveal is active must not overwrite the reveal.
    m.systems.progression.addXp(20);
    expect(m.state.matchFlow).toBe('relicSelection');
    expect(m.state.teamProgression.activeSelection?.kind).toBe('relic');
    m.skipProgressionRelic(result.acquisitionSequence, 1);
    expect(m.state.matchFlow).toBe('upgradeSelection');
    expect(m.state.teamProgression.activeSelection?.kind).toBe('upgrade');
    resolveAllOffers(m);
    expect(m.state.matchFlow).toBe('playing');
    expect(m.state.teamProgression.pendingLevelUps).toBe(0);
  });

  it('multiple level-ups queue and resolve sequentially without nesting', () => {
    const m = makeMatch('mode.singlePlayerScoreAttack', 'queue-levels');
    m.systems.progression.addXp(50); // 100 XP → 2 thresholds
    expect(m.state.matchFlow).toBe('upgradeSelection');
    const first = m.state.teamProgression.activeSelection!.offerId;
    m.submitProgressionSelection('single', first, 0);
    expect(m.state.teamProgression.activeSelection).not.toBeNull();
    expect(m.state.teamProgression.activeSelection!.offerId).not.toBe(first);
    expect(m.state.matchFlow).toBe('upgradeSelection');
    resolveAllOffers(m);
    expect(m.state.matchFlow).toBe('playing');
    expect(m.state.teamProgression.pendingLevelUps).toBe(0);
  });

  it('a second chest cannot nest inside an active reveal', () => {
    const m = makeMatch('mode.singlePlayerScoreAttack', 'queue-chest-serial');
    const c1 = m.systems.progression.spawnChest('map', 3, 3);
    m.openProgressionChest(c1.id, 0);
    const c2 = m.systems.progression.spawnChest('map', 4, 4);
    expect(m.openProgressionChest(c2.id, 1)).toBeNull();
    expect(c2.opened).toBe(false);
    expect(m.state.teamProgression.treasureChestsOpened).toBe(1);
  });

  it('terminal state cancels pending presentation and never starts a selection', () => {
    const m = makeMatch('mode.singlePlayerScoreAttack', 'queue-terminal');
    const chest = m.systems.progression.spawnChest('map', 3, 3);
    const result = m.openProgressionChest(chest.id, 0)!;
    m.state.teamProgression.pendingLevelUps = 2;
    const deadline = m.state.teamProgression.activeSelection!.expiresAtWallMs;
    m.state.matchFlow = 'clear';
    m.state.phase = 'results';
    expect(m.checkProgressionTimeout(deadline + 1)).toBe(false);
    expect(m.state.matchFlow).toBe('clear');
    expect(m.state.teamProgression.activeSelection).toBeNull();
    expect(m.state.teamProgression.pendingLevelUps).toBe(2);
  });

  it('relic application happens exactly once across skip and timeout', () => {
    const m = makeMatch('mode.singlePlayerScoreAttack', 'queue-once');
    const chest = m.systems.progression.spawnChest('map', 3, 3);
    const result = m.openProgressionChest(chest.id, 0)!;
    m.skipProgressionRelic(result.acquisitionSequence, 1);
    const stacksAfterSkip = m.state.teamProgression.relicStacks[result.relicId];
    // A stale timeout after resolution is a no-op.
    m.checkProgressionTimeout(999_999);
    expect(m.state.teamProgression.relicStacks[result.relicId]).toBe(stacksAfterSkip);
    expect(m.state.matchFlow).toBe('playing');
  });
});
