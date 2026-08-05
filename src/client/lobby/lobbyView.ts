import type { ClientLobbyState, CrewSeat, LobbyChatMessage } from '../../shared/lobby/lobbyTypes';

export interface LobbyViewCallbacks {
  onSelectSeat(seat: CrewSeat | null): void;
  onReadyToggle(): void;
  onSendChat(text: string): void;
  onLeave(): void;
  onCopy(code: string): void;
}

const ELIGIBILITY_LABELS: Record<string, string> = {
  eligible: 'Crew Ready',
  waiting_for_player: 'Waiting for another player',
  invalid_seats: 'Choose different crew roles (one Driver, one Gunner)',
  player_not_ready: 'A player is not Ready yet',
  player_disconnected: 'A player is reconnecting',
  content_unavailable: 'Content unavailable',
};

/**
 * Code-owned Lobby V2 view. Renders authoritative lobby state with
 * textContent only (never innerHTML), marks the local player with YOU by
 * playerId, and exposes seat/ready/chat/leave controls.
 */
export class LobbyView {
  private readonly root: HTMLElement;
  private readonly playersHost: HTMLElement;
  private readonly chatHost: HTMLElement;
  private readonly chatInput: HTMLInputElement;
  private readonly hint: HTMLElement;
  private readonly readyButton: HTMLButtonElement;
  private readonly code: HTMLElement;
  private readonly copyButton: HTMLButtonElement;
  private readonly leaveButton: HTMLButtonElement;
  private localPlayerId = '';

  constructor(container: HTMLElement, private readonly cb: LobbyViewCallbacks) {
    this.root = document.createElement('div');
    this.root.id = 'screen-ready';
    this.root.className = 'screen lobby-v2';

    const header = document.createElement('div');
    header.className = 'lobby-header';
    const title = document.createElement('h2');
    title.textContent = 'CREW LOBBY';
    this.code = document.createElement('span');
    this.code.id = 'lobby-code';
    this.code.className = 'code';
    this.copyButton = document.createElement('button');
    this.copyButton.id = 'copy-code';
    this.copyButton.className = 'btn small';
    this.copyButton.textContent = 'COPY';
    this.copyButton.addEventListener('click', () => this.cb.onCopy(this.code.textContent ?? ''));
    const codeBox = document.createElement('div');
    codeBox.className = 'code-box small';
    codeBox.append(this.code, this.copyButton);
    header.append(title, codeBox);

    const body = document.createElement('div');
    body.className = 'lobby-body';
    const crew = document.createElement('section');
    crew.className = 'lobby-crew';
    this.playersHost = document.createElement('div');
    this.playersHost.id = 'lobby-players';
    crew.appendChild(this.playersHost);
    this.hint = document.createElement('div');
    this.hint.id = 'lobby-start-hint';
    this.hint.className = 'lobby-hint';
    crew.appendChild(this.hint);
    this.readyButton = document.createElement('button');
    this.readyButton.id = 'lobby-ready';
    this.readyButton.dataset['act'] = 'ready';
    this.readyButton.className = 'btn primary';
    this.readyButton.addEventListener('click', () => this.cb.onReadyToggle());
    crew.appendChild(this.readyButton);
    this.leaveButton = document.createElement('button');
    this.leaveButton.id = 'lobby-leave';
    this.leaveButton.className = 'btn ghost';
    this.leaveButton.textContent = 'LEAVE';
    this.leaveButton.addEventListener('click', () => this.cb.onLeave());
    crew.appendChild(this.leaveButton);

    const chat = document.createElement('section');
    chat.className = 'lobby-chat';
    const chatTitle = document.createElement('h3');
    chatTitle.textContent = 'ROOM CHAT';
    this.chatHost = document.createElement('div');
    this.chatHost.id = 'lobby-chat-messages';
    this.chatHost.className = 'lobby-chat-messages';
    const chatRow = document.createElement('div');
    chatRow.className = 'lobby-chat-row';
    this.chatInput = document.createElement('input');
    this.chatInput.id = 'lobby-chat-input';
    this.chatInput.maxLength = 200;
    this.chatInput.placeholder = 'Message…';
    const send = document.createElement('button');
    send.id = 'lobby-chat-send';
    send.className = 'btn small';
    send.textContent = 'SEND';
    const submit = (): void => {
      const text = this.chatInput.value;
      if (!text.trim()) return;
      this.cb.onSendChat(text);
      this.chatInput.value = '';
    };
    send.addEventListener('click', submit);
    this.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
    chatRow.append(this.chatInput, send);
    chat.append(chatTitle, this.chatHost, chatRow);

    body.append(crew, chat);
    this.root.append(header, body);
    container.appendChild(this.root);
  }

  update(state: ClientLobbyState, chat: readonly LobbyChatMessage[], localPlayerId: string): void {
    this.localPlayerId = localPlayerId;
    this.code.textContent = state.roomCode;
    this.renderPlayers(state);
    const reason = state.startEligibility.reason;
    this.hint.textContent = ELIGIBILITY_LABELS[reason] ?? 'Crew not ready';
    const me = state.players.find((p) => p.playerId === localPlayerId);
    const ready = me?.ready === true;
    this.readyButton.textContent = ready ? 'READY ✓ (UNREADY)' : 'READY';
    this.readyButton.classList.toggle('ready', ready);
    this.renderChat(chat);
  }

  private renderPlayers(state: ClientLobbyState): void {
    this.playersHost.textContent = '';
    for (const player of state.players) {
      const card = document.createElement('div');
      card.className = 'lobby-player';
      card.dataset['playerId'] = player.playerId;
      card.classList.toggle('local', player.playerId === this.localPlayerId);
      card.classList.toggle('reconnecting', !player.connected);

      const nameLine = document.createElement('div');
      nameLine.className = 'lobby-name';
      const host = document.createElement('span');
      const isHost = player.playerId === state.hostPlayerId;
      host.className = 'lobby-badge host';
      host.classList.toggle('host', isHost);
      host.textContent = isHost ? '[HOST] ' : '';
      const name = document.createElement('span');
      name.textContent = player.displayName;
      const you = document.createElement('span');
      you.className = 'lobby-badge you';
      you.dataset['you'] = String(player.playerId === this.localPlayerId);
      you.textContent = player.playerId === this.localPlayerId ? ' [YOU]' : '';
      nameLine.append(host, name, you);
      card.appendChild(nameLine);

      const seatLine = document.createElement('div');
      seatLine.className = 'lobby-seat';
      seatLine.textContent = player.seat ? player.seat.toUpperCase() : 'NO ROLE';
      card.appendChild(seatLine);

      if (player.playerId === this.localPlayerId) {
        const seatRow = document.createElement('div');
        seatRow.className = 'lobby-seat-row';
        for (const seat of ['driver', 'gunner'] as CrewSeat[]) {
          const btn = document.createElement('button');
          btn.id = `seat-${seat}`;
          btn.dataset['seat'] = seat;
          btn.className = 'btn small';
          btn.textContent = seat.toUpperCase();
          btn.classList.toggle('selected', player.seat === seat);
          btn.addEventListener('click', () => this.cb.onSelectSeat(player.seat === seat ? null : seat));
          seatRow.appendChild(btn);
        }
        card.appendChild(seatRow);
      }

      const status = document.createElement('div');
      status.className = 'lobby-status';
      status.textContent = !player.connected
        ? 'RECONNECTING…'
        : player.ready
          ? 'READY'
          : 'NOT READY';
      card.appendChild(status);
      this.playersHost.appendChild(card);
    }
  }

  private renderChat(chat: readonly LobbyChatMessage[]): void {
    this.chatHost.textContent = '';
    for (const message of chat) {
      const row = document.createElement('div');
      row.className = 'lobby-chat-message';
      const who = document.createElement('span');
      who.className = 'lobby-chat-who';
      who.textContent = `${message.displayName}: `;
      const text = document.createElement('span');
      text.textContent = message.text;
      row.append(who, text);
      this.chatHost.appendChild(row);
    }
    this.chatHost.scrollTop = this.chatHost.scrollHeight;
  }

  dispose(): void {
    this.root.remove();
  }
}
