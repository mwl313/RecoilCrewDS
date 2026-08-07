import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION, protocolOk } from '../../src/shared/net/protocol';
import { makeMatch } from './helpers';

describe('progression network protocol (progression08)', () => {
  it('protocol version includes authoritative relic chest lifecycle snapshots', () => {
    expect(PROTOCOL_VERSION).toBe(17);
    expect(protocolOk({ protocol: PROTOCOL_VERSION, t: 'selectUpgrade', offerId: 'x', cardIndex: 0 })).toBe(true);
    expect(protocolOk({ protocol: PROTOCOL_VERSION, t: 'skipRelicPresentation', acquisitionSequence: 1 })).toBe(true);
    expect(protocolOk({ protocol: PROTOCOL_VERSION, t: 'acknowledgeRelic', acquisitionSequence: 1 })).toBe(true);
  });

  it('selection command is idempotent and rejects wrong roles/indices', () => {
    const m = makeMatch();
    m.systems.progression.addXp(20);
    const active = m.state.teamProgression.activeSelection!;
    expect(m.submitProgressionSelection('single', active.offerId, 0).accepted).toBe(true);
    expect(m.submitProgressionSelection('single', active.offerId, 1).accepted).toBe(false);
    expect(m.submitProgressionSelection('driver', active.offerId, 0).accepted).toBe(false);
  });

  it('snapshot state carries everything needed to rebuild the HUD on reconnect', () => {
    const m = makeMatch();
    m.systems.progression.addXp(20);
    const serialized = JSON.parse(JSON.stringify(m.state));
    expect(serialized.matchFlow).toBe('upgradeSelection');
    expect(serialized.teamProgression.activeSelection.offerId).toBeTruthy();
    expect(serialized.teamProgression.activeSelection.driverSelection).toBeUndefined();
    expect(serialized.teamProgression.relicStacks).toEqual({});
    expect(serialized.teamProgression.levelUpgradeSummary).toEqual([]);
  });

  it('roundtrips every chest lifecycle and a future three-candidate offer', () => {
    const m = makeMatch();
    const lifecycles = ['spawning', 'closed', 'opening', 'revealing', 'open', 'despawning'] as const;
    m.state.chests = lifecycles.map((lifecycle, index) => ({
      id: index + 1,
      source: 'mapStart' as const,
      x: index,
      y: 0,
      z: -index,
      lifecycle,
      spawnStartedAtGameTime: 1,
      claimableAtGameTime: 1.5,
      openingStartedAtWallMs: lifecycle === 'opening' ? 5_000 : undefined,
      fullyOpenAtWallMs: lifecycle === 'opening' ? 5_650 : undefined,
      fullyOpenStartedAtGameTime: lifecycle === 'open' ? 8 : undefined,
      despawnStartedAtGameTime: lifecycle === 'despawning' ? 10 : undefined,
    }));
    m.state.chests[2].rewardOffer = {
      offerId: 'future-three',
      chestId: 3,
      candidates: [
        { relicId: 'relic.magnet_core', rarity: 'common' },
        { relicId: 'relic.heat_sink', rarity: 'rare' },
        { relicId: 'relic.phase_dash', rarity: 'legendary' },
      ],
      selectionMode: 'chooseOne',
      selectedIndex: null,
      resolved: false,
    };
    m.state.teamProgression.relicStacks = { 'relic.magnet_core': 2 };
    m.state.teamProgression.relicAcquisitionOrder = ['relic.magnet_core'];

    const serialized = JSON.parse(JSON.stringify(m.state));
    expect(serialized.chests.map((chest: { lifecycle: string }) => chest.lifecycle)).toEqual(lifecycles);
    expect(serialized.chests[2].rewardOffer.candidates).toHaveLength(3);
    expect(serialized.teamProgression.relicAcquisitionOrder).toEqual(['relic.magnet_core']);
  });
});
