// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { LobbyView } from '../../src/client/lobby/lobbyView';
import type { ClientLobbyState, LobbyChatMessage } from '../../src/shared/lobby/lobbyTypes';

const mounted: LobbyView[] = [];
afterEach(() => {
  for (const view of mounted) view.dispose();
  mounted.length = 0;
});

function makeState(over: Partial<ClientLobbyState> = {}): ClientLobbyState {
  return {
    revision: 1,
    roomCode: 'ABC123',
    phase: 'lobby',
    hostPlayerId: 'host',
    players: [
      { playerId: 'host', displayName: 'TurboToad07', connected: true, reconnecting: false, seat: 'driver', ready: true },
      { playerId: 'guest', displayName: 'TurboToad07', connected: true, reconnecting: false, seat: 'gunner', ready: false },
    ],
    settings: { gameplayType: 'sharedTank', modeId: 'mode.demoScoreAttack' },
    countdownEndsAtWallMs: null,
    startEligibility: { eligible: false, reason: 'player_not_ready' },
    ...over,
  };
}

describe('lobby09 presentation', () => {
  it('YOU appears only on the local player card (by playerId, not nickname)', () => {
    const container = document.createElement('div');
    const view = new LobbyView(container, {
      onSelectSeat: () => undefined,
      onReadyToggle: () => undefined,
      onSendChat: () => undefined,
      onLeave: () => undefined,
      onCopy: () => undefined,
    });
    mounted.push(view);
    view.update(makeState(), [], 'guest');
    const cards = container.querySelectorAll<HTMLElement>('[data-player-id]');
    expect(cards.length).toBe(2);
    const you = container.querySelectorAll<HTMLElement>('[data-you="true"]');
    expect(you.length).toBe(1);
    expect(you[0].closest('[data-player-id]')!.getAttribute('data-player-id')).toBe('guest');
    // Same nickname on both cards does not confuse YOU.
    expect(container.textContent).toContain('TurboToad07');
  });

  it('chat renders safely as textContent', () => {
    const container = document.createElement('div');
    const view = new LobbyView(container, {
      onSelectSeat: () => undefined,
      onReadyToggle: () => undefined,
      onSendChat: () => undefined,
      onLeave: () => undefined,
      onCopy: () => undefined,
    });
    mounted.push(view);
    const chat: LobbyChatMessage[] = [
      { messageId: 1, playerId: 'host', displayName: 'TurboToad07', text: '<img src=x onerror=alert(1)>', sentAtWallMs: 0 },
    ];
    view.update(makeState(), chat, 'guest');
    expect(container.querySelector('#lobby-chat-messages')!.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(container.querySelector('#lobby-chat-messages')!.querySelector('img')).toBeNull();
  });

  it('shows host badge, seats, ready state, and eligibility explanation', () => {
    const container = document.createElement('div');
    const view = new LobbyView(container, {
      onSelectSeat: () => undefined,
      onReadyToggle: () => undefined,
      onSendChat: () => undefined,
      onLeave: () => undefined,
      onCopy: () => undefined,
    });
    mounted.push(view);
    view.update(makeState(), [], 'host');
    expect(container.querySelector('#lobby-start-hint')!.textContent).toBe('A player is not Ready yet');
    expect(container.querySelectorAll('.lobby-badge.host').length).toBe(1);
    expect(container.querySelector('#seat-driver')).not.toBeNull();
    expect(container.querySelector('#seat-gunner')).not.toBeNull();
    expect(container.querySelector('#lobby-ready')!.textContent).toContain('READY');
  });
});
