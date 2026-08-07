import { describe, expect, it } from 'vitest';
import {
  checkProtocolCompatibility,
  PROTOCOL_VERSION,
  isClientMessage,
  protocolOk,
} from '../../src/shared/net/protocol';
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
  });

  it('rejects old protocol versions against the current server', () => {
    expect(PROTOCOL_VERSION).toBe(15);
    const result = checkProtocolCompatibility({
      clientProtocol: PROTOCOL_VERSION - 1,
      clientContentHash: 'a',
      clientDefinitionOrderHash: 'b',
      serverProtocol: PROTOCOL_VERSION,
      serverContentHash: 'a',
      serverDefinitionOrderHash: 'b',
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('protocol version mismatch');
  });

  it('rejects content-pack hash mismatches in both directions', () => {
    const server = {
      serverProtocol: PROTOCOL_VERSION,
      serverContentHash: 'server-content',
      serverDefinitionOrderHash: 'server-order',
    };
    const badContent = checkProtocolCompatibility({
      clientProtocol: PROTOCOL_VERSION,
      clientContentHash: 'client-content',
      clientDefinitionOrderHash: 'server-order',
      ...server,
    });
    expect(badContent.ok).toBe(false);
    expect(badContent.reason).toBe('content-pack hash mismatch');

    const badOrder = checkProtocolCompatibility({
      clientProtocol: PROTOCOL_VERSION,
      clientContentHash: 'server-content',
      clientDefinitionOrderHash: 'client-order',
      ...server,
    });
    expect(badOrder.ok).toBe(false);
    expect(badOrder.reason).toBe('enemy-definition-order hash mismatch');
  });

  it('accepts a fully matching current client/server pair', () => {
    expect(
      checkProtocolCompatibility({
        clientProtocol: PROTOCOL_VERSION,
        clientContentHash: 'c',
        clientDefinitionOrderHash: 'd',
        serverProtocol: PROTOCOL_VERSION,
        serverContentHash: 'c',
        serverDefinitionOrderHash: 'd',
      }).ok,
    ).toBe(true);
  });
});
