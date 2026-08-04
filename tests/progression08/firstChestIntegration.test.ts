import { describe, expect, it } from 'vitest';
import { makeMatch, spawnEnemy, killEnemy, resolveAllOffers } from './helpers';

const SOURCES = ['map', 'enemyDrop', 'waveClear'] as const;

describe('first chest integration (progression08 hardening)', () => {
  it('first real open for every chest source is Epic/Legendary only', () => {
    for (const source of SOURCES) {
      const m = makeMatch('mode.singlePlayerScoreAttack', `first-${source}`);
      const chest = m.systems.progression.spawnChest(source, 3, 3);
      const result = m.openProgressionChest(chest.id, 0);
      expect(result).not.toBeNull();
      expect(['epic', 'legendary']).toContain(result!.rarity);
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
    const result = m.openProgressionChest(waveChests[0].id, 0);
    expect(result).not.toBeNull();
    expect(['epic', 'legendary']).toContain(result!.rarity);
  });

  it('later chests use the normal table and first-chest status is consumed exactly once', () => {
    const m = makeMatch('mode.singlePlayerScoreAttack', 'later-chests');
    const first = m.systems.progression.spawnChest('map', 3, 3);
    const r1 = m.openProgressionChest(first.id, 0);
    expect(['epic', 'legendary']).toContain(r1!.rarity);
    m.skipProgressionRelic(r1!.acquisitionSequence, 1);

    const second = m.systems.progression.spawnChest('enemyDrop', 4, 4);
    const r2 = m.openProgressionChest(second.id, 0);
    expect(r2).not.toBeNull();
    expect(m.state.teamProgression.treasureChestsOpened).toBe(2);
    expect(m.state.teamProgression.relicAcquisitionSequence).toBe(2);
    expect(r2!.acquisitionSequence).toBe(2);
  });

  it('across seeds, first opens are Epic/Legendary only and later opens hit the normal table', () => {
    const firstRarities = new Set<string>();
    const laterRarities = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const m = makeMatch('mode.singlePlayerScoreAttack', `distribution-${i}`);
      const a = m.systems.progression.spawnChest('map', 3, 3);
      const ra = m.openProgressionChest(a.id, 0)!;
      firstRarities.add(ra.rarity);
      m.skipProgressionRelic(ra.acquisitionSequence, 1);
      const b = m.systems.progression.spawnChest('map', 4, 4);
      laterRarities.add(m.openProgressionChest(b.id, 0)!.rarity);
    }
    expect([...firstRarities].every((r) => r === 'epic' || r === 'legendary')).toBe(true);
    // The normal table (C55/R30/E13/L2) must eventually surface common/rare;
    // the first-chest rule can never produce them.
    expect([...laterRarities].some((r) => r === 'common' || r === 'rare')).toBe(true);
  });

  it('failed open attempts never consume the chest or first-chest status', () => {
    const m = makeMatch('mode.singlePlayerScoreAttack', 'failed-open');
    const chest = m.systems.progression.spawnChest('map', 3, 3);
    expect(m.openProgressionChest(9999, 0)).toBeNull();
    expect(m.openProgressionChest(-1, 0)).toBeNull();
    expect(chest.opened).toBe(false);
    expect(m.state.teamProgression.treasureChestsOpened).toBe(0);

    const result = m.openProgressionChest(chest.id, 0);
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
    const ra = a.openProgressionChest(ca.id, 0);
    const rb = b.openProgressionChest(cb.id, 0);
    expect(ra?.relicId).toBe(rb?.relicId);
    expect(ra?.acquisitionSequence).toBe(rb?.acquisitionSequence);
  });
});
