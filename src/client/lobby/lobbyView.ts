import type { ClientLobbyState, CrewSeat, LobbyChatMessage } from '../../shared/lobby/lobbyTypes';
import { localization } from '../localization/localizationService';
import type { LocalizationService } from '../localization/localizationTypes';

export interface LobbyViewCallbacks {
  onSelectSeat(seat: CrewSeat): void;
  onRequestRoleSwap(): void;
  onResolveRoleSwap(requestId: number, accept: boolean): void;
  onReadyToggle(): void;
  onSendChat(text: string): void;
  onLeave(): void;
  onCopy(code: string): void;
}

const ELIGIBILITY_KEYS: Record<string, string> = {
  eligible: 'ui.lobby.eligible',
  waiting_for_player: 'ui.lobby.waitingForPlayer',
  invalid_seats: 'ui.lobby.invalidSeats',
  role_swap_pending: 'ui.lobby.roleSwapPending',
  player_not_ready: 'ui.lobby.playerNotReady',
  player_disconnected: 'ui.lobby.playerDisconnected',
  content_unavailable: 'ui.lobby.contentUnavailable',
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
  private lastState: ClientLobbyState | null = null;
  private lastChat: readonly LobbyChatMessage[] = [];
  private readonly unsubscribeLocalization: () => void;

  constructor(
    container: HTMLElement,
    private readonly cb: LobbyViewCallbacks,
    private readonly i18n: LocalizationService = localization,
  ) {
    this.root = el('div', 'screen ui-screen lobby-v2 lobby-screen hidden');
    this.root.id = 'screen-ready';
    this.root.dataset.uiDensity = 'comfortable';

    const safeFrame = el('div', 'ui-safe-frame');
    safeFrame.setAttribute('aria-hidden', 'true');
    const backdrop = el('div', 'lobby-backdrop');
    backdrop.setAttribute('aria-hidden', 'true');

    const header = el('header', 'ui-topbar lobby-header');
    const brand = el('div', 'ui-unit-mark', 'RC / CREW LINK');
    const system = this.staticText('div', 'ui-system-state ui-shared-status lobby-system-status', 'ui.lobby.systemReady');
    header.appendChild(brand);

    const codeBox = el('div', 'lobby-code-strip');
    const codeLabel = this.staticText('small', '', 'ui.lobby.roomCode');
    this.code = el('strong', 'code');
    this.code.id = 'lobby-code';
    this.copyButton = this.staticText('button', 'ui-compact-action', 'ui.lobby.copy');
    this.copyButton.id = 'copy-code';
    this.copyButton.type = 'button';
    this.copyButton.addEventListener('click', () => this.cb.onCopy(this.code.textContent ?? ''));
    codeBox.append(codeLabel, this.code, this.copyButton);

    const body = el('div', 'lobby-body');
    const crew = el('section', 'lobby-crew');
    crew.dataset.i18nAria = 'ui.lobby.seatsAria';
    this.playersHost = el('div', 'lobby-players');
    this.playersHost.id = 'lobby-players';
    crew.appendChild(this.playersHost);

    const vehicle = el('div', 'lobby-vehicle-stage');
    vehicle.setAttribute('aria-hidden', 'true');
    const vehicleMark = el('div', 'lobby-vehicle-mark');
    vehicleMark.append(this.staticText('span', '', 'ui.lobby.sharedChassis'), el('strong', '', 'RC–07'));
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
    this.leaveButton = this.staticText('button', 'ui-text-action lobby-leave', 'ui.lobby.leave');
    this.leaveButton.id = 'lobby-leave';
    this.leaveButton.type = 'button';
    this.leaveButton.addEventListener('click', () => this.cb.onLeave());
    actions.append(this.hint, this.leaveButton, this.readyButton);

    const chat = el('section', 'lobby-chat');
    const chatHeader = el('div', 'lobby-chat__header');
    chatHeader.append(this.staticText('h3', '', 'ui.lobby.chat'), this.staticText('span', '', 'ui.lobby.chatFocus'));
    this.chatHost = el('div', 'lobby-chat-messages');
    this.chatHost.id = 'lobby-chat-messages';
    const chatRow = el('div', 'lobby-chat-row');
    this.chatInput = el('input', 'lobby-chat-input');
    this.chatInput.id = 'lobby-chat-input';
    this.chatInput.maxLength = 200;
    this.chatInput.dataset.i18nPlaceholder = 'ui.lobby.chatPlaceholder';
    const send = this.staticText('button', 'ui-compact-action', 'ui.lobby.send');
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
    this.refreshStatic();
    this.unsubscribeLocalization = this.i18n.subscribe(() => {
      this.refreshStatic();
      if (this.lastState) this.update(this.lastState, this.lastChat, this.localPlayerId);
    });
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
    this.lastState = state;
    this.lastChat = chat;
    this.localPlayerId = localPlayerId;
    this.code.textContent = state.roomCode;
    this.renderPlayers(state);
    const reason = state.startEligibility.reason;
    this.hint.textContent = this.i18n.t(ELIGIBILITY_KEYS[reason] ?? 'ui.lobby.notReady');
    this.hint.classList.toggle('ready', state.startEligibility.eligible);
    const me = state.players.find((player) => player.playerId === localPlayerId);
    const ready = me?.ready === true;
    this.readyButton.textContent = this.i18n.t(ready ? 'ui.lobby.unready' : 'ui.lobby.readyForWave');
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
      const role = this.i18n.t(`ui.role.${seat}`);
      seatHeader.append(el('small', '', this.i18n.t('ui.lobby.seat', { number: seat === 'driver' ? '01' : '02' })), el('strong', '', role));
      card.appendChild(seatHeader);

      const nameLine = el('div', 'lobby-name');
      if (player) {
        const isHost = player.playerId === state.hostPlayerId;
        const host = el('span', 'lobby-badge host', isHost ? this.i18n.t('ui.lobby.host') : '');
        host.classList.toggle('host', isHost);
        const name = el('span', 'lobby-player__name');
        name.textContent = player.displayName;
        const you = el('span', 'lobby-badge you', player.playerId === this.localPlayerId ? this.i18n.t('ui.lobby.you') : '');
        you.dataset.you = String(player.playerId === this.localPlayerId);
        nameLine.append(host, name, you);
      } else {
        nameLine.appendChild(el('span', 'lobby-player__name lobby-player__empty', this.i18n.t('ui.lobby.awaiting')));
      }
      card.appendChild(nameLine);

      const duty = el('p', 'lobby-player__duty', seat === 'driver'
        ? this.i18n.t('ui.lobby.driverDuty')
        : this.i18n.t('ui.lobby.gunnerDuty'));
      card.appendChild(duty);

      if (localPlayer) {
        const roleActions = el('div', 'lobby-seat-row');
        if (player?.playerId === this.localPlayerId) {
          const current = el('button', 'ui-compact-action selected', this.i18n.t('ui.lobby.yourRole'));
          current.id = `seat-${seat}`;
          current.type = 'button';
          current.disabled = true;
          roleActions.appendChild(current);
        } else if (!player) {
          const choose = el('button', 'ui-compact-action', this.i18n.t('ui.lobby.switchRole', { role }));
          choose.id = `seat-${seat}`;
          choose.dataset.seat = seat;
          choose.type = 'button';
          choose.addEventListener('click', () => this.cb.onSelectSeat(seat));
          roleActions.appendChild(choose);
        } else if (!state.roleSwap) {
          const request = el('button', 'ui-compact-action', this.i18n.t('ui.lobby.requestSwap'));
          request.id = 'request-role-swap';
          request.type = 'button';
          request.addEventListener('click', () => this.cb.onRequestRoleSwap());
          roleActions.appendChild(request);
        } else if (state.roleSwap.requestedByPlayerId === this.localPlayerId) {
          const pending = el('button', 'ui-compact-action', this.i18n.t('ui.lobby.swapRequested'));
          pending.id = 'role-swap-pending';
          pending.type = 'button';
          pending.disabled = true;
          roleActions.appendChild(pending);
        } else if (state.roleSwap.targetPlayerId === this.localPlayerId) {
          const accept = el('button', 'ui-compact-action selected', this.i18n.t('ui.lobby.acceptRole', { role: this.i18n.t(`ui.role.${player.seat}`) }));
          accept.id = 'accept-role-swap';
          accept.type = 'button';
          accept.addEventListener('click', () => this.cb.onResolveRoleSwap(state.roleSwap!.requestId, true));
          const decline = el('button', 'ui-compact-action', this.i18n.t('ui.lobby.decline'));
          decline.id = 'decline-role-swap';
          decline.type = 'button';
          decline.addEventListener('click', () => this.cb.onResolveRoleSwap(state.roleSwap!.requestId, false));
          roleActions.append(accept, decline);
        }
        if (roleActions.childElementCount > 0) card.appendChild(roleActions);
      }

      const status = el('div', 'lobby-status');
      status.append(el('span', '', this.i18n.t('ui.lobby.input')), el('strong', '', !player
        ? this.i18n.t('ui.lobby.open')
        : !player.connected
          ? this.i18n.t('ui.lobby.reconnecting')
          : player.ready
            ? this.i18n.t('ui.status.ready')
            : this.i18n.t('ui.lobby.standby')));
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
    this.unsubscribeLocalization();
    this.root.remove();
  }

  private staticText<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, key: string): HTMLElementTagNameMap[K] {
    const node = el(tag, className, this.i18n.t(key));
    node.dataset.i18n = key;
    return node;
  }

  private refreshStatic(): void {
    for (const node of this.root.querySelectorAll<HTMLElement>('[data-i18n]')) {
      node.textContent = this.i18n.t(node.dataset.i18n!);
    }
    for (const node of this.root.querySelectorAll<HTMLElement>('[data-i18n-aria]')) {
      node.setAttribute('aria-label', this.i18n.t(node.dataset.i18nAria!));
    }
    for (const node of this.root.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]')) {
      node.placeholder = this.i18n.t(node.dataset.i18nPlaceholder!);
    }
  }
}
