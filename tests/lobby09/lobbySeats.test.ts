import { describe, expect, it } from 'vitest';
import { createAndJoin, FakeSocket, makeManager } from './helpers';

describe('lobby09 role selection', () => {
  it('never accepts an unseated state and allows an atomic move to an open role', () => {
    const manager = makeManager().manager;
    const solo = new FakeSocket();
    manager.handle(solo, { t: 'create', displayName: 'Solo' });
    manager.handle(solo, { t: 'lobbySelectSeat', seat: null, lobbyRevision: 999 });
    expect(solo.last('error')!.code).toBe('invalid_seat');

    manager.handle(solo, { t: 'lobbySelectSeat', seat: 'gunner', lobbyRevision: 999 });
    const state = solo.last('lobbyState')!.lobby as { players: Array<{ seat: string }> };
    expect(state.players).toHaveLength(1);
    expect(state.players[0].seat).toBe('gunner');
    expect(manager.getClient(solo)!.role).toBe('gunner');
  });

  it('rejects direct selection of an occupied role and points to role swapping', () => {
    const { manager, b } = createAndJoin(makeManager().manager);
    manager.handle(b, { t: 'lobbySelectSeat', seat: 'driver', lobbyRevision: 999 });
    expect(b.last('error')!.code).toBe('seat_occupied');
    expect(String(b.last('error')!.message)).toContain('swap');
  });

  it('the requested player can decline a role swap without changing seats', () => {
    const { manager, a, b } = createAndJoin(makeManager().manager);
    manager.handle(b, { t: 'lobbyRequestRoleSwap', lobbyRevision: 999 });
    const pending = a.last('lobbyState')!.lobby as { roleSwap: { requestId: number } };
    manager.handle(a, {
      t: 'lobbyResolveRoleSwap',
      requestId: pending.roleSwap.requestId,
      accept: false,
      lobbyRevision: 999,
    });
    const state = b.last('lobbyState')!.lobby as { roleSwap: null };
    expect(state.roleSwap).toBeNull();
    expect(manager.getClient(a)!.role).toBe('driver');
    expect(manager.getClient(b)!.role).toBe('gunner');
  });

  it('accepted role swaps are atomic and clear all Ready flags', () => {
    const { manager, a, b, room } = createAndJoin(makeManager().manager);
    manager.handle(a, { t: 'lobbyReadySet', ready: true, lobbyRevision: 999 });
    manager.handle(b, { t: 'lobbyRequestRoleSwap', lobbyRevision: 999 });
    const pending = a.last('lobbyState')!.lobby as { roleSwap: { requestId: number } };
    manager.handle(a, {
      t: 'lobbyResolveRoleSwap',
      requestId: pending.roleSwap.requestId,
      accept: true,
      lobbyRevision: 999,
    });
    const state = b.last('lobbyState')!.lobby as {
      roleSwap: null;
      players: Array<{ ready: boolean; seat: string }>;
    };
    expect(state.roleSwap).toBeNull();
    expect(state.players.every((player) => !player.ready)).toBe(true);
    expect(manager.getClient(a)!.role).toBe('gunner');
    expect(manager.getClient(b)!.role).toBe('driver');
    expect(room.gunner).toBe(manager.getClient(a));
    expect(room.driver).toBe(manager.getClient(b));
  });

  it('stale seat and swap requests are rejected', () => {
    const { manager, a } = createAndJoin(makeManager().manager);
    manager.handle(a, { t: 'lobbySelectSeat', seat: 'gunner', lobbyRevision: 0 });
    expect(a.last('error')!.code).toBe('stale');
    manager.handle(a, { t: 'lobbyRequestRoleSwap', lobbyRevision: 0 });
    expect(a.last('error')!.code).toBe('stale');
  });
});
