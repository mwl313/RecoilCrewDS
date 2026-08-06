import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION, protocolOk } from '../../src/shared/net/protocol';

describe('lobby09 protocol', () => {
  it('protocol version 10 carries lobby messages', () => {
    expect(PROTOCOL_VERSION).toBe(10);
    expect(protocolOk({ protocol: 10, t: 'create', displayName: 'TurboToad07' })).toBe(true);
    expect(protocolOk({ protocol: 10, t: 'lobbySelectSeat', seat: 'driver', lobbyRevision: 3 })).toBe(true);
    expect(protocolOk({ protocol: 10, t: 'lobbyReadySet', ready: true, lobbyRevision: 3 })).toBe(true);
    expect(protocolOk({ protocol: 10, t: 'lobbyChatSend', text: 'hi' })).toBe(true);
  });
});
