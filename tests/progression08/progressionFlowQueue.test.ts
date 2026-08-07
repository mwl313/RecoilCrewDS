import { describe, expect, it } from 'vitest';
import { claimChest, completeRelicReveal, makeMatch, revealChest, resolveAllOffers } from './helpers';

describe('serialized progression reward flow', () => {
  it('one chest flow blocks nested claims and yields to queued level-ups afterward', () => {
    const m = makeMatch('mode.singlePlayerScoreAttack', 'queue-relic-first');
    m.state.teamProgression.pendingLevelUps = 1;
    const first = m.systems.progression.spawnChest('mapStart', 3, 3);
    claimChest(m, first, 1_000);
    const second = m.systems.progression.spawnChest('mapStart', 4, 4);
    second.lifecycle = 'closed';
    expect(m.openProgressionChest(second.id, 1_001)).toBeNull();
    m.checkProgressionTimeout(1_651);
    completeRelicReveal(m);
    expect(m.state.matchFlow).toBe('upgradeSelection');
    resolveAllOffers(m);
    expect(m.state.matchFlow).toBe('playing');
  });

  it('relic application remains exactly once across stale skip and timeout', () => {
    const m = makeMatch('mode.singlePlayerScoreAttack', 'queue-once');
    const chest = m.systems.progression.spawnChest('mapStart', 3, 3);
    const result = revealChest(m, chest, 1_000);
    completeRelicReveal(m);
    const stacks = m.state.teamProgression.relicStacks[result.relicId];
    m.checkProgressionTimeout(999_999);
    m.skipProgressionRelic(result.acquisitionSequence, 999_999);
    expect(m.state.teamProgression.relicStacks[result.relicId]).toBe(stacks);
  });

  it('terminal state cancels presentation without resurrecting play', () => {
    const m = makeMatch('mode.singlePlayerScoreAttack', 'queue-terminal');
    const chest = m.systems.progression.spawnChest('mapStart', 3, 3);
    claimChest(m, chest, 1_000);
    m.state.matchFlow = 'clear';
    m.state.phase = 'results';
    expect(m.checkProgressionTimeout(99_999)).toBe(false);
    expect(m.state.matchFlow).toBe('clear');
    expect(m.state.teamProgression.activeSelection).toBeNull();
  });
});
