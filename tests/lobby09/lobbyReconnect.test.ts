import { describe, expect, it } from 'vitest';
import { createAndJoin, FakeSocket, makeManager } from './helpers';

describe('lobby09 reconnect and host migration', () => {
  it('reconnect restores nickname and seat, but not Ready', () => {
    const { manager, a, b, code } = createAndJoin(makeManager().manager, 'TurboToad07', 'ScrapFox42');
    manager.handle(a, { t: 'lobbyReadySet', ready: true, lobbyRevision: 999 });
    manager.handle(b, { t: 'lobbyReadySet', ready: true, lobbyRevision: 999 });
    const sessionId = b.last('joined')!.sessionId as string;
    manager.disconnect(manager.getClient(b)!);
    const b2 = new FakeSocket();
    const client = manager.rejoin(code, sessionId, b2);
    expect(client).not.toBeNull();
    const joined = b2.last('joined')!;
    expect(joined.displayName).toBe('ScrapFox42');
    expect(joined.seat).toBe('gunner');
    const lobby = b2.last('joined')!.lobby as {
      players: Array<{ displayName: string; seat: string | null; ready: boolean }>;
    };
    const me = lobby.players.find((p) => p.displayName === 'ScrapFox42')!;
    expect(me.seat).toBe('gunner');
    expect(me.ready).toBe(false);
  });

  it('host migrates to the connected lowest joinedSequence player after grace', () => {
    const { manager, a, b } = createAndJoin(makeManager().manager);
    const hostId = a.last('created')!.playerId as string;
    const hostClient = manager.getClient(a)!;
    manager.disconnect(manager.getClient(a)!);
    const lobbyAfterDisconnect = b.last('lobbyState')!.lobby as { hostPlayerId: string };
    expect(lobbyAfterDisconnect.hostPlayerId).toBe(hostId);
    manager.tick(1 / 30);
    // Simulate grace expiry by directly removing the disconnected host.
    hostClient.graceLeft = 0;
    manager.tick(1 / 30);
    const lobbyAfterExpiry = b.last('lobbyState')!.lobby as { hostPlayerId: string; players: Array<{ playerId: string }> };
    expect(lobbyAfterExpiry.hostPlayerId).not.toBe(hostId);
    expect(lobbyAfterExpiry.players[0].playerId).toBe(lobbyAfterExpiry.hostPlayerId);
  });
});
