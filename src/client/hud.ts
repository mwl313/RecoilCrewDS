import type { MatchState, ModifierId, Role } from '../shared/types';
import type { AppFlowHandlers, FlowStateId } from './presentation/flowTypes';
import { SceneFlowPresenter } from './presentation/sceneFlowPresenter';
import { UiComponentRegistry } from './presentation/componentRegistry';
import { registerDefaultUiComponents } from './presentation/uiComponents';
import { HudProjector, type HudProjectionContext } from './presentation/hudViewModel';
import { HudRuntime } from './presentation/hudRuntime';
import type { PresentationWorldFactory } from './presentation/presentationWorld';
import { LobbyView } from './lobby/lobbyView';
import type { ClientLobbyState, LobbyChatMessage } from '../shared/lobby/lobbyTypes';

export interface HudHandlers extends AppFlowHandlers {}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}

/**
 * Presentation facade. Screens are content-driven through SceneFlowPresenter
 * + SceneRuntime; the gameplay HUD is content-driven through HudRuntime
 * (content/hud/gameplay.json) and projected through HudProjector.
 */
export class Hud {
  root: HTMLElement;
  private readonly flow: SceneFlowPresenter;
  private readonly screensHost: HTMLElement;
  private readonly hudRuntime: HudRuntime;
  private readonly projector = new HudProjector();
  private handlers: Partial<HudHandlers> = {};
  private lobbyView: LobbyView | null = null;
  onUiSound: (() => void) | null = null;

  private sound() {
    this.onUiSound?.();
  }

  constructor() {
    this.root = el('div', 'app-root');
    document.getElementById('app')!.appendChild(this.root);

    const screens = el('div', 'screens');
    this.screensHost = screens;
    this.root.appendChild(screens);
    const registry = new UiComponentRegistry();
    registerDefaultUiComponents(registry);
    this.flow = new SceneFlowPresenter(screens, this.root, registry);
    this.flow.setUiSound(() => this.onUiSound?.());

    const hudHost = el('div', '');
    this.root.appendChild(hudHost);
    this.hudRuntime = new HudRuntime(hudHost, registry, this.root);
    this.flow.setHudElement(this.hudRuntime.element!);
    this.hudRuntime.setResumeHandler(() => {
      this.sound();
      this.handlers.onResume?.();
    });
    this.hudRuntime.setPauseHandler(() => {
      this.sound();
      this.handlers.onPause?.();
    });
  }

  bind(h: HudHandlers) {
    this.handlers = h;
    this.flow.bind(h);
  }

  setPresentationFactory(fn: PresentationWorldFactory | null): void {
    this.flow.setPresentationFactory(fn);
  }

  setAssetUrlResolver(fn: ((id: string) => string | null) | null): void {
    this.flow.setAssetUrlResolver(fn);
    this.hudRuntime.setAssetUrlResolver(fn);
  }

  setTrajectoryReticle(x: number, y: number, visible: boolean, blocked: boolean) {
    this.hudRuntime.setTrajectoryReticle(x, y, visible, blocked);
  }

  showScreen(name: string) {
    if (name !== 'lobby') this.hideLobby();
    this.flow.showState(name as FlowStateId);
  }

  setGameScreen(show: boolean) {
    if (show) this.hideLobby();
    this.flow.setGameVisible(show);
  }

  showLobby(state: ClientLobbyState, chat: LobbyChatMessage[], localPlayerId: string) {
    if (!this.lobbyView) {
      this.lobbyView = new LobbyView(this.screensHost, {
        onSelectSeat: (seat) => this.handlers.onLobbySeat?.(seat),
        onReadyToggle: () => this.handlers.onLobbyReadyToggle?.(),
        onSendChat: (text) => this.handlers.onLobbyChatSend?.(text),
        onLeave: () => this.handlers.onLeave?.(),
        onCopy: (code) => this.handlers.onCopyRoomCode?.(code),
      });
    }
    this.lobbyView.update(state, chat, localPlayerId);
    this.flow.setGameVisible(false);
    // Hide every presentation scene so only the lobby view is visible.
    const presenter = this.flow as unknown as { runtimes: Map<string, { element?: HTMLElement | null }> };
    for (const runtime of presenter.runtimes.values()) {
      runtime.element?.classList.add('hidden');
    }
  }

  updateLobbyState(state: ClientLobbyState, chat: LobbyChatMessage[], localPlayerId: string) {
    this.lobbyView?.update(state, chat, localPlayerId);
  }

  hideLobby() {
    this.lobbyView?.dispose();
    this.lobbyView = null;
  }

  setMainMenuNickname(nickname: string) {
    this.flow.setSceneContext('scene.mainMenu', { currentNickname: `PLAYING AS: ${nickname}` });
  }

  setSettingsContext(patch: Record<string, unknown>) {
    this.flow.setSceneContext('scene.settings', patch);
  }

  setTheme(theme: 'driver' | 'gunner' | 'singlePlayer') {
    this.hudRuntime.setTheme(theme);
  }

  setCreateCode(code: string) {
    this.flow.setCreateCode(code);
  }

  updateLobby(driverReady: boolean, gunnerReady: boolean, myRole: Role) {
    this.flow.updateLobby(driverReady, gunnerReady, myRole);
  }

  showCountdown(n: number) {
    this.flow.showCountdown(n);
  }

  hideCountdown() {
    this.flow.hideCountdown();
  }

  showError(message: string) {
    this.flow.showError(message);
  }

  showCreateError(message: string) {
    this.flow.setCreateError(message);
  }

  showJoinError(message: string) {
    this.flow.showJoinError(message);
  }

  showResults(
    results: { score: number; bestCombo: number; chargedCannonShots: number; fullChargeShots: number; kills: number; scrapCollected: number; links: number; wipeouts: number; grade: string; title: string; modifier: string },
    rematch: { driver: boolean; gunner: boolean; modifier: string },
  ) {
    this.flow.showResults(results, rematch);
    this.onUiSound?.();
  }

  showSinglePlayerResults(
    results: { score: number; bestCombo: number; chargedCannonShots: number; fullChargeShots: number; kills: number; scrapCollected: number; links: number; wipeouts: number; grade: string; title: string; modifier: string },
  ) {
    this.flow.showSinglePlayerResults(results);
    this.onUiSound?.();
  }

  updateRematch(rematch: { driver: boolean; gunner: boolean; modifier: string }) {
    this.flow.updateRematch(rematch);
  }

  update(state: MatchState, opts: HudProjectionContext) {
    this.hudRuntime.apply(this.projector.project(state, opts));
  }

  floatText(text: string, kind = 'score') {
    this.hudRuntime.addPopup(text, kind);
  }

  comboPulse() {
    const combo = this.hudRuntime.getNode('combo')?.element;
    if (!combo) return;
    combo.classList.remove('pulse');
    void combo.offsetWidth;
    combo.classList.add('pulse');
  }

  onEvent(ev: { type: string; label?: string; value?: number; kind?: string }) {
    if (ev.type === 'comboChange') this.comboPulse();
    if (ev.type === 'pickup' || ev.type === 'score') this.floatText(ev.label ?? '', ev.kind ?? 'score');
    if (ev.type === 'damage') {
      this.root.classList.remove('flash-damage');
      void this.root.offsetWidth;
      this.root.classList.add('flash-damage');
    }
    if (ev.type === 'dash') {
      const dash = this.hudRuntime.getNode('dash-ind')?.element;
      if (!dash) return;
      dash.classList.remove('burst');
      void dash.offsetWidth;
      dash.classList.add('burst');
    }
  }
}

export type { ModifierId };
