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

  it.each(uniqueIds)('%s remains stack one and converts a duplicate to XP', (relicId) => {
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

  it('uses the relic-specific duplicate replacement before the global fallback', () => {
    const m = makeMatch('mode.singlePlayerScoreAttack', 'unique-replacement-authority');
    const inventory = new RelicInventory(m.state, progression, () => undefined);
    const relic: RelicDefinition = {
      ...CLIENT_CONTENT_PACK.getRelic('relic.phase_dash'),
      id: 'relic.test_unique_replacement',
      duplicateReplacement: { type: 'xp', amount: 777 },
    };
    inventory.add(relic);
    expect(inventory.add(relic).replacementXp).toBe(777);
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
