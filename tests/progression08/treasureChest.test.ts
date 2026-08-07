import { describe, expect, it } from 'vitest';
import { TreasureChestSystem } from '../../src/shared/progression/treasureChestSystem';
import { CLIENT_CONTENT_PACK } from '../../src/generated/contentPack.generated';
import { makeMatch, spawnEnemy, killEnemy } from './helpers';

const def = CLIENT_CONTENT_PACK.getProgressionDefinition('progression.mainStage');
const first = CLIENT_CONTENT_PACK.getFirstTreasureRule(def.firstTreasureRuleId);
const normal = CLIENT_CONTENT_PACK.getTreasureRarityTable(def.treasureRarityTableId);

describe('treasure chest lifecycle (progression08)', () => {
  it('first chest uses Epic/Legendary only regardless of source', () => {
    let opened = 0;
    const system = new TreasureChestSystem(() => opened, () => opened++);
    for (const roll of [0, 0.5, 0.7, 0.99]) {
      const rarity = system.rollRarity(() => roll, first, normal);
      expect(['epic', 'legendary']).toContain(rarity);
    }
  });

  it('later chests use the normal table', () => {
    let opened = 1;
    const system = new TreasureChestSystem(() => opened, () => opened++);
    const rarity = system.rollRarity(() => 0.99, first, normal);
    expect(rarity).toBe('legendary');
    expect(system.rollRarity(() => 0.7, first, normal)).toBe('rare');
    expect(system.rollRarity(() => 0.1, first, normal)).toBe('common');
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
    const initialChestCount = m2.state.chests.length;
    const e = spawnEnemy(m2);
    m2.systems.enemies.purge((x) => x.id === e.id);
    expect(m2.state.chests.length).toBe(initialChestCount);
  });

  it('places content-driven map chests and opens one through a spherical proximity pickup', () => {
    const m = makeMatch();
    const mapChests = m.state.chests.filter((chest) => chest.source === 'map');
    expect(mapChests).toHaveLength(def.mapChestCount);
    expect(mapChests.every((chest) => Math.hypot(chest.x - m.state.tank.x, chest.z - m.state.tank.z) >= def.mapChestMinSpawnDistance)).toBe(true);

    const target = mapChests[0];
    m.state.tank.x = target.x;
    m.state.tank.y = target.y - 0.4;
    m.state.tank.z = target.z;
    expect(m.systems.progression.updateChestProximity(Date.now())).toBe(true);
    expect(target.opened).toBe(true);
    expect(m.state.matchFlow).toBe('relicSelection');
  });

  it('opening a chest rolls a relic and applies it once', () => {
    const m = makeMatch();
    const chest = m.systems.progression.spawnChest('map', 3, 3);
    const result = m.openProgressionChest(chest.id, Date.now());
    expect(result).not.toBeNull();
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
    const ra = a.openProgressionChest(ca.id, 0);
    const rb = b.openProgressionChest(cb.id, 0);
    expect(ra?.relicId).toBe(rb?.relicId);
  });
});
