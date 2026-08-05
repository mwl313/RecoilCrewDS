import { describe, expect, it } from 'vitest';
import { createAndJoin, FakeSocket, makeManager, readyBoth, stepSeconds } from './helpers';

describe('lobby09 ready and countdown', () => {
  it('Ready requires a seat', () => {
    const { manager, b } = createAndJoin(makeManager().manager);
    manager.handle(b, { t: 'lobbySelectSeat', seat: null, lobbyRevision: 999 });
    manager.handle(b, { t: 'lobbyReadySet', ready: true, lobbyRevision: 999 });
    expect(b.last('error')!.code).toBe('seat_required');
    void manager;
  });

  it('both Ready starts countdown; Unready cancels it', () => {
    const { manager, a, b, room } = createAndJoin(makeManager().manager);
    readyBoth(manager, a, b);
    expect(a.last('countdown')!.n).toBe(3);
    expect(room.phase).toBe('countdown');
    manager.handle(b, { t: 'lobbyReadySet', ready: false, lobbyRevision: 999 });
    expect(room.phase).toBe('lobby');
    expect(room.lobbyPhase).toBe('lobby');
  });

  it('disconnect cancels countdown', () => {
    const { manager, a, b, room } = createAndJoin(makeManager().manager);
    readyBoth(manager, a, b);
    expect(room.phase).toBe('countdown');
    manager.disconnect(manager.getClient(b)!);
    expect(room.phase).toBe('lobby');
    const state = a.last('lobbyState')!.lobby as { players: Array<{ connected: boolean; reconnecting: boolean }> };
    expect(state.players.find((p) => !p.connected)?.reconnecting).toBe(true);
  });

  it('countdown completes into the existing Shared Tank match', () => {
    const { manager, a, b, room } = createAndJoin(makeManager().manager);
    readyBoth(manager, a, b);
    stepSeconds(manager, 3.6);
    expect(room.phase).toBe('running');
    expect(room.match).toBeDefined();
    expect(a.last('start')!.matchId).toBeDefined();
  });
});
