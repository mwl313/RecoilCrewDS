import { copyText, isValidRoomCode } from '../clipboard';
import {
  DEFAULT_PRESENTATION_FLOW_ID,
  PRESENTATION_FLOWS,
  PRESENTATION_SCENES,
} from '../../generated/presentationContent.generated';
import { SceneActionRegistry } from './actionRegistry';
import {
  MODIFIERS,
  type AppFlowHandlers,
  type FlowStateId,
  type RematchPayload,
  type ResultsPayload,
} from './flowTypes';
import { SceneRuntime, type SceneRuntimeServices } from './sceneRuntime';
import { UiComponentRegistry } from './componentRegistry';
import type { PresentationWorldFactory } from './presentationWorld';

/**
 * AppFlowController owns application flow: current state, scene selection,
 * network-driven transitions, input/gameplay policy hooks, error/results/
 * practice entry. Scene documents only request allowlisted actions.
 */
export class AppFlowController {
  private readonly runtimes = new Map<string, SceneRuntime>();
  private readonly actions = new SceneActionRegistry();
  private handlers: Partial<AppFlowHandlers> = {};
  private currentState: FlowStateId = 'boot';
  private currentSceneId = '';
  private copyFeedbackT = 0;
  private hudElement: HTMLElement | null = null;
  private uiSound: (() => void) | null = null;
  private presentationFactory: PresentationWorldFactory | null = null;
  private activeWorld: { dispose(): void } | null = null;

  constructor(
    private readonly screensContainer: HTMLElement,
    private readonly themeRoot: HTMLElement,
    private readonly registry: UiComponentRegistry,
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

  bind(handlers: AppFlowHandlers): void {
    this.handlers = handlers;
  }

  setHudElement(element: HTMLElement): void {
    this.hudElement = element;
  }

  setUiSound(fn: () => void): void {
    this.uiSound = fn;
  }

  setPresentationFactory(fn: PresentationWorldFactory | null): void {
    this.presentationFactory = fn;
  }

  showState(stateId: FlowStateId): void {
    const flow = PRESENTATION_FLOWS[DEFAULT_PRESENTATION_FLOW_ID];
    const state = flow.states.find((s) => s.id === stateId);
    if (!state) throw new Error(`unknown flow state: ${stateId}`);
    this.currentState = stateId;
    const runtime = this.ensureRuntimeFor(state.sceneId);
    if (this.currentSceneId && this.currentSceneId !== state.sceneId) {
      this.runtimes.get(this.currentSceneId)?.element?.classList.add('hidden');
    }
    this.currentSceneId = state.sceneId;
    runtime.element?.classList.remove('hidden');
    if (this.hudElement) this.hudElement.classList.toggle('hidden', stateId !== 'game');
    this.syncPresentationWorld(stateId);
  }

  private syncPresentationWorld(stateId: FlowStateId): void {
    this.activeWorld?.dispose();
    this.activeWorld = null;
    if (!this.presentationFactory || stateId !== 'main') return;
    const scene = PRESENTATION_SCENES['scene.mainMenu'];
    if (scene.type !== 'hybrid') return;
    const container = this.runtimes.get('scene.mainMenu')?.element;
    if (!container) return;
    this.activeWorld = this.presentationFactory(scene, container);
  }

  private services(): SceneRuntimeServices {
    return {
      actions: this.actions,
      registry: this.registry,
      addPopup: () => undefined,
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

  showResults(results: ResultsPayload, rematch: RematchPayload): void {
    this.setSceneContext('scene.results', {
      grade: results.grade,
      title: results.title,
      score: results.score.toLocaleString(),
      stats: [
        { label: 'BEST COMBO', value: `×${results.bestCombo}` },
        { label: 'JACKPOT', value: String(results.jackpotFired) },
        { label: 'KILLS', value: String(results.kills) },
        { label: 'SCRAP', value: String(results.scrapCollected) },
        { label: 'CREW LINKS', value: String(results.links) },
        { label: 'WIPEOUTS', value: String(results.wipeouts) },
      ],
    });
    this.updateRematch(rematch);
    this.ensureRuntimeFor('scene.results');
    this.showState('results');
  }

  updateRematch(rematch: RematchPayload): void {
    this.setSceneContext('scene.results', {
      modifiers: MODIFIERS.map((m) => ({
        id: m.id,
        label: m.label,
        desc: m.desc,
        selected: m.id === rematch.modifier,
      })),
      rematchInfo:
        rematch.driver && rematch.gunner
          ? 'BOTH READY — REMATCH INCOMING'
          : `DRIVER ${rematch.driver ? 'READY' : 'PICKING'} · GUNNER ${rematch.gunner ? 'READY' : 'PICKING'}`,
    });
  }

  showCountdown(n: number): void {
    if (n <= 0) {
      this.setSceneContext('scene.countdown', { value: 'GO!', sub: '' });
    } else {
      this.setSceneContext('scene.countdown', {
        value: String(n),
        sub: n === 3 ? 'GET READY' : n === 2 ? 'DRIVER · GUNNER' : 'BRACE YOURSELF',
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

  setCreateCode(code: string): void {
    const valid = isValidRoomCode(code);
    this.setSceneContext('scene.createCrew', { code, copyLabel: 'COPY', copyDisabled: !valid });
    this.setSceneContext('scene.readyLobby', { roomCode: code });
  }

  updateLobby(driverReady: boolean, gunnerReady: boolean, myRole: 'driver' | 'gunner'): void {
    const mine = myRole === 'driver' ? driverReady : gunnerReady;
    this.setSceneContext('scene.readyLobby', {
      driverReady,
      gunnerReady,
      driverState: driverReady ? 'READY' : 'WAITING',
      gunnerState: gunnerReady ? 'READY' : 'WAITING',
      readyLabel: mine ? 'READY ✓' : 'READY',
    });
  }

  private async copyRoomCode(): Promise<void> {
    const runtime = this.runtimes.get('scene.createCrew');
    const code = runtime?.getNode('create-code')?.element.textContent ?? '';
    if (!isValidRoomCode(code)) {
      this.setSceneContext('scene.createCrew', { copyLabel: 'COPY FAILED — SELECT CODE', copyDisabled: true });
      return;
    }
    const ok = await copyText(code);
    this.setSceneContext('scene.createCrew', { copyLabel: ok ? 'COPIED' : 'COPY FAILED — SELECT CODE' });
    const token = ++this.copyFeedbackT;
    setTimeout(() => {
      if (token === this.copyFeedbackT) {
        this.setSceneContext('scene.createCrew', { copyLabel: 'COPY' });
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
    this.actions.register('app.enter', () => ui(() => h().onBoot?.()));
    this.actions.register('app.createCrew', () => ui(() => h().onCreate?.()));
    this.actions.register('app.openJoin', () => ui(() => h().onJoin?.('')));
    this.actions.register('app.joinCrew', (_p, runtime) => {
      const input = runtime?.getNode('join-code')?.element as HTMLInputElement | undefined;
      ui(() => h().onJoin?.(input?.value ?? ''));
    });
    this.actions.register('app.ready', () => ui(() => h().onReady?.()));
    this.actions.register('app.startPractice', () => ui(() => h().onPractice?.()));
    this.actions.register('app.openHowTo', () => ui(() => h().onHowTo?.()));
    this.actions.register('app.back', () => ui(() => h().onBack?.()));
    this.actions.register('app.leave', () => ui(() => h().onLeave?.()));
    this.actions.register('app.rematch', (payload) => ui(() => h().onRematch?.((payload as string ?? 'none') as never)));
    this.actions.register('app.retry', () => ui(() => h().onRetry?.()));
    this.actions.register('app.resume', () => ui(() => h().onResume?.()));
    this.actions.register('app.returnToMenu', () => ui(() => h().onMainMenu?.()));
    this.actions.register('app.copyRoomCode', () => ui(() => void this.copyRoomCode()));
  }
}
