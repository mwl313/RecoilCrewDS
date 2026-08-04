import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION, protocolOk } from '../../src/shared/net/protocol';
import { makeMatch } from './helpers';

describe('progression network protocol (progression08)', () => {
  it('protocol version was bumped deliberately for selectUpgrade + skipRelicPresentation', () => {
    expect(PROTOCOL_VERSION).toBe(7);
    expect(protocolOk({ protocol: PROTOCOL_VERSION, t: 'selectUpgrade', offerId: 'x', cardIndex: 0 })).toBe(true);
    expect(protocolOk({ protocol: PROTOCOL_VERSION, t: 'skipRelicPresentation', acquisitionSequence: 1 })).toBe(true);
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
  });
});
