import { copyText, isValidRoomCode } from '../clipboard';
import {
  DEFAULT_PRESENTATION_FLOW_ID,
  PRESENTATION_FLOWS,
  PRESENTATION_SCENES,
} from '../../generated/presentationContent.generated';
import { SceneActionRegistry } from './actionRegistry';
import {
  type AppFlowHandlers,
  type FlowStateId,
  type RematchPayload,
  type ResultOutcome,
  type ResultsPayload,
} from './flowTypes';
import { SceneRuntime, type SceneRuntimeServices } from './sceneRuntime';
import { UiComponentRegistry } from './componentRegistry';
import type { PresentationWorldFactory } from './presentationWorld';
import { localization } from '../localization/localizationService';
import type { LocalizationService, Locale } from '../localization/localizationTypes';

/**
 * SceneFlowPresenter: presentation-side flow presenter.
 *
 * Ownership boundary (documented after the Refractor 02 verification audit):
 * the application state machine and network-driven transitions live in
 * src/client/main.ts. This class owns the presentation side only: scene
 * runtime selection/caching, enter/leave transitions, hybrid presentation
 * world lifecycle, theme root, and allowlisted action execution.
 */
export class SceneFlowPresenter {
  private readonly runtimes = new Map<string, SceneRuntime>();
  private readonly actions = new SceneActionRegistry();
  private handlers: Partial<AppFlowHandlers> = {};
  private currentState: FlowStateId = 'boot';
  private currentSceneId = '';
  private copyFeedbackT = 0;
  private hudElement: HTMLElement | null = null;
  private uiSound: (() => void) | null = null;
  private presentationFactory: PresentationWorldFactory | null = null;
  private assetUrlResolver: ((id: string) => string | null) | null = null;
  private activeWorld: { start(): void; dispose(): void } | null = null;
  private titleExitPending = false;
  private choreographyToken = 0;
  private menuPage: 'main' | 'multiplayer' = 'main';
  private menuSwapPending = false;
  private menuSwapToken = 0;
  private menuSwapCleanup: (() => void) | null = null;

  constructor(
    private readonly screensContainer: HTMLElement,
    private readonly themeRoot: HTMLElement,
    private readonly registry: UiComponentRegistry,
    private readonly i18n: LocalizationService = localization,
  ) {
    this.registerDefaultActions();
  }

  get actionRegistry(): SceneActionRegistry {
    return this.actions;
  }

  get state(): FlowStateId {
    return this.currentState;
  }

  get sceneId(): string {
    return this.currentSceneId;
  }

  /** Select a command page without animating or rebuilding the menu scene. */
  showMainMenuPage(page: 'main' | 'multiplayer'): void {
    if (this.currentState !== 'main') return;
    const runtime = this.runtimes.get('scene.mainMenu');
    if (runtime) this.setMenuPageImmediate(runtime, page);
  }

  /** Split the active multiplayer menu outward before an external crew view takes over. */
  transitionMainToCrew(onComplete: () => void): void {
    const runtime = this.runtimes.get('scene.mainMenu');
    const root = runtime?.element;
    const sentinel = runtime?.getNode('main-panel')?.element;
    if (this.currentState !== 'main' || !root || !sentinel || this.prefersReducedMotion()) {
      this.hideAllScenes();
      onComplete();
      return;
    }

    const token = ++this.choreographyToken;
    root.setAttribute('aria-busy', 'true');
    root.classList.remove('ui-choreography--menu-exit');
    void root.offsetWidth;
    root.classList.add('ui-choreography--menu-exit');

    let fallback = 0;
    const finish = (): void => {
      if (token !== this.choreographyToken) return;
      window.clearTimeout(fallback);
      sentinel.removeEventListener('animationend', onAnimationEnd);
      root.removeAttribute('aria-busy');
      root.classList.remove('ui-choreography--menu-exit');
      this.hideAllScenes();
      onComplete();
    };
    const onAnimationEnd = (event: AnimationEvent): void => {
      if (event.target !== sentinel) return;
      if (event.animationName && event.animationName !== 'ui-scene-leave-left') return;
      finish();
    };
    sentinel.addEventListener('animationend', onAnimationEnd);
    fallback = window.setTimeout(finish, 600);
  }

  /** Restore the persistent menu directly to Multiplayer after a crew dismissal. */
  showMainMenuFromCrew(page: 'main' | 'multiplayer' = 'multiplayer'): void {
    const runtime = this.ensureRuntimeFor('scene.mainMenu');
    const root = runtime.element;
    this.currentState = 'main';
    this.currentSceneId = 'scene.mainMenu';
    this.setMenuPageImmediate(runtime, page);
    root?.classList.remove('hidden', 'scene-enter', 'scene-exit', 'ui-choreography--menu-exit');
    if (this.hudElement) this.hudElement.classList.add('hidden');
    this.syncPresentationWorld('main');
    this.playDirectionalEntrance(runtime);
  }

  bind(handlers: AppFlowHandlers): void {
    this.handlers = handlers;
  }

  setHudElement(element: HTMLElement): void {
    this.hudElement = element;
  }

  /**
   * Gameplay visibility (mirrors the legacy HUD contract): when gameplay is
   * shown, EVERY scene screen is hidden and the HUD is shown; when hidden,
   * every screen and the HUD are hidden. Also tears down any hybrid
   * presentation world so a menu background never renders behind gameplay.
   */
  setGameVisible(show: boolean): void {
    this.hideAllScenes();
    if (this.hudElement) this.hudElement.classList.toggle('hidden', !show);
    if (show) this.disposePresentationWorld();
  }

  /** Hide cached content-driven scenes while an external composite view is active. */
  hideAllScenes(): void {
    for (const runtime of this.runtimes.values()) runtime.element?.classList.add('hidden');
    this.disposePresentationWorld();
  }

  setUiSound(fn: () => void): void {
    this.uiSound = fn;
  }

  setPresentationFactory(fn: PresentationWorldFactory | null): void {
    this.presentationFactory = fn;
  }

  setAssetUrlResolver(fn: ((id: string) => string | null) | null): void {
    this.assetUrlResolver = fn;
  }

  showState(stateId: FlowStateId): void {
    const flow = PRESENTATION_FLOWS[DEFAULT_PRESENTATION_FLOW_ID];
    const state = flow.states.find((s) => s.id === stateId);
    if (!state) throw new Error(`unknown flow state: ${stateId}`);
    const previousState = this.currentState;
    this.currentState = stateId;
    const runtime = this.ensureRuntimeFor(state.sceneId);
    const previous = this.currentSceneId && this.currentSceneId !== state.sceneId
      ? this.runtimes.get(this.currentSceneId)
      : null;
    this.currentSceneId = state.sceneId;

    // Settings, How To, and Credits are menu overlays, not replacement screens. Keep
    // the main menu DOM and its presentation world alive beneath them so the
    // backdrop is the exact screen the player opened the overlay from.
    if (this.isMenuOverlayState(stateId) && previousState === 'main') {
      runtime.enter();
      if (this.hudElement) this.hudElement.classList.add('hidden');
      if (!this.activeWorld) this.syncPresentationWorld('main');
      return;
    }
    if (stateId === 'main' && this.isMenuOverlayState(previousState)) {
      previous?.leave();
      runtime.element?.classList.remove('hidden');
      if (this.hudElement) this.hudElement.classList.add('hidden');
      if (!this.activeWorld) this.syncPresentationWorld('main');
      return;
    }

    // Replay enter/leave per transition (scenes are cached, not rebuilt).
    previous?.leave();
    runtime.enter();
    if (stateId === 'main') this.resetMenuPage(runtime);
    if (this.hudElement) this.hudElement.classList.toggle('hidden', stateId !== 'game');
    this.syncPresentationWorld(stateId);
    if (previousState === 'boot' && stateId === 'main') {
      this.playDirectionalEntrance(runtime);
    }
  }

  private isMenuOverlayState(stateId: FlowStateId): boolean {
    return stateId === 'settings' || stateId === 'howto' || stateId === 'credits' || stateId === 'join';
  }

  private syncPresentationWorld(stateId: FlowStateId): void {
    this.disposePresentationWorld();
    if (!this.presentationFactory || stateId !== 'main') return;
    const scene = PRESENTATION_SCENES['scene.mainMenu'];
    if (scene.type !== 'hybrid') return;
    const container = this.runtimes.get('scene.mainMenu')?.element;
    if (!container) return;
    this.activeWorld = this.presentationFactory(scene, container);
    // The flow is the single lifecycle owner: the factory only constructs,
    // and the presenter starts (and later disposes) the render loop.
    this.activeWorld?.start();
  }

  private disposePresentationWorld(): void {
    this.activeWorld?.dispose();
    this.activeWorld = null;
  }

  /**
   * Run the authored split-title exit before handing control to the app flow.
   * The CSS role classes make the choreography reusable without coupling the
   * presenter to individual title elements.
   */
  private playTitleExit(onComplete: () => void): void {
    if (this.titleExitPending) return;
    const runtime = this.runtimes.get('scene.boot');
    const root = runtime?.element;
    const sentinel = runtime?.getNode('boot-hint')?.element;
    if (this.currentState !== 'boot' || !root || !sentinel || this.prefersReducedMotion()) {
      onComplete();
      return;
    }

    this.titleExitPending = true;
    const token = ++this.choreographyToken;
    root.setAttribute('aria-busy', 'true');
    root.classList.remove('ui-choreography--title-exit');
    void root.offsetWidth;
    root.classList.add('ui-choreography--title-exit');

    let fallback = 0;
    const finish = (): void => {
      if (!this.titleExitPending || token !== this.choreographyToken) return;
      this.titleExitPending = false;
      window.clearTimeout(fallback);
      sentinel.removeEventListener('animationend', onAnimationEnd);
      root.removeAttribute('aria-busy');
      onComplete();
      // Keep the filled exit pose until the boot scene has completed its
      // short scene-level fade; otherwise its children visibly snap back.
      window.setTimeout(() => root.classList.remove('ui-choreography--title-exit'), 220);
    };
    const onAnimationEnd = (event: AnimationEvent): void => {
      if (event.target !== sentinel) return;
      if (event.animationName && event.animationName !== 'ui-title-control-drop') return;
      finish();
    };
    sentinel.addEventListener('animationend', onAnimationEnd);
    fallback = window.setTimeout(finish, 600);
  }

  /** Replay the reusable left/right arrival contract on a newly shown scene. */
  private playDirectionalEntrance(runtime: SceneRuntime): void {
    const root = runtime.element;
    if (!root || this.prefersReducedMotion()) return;
    const token = ++this.choreographyToken;
    root.classList.remove('ui-choreography--split-enter');
    void root.offsetWidth;
    root.classList.add('ui-choreography--split-enter');
    window.setTimeout(() => {
      if (token === this.choreographyToken) root.classList.remove('ui-choreography--split-enter');
    }, 680);
  }

  private prefersReducedMotion(): boolean {
    return typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * Swap only the command page inside the persistent menu archetype. The
   * environment, title, instrumentation, and presentation world never leave.
   */
  private swapMenuPage(target: 'main' | 'multiplayer'): void {
    if (this.currentState !== 'main' || this.menuSwapPending || target === this.menuPage) return;
    const runtime = this.runtimes.get('scene.mainMenu');
    const stack = runtime?.getNode('main-menu-stack')?.element;
    const outgoingId = this.menuPage === 'main' ? 'main-menu-page' : 'multiplayer-menu-page';
    const incomingId = target === 'main' ? 'main-menu-page' : 'multiplayer-menu-page';
    const outgoing = runtime?.getNode(outgoingId)?.element;
    const incoming = runtime?.getNode(incomingId)?.element;
    if (!stack || !outgoing || !incoming) return;

    if (this.prefersReducedMotion()) {
      outgoing.classList.add('hidden');
      incoming.classList.remove('hidden');
      this.menuPage = target;
      return;
    }

    this.menuSwapPending = true;
    const token = ++this.menuSwapToken;
    incoming.classList.remove('is-leaving', 'is-entering');
    incoming.classList.add('hidden');
    outgoing.classList.remove('is-leaving', 'is-entering');
    void stack.offsetWidth;
    stack.classList.add('is-swapping');
    outgoing.classList.add('is-leaving');

    let phaseFallback = 0;
    const cleanup = (): void => {
      window.clearTimeout(phaseFallback);
      outgoing.removeEventListener('animationend', onOutgoingEnd);
      incoming.removeEventListener('animationend', onIncomingEnd);
    };
    const finish = (): void => {
      if (!this.menuSwapPending || token !== this.menuSwapToken) return;
      cleanup();
      this.menuSwapCleanup = null;
      this.menuSwapPending = false;
      outgoing.classList.remove('is-leaving');
      outgoing.classList.add('hidden');
      incoming.classList.remove('is-entering');
      stack.classList.remove('is-swapping');
      this.menuPage = target;
    };

    const beginIncoming = (): void => {
      if (!this.menuSwapPending || token !== this.menuSwapToken) return;
      window.clearTimeout(phaseFallback);
      outgoing.removeEventListener('animationend', onOutgoingEnd);
      outgoing.classList.remove('is-leaving');
      outgoing.classList.add('hidden');
      incoming.classList.remove('hidden');
      void incoming.offsetWidth;
      incoming.classList.add('is-entering');
      incoming.addEventListener('animationend', onIncomingEnd);
      phaseFallback = window.setTimeout(finish, 560);
    };
    const onOutgoingEnd = (event: AnimationEvent): void => {
      if (event.target !== outgoing) return;
      if (event.animationName && event.animationName !== 'ui-menu-page-depart') return;
      beginIncoming();
    };
    const onIncomingEnd = (event: AnimationEvent): void => {
      if (event.target !== incoming) return;
      if (event.animationName && event.animationName !== 'ui-menu-page-arrive') return;
      finish();
    };
    outgoing.addEventListener('animationend', onOutgoingEnd);
    phaseFallback = window.setTimeout(beginIncoming, 560);
    this.menuSwapCleanup = cleanup;
  }

  private resetMenuPage(runtime: SceneRuntime): void {
    this.setMenuPageImmediate(runtime, 'main');
  }

  private setMenuPageImmediate(runtime: SceneRuntime, target: 'main' | 'multiplayer'): void {
    const main = runtime.getNode('main-menu-page')?.element;
    const multiplayer = runtime.getNode('multiplayer-menu-page')?.element;
    const stack = runtime.getNode('main-menu-stack')?.element;
    if (!main || !multiplayer || !stack) return;
    this.menuSwapCleanup?.();
    this.menuSwapCleanup = null;
    this.menuSwapToken++;
    this.menuSwapPending = false;
    this.menuPage = target;
    stack.classList.remove('is-swapping');
    main.classList.remove('is-leaving', 'is-entering');
    multiplayer.classList.remove('is-leaving', 'is-entering');
    main.classList.toggle('hidden', target !== 'main');
    multiplayer.classList.toggle('hidden', target !== 'multiplayer');
  }

  private services(): SceneRuntimeServices {
    return {
      actions: this.actions,
      registry: this.registry,
      addPopup: () => undefined,
      resolveAssetUrl: (id) => this.assetUrlResolver?.(id) ?? null,
      localization: this.i18n,
    };
  }

  /** Update the binding context of one scene runtime. */
  setSceneContext(sceneId: string, patch: Record<string, unknown>): void {
    const runtime = this.runtimes.get(sceneId);
    runtime?.setContext(patch);
    // Context may be needed before the scene is first shown (e.g. results).
    if (!runtime) {
      this.pendingContext.set(sceneId, { ...(this.pendingContext.get(sceneId) ?? {}), ...patch });
    }
  }

  private readonly pendingContext = new Map<string, Record<string, unknown>>();

  private ensureRuntimeFor(sceneId: string): SceneRuntime {
    let runtime = this.runtimes.get(sceneId);
    if (!runtime) {
      const scene = PRESENTATION_SCENES[sceneId];
      if (!scene) throw new Error(`unknown scene: ${sceneId}`);
      runtime = new SceneRuntime(this.services(), this.screensContainer);
      this.runtimes.set(sceneId, runtime);
      void runtime.load(scene, this.pendingContext.get(sceneId) ?? {});
      this.pendingContext.delete(sceneId);
    }
    return runtime;
  }

  sceneRuntime(sceneId: string): SceneRuntime | undefined {
    return this.runtimes.get(sceneId);
  }

  setTheme(role: 'driver' | 'gunner'): void {
    this.themeRoot.dataset.theme = role;
  }

  showResults(results: ResultsPayload, rematch: RematchPayload, outcome: ResultOutcome = 'complete'): void {
    this.setSceneContext('scene.results', {
      ...resultOutcomeContext(outcome, this.i18n),
      grade: results.grade,
      title: localizedResultTitle(results, this.i18n),
      score: results.score.toLocaleString(),
      crewMode: true,
      singleMode: false,
      stats: [
        { label: this.i18n.t('ui.results.bestCombo'), value: `×${results.bestCombo}` },
        { label: this.i18n.t('ui.results.chargedShots'), value: String(results.chargedCannonShots) },
        { label: this.i18n.t('ui.results.fullCharge'), value: String(results.fullChargeShots) },
        { label: this.i18n.t('ui.results.kills'), value: String(results.kills) },
      ],
    });
    this.updateRematch(rematch);
    this.ensureRuntimeFor('scene.results');
    this.showState('results');
  }

  /** Single Player results: local restart, no crew rematch vote. */
  showSinglePlayerResults(results: ResultsPayload, outcome: ResultOutcome = 'complete'): void {
    this.setSceneContext('scene.results', {
      ...resultOutcomeContext(outcome, this.i18n),
      grade: results.grade,
      title: localizedResultTitle(results, this.i18n),
      score: results.score.toLocaleString(),
      crewMode: false,
      singleMode: true,
      stats: [
        { label: this.i18n.t('ui.results.bestCombo'), value: `×${results.bestCombo}` },
        { label: this.i18n.t('ui.results.chargedShots'), value: String(results.chargedCannonShots) },
        { label: this.i18n.t('ui.results.fullCharge'), value: String(results.fullChargeShots) },
        { label: this.i18n.t('ui.results.kills'), value: String(results.kills) },
      ],
    });
    this.ensureRuntimeFor('scene.results');
    this.showState('results');
  }

  updateRematch(_rematch: RematchPayload): void {
    // Rematch readiness remains authoritative, but the results scene now uses
    // one standard rematch action instead of exposing modifier selection.
  }

  showCountdown(n: number): void {
    if (n <= 0) {
      this.setSceneContext('scene.countdown', { value: this.i18n.t('ui.countdown.go'), sub: '' });
    } else {
      this.setSceneContext('scene.countdown', {
        value: String(n),
        sub: n === 3 ? this.i18n.t('ui.countdown.ready') : n === 2 ? this.i18n.t('ui.countdown.roles') : this.i18n.t('ui.countdown.brace'),
      });
    }
    const runtime = this.ensureRuntimeFor('scene.countdown');
    runtime.element?.classList.remove('pop');
    void runtime.element?.offsetWidth;
    runtime.element?.classList.add('pop');
  }

  hideCountdown(): void {
    this.runtimes.get('scene.countdown')?.element?.classList.add('hidden');
  }

  showError(message: string): void {
    this.setSceneContext('scene.error', { message });
    this.ensureRuntimeFor('scene.error');
    this.showState('error');
  }

  showJoinError(message: string): void {
    this.setSceneContext('scene.joinCrew', { message });
  }

  /** Surface a create-room failure on the create screen (never a silent empty code). */
  setCreateError(message: string): void {
    this.setSceneContext('scene.createCrew', { status: message, copyLabel: this.i18n.t('ui.create.copy'), copyDisabled: true });
  }

  setCreateCode(code: string): void {
    const valid = isValidRoomCode(code);
    this.setSceneContext('scene.createCrew', { code, copyLabel: this.i18n.t('ui.create.copy'), copyDisabled: !valid });
    this.setSceneContext('scene.readyLobby', { roomCode: code });
  }

  updateLobby(driverReady: boolean, gunnerReady: boolean, myRole: 'driver' | 'gunner'): void {
    const mine = myRole === 'driver' ? driverReady : gunnerReady;
    this.setSceneContext('scene.readyLobby', {
      driverReady,
      gunnerReady,
      driverState: this.i18n.t(driverReady ? 'ui.status.ready' : 'ui.status.waiting'),
      gunnerState: this.i18n.t(gunnerReady ? 'ui.status.ready' : 'ui.status.waiting'),
      readyLabel: `${this.i18n.t('ui.status.ready')}${mine ? ' ✓' : ''}`,
    });
  }

  private async copyRoomCode(): Promise<void> {
    const runtime = this.runtimes.get('scene.createCrew');
    const code = runtime?.getNode('create-code')?.element.textContent ?? '';
    if (!isValidRoomCode(code)) {
      this.setSceneContext('scene.createCrew', { copyLabel: this.i18n.t('ui.create.copyFailed'), copyDisabled: true });
      return;
    }
    const ok = await copyText(code);
    this.setSceneContext('scene.createCrew', { copyLabel: this.i18n.t(ok ? 'ui.create.copied' : 'ui.create.copyFailed') });
    const token = ++this.copyFeedbackT;
    setTimeout(() => {
      if (token === this.copyFeedbackT) {
        this.setSceneContext('scene.createCrew', { copyLabel: this.i18n.t('ui.create.copy') });
        const btn = this.runtimes.get('scene.createCrew')?.getNode('copy-code');
        btn?.element.classList.remove('copied', 'failed');
      }
    }, 1600);
  }

  private registerDefaultActions(): void {
    const h = (): Partial<AppFlowHandlers> => this.handlers;
    const ui = (fn: () => void): void => {
      this.uiSound?.();
      fn();
    };
    this.actions.register('app.enter', () => {
      this.uiSound?.();
      this.playTitleExit(() => h().onBoot?.());
    });
    this.actions.register('app.openMultiplayer', () => {
      this.uiSound?.();
      this.swapMenuPage('multiplayer');
    });
    this.actions.register('app.closeMultiplayer', () => {
      this.uiSound?.();
      this.swapMenuPage('main');
    });
    this.actions.register('app.createCrew', () => ui(() => h().onCreate?.()));
    this.actions.register('app.openJoin', () => ui(() => h().onJoin?.('')));
    this.actions.register('app.joinCrew', (_p, runtime) => {
      const input = runtime?.getNode('join-code')?.element as HTMLInputElement | undefined;
      ui(() => h().onJoin?.(input?.value ?? ''));
    });
    this.actions.register('app.ready', () => ui(() => h().onReady?.()));
    this.actions.register('app.startSinglePlayer', () => ui(() => h().onStartSinglePlayer?.()));
    this.actions.register('app.restartSinglePlayer', () => ui(() => h().onRestartSinglePlayer?.()));
    this.actions.register('app.openHowTo', () => ui(() => h().onHowTo?.()));
    this.actions.register('app.openCredits', () => ui(() => h().onCredits?.()));
    this.actions.register('app.openSettings', () => ui(() => h().onOpenSettings?.()));
    this.actions.register('app.saveSettings', (_p, runtime) => {
      const input = runtime?.getNode('nickname-input')?.element as HTMLInputElement | undefined;
      ui(() => h().onSaveSettings?.(input?.value ?? ''));
    });
    this.actions.register('app.randomizeNickname', () => ui(() => h().onRandomizeNickname?.()));
    this.actions.register('app.previewLocale', (_p, runtime) => {
      const control = runtime?.getNode('settings-language')?.element;
      const locale = control?.dataset.value;
      if (locale === 'en' || locale === 'ko') h().onPreviewLocale?.(locale as Locale);
    });
    this.actions.register('app.previewBgmVolume', (_p, runtime) => {
      const input = runtime?.getNode('settings-bgm-range')?.element as HTMLInputElement | undefined;
      if (input) h().onPreviewBgmVolume?.(Number(input.value));
    });
    this.actions.register('app.previewSfxVolume', (_p, runtime) => {
      const input = runtime?.getNode('settings-sfx-range')?.element as HTMLInputElement | undefined;
      if (input) h().onPreviewSfxVolume?.(Number(input.value));
    });
    this.actions.register('app.cancelSettings', () => ui(() => h().onCancelSettings?.()));
    this.actions.register('app.back', () => ui(() => h().onBack?.()));
    this.actions.register('app.leave', () => ui(() => h().onLeave?.()));
    this.actions.register('app.rematch', () => ui(() => h().onRematch?.('none')));
    this.actions.register('app.retry', () => ui(() => h().onRetry?.()));
    this.actions.register('app.resume', () => ui(() => h().onResume?.()));
    this.actions.register('app.pause', () => ui(() => h().onPause?.()));
    this.actions.register('app.returnToMenu', () => ui(() => h().onMainMenu?.()));
    this.actions.register('app.copyRoomCode', () => ui(() => void this.copyRoomCode()));
  }
}

function resultOutcomeContext(outcome: ResultOutcome, i18n: LocalizationService): Record<string, unknown> {
  if (outcome === 'victory') {
    return {
      victory: true,
      defeat: false,
      outcomeHeading: i18n.t('ui.results.victory'),
      outcomeKicker: i18n.t('ui.results.victoryKicker'),
      outcomeCopy: i18n.t('ui.results.victoryCopy'),
      outcomeState: i18n.t('ui.results.stageClear'),
    };
  }
  if (outcome === 'defeat') {
    return {
      victory: false,
      defeat: true,
      outcomeHeading: i18n.t('ui.results.defeat'),
      outcomeKicker: i18n.t('ui.results.defeatKicker'),
      outcomeCopy: i18n.t('ui.results.defeatCopy'),
      outcomeState: i18n.t('ui.results.chassisOffline'),
    };
  }
  return {
    victory: false,
    defeat: false,
    outcomeHeading: i18n.t('ui.results.complete'),
    outcomeKicker: i18n.t('ui.results.kicker'),
    outcomeCopy: i18n.t('ui.results.defaultCopy'),
    outcomeState: i18n.t('ui.results.system'),
  };
}

const LEGACY_RESULT_TITLE_IDS: Readonly<Record<string, string>> = {
  'Airborne Division': 'title.airborneDivision',
  'Recoil Accountants': 'title.recoilAccountants',
  'Friendly Fire Department': 'title.friendlyFire',
  'The Brakes Were Optional': 'title.brakesOptional',
  'One Brain, Two Browsers': 'title.oneBrain',
  'Perfectly Coordinated Accident': 'title.perfectlyCoordinated',
  'Unlicensed Ballistics': 'title.unlicensed',
  'Scrap Goblins': 'title.scrapGoblins',
  'Boss Slayer': 'title.bossSlayer',
};

function localizedResultTitle(results: ResultsPayload, i18n: LocalizationService): string {
  const titleId = results.titleId ?? LEGACY_RESULT_TITLE_IDS[results.title];
  return titleId ? i18n.t(`result.${titleId}`, {}, results.title) : results.title;
}
