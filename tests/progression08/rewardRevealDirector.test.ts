import { describe, expect, it } from 'vitest';
import { RewardRevealDirector } from '../../src/client/progression/rewardRevealDirector';
import type { ProgressionSelectionState } from '../../src/shared/progression/progressionTypes';

function selection(kind: 'upgrade' | 'relic'): ProgressionSelectionState {
  return {
    offerId: kind === 'upgrade' ? 'offer-reduced' : 'reveal-7',
    kind,
    level: 2,
    resolved: false,
    revealStartedAtWallMs: kind === 'relic' ? 1_000 : undefined,
    relicResult: kind === 'relic'
      ? { acquisitionSequence: 7, relicId: 'relic.magnet_core', rarity: 'common', duplicateConverted: false, replacementXp: 0, stackCountAfter: 1 }
      : undefined,
  };
}

describe('RewardRevealDirector accessibility and identity', () => {
  it('deduplicates repeated upgrade snapshots by offerId', () => {
    const director = new RewardRevealDirector();
    expect(director.sync(selection('upgrade'), 1_000).startedNow).toBe(true);
    expect(director.sync(selection('upgrade'), 1_100).startedNow).toBe(false);
  });

  it('deduplicates repeated relic snapshots by acquisitionSequence', () => {
    const director = new RewardRevealDirector();
    expect(director.sync(selection('relic'), 1_000).startedNow).toBe(true);
    expect(director.sync({ ...selection('relic'), offerId: 'different-envelope' }, 1_100).startedNow).toBe(false);
  });

  it('collapses both sequences to an informative 300ms reduced-motion path', () => {
    const upgrade = new RewardRevealDirector(true);
    upgrade.sync(selection('upgrade'), 1_000);
    expect(upgrade.sync(selection('upgrade'), 1_301).state).toBe('selectable');
    expect(upgrade.sync(selection('upgrade'), 1_301).lockedCards).toBe(3);

    const relic = new RewardRevealDirector(true);
    expect(relic.sync(selection('relic'), 1_000).finalVisible).toBe(true);
    expect(relic.sync(selection('relic'), 1_301).state).toBe('awaitingContinue');
    expect(relic.sync(selection('relic'), 1_301).continueArmed).toBe(true);
  });
});

