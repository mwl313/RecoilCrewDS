import type { ClientLobbyState, CrewSeat, LobbyChatMessage } from '../../shared/lobby/lobbyTypes';

export interface LobbyViewCallbacks {
  onSelectSeat(seat: CrewSeat): void;
  onRequestRoleSwap(): void;
  onResolveRoleSwap(requestId: number, accept: boolean): void;
  onReadyToggle(): void;
  onSendChat(text: string): void;
  onLeave(): void;
  onCopy(code: string): void;
}

const ELIGIBILITY_LABELS: Record<string, string> = {
  eligible: 'Both crew members linked — ready for wave',
  waiting_for_player: 'Waiting for another crew member',
  invalid_seats: 'Choose different crew roles — one Driver, one Gunner',
  role_swap_pending: 'Role swap awaiting crew confirmation',
  player_not_ready: 'A player is not Ready yet',
  player_disconnected: 'A crew member is reconnecting',
  content_unavailable: 'Run content unavailable',
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

/**
 * Dynamic lobby composite. Network state remains authoritative and all remote
 * strings are assigned through textContent; styling is shared with the
 * content-driven UI system through semantic classes and role data attributes.
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
  private transitionToken = 0;
  private presented = false;

  constructor(container: HTMLElement, private readonly cb: LobbyViewCallbacks) {
    this.root = el('div', 'screen ui-screen lobby-v2 lobby-screen hidden');
    this.root.id = 'screen-ready';
    this.root.dataset.uiDensity = 'comfortable';

    const safeFrame = el('div', 'ui-safe-frame');
    safeFrame.setAttribute('aria-hidden', 'true');
    const backdrop = el('div', 'lobby-backdrop');
    backdrop.setAttribute('aria-hidden', 'true');

    const header = el('header', 'ui-topbar lobby-header');
    const brand = el('div', 'ui-unit-mark', 'RC / CREW LINK');
    const system = el('div', 'ui-system-state ui-shared-status lobby-system-status', 'SYSTEM STATUS: READY');
    header.appendChild(brand);

    const codeBox = el('div', 'lobby-code-strip');
    const codeLabel = el('small', '', 'ROOM CODE');
    this.code = el('strong', 'code');
    this.code.id = 'lobby-code';
    this.copyButton = el('button', 'ui-compact-action', 'COPY');
    this.copyButton.id = 'copy-code';
    this.copyButton.type = 'button';
    this.copyButton.addEventListener('click', () => this.cb.onCopy(this.code.textContent ?? ''));
    codeBox.append(codeLabel, this.code, this.copyButton);

    const body = el('div', 'lobby-body');
    const crew = el('section', 'lobby-crew');
    crew.setAttribute('aria-label', 'Crew seats');
    this.playersHost = el('div', 'lobby-players');
    this.playersHost.id = 'lobby-players';
    crew.appendChild(this.playersHost);

    const vehicle = el('div', 'lobby-vehicle-stage');
    vehicle.setAttribute('aria-hidden', 'true');
    const vehicleMark = el('div', 'lobby-vehicle-mark');
    vehicleMark.append(el('span', '', 'SHARED CHASSIS'), el('strong', '', 'RC–07'));
    const tank = el('div', 'lobby-tank');
    tank.append(el('i', 'lobby-tank__barrel'), el('i', 'lobby-tank__turret'), el('i', 'lobby-tank__body'), el('i', 'lobby-tank__treads'));
    vehicle.append(tank, vehicleMark);

    body.append(crew, vehicle);

    const actions = el('footer', 'lobby-actions');
    this.hint = el('div', 'lobby-hint');
    this.hint.id = 'lobby-start-hint';
    this.readyButton = el('button', 'ui-action lobby-ready');
    this.readyButton.id = 'lobby-ready';
    this.readyButton.dataset.act = 'ready';
    this.readyButton.dataset.uiTone = 'action';
    this.readyButton.type = 'button';
    this.readyButton.addEventListener('click', () => this.cb.onReadyToggle());
    this.leaveButton = el('button', 'ui-text-action lobby-leave', 'LEAVE CREW');
    this.leaveButton.id = 'lobby-leave';
    this.leaveButton.type = 'button';
    this.leaveButton.addEventListener('click', () => this.cb.onLeave());
    actions.append(this.hint, this.leaveButton, this.readyButton);

    const chat = el('section', 'lobby-chat');
    const chatHeader = el('div', 'lobby-chat__header');
    chatHeader.append(el('h3', '', 'CHAT'), el('span', '', 'FOCUS TO EXPAND'));
    this.chatHost = el('div', 'lobby-chat-messages');
    this.chatHost.id = 'lobby-chat-messages';
    const chatRow = el('div', 'lobby-chat-row');
    this.chatInput = el('input', 'lobby-chat-input');
    this.chatInput.id = 'lobby-chat-input';
    this.chatInput.maxLength = 200;
    this.chatInput.placeholder = 'Message your crew…';
    const send = el('button', 'ui-compact-action', 'SEND');
    send.id = 'lobby-chat-send';
    send.type = 'button';
    const submit = (): void => {
      const text = this.chatInput.value;
      if (!text.trim()) return;
      this.cb.onSendChat(text);
      this.chatInput.value = '';
    };
    send.addEventListener('click', submit);
    this.chatInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') submit();
    });
    chatRow.append(this.chatInput, send);
    chat.append(chatHeader, this.chatHost, chatRow);

    this.root.append(backdrop, safeFrame, header, system, codeBox, body, actions, chat);
    container.appendChild(this.root);
  }

  /** Reveal the crew scene with the reverse of its directional dismissal. */
  enter(): void {
    if (this.presented) return;
    this.presented = true;
    const token = ++this.transitionToken;
    this.root.classList.remove('hidden', 'is-leaving');
    this.root.classList.remove('is-entering');
    void this.root.offsetWidth;
    this.root.classList.add('is-entering');
    window.setTimeout(() => {
      if (token === this.transitionToken) this.root.classList.remove('is-entering');
    }, 600);
  }

  /** Split the crew scene outward before the multiplayer menu is restored. */
  leave(onComplete: () => void): void {
    if (!this.presented) {
      onComplete();
      return;
    }
    this.presented = false;
    const token = ++this.transitionToken;
    this.root.classList.remove('is-entering', 'is-leaving');
    void this.root.offsetWidth;
    this.root.classList.add('is-leaving');
    this.root.setAttribute('aria-busy', 'true');
    window.setTimeout(() => {
      if (token !== this.transitionToken) return;
      this.root.removeAttribute('aria-busy');
      this.root.classList.add('hidden');
      this.root.classList.remove('is-leaving');
      onComplete();
    }, 560);
  }

  update(state: ClientLobbyState, chat: readonly LobbyChatMessage[], localPlayerId: string): void {
    this.localPlayerId = localPlayerId;
    this.code.textContent = state.roomCode;
    this.renderPlayers(state);
    const reason = state.startEligibility.reason;
    this.hint.textContent = ELIGIBILITY_LABELS[reason] ?? 'Crew not ready';
    this.hint.classList.toggle('ready', state.startEligibility.eligible);
    const me = state.players.find((player) => player.playerId === localPlayerId);
    const ready = me?.ready === true;
    this.readyButton.textContent = ready ? 'LOCKED IN — UNREADY' : 'READY FOR WAVE';
    this.readyButton.classList.toggle('ready', ready);
    this.renderChat(chat);
  }

  private renderPlayers(state: ClientLobbyState): void {
    this.playersHost.textContent = '';
    const orderedSeats: CrewSeat[] = ['driver', 'gunner'];
    const localPlayer = state.players.find((candidate) => candidate.playerId === this.localPlayerId) ?? null;
    for (const seat of orderedSeats) {
      const player = state.players.find((candidate) => candidate.seat === seat) ?? null;
      const card = el('article', `lobby-player lobby-player--${seat}`);
      card.dataset.seat = seat;
      if (player) card.dataset.playerId = player.playerId;
      card.classList.toggle('local', player?.playerId === this.localPlayerId);
      card.classList.toggle('reconnecting', player !== null && !player.connected);

      const seatHeader = el('div', 'lobby-player__seat');
      seatHeader.append(el('small', '', seat === 'driver' ? 'SEAT 01' : 'SEAT 02'), el('strong', '', seat.toUpperCase()));
      card.appendChild(seatHeader);

      const nameLine = el('div', 'lobby-name');
      if (player) {
        const isHost = player.playerId === state.hostPlayerId;
        const host = el('span', 'lobby-badge host', isHost ? 'HOST' : '');
        host.classList.toggle('host', isHost);
        const name = el('span', 'lobby-player__name');
        name.textContent = player.displayName;
        const you = el('span', 'lobby-badge you', player.playerId === this.localPlayerId ? 'YOU' : '');
        you.dataset.you = String(player.playerId === this.localPlayerId);
        nameLine.append(host, name, you);
      } else {
        nameLine.appendChild(el('span', 'lobby-player__name lobby-player__empty', 'AWAITING CREW'));
      }
      card.appendChild(nameLine);

      const duty = el('p', 'lobby-player__duty', seat === 'driver'
        ? 'Mobility // collision // survival'
        : 'Targeting // recoil // destruction');
      card.appendChild(duty);

      if (localPlayer) {
        const roleActions = el('div', 'lobby-seat-row');
        if (player?.playerId === this.localPlayerId) {
          const current = el('button', 'ui-compact-action selected', 'YOUR ROLE');
          current.id = `seat-${seat}`;
          current.type = 'button';
          current.disabled = true;
          roleActions.appendChild(current);
        } else if (!player) {
          const choose = el('button', 'ui-compact-action', `SWITCH TO ${seat.toUpperCase()}`);
          choose.id = `seat-${seat}`;
          choose.dataset.seat = seat;
          choose.type = 'button';
          choose.addEventListener('click', () => this.cb.onSelectSeat(seat));
          roleActions.appendChild(choose);
        } else if (!state.roleSwap) {
          const request = el('button', 'ui-compact-action', 'REQUEST ROLE SWAP');
          request.id = 'request-role-swap';
          request.type = 'button';
          request.addEventListener('click', () => this.cb.onRequestRoleSwap());
          roleActions.appendChild(request);
        } else if (state.roleSwap.requestedByPlayerId === this.localPlayerId) {
          const pending = el('button', 'ui-compact-action', 'SWAP REQUESTED');
          pending.id = 'role-swap-pending';
          pending.type = 'button';
          pending.disabled = true;
          roleActions.appendChild(pending);
        } else if (state.roleSwap.targetPlayerId === this.localPlayerId) {
          const accept = el('button', 'ui-compact-action selected', `ACCEPT — BECOME ${player.seat.toUpperCase()}`);
          accept.id = 'accept-role-swap';
          accept.type = 'button';
          accept.addEventListener('click', () => this.cb.onResolveRoleSwap(state.roleSwap!.requestId, true));
          const decline = el('button', 'ui-compact-action', 'DECLINE');
          decline.id = 'decline-role-swap';
          decline.type = 'button';
          decline.addEventListener('click', () => this.cb.onResolveRoleSwap(state.roleSwap!.requestId, false));
          roleActions.append(accept, decline);
        }
        if (roleActions.childElementCount > 0) card.appendChild(roleActions);
      }

      const status = el('div', 'lobby-status');
      status.append(el('span', '', 'INPUT'), el('strong', '', !player
        ? 'OPEN'
        : !player.connected
          ? 'RECONNECTING…'
          : player.ready
            ? 'READY'
            : 'STANDBY'));
      card.appendChild(status);
      this.playersHost.appendChild(card);
    }
  }

  private renderChat(chat: readonly LobbyChatMessage[]): void {
    this.chatHost.textContent = '';
    for (const message of chat) {
      const row = el('div', 'lobby-chat-message');
      const who = el('span', 'lobby-chat-who');
      who.textContent = `${message.displayName}: `;
      const text = el('span');
      text.textContent = message.text;
      row.append(who, text);
      this.chatHost.appendChild(row);
    }
    this.chatHost.scrollTop = this.chatHost.scrollHeight;
  }

  dispose(): void {
    this.transitionToken++;
    this.root.remove();
  }
}
