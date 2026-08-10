import type { MatchState, ModifierId, Role } from '../shared/types';
import type { AppFlowHandlers, FlowStateId, ResultOutcome } from './presentation/flowTypes';
import { SceneFlowPresenter } from './presentation/sceneFlowPresenter';
import { UiComponentRegistry } from './presentation/componentRegistry';
import { registerDefaultUiComponents } from './presentation/uiComponents';
import { HudProjector, type HudProjectionContext } from './presentation/hudViewModel';
import { HudRuntime } from './presentation/hudRuntime';
import type { PresentationWorldFactory } from './presentation/presentationWorld';
import { LobbyView } from './lobby/lobbyView';
import type { ClientLobbyState, LobbyChatMessage } from '../shared/lobby/lobbyTypes';
import { localization } from './localization/localizationService';
import {
  PhaseAnnouncementLayer,
  type PhaseAnnouncementImpact,
  type PhaseAnnouncementKind,
  type PhaseAnnouncementLocale,
} from './presentation/phaseAnnouncementLayer';

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
  private readonly projector = new HudProjector(localization);
  private readonly phaseAnnouncements: PhaseAnnouncementLayer;
  private handlers: Partial<HudHandlers> = {};
  private lobbyView: LobbyView | null = null;
  onUiSound: (() => void) | null = null;
  onPhaseAnnouncement: ((impact: PhaseAnnouncementImpact) => void) | null = null;

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
    this.flow = new SceneFlowPresenter(screens, this.root, registry, localization);
    this.flow.setUiSound(() => this.onUiSound?.());

    const hudHost = el('div', '');
    this.root.appendChild(hudHost);
    this.hudRuntime = new HudRuntime(hudHost, registry, this.root, localization);
    this.flow.setHudElement(this.hudRuntime.element!);
    this.hudRuntime.setResumeHandler(() => {
      this.sound();
      this.handlers.onResume?.();
    });
    this.hudRuntime.setPauseHandler(() => {
      this.sound();
      this.handlers.onPause?.();
    });
    this.phaseAnnouncements = new PhaseAnnouncementLayer(this.root, {
      onPresent: (impact) => this.onPhaseAnnouncement?.(impact),
      onActiveChange: (active) => {
        this.root.classList.toggle('phase-announcement-presenting', active);
        this.hudRuntime.element?.classList.toggle('phase-announcement-presenting', active);
      },
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

  setTrajectoryReticle(x: number, y: number, visible: boolean, blocked: boolean, verticalLocked = false) {
    this.hudRuntime.setTrajectoryReticle(x, y, visible, blocked, verticalLocked);
  }

  showScreen(name: string) {
    if (name !== 'lobby') this.hideLobby();
    this.flow.showState(name as FlowStateId);
  }

  setGameScreen(show: boolean) {
    if (show) this.hideLobby();
    else this.phaseAnnouncements.hide();
    this.flow.setGameVisible(show);
  }

  beginPhaseAnnouncementMatch(matchId: string, announceInitial: boolean): void {
    this.phaseAnnouncements.beginMatch(matchId, announceInitial);
  }

  previewPhaseAnnouncement(kind: PhaseAnnouncementKind, locale?: PhaseAnnouncementLocale): void {
    this.phaseAnnouncements.preview(kind, locale);
  }

  phaseAnnouncementDiagnostics() {
    return this.phaseAnnouncements.diagnostics;
  }

  showLobby(state: ClientLobbyState, chat: LobbyChatMessage[], localPlayerId: string) {
    let created = false;
    if (!this.lobbyView) {
      created = true;
      this.lobbyView = new LobbyView(this.screensHost, {
        onSelectSeat: (seat) => this.handlers.onLobbySeat?.(seat),
        onRequestRoleSwap: () => this.handlers.onLobbyRequestRoleSwap?.(),
        onResolveRoleSwap: (requestId, accept) => this.handlers.onLobbyResolveRoleSwap?.(requestId, accept),
        onReadyToggle: () => this.handlers.onLobbyReadyToggle?.(),
        onSendChat: (text) => this.handlers.onLobbyChatSend?.(text),
        onLeave: () => this.handlers.onLeave?.(),
        onCopy: (code) => this.handlers.onCopyRoomCode?.(code),
      }, localization);
    }
    this.lobbyView.update(state, chat, localPlayerId);
    if (created) {
      const view = this.lobbyView;
      this.flow.transitionMainToCrew(() => {
        if (this.lobbyView === view) view.enter();
      });
    }
  }

  updateLobbyState(state: ClientLobbyState, chat: LobbyChatMessage[], localPlayerId: string) {
    this.lobbyView?.update(state, chat, localPlayerId);
  }

  hideLobby() {
    this.lobbyView?.dispose();
    this.lobbyView = null;
  }

  leaveLobbyToMultiplayer() {
    const view = this.lobbyView;
    if (!view) {
      // Results and other content-driven crew screens still need their normal
      // SceneRuntime dismissal before the menu is selected.
      this.flow.showState('main');
      this.flow.showMainMenuPage('multiplayer');
      return;
    }
    view.leave(() => {
      if (this.lobbyView !== view) return;
      view.dispose();
      this.lobbyView = null;
      this.flow.showMainMenuFromCrew('multiplayer');
    });
  }

  setMainMenuNickname(nickname: string) {
    this.flow.setSceneContext('scene.mainMenu', { currentNickname: nickname });
  }

  showMainMenuPage(page: 'main' | 'multiplayer') {
    this.flow.showMainMenuPage(page);
  }

  setSettingsContext(patch: Record<string, unknown>) {
    this.flow.setSceneContext('scene.settings', patch);
  }

  setPauseContext(singleMode: boolean) {
    this.flow.setSceneContext('scene.pause', { singleMode });
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
    outcome: ResultOutcome = 'complete',
  ) {
    this.flow.showResults(results, rematch, outcome);
    this.onUiSound?.();
  }

  showSinglePlayerResults(
    results: { score: number; bestCombo: number; chargedCannonShots: number; fullChargeShots: number; kills: number; scrapCollected: number; links: number; wipeouts: number; grade: string; title: string; modifier: string },
    outcome: ResultOutcome = 'complete',
  ) {
    this.flow.showSinglePlayerResults(results, outcome);
    this.onUiSound?.();
  }

  updateRematch(rematch: { driver: boolean; gunner: boolean; modifier: string }) {
    this.flow.updateRematch(rematch);
  }

  update(state: MatchState, opts: HudProjectionContext) {
    this.phaseAnnouncements.observe(state.matchId, opts.stage);
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
