// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LobbyView } from '../../src/client/lobby/lobbyView';
import type { ClientLobbyState, LobbyChatMessage } from '../../src/shared/lobby/lobbyTypes';

const mounted: LobbyView[] = [];
function callbacks() {
  return {
    onSelectSeat: () => undefined,
    onRequestRoleSwap: () => undefined,
    onResolveRoleSwap: () => undefined,
    onReadyToggle: () => undefined,
    onSendChat: () => undefined,
    onLeave: () => undefined,
    onCopy: () => undefined,
  };
}
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
    roleSwap: null,
    ...over,
  };
}

describe('lobby09 presentation', () => {
  it('YOU appears only on the local player card (by playerId, not nickname)', () => {
    const container = document.createElement('div');
    const view = new LobbyView(container, callbacks());
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
    const view = new LobbyView(container, callbacks());
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
    const view = new LobbyView(container, callbacks());
    mounted.push(view);
    view.update(makeState(), [], 'host');
    expect(container.querySelector('#lobby-start-hint')!.textContent).toBe('A player is not Ready yet');
    expect(container.querySelectorAll('.lobby-badge.host').length).toBe(1);
    expect(container.querySelector('#seat-driver')).not.toBeNull();
    expect(container.querySelector('#seat-driver')!.textContent).toBe('YOUR ROLE');
    expect(container.querySelector('#request-role-swap')).not.toBeNull();
    expect(container.querySelector('#lobby-ready')!.textContent).toContain('READY');
  });

  it('promotes the room code into the top strip and uses the CHAT label', () => {
    const container = document.createElement('div');
    const view = new LobbyView(container, callbacks());
    mounted.push(view);
    view.update(makeState(), [], 'host');

    const strip = container.querySelector('.lobby-code-strip') as HTMLElement;
    expect(strip.textContent).toContain('ROOM CODE');
    expect(strip.querySelector('#lobby-code')?.textContent).toBe('ABC123');
    expect(strip.querySelector('#copy-code')).not.toBeNull();
    expect(container.textContent).not.toContain('RUN TYPE');
    expect(container.textContent).not.toContain('CREW FORMAT');
    expect(container.textContent).not.toContain('CHANNEL');
    expect(container.querySelector('.lobby-chat h3')?.textContent).toBe('CHAT');
  });

  it('shows explicit accept/decline controls only to the requested swap target', () => {
    const container = document.createElement('div');
    const view = new LobbyView(container, callbacks());
    mounted.push(view);
    view.update(makeState({
      roleSwap: {
        requestId: 7,
        requestedByPlayerId: 'host',
        targetPlayerId: 'guest',
        requestedBySeat: 'driver',
        requestedSeat: 'gunner',
      },
      startEligibility: { eligible: false, reason: 'role_swap_pending' },
    }), [], 'guest');
    expect(container.querySelector('#accept-role-swap')?.textContent).toContain('BECOME DRIVER');
    expect(container.querySelector('#decline-role-swap')).not.toBeNull();
    expect(container.querySelector('#request-role-swap')).toBeNull();
  });

  it('uses directional lifecycle classes for crew entrance and dismissal', () => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    const view = new LobbyView(container, callbacks());
    mounted.push(view);
    const root = container.querySelector('.lobby-screen') as HTMLElement;

    view.enter();
    expect(root.classList.contains('hidden')).toBe(false);
    expect(root.classList.contains('is-entering')).toBe(true);
    vi.advanceTimersByTime(601);
    expect(root.classList.contains('is-entering')).toBe(false);

    const completed = vi.fn();
    view.leave(completed);
    expect(root.classList.contains('is-leaving')).toBe(true);
    expect(root.getAttribute('aria-busy')).toBe('true');
    vi.advanceTimersByTime(561);
    expect(root.classList.contains('hidden')).toBe(true);
    expect(completed).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
