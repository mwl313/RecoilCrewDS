import { describe, expect, it } from 'vitest';
import { makeMatch, spawnEnemy, killEnemy, resolveAllOffers, revealChest, completeRelicReveal } from './helpers';

const SOURCES = ['mapStart', 'enemyDrop', 'waveClear'] as const;
const isFirstChestReward = (reward: { relicId: string; rarity: string }): boolean =>
  reward.relicId === 'relic.twin_shell' || reward.rarity === 'legendary';

describe('first chest integration (progression08 hardening)', () => {
  it('first real open for every chest source is Twin Shell or Legendary', () => {
    for (const source of SOURCES) {
      const m = makeMatch('mode.singlePlayerScoreAttack', `first-${source}`);
      const chest = m.systems.progression.spawnChest(source, 3, 3);
      const result = revealChest(m, chest, 1000);
      expect(result).not.toBeNull();
      expect(isFirstChestReward(result!)).toBe(true);
      expect(m.state.teamProgression.treasureChestsOpened).toBe(1);
      expect(m.state.teamProgression.relicAcquisitionSequence).toBe(1);
    }
  });

  it('wave leader guaranteed chest uses the first-chest table on its first open', () => {
    const m = makeMatch('mode.singlePlayerScoreAttack', 'first-wave-leader');
    const leader = spawnEnemy(m, 'enemy.scrapBug', 5, 5);
    leader.ownership = {
      populationClass: 'wave',
      waveId: 1,
      leaderId: leader.id,
      packInstanceId: 0,
      spawnAnchorId: null,
      purgeOnLeaderDeath: false,
    };
    killEnemy(m, leader.id);
    const waveChests = m.state.chests.filter((c) => c.source === 'waveClear');
    expect(waveChests.length).toBe(1);
    // Leader XP may start a level-up selection; rewards are serialized, so
    // the guaranteed chest opens after the pending selection resolves.
    resolveAllOffers(m);
    expect(m.state.matchFlow).toBe('playing');
    const result = revealChest(m, waveChests[0], 1000);
    expect(result).not.toBeNull();
    expect(isFirstChestReward(result!)).toBe(true);
  });

  it('later chests use the normal table and first-chest status is consumed exactly once', () => {
    const m = makeMatch('mode.singlePlayerScoreAttack', 'later-chests');
    const first = m.systems.progression.spawnChest('map', 3, 3);
    const r1 = revealChest(m, first, 1000);
    expect(isFirstChestReward(r1!)).toBe(true);
    completeRelicReveal(m);

    const second = m.systems.progression.spawnChest('enemyDrop', 4, 4);
    const r2 = revealChest(m, second, 5000);
    expect(r2).not.toBeNull();
    expect(m.state.teamProgression.treasureChestsOpened).toBe(2);
    expect(m.state.teamProgression.relicAcquisitionSequence).toBe(2);
    expect(r2!.acquisitionSequence).toBe(2);
  });

  it('across seeds, first opens hit both first-chest branches and later opens use the normal table', () => {
    const firstRelicIds = new Set<string>();
    const firstRarities = new Set<string>();
    const laterRarities = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const m = makeMatch('mode.singlePlayerScoreAttack', `distribution-${i}`);
      const a = m.systems.progression.spawnChest('map', 3, 3);
      const ra = revealChest(m, a, 1000);
      expect(isFirstChestReward(ra)).toBe(true);
      firstRelicIds.add(ra.relicId);
      firstRarities.add(ra.rarity);
      completeRelicReveal(m);
      const b = m.systems.progression.spawnChest('map', 4, 4);
      laterRarities.add(revealChest(m, b, 5000).rarity);
    }
    expect(firstRelicIds.has('relic.twin_shell')).toBe(true);
    expect(firstRarities.has('legendary')).toBe(true);
    // The normal table (C55/R30/E13/L2) must eventually surface common/rare;
    // the first-chest rule can never produce those rarities.
    expect([...laterRarities].some((r) => r === 'common' || r === 'rare')).toBe(true);
  });

  it('failed open attempts never consume the chest or first-chest status', () => {
    const m = makeMatch('mode.singlePlayerScoreAttack', 'failed-open');
    const chest = m.systems.progression.spawnChest('map', 3, 3);
    expect(m.openProgressionChest(9999, 0)).toBeNull();
    expect(m.openProgressionChest(-1, 0)).toBeNull();
    expect(chest.opened).toBe(false);
    expect(m.state.teamProgression.treasureChestsOpened).toBe(0);

    const result = revealChest(m, chest, 1000);
    expect(result).not.toBeNull();
    expect(chest.opened).toBe(true);
    expect(m.openProgressionChest(chest.id, 0)).toBeNull();
    expect(m.state.teamProgression.treasureChestsOpened).toBe(1);
  });

  it('same seed produces the same first relic with the same acquisition sequence', () => {
    const a = makeMatch('mode.singlePlayerScoreAttack', 'seed-determinism');
    const b = makeMatch('mode.singlePlayerScoreAttack', 'seed-determinism');
    const ca = a.systems.progression.spawnChest('map', 1, 1);
    const cb = b.systems.progression.spawnChest('map', 1, 1);
    const ra = revealChest(a, ca, 1000);
    const rb = revealChest(b, cb, 1000);
    expect(ra?.relicId).toBe(rb?.relicId);
    expect(ra?.acquisitionSequence).toBe(rb?.acquisitionSequence);
  });
});
