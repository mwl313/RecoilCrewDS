import { describe, expect, it } from 'vitest';
import { CLIENT_CONTENT_PACK } from '../../src/generated/contentPack.generated';
import type { RelicDefinition } from '../../src/shared/content/schemas/progression';
import { RelicInventory } from '../../src/shared/progression/relicInventory';
import { makeMatch } from './helpers';

const progression = CLIENT_CONTENT_PACK.getProgressionDefinition('progression.mainStage');
const uniqueIds = ['relic.phase_dash', 'relic.phoenix_core', 'relic.twin_shell'] as const;

describe('unique relic rolling and activation limits', () => {
  it('only the three intended relic definitions are unique', () => {
    const actual = CLIENT_CONTENT_PACK.all<RelicDefinition>('relics')
      .filter((relic) => relic.stackPolicy === 'unique')
      .map((relic) => relic.id)
      .sort();
    expect(actual).toEqual([...uniqueIds].sort());
  });

  it.each(uniqueIds)('%s remains stack one and converts a defensive duplicate add to authored XP', (relicId) => {
    const m = makeMatch('mode.singlePlayerScoreAttack', `unique-${relicId}`);
    const inventory = new RelicInventory(
      m.state,
      progression,
      (id, source) => m.systems.capabilities.grant(id, source),
    );
    const relic = CLIENT_CONTENT_PACK.getRelic(relicId);
    const first = inventory.add(relic);
    const second = inventory.add(relic);
    expect(first.stackCount).toBe(1);
    expect(second.stackCount).toBe(1);
    expect(second.duplicateConverted).toBe(true);
    expect(second.replacementXp).toBe(250);
    expect(inventory.getStack(relicId)).toBe(1);
    if (relic.capabilityId) {
      expect(m.systems.capabilities.debugSources()[relic.capabilityId]).toEqual([`relic:${relicId}`]);
    }
  });

  it('filters every maxed relic before authoritative chest candidate selection', () => {
    const m = makeMatch('mode.singlePlayerScoreAttack', 'unique-eligibility');
    for (const relicId of uniqueIds) m.state.teamProgression.relicStacks[relicId] = 1;
    m.state.teamProgression.relicStacks['relic.friendly_shield'] = 2;
    const maxedIds = [...uniqueIds, 'relic.friendly_shield'];
    for (let index = 0; index < 24; index++) {
      const chest = m.systems.progression.spawnChest('mapStart', 20 + index, 20);
      chest.lifecycle = 'closed';
      const offer = m.openProgressionChest(chest.id, 1_000 + index * 10_000);
      expect(offer).not.toBeNull();
      expect(maxedIds).not.toContain(offer!.candidates[0].relicId);
      m.checkProgressionTimeout(1_651 + index * 10_000);
      const active = m.state.teamProgression.activeSelection!;
      m.skipProgressionRelic(active.relicResult!.acquisitionSequence, active.continueAllowedAtWallMs! + 1);
    }
  });

  it('PHOENIX usage persists in one match and starts unused in a new match', () => {
    const first = makeMatch('mode.singlePlayerScoreAttack', 'phoenix-first');
    first.state.teamProgression.relicStacks['relic.phoenix_core'] = 1;
    first.state.tank.integrity = 0;
    first.state.tank.deadT = 3;
    first.systems.progression.notifyWipeout();
    expect(first.systems.progression.debugState().triggers.phoenixConsumed).toBe(true);

    const next = makeMatch('mode.singlePlayerScoreAttack', 'phoenix-next');
    expect(next.systems.progression.debugState().triggers.phoenixConsumed).toBe(false);
  });
});
