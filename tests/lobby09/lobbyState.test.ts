import { describe, expect, it } from 'vitest';
import { computeStartEligibility } from '../../src/shared/lobby/lobbyEligibility';
import type { LobbyPlayerInternal } from '../../src/shared/lobby/lobbyTypes';
import { createAndJoin, makeManager } from './helpers';

function player(over: Partial<LobbyPlayerInternal>): LobbyPlayerInternal {
  return {
    playerId: 'p1',
    sessionId: 's1',
    displayName: 'TurboToad07',
    connected: true,
    reconnectDeadlineWallMs: null,
    seat: 'driver',
    ready: true,
    joinedSequence: 1,
    ...over,
  };
}

describe('lobby09 eligibility', () => {
  it('eligible only with two connected ready players on valid seats', () => {
    const full = computeStartEligibility({
      players: [player({ playerId: 'a', seat: 'driver' }), player({ playerId: 'b', seat: 'gunner', joinedSequence: 2 })],
      contentAvailable: true,
    });
    expect(full).toEqual({ eligible: true, reason: 'eligible' });
    expect(
      computeStartEligibility({ players: [player({ seat: 'driver' })], contentAvailable: true }).reason,
    ).toBe('waiting_for_player');
    expect(
      computeStartEligibility({
        players: [player({ seat: 'driver' }), player({ seat: 'driver', joinedSequence: 2 })],
        contentAvailable: true,
      }).reason,
    ).toBe('invalid_seats');
    expect(
      computeStartEligibility({
        players: [player({ seat: 'driver' }), player({ seat: null, joinedSequence: 2 })],
        contentAvailable: true,
      }).reason,
    ).toBe('invalid_seats');
    expect(
      computeStartEligibility({
        players: [player({ seat: 'driver' }), player({ seat: 'gunner', ready: false, joinedSequence: 2 })],
        contentAvailable: true,
      }).reason,
    ).toBe('player_not_ready');
    expect(
      computeStartEligibility({
        players: [player({ seat: 'driver' }), player({ seat: 'gunner', connected: false, joinedSequence: 2 })],
        contentAvailable: true,
      }).reason,
    ).toBe('player_disconnected');
  });
});

describe('lobby09 revisioned state', () => {
  it('full lobby state is sent after create/join and revision increases', () => {
    const { manager, a, b } = createAndJoin(makeManager().manager);
    const created = a.last('created')!.lobby as { revision: number; players: Array<{ playerId: string }> };
    expect(created.revision).toBe(1);
    expect(created.players.length).toBe(1);
    const joined = b.last('joined')!.lobby as { revision: number; players: Array<{ playerId: string }> };
    expect(joined.revision).toBe(2);
    expect(joined.players.length).toBe(2);
    const broadcast = b.last('lobbyState')!.lobby as { revision: number };
    expect(broadcast.revision).toBeGreaterThanOrEqual(2);
    void manager;
  });

  it('player views never expose sessionId', () => {
    const { a } = createAndJoin(makeManager().manager);
    const lobby = a.last('created')!.lobby as { players: Array<Record<string, unknown>> };
    for (const p of lobby.players) {
      expect('sessionId' in p).toBe(false);
    }
  });
});
