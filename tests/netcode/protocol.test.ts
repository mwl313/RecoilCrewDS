import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION, isClientMessage, protocolOk } from '../../src/shared/net/protocol';
import { NET_TUNING, SNAPSHOT_INTERVAL, SIM_DT } from '../../src/shared/net/tuning';

describe('typed protocol', () => {
  it('exports a stable protocol version and rejects mismatched clients', () => {
    expect(PROTOCOL_VERSION).toBeGreaterThan(0);
    expect(protocolOk({ protocol: PROTOCOL_VERSION, t: 'create' })).toBe(true);
    expect(protocolOk({ protocol: PROTOCOL_VERSION + 1, t: 'create' })).toBe(false);
    expect(protocolOk({ t: 'create' })).toBe(false);
  });

  it('recognizes client messages by discriminator', () => {
    expect(isClientMessage({ t: 'input', seq: 1 })).toBe(true);
    expect(isClientMessage({ notAMessage: true })).toBe(false);
  });

  it('has no scattered netcode magic numbers', () => {
    expect(NET_TUNING.simHz).toBe(30);
    expect(NET_TUNING.snapshotHz).toBe(20);
    expect(SIM_DT).toBeCloseTo(1 / 30);
    expect(SNAPSHOT_INTERVAL).toBeCloseTo(1 / 20);
    expect(NET_TUNING.pip.normalHz).toBe(12);
    expect(NET_TUNING.pip.degradedHz).toBe(6);
  });
});
