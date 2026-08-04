import { describe, expect, it } from 'vitest';
import { RelicInventory } from '../../src/shared/progression/relicInventory';
import { CLIENT_CONTENT_PACK } from '../../src/generated/contentPack.generated';
import { makeMatch } from './helpers';

const def = CLIENT_CONTENT_PACK.getProgressionDefinition('progression.mainStage');

describe('relic inventory (progression08)', () => {
  it('stacks add, capability granted once, unique duplicates convert to 250 XP', () => {
    const m = makeMatch();
    const inventory = new RelicInventory(m.state, def, (id, source) => m.systems.capabilities.grant(id, source));
    const roadkill = CLIENT_CONTENT_PACK.getRelic('relic.roadkill');
    const first = inventory.add(roadkill);
    expect(first.stackCount).toBe(1);
    expect(first.capabilityGranted).toBe(true);
    expect(m.state.build.capabilities).toContain('tank.roadkillContact');
    const second = inventory.add(roadkill);
    expect(second.stackCount).toBe(2);
    expect(second.capabilityGranted).toBe(false);

    const phoenix = CLIENT_CONTENT_PACK.getRelic('relic.phoenix_core');
    inventory.add(phoenix);
    const dup = inventory.add(phoenix);
    expect(dup.duplicateConverted).toBe(true);
    expect(dup.replacementXp).toBe(250);
    expect(inventory.getStack('relic.phoenix_core')).toBe(1);
  });

  it('capability source safety: one relic source cannot revoke another', () => {
    const m = makeMatch();
    const inventory = new RelicInventory(m.state, def, (id, source) => m.systems.capabilities.grant(id, source));
    const relic = CLIENT_CONTENT_PACK.getRelic('relic.unstoppable');
    inventory.add(relic);
    m.systems.capabilities.grant('tank.zeroDashCooldown', 'test:other');
    m.systems.capabilities.revokeSource('relic:relic.unstoppable');
    // The capability stays because a different source still grants it.
    expect(m.state.build.capabilities).toContain('tank.zeroDashCooldown');
  });
});
