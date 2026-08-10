import { describe, expect, it } from 'vitest';
import { RelicInventory } from '../../src/shared/progression/relicInventory';
import { CLIENT_CONTENT_PACK } from '../../src/generated/contentPack.generated';
import { makeMatch } from './helpers';

describe('relic inventory (progression08)', () => {
  it('stacks add, capability grants once, and unique re-add grants no reward', () => {
    const m = makeMatch();
    const inventory = new RelicInventory(m.state, (id, source) => m.systems.capabilities.grant(id, source));
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
    expect(dup.duplicateConverted).toBe(false);
    expect(dup.replacementXp).toBe(0);
    expect(inventory.getStack('relic.phoenix_core')).toBe(1);
  });

  it('capability source safety: one relic source cannot revoke another', () => {
    const m = makeMatch();
    const inventory = new RelicInventory(m.state, (id, source) => m.systems.capabilities.grant(id, source));
    const relic = CLIENT_CONTENT_PACK.getRelic('relic.unstoppable');
    inventory.add(relic);
    m.systems.capabilities.grant('tank.zeroDashCooldown', 'test:other');
    m.systems.capabilities.revokeSource('relic:relic.unstoppable');
    // The capability stays because a different source still grants it.
    expect(m.state.build.capabilities).toContain('tank.zeroDashCooldown');
  });

  it('does not add a third FRIENDLY SHIELD stack', () => {
    const m = makeMatch();
    const inventory = new RelicInventory(m.state, (id, source) => m.systems.capabilities.grant(id, source));
    const friendlyShield = CLIENT_CONTENT_PACK.getRelic('relic.friendly_shield');

    expect(friendlyShield.maximumStacks).toBe(2);
    expect(inventory.add(friendlyShield).stackCount).toBe(1);
    expect(inventory.add(friendlyShield).stackCount).toBe(2);
    expect(inventory.add(friendlyShield).stackCount).toBe(2);
    expect(inventory.getStack(friendlyShield.id)).toBe(2);
  });
});
