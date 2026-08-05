import { describe, expect, it } from 'vitest';
import { createAndJoin, makeManager } from './helpers';

describe('lobby09 seat selection', () => {
  it('server rejects an occupied seat and accepts release', () => {
    const { manager, a, b } = createAndJoin(makeManager().manager);
    manager.handle(a, { t: 'lobbySelectSeat', seat: null, lobbyRevision: 999 });
    manager.handle(b, { t: 'lobbySelectSeat', seat: null, lobbyRevision: 999 });
    manager.handle(a, { t: 'lobbySelectSeat', seat: 'driver', lobbyRevision: 999 });
    manager.handle(b, { t: 'lobbySelectSeat', seat: 'driver', lobbyRevision: 999 });
    expect(b.last('error')!.code).toBe('seat_occupied');
    const errorsBefore = b.all('error').length;
    manager.handle(b, { t: 'lobbySelectSeat', seat: 'gunner', lobbyRevision: 999 });
    expect(b.all('error').length).toBe(errorsBefore);
    const view = b.last('lobbyState')!.lobby as {
      players: Array<{ seat: string | null }>;
    };
    expect(view.players.find((p) => p.seat === 'gunner')).toBeTruthy();
    // Release: the client sends null to leave the seat.
    manager.handle(b, { t: 'lobbySelectSeat', seat: null, lobbyRevision: 999 });
    const released = b.last('lobbyState')!.lobby as {
      players: Array<{ seat: string | null }>;
    };
    expect(released.players.find((p) => p.seat === null)).toBeTruthy();
    void manager;
  });

  it('seat changes clear all Ready flags', () => {
    const { manager, a, b } = createAndJoin(makeManager().manager);
    manager.handle(a, { t: 'lobbyReadySet', ready: true, lobbyRevision: 999 });
    manager.handle(b, { t: 'lobbyReadySet', ready: true, lobbyRevision: 999 });
    const before = a.last('lobbyState')!.lobby as { players: Array<{ ready: boolean }> };
    expect(before.players.every((p) => p.ready)).toBe(true);
    manager.handle(a, { t: 'lobbySelectSeat', seat: null, lobbyRevision: 999 });
    const after = b.last('lobbyState')!.lobby as { players: Array<{ ready: boolean }> };
    expect(after.players.every((p) => !p.ready)).toBe(true);
    void manager;
  });

  it('stale seat requests are rejected', () => {
    const { manager, a } = createAndJoin(makeManager().manager);
    manager.handle(a, { t: 'lobbySelectSeat', seat: 'gunner', lobbyRevision: 0 });
    manager.handle(a, { t: 'lobbySelectSeat', seat: 'driver', lobbyRevision: 0 });
    expect(a.last('error')!.code).toBe('stale');
    void manager;
  });
});
