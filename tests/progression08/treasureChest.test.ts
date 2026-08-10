import { describe, expect, it } from 'vitest';
import { TreasureChestSystem } from '../../src/shared/progression/treasureChestSystem';
import { CLIENT_CONTENT_PACK } from '../../src/generated/contentPack.generated';
import { makeMatch, spawnEnemy, killEnemy, revealChest } from './helpers';

const def = CLIENT_CONTENT_PACK.getProgressionDefinition('progression.mainStage');
const first = CLIENT_CONTENT_PACK.getFirstTreasureRule(def.firstTreasureRuleId);
const normal = CLIENT_CONTENT_PACK.getTreasureRarityTable(def.treasureRarityTableId);

describe('treasure chest lifecycle (progression08)', () => {
  it('first chest is a 50/50 Twin Shell or Legendary branch regardless of source', () => {
    let opened = 0;
    const system = new TreasureChestSystem(() => opened, () => opened++);
    expect(system.rollReward(() => 0, first, normal)).toEqual({
      kind: 'fixedRelic',
      relicId: 'relic.twin_shell',
    });
    expect(system.rollReward(() => 0.4999, first, normal)).toEqual({
      kind: 'fixedRelic',
      relicId: 'relic.twin_shell',
    });
    expect(system.rollReward(() => 0.5001, first, normal)).toEqual({
      kind: 'rarity',
      rarity: 'legendary',
    });
    expect(system.rollReward(() => 0.99, first, normal)).toEqual({
      kind: 'rarity',
      rarity: 'legendary',
    });
  });

  it('later chests use the normal table', () => {
    let opened = 1;
    const system = new TreasureChestSystem(() => opened, () => opened++);
    expect(system.rollReward(() => 0.99, first, normal)).toEqual({ kind: 'rarity', rarity: 'legendary' });
    expect(system.rollReward(() => 0.7, first, normal)).toEqual({ kind: 'rarity', rarity: 'rare' });
    expect(system.rollReward(() => 0.1, first, normal)).toEqual({ kind: 'rarity', rarity: 'common' });
  });

  it('wave leader kill creates one guaranteed chest; purge creates none', () => {
    const m = makeMatch();
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
    expect(m.state.teamProgression.treasureChestsOpened).toBe(0);

    const m2 = makeMatch();
    const e = spawnEnemy(m2);
    m2.systems.enemies.purge((x) => x.id === e.id);
    expect(m2.state.chests.length).toBe(0);
  });

  it('opening a chest rolls a relic and applies it once', () => {
    const m = makeMatch();
    const chest = m.systems.progression.spawnChest('map', 3, 3);
    const result = revealChest(m, chest, Date.now());
    expect(result).not.toBeNull();
    expect(result!.relicId === 'relic.twin_shell' || result!.rarity === 'legendary').toBe(true);
    expect(m.state.teamProgression.treasureChestsOpened).toBe(1);
    expect(m.state.teamProgression.relicStacks[result!.relicId]).toBe(1);
    // Second open is impossible.
    expect(m.openProgressionChest(chest.id, Date.now())).toBeNull();
  });

  it('same seed produces the same relic result', () => {
    const a = makeMatch('mode.singlePlayerScoreAttack', 'seed-a');
    const b = makeMatch('mode.singlePlayerScoreAttack', 'seed-a');
    const ca = a.systems.progression.spawnChest('map', 1, 1);
    const cb = b.systems.progression.spawnChest('map', 1, 1);
    const ra = revealChest(a, ca, 1000);
    const rb = revealChest(b, cb, 1000);
    expect(ra?.relicId).toBe(rb?.relicId);
  });
});
