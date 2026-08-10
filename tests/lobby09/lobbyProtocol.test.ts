import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION, protocolOk } from '../../src/shared/net/protocol';

describe('lobby09 protocol', () => {
  it('current protocol carries lobby messages', () => {
    expect(PROTOCOL_VERSION).toBe(20);
    expect(protocolOk({ protocol: PROTOCOL_VERSION, t: 'create', displayName: 'TurboToad07' })).toBe(true);
    expect(protocolOk({ protocol: PROTOCOL_VERSION, t: 'lobbySelectSeat', seat: 'driver', lobbyRevision: 3 })).toBe(true);
    expect(protocolOk({ protocol: PROTOCOL_VERSION, t: 'lobbyRequestRoleSwap', lobbyRevision: 3 })).toBe(true);
    expect(protocolOk({ protocol: PROTOCOL_VERSION, t: 'lobbyResolveRoleSwap', requestId: 1, accept: true, lobbyRevision: 4 })).toBe(true);
    expect(protocolOk({ protocol: PROTOCOL_VERSION, t: 'lobbyReadySet', ready: true, lobbyRevision: 3 })).toBe(true);
    expect(protocolOk({ protocol: PROTOCOL_VERSION, t: 'lobbyChatSend', text: 'hi' })).toBe(true);
  });
});
