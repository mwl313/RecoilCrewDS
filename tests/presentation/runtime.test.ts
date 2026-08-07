// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { SceneActionRegistry } from '../../src/client/presentation/actionRegistry';
import { UiComponentRegistry } from '../../src/client/presentation/componentRegistry';
import { registerDefaultUiComponents } from '../../src/client/presentation/uiComponents';
import { SceneRuntime } from '../../src/client/presentation/sceneRuntime';
import { HudProjector, emptyHudViewModel } from '../../src/client/presentation/hudViewModel';
import type { MatchState } from '../../src/shared/types';
import { PRESENTATION_SCENES, PRESENTATION_HUDS } from '../../src/generated/presentationContent.generated';
import { SceneFlowPresenter } from '../../src/client/presentation/sceneFlowPresenter';
import { HudRuntime } from '../../src/client/presentation/hudRuntime';

function makeRuntime(container: HTMLElement): { runtime: SceneRuntime; actions: SceneActionRegistry } {
  const registry = new UiComponentRegistry();
  registerDefaultUiComponents(registry);
  const actions = new SceneActionRegistry();
  const runtime = new SceneRuntime({ actions, registry }, container);
  return { runtime, actions };
}

describe('SceneRuntime components', () => {
  it('mounts a tree, applies bindings, and disposes without leaks', async () => {
    const container = document.createElement('div');
    const { runtime, actions } = makeRuntime(container);
    let clicked = 0;
    actions.register('app.enter', () => {
      clicked++;
    });
    await runtime.load({
      id: 'scene.test',
      label: 'Test',
      type: 'ui',
      root: {
        id: 'root',
        type: 'container',
        class: 'screen',
        children: [
          { id: 'label', type: 'text', text: 'hi', bindings: [{ target: 'text', source: 'name' }] },
          { id: 'visible', type: 'text', text: 'x', bindings: [{ target: 'visible', source: 'show' }] },
          { id: 'btn', type: 'button', text: 'GO', actions: [{ event: 'click', action: 'app.enter' }] },
          { id: 'box', type: 'progressBar', props: { valueSource: 'v', maxSource: 'max' } },
        ],
      },
    });
    const root = container.querySelector('#root') as HTMLElement;
    expect(root).not.toBeNull();
    expect(container.querySelectorAll('*').length).toBeGreaterThan(3);
    runtime.setContext({ name: 'world', show: false, v: 50, max: 100 });
    expect((container.querySelector('#label') as HTMLElement).textContent).toBe('world');
    expect((container.querySelector('#visible') as HTMLElement).classList.contains('hidden')).toBe(true);
    expect((container.querySelector('#box') as HTMLElement).style.width).toBe('50%');
    (container.querySelector('#btn') as HTMLButtonElement).click();
    expect(clicked).toBe(1);
    const nodeCountBefore = container.querySelectorAll('*').length;
    runtime.setContext({ name: 'world', show: false, v: 60, max: 100 });
    expect(container.querySelectorAll('*').length).toBe(nodeCountBefore);
    runtime.unload();
    expect(container.querySelector('#root')).toBeNull();
  });

  it('repeaters render list items with item bindings and actions', async () => {
    const container = document.createElement('div');
    const { runtime, actions } = makeRuntime(container);
    const rematched: string[] = [];
    actions.register('app.rematch', (payload) => {
      rematched.push(String(payload));
    });
    await runtime.load({
      id: 'scene.list',
      label: 'List',
      type: 'ui',
      root: {
        id: 'list',
        type: 'repeater',
        props: { listSource: 'items' },
        children: [
          {
            id: 'item',
            type: 'button',
            bindings: [{ target: 'text', source: 'item.label' }],
            actions: [{ event: 'click', action: 'app.rematch', payload: { __itemId: true } }],
          },
        ],
      },
    });
    runtime.setContext({ items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] });
    expect(container.querySelectorAll('[data-repeater-item]').length).toBe(2);
    (container.querySelectorAll('[data-repeater-item]')[0] as HTMLElement).click();
    expect(rematched).toEqual(['a']);
    runtime.setContext({ items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }] });
    expect(container.querySelectorAll('[data-repeater-item]').length).toBe(3);
    runtime.unload();
  });

  it('content scenes load with stable ids and text', async () => {
    const container = document.createElement('div');
    const { runtime } = makeRuntime(container);
    await runtime.load(PRESENTATION_SCENES['scene.mainMenu']);
    expect(container.querySelector('#screen-main')).not.toBeNull();
    expect((container.querySelector('[data-act="multiplayer"]') as HTMLElement).textContent).toBe('MULTIPLAYER');
    expect((container.querySelector('[data-act="create"]') as HTMLElement).textContent).toBe('CREATE CREW');
    expect(container.querySelector('#multiplayer-menu-page')?.classList.contains('hidden')).toBe(true);
    runtime.unload();
  });

  it('hud document mounts with the same node ids', async () => {
    const container = document.createElement('div');
    const { runtime } = makeRuntime(container);
    const hud = PRESENTATION_HUDS['hud.gameplay'];
    await runtime.load({ id: hud.id, label: hud.label, type: 'gameplayOverlay', root: hud.root });
    for (const id of ['hud', 'role-chip', 'timer', 'score', 'combo', 'integrity', 'speed', 'dash-ind', 'prompt', 'crosshair', 'fps', 'popups', 'pause-btn']) {
      expect(container.querySelector(`#${id}`), id).not.toBeNull();
    }
    runtime.unload();
  });

  it('results scene renders modifier chips with labels and data-mod', async () => {
    const container = document.createElement('div');
    const { runtime, actions } = makeRuntime(container);
    actions.register('app.rematch', () => undefined);
    await runtime.load(PRESENTATION_SCENES['scene.results'], {
      grade: 'D',
      title: 'T',
      score: '1,050',
      crewMode: true,
      singleMode: false,
      stats: [{ label: 'KILLS', value: '4' }],
      modifiers: [{ id: 'doubleBarrel', label: 'DOUBLE BARREL', desc: 'x', selected: false }],
      rematchInfo: 'DRIVER READY · GUNNER PICKING',
    });
    const chips = Array.from(container.querySelectorAll('.mod')) as HTMLElement[];
    expect(chips.length).toBe(1);
    expect(chips[0].textContent).toBe('DOUBLE BARREL');
    expect(chips[0].getAttribute('data-mod')).toBe('doubleBarrel');
    const stats = Array.from(container.querySelectorAll('.results-stat')) as HTMLElement[];
    expect(stats.length).toBe(1);
    expect(stats[0].textContent).toContain('KILLS');

    // Single Player results replace the crew vote with local actions.
    const singleRuntime = makeRuntime(document.createElement('div'));
    singleRuntime.actions.register('app.restartSinglePlayer', () => undefined);
    singleRuntime.actions.register('app.returnToMenu', () => undefined);
    await singleRuntime.runtime.load(PRESENTATION_SCENES['scene.results'], {
      grade: 'A',
      title: 'SOLO',
      score: '4,200',
      crewMode: false,
      singleMode: true,
      stats: [{ label: 'KILLS', value: '12' }],
    });
    const singleRoot = singleRuntime.runtime.element as HTMLElement;
    expect((singleRoot.querySelector('#sp-play-again') as HTMLElement).textContent).toBe('PLAY AGAIN');
    expect((singleRoot.querySelector('#sp-actions') as HTMLElement).classList.contains('hidden')).toBe(false);
    expect((singleRoot.querySelector('#leave-btn') as HTMLElement).classList.contains('hidden')).toBe(true);
    runtime.unload();
    singleRuntime.runtime.unload();
  });
});

describe('HudProjector', () => {
  function state(partial: Partial<MatchState> = {}): MatchState {
    return {
      tank: { x: 0, y: 0, z: 0, vx: 10, vy: 0, vz: 0, yaw: 0, yawVel: 0, pitch: 0, roll: 0, grounded: true, dashCooldown: 0, dashPresentationT: 0, dashDamageT: 0, drift: false, deadT: 0, prevOnRamp: false },
      turret: { yaw: 0, pitch: 0, cannonHeld: false, cannonHoldT: 0, cannonChargeRatio: 0, cannonChargeFull: false, cannonCooldown: 0, mgCooldown: 0, mgFiring: false, cannonFlash: 0 },
      combo: { multiplier: 1 },
      build: { capabilities: [] },
      stats: { score: 0, chargedCannonShots: 0, fullChargeShots: 0, scrapCollected: 0, kills: 0, links: 0, wipeouts: 0, bestCombo: 0, dashKills: 0, dodgeCount: 0, anyContribution: false },
      duration: 90,
      time: 0,
      truck: { active: false, x: 0, y: 0, z: 0, yaw: 0, hp: 100, waypoint: 0, escaped: false, sirenT: 0 },
      phase: 'running',
      matchId: 'm',
      modifier: 'none',
      nextEnemyId: 1,
      nextPickupId: 1,
      pickups: [],
      enemies: [],
      shells: [],
      barrels: [],
      wipeout: false,
      countdown: 0,
      respawnT: 0,
      ...partial,
    } as MatchState;
  }

  it('projects safe view fields (no raw MatchState exposure)', () => {
    const projector = new HudProjector();
    const vm = projector.project(state({ stats: { score: 12345, chargedCannonShots: 3, fullChargeShots: 1, scrapCollected: 5, kills: 4, links: 2, wipeouts: 1, bestCombo: 5, dashKills: 1, dodgeCount: 2, anyContribution: true } }), {
      role: 'driver',
      peerConnected: true,
      ping: 24.2,
      fps: 59.8,
      pointerLocked: true,
      session: { kind: 'multiplayer', showRoleIdentity: true, showPeerStatus: true },
      objective: { x: 100, y: 80, visible: true },
    });
    expect(vm.match.scoreText).toBe('12,345');
    expect(vm.connection.pingMs).toBe(24);
    expect(vm.connection.fps).toBe(60);
    expect(vm.tank.speed).toBe(36); // 10 m/s * 3.6
    expect(vm.crosshairVisible).toBe(false);
    expect(vm.objective.visible).toBe(false); // truck inactive
  });

  it('projects connection health and the compact progression strip', () => {
    const projector = new HudProjector();
    const vm = projector.project(state({
      matchFlow: 'upgradeSelection',
      teamProgression: {
        level: 4,
        currentXp: 75,
        xpForNextLevel: 100,
        totalXpCollected: 240,
        pendingLevelUps: 1,
        levelUpOffersCompleted: 3,
        treasureChestsOpened: 0,
        relicAcquisitionSequence: 0,
        relicStacks: {},
        activeSelection: null,
        lastRelicResult: null,
        pendingRelicResults: [],
      },
    }), {
      role: 'driver',
      peerConnected: true,
      ping: 205,
      fps: 60,
      pointerLocked: true,
      session: { kind: 'multiplayer', showRoleIdentity: true, showPeerStatus: true },
      rules: { progressionEnabled: true },
      objective: null,
    });
    expect(vm.connection.degraded).toBe(true);
    expect(vm.progression).toMatchObject({
      visible: true,
      level: 4,
      currentXp: 75,
      xpForNextLevel: 100,
      ratio: 0.75,
      pendingLevelUps: 1,
      upgradePending: true,
    });
  });

  it('gunner and single-player projection and prompts', () => {
    const projector = new HudProjector();
    const vm = projector.project(
      state({ time: 3, build: { capabilities: ['cannon.charge'] }, turret: { yaw: 0, pitch: 0, cannonHeld: true, cannonHoldT: 0.5, cannonChargeRatio: 0.5, cannonChargeFull: false, cannonCooldown: 1.2, mgCooldown: 0, mgFiring: false, cannonFlash: 0 } }),
      { role: 'gunner', peerConnected: true, ping: 10, fps: 60, pointerLocked: true, session: { kind: 'multiplayer', showRoleIdentity: true, showPeerStatus: true }, objective: null },
    );
    expect(vm.crosshairVisible).toBe(true);
    expect(vm.prompt).toBe('HOLD TO CHARGE');
    expect(vm.gunner.cooldownRatio).toBeCloseTo(0.75);
    expect(vm.gunner.chargeRatio).toBeCloseTo(0.5);
    expect(vm.gunner.chargeHeld).toBe(true);
    expect(vm.gunner.chargeUnlocked).toBe(true);
    expect(vm.tank.dashCooling).toBe(false);

    const sp = projector.project(
      state({ time: 3, turret: { yaw: 0, pitch: 0, cannonHeld: false, cannonHoldT: 0, cannonChargeRatio: 0, cannonChargeFull: false, cannonCooldown: 0, mgCooldown: 0, mgFiring: false, cannonFlash: 0 } }),
      { role: 'driver', peerConnected: false, ping: 0, fps: 60, pointerLocked: true, session: { kind: 'singlePlayer', showRoleIdentity: false, showPeerStatus: false }, objective: null },
    );
    expect(sp.crosshairVisible).toBe(true);
    expect(sp.prompt).toBe('DRIVE · AIM · FIRE');
    expect(sp.promptSub).toBe('WASD · SHIFT · SPACE · LMB · RMB');
    expect(sp.session.showRoleIdentity).toBe(false);
    expect(sp.session.showPeerStatus).toBe(false);

    // When the pointer is not locked, both modes show CLICK TO AIM.
    const unlocked = projector.project(
      state({ time: 3 }),
      { role: 'gunner', peerConnected: true, ping: 10, fps: 60, pointerLocked: false, session: { kind: 'multiplayer', showRoleIdentity: true, showPeerStatus: true }, objective: null },
    );
    expect(unlocked.prompt).toBe('CLICK TO AIM');
  });

  it('empty view model is stable', () => {
    const vm = emptyHudViewModel();
    expect(vm.match.timeRemaining).toBe(90);
  });
});

describe('HudRuntime trajectory reticle', () => {
  it('uses viewport coordinates directly and stays outside the transformed prompt group', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 720 });
    const container = document.createElement('div');
    const themeRoot = document.createElement('div');
    const registry = new UiComponentRegistry();
    registerDefaultUiComponents(registry);
    const runtime = new HudRuntime(container, registry, themeRoot);

    runtime.setTrajectoryReticle(321, 234, true, false, true);
    const crosshair = container.querySelector('#crosshair') as HTMLElement;
    const promptGroup = container.querySelector('#hud-center') as HTMLElement;
    expect(crosshair.style.left).toBe('321px');
    expect(crosshair.style.top).toBe('234px');
    expect(crosshair.style.transform).toBe('translate(-50%, -50%)');
    expect(crosshair.classList.contains('vertical-lock')).toBe(true);
    expect(promptGroup.contains(crosshair)).toBe(false);

    runtime.setTrajectoryReticle(9999, -50, true, true);
    expect(crosshair.style.left).toBe('1272px');
    expect(crosshair.style.top).toBe('8px');
    expect(crosshair.classList.contains('blocked')).toBe(true);
    expect(crosshair.classList.contains('vertical-lock')).toBe(false);
    runtime.dispose();
  });
});

describe('SceneFlowPresenter overlay visibility', () => {
  it('keeps the live menu and presentation world mounted beneath menu overlays', () => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    const themeRoot = document.createElement('div');
    const registry = new UiComponentRegistry();
    registerDefaultUiComponents(registry);
    const flow = new SceneFlowPresenter(container, themeRoot, registry);
    const started: number[] = [];
    const disposed: number[] = [];
    flow.setPresentationFactory((() => ({
      start: () => started.push(1),
      dispose: () => disposed.push(1),
    })) as never);
    flow.bind({} as never);

    flow.showState('main');
    flow.showState('settings');
    expect((container.querySelector('#screen-main') as HTMLElement).classList.contains('hidden')).toBe(false);
    expect((container.querySelector('#screen-settings') as HTMLElement).classList.contains('hidden')).toBe(false);
    expect(started).toEqual([1]);
    expect(disposed).toEqual([]);

    flow.showState('main');
    const settings = container.querySelector('#screen-settings') as HTMLElement;
    expect(settings.classList.contains('hidden')).toBe(false);
    expect(settings.classList.contains('scene-exit')).toBe(true);
    vi.advanceTimersByTime(421);
    expect((container.querySelector('#screen-settings') as HTMLElement).classList.contains('hidden')).toBe(true);
    expect(started).toEqual([1]);
    expect(disposed).toEqual([]);

    flow.showState('howto');
    expect((container.querySelector('#screen-main') as HTMLElement).classList.contains('hidden')).toBe(false);
    expect((container.querySelector('#screen-howto') as HTMLElement).classList.contains('hidden')).toBe(false);
    expect(started).toEqual([1]);
    expect(disposed).toEqual([]);
    vi.useRealTimers();
  });

  it('presents Join Crew as a reversible overlay over the live multiplayer menu', () => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    const themeRoot = document.createElement('div');
    const registry = new UiComponentRegistry();
    registerDefaultUiComponents(registry);
    const flow = new SceneFlowPresenter(container, themeRoot, registry);
    const started = vi.fn();
    const disposed = vi.fn();
    flow.setPresentationFactory((() => ({ start: started, dispose: disposed })) as never);
    flow.bind({} as never);

    flow.showState('main');
    flow.actionRegistry.execute('app.openMultiplayer');
    vi.advanceTimersByTime(601);
    flow.showState('join');
    const main = container.querySelector('#screen-main') as HTMLElement;
    const join = container.querySelector('#screen-join') as HTMLElement;
    expect(main.classList.contains('hidden')).toBe(false);
    expect(join.classList.contains('hidden')).toBe(false);
    expect(join.classList.contains('ui-overlay-screen')).toBe(true);
    expect(container.querySelector('#multiplayer-menu-page')?.classList.contains('hidden')).toBe(false);
    expect(started).toHaveBeenCalledTimes(1);
    expect(disposed).not.toHaveBeenCalled();

    flow.showState('main');
    expect(join.classList.contains('scene-exit')).toBe(true);
    expect(join.classList.contains('hidden')).toBe(false);
    vi.advanceTimersByTime(421);
    expect(join.classList.contains('hidden')).toBe(true);
    expect(main.classList.contains('hidden')).toBe(false);
    expect(container.querySelector('#multiplayer-menu-page')?.classList.contains('hidden')).toBe(false);
    expect(started).toHaveBeenCalledTimes(1);
    expect(disposed).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('gates boot handoff on the reusable title choreography and ignores repeat input', () => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    const themeRoot = document.createElement('div');
    const registry = new UiComponentRegistry();
    registerDefaultUiComponents(registry);
    const flow = new SceneFlowPresenter(container, themeRoot, registry);
    const onBoot = vi.fn();
    flow.bind({ onBoot } as never);
    flow.showState('boot');

    flow.actionRegistry.execute('app.enter');
    flow.actionRegistry.execute('app.enter');
    const boot = container.querySelector('#screen-boot') as HTMLElement;
    const hint = container.querySelector('#boot-hint') as HTMLElement;
    expect(boot.classList.contains('ui-choreography--title-exit')).toBe(true);
    expect(boot.getAttribute('aria-busy')).toBe('true');
    expect(onBoot).not.toHaveBeenCalled();

    const end = new Event('animationend', { bubbles: true }) as AnimationEvent;
    Object.defineProperty(end, 'animationName', { value: 'ui-title-control-drop' });
    hint.dispatchEvent(end);
    expect(onBoot).toHaveBeenCalledTimes(1);
    expect(boot.hasAttribute('aria-busy')).toBe(false);
    vi.useRealTimers();
  });

  it('marks authored menu regions for a split directional entrance from boot', () => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    const themeRoot = document.createElement('div');
    const registry = new UiComponentRegistry();
    registerDefaultUiComponents(registry);
    const flow = new SceneFlowPresenter(container, themeRoot, registry);
    flow.bind({} as never);
    flow.showState('boot');
    flow.showState('main');

    const menu = container.querySelector('#screen-main') as HTMLElement;
    expect(menu.classList.contains('ui-choreography--split-enter')).toBe(true);
    expect(container.querySelector('#main-panel')?.classList.contains('ui-enter-from-left')).toBe(true);
    expect(container.querySelector('#main-hero-caption')?.classList.contains('ui-enter-from-right')).toBe(true);
    vi.advanceTimersByTime(681);
    expect(menu.classList.contains('ui-choreography--split-enter')).toBe(false);
    vi.useRealTimers();
  });

  it('game visibility hides every scene overlay (pause/menu regression)', async () => {
    const container = document.createElement('div');
    const themeRoot = document.createElement('div');
    const hudEl = document.createElement('div');
    hudEl.id = 'hud';
    const registry = new UiComponentRegistry();
    registerDefaultUiComponents(registry);
    const flow = new SceneFlowPresenter(container, themeRoot, registry);
    flow.setHudElement(hudEl);
    flow.bind({} as never);

    flow.showState('main');
    expect((container.querySelector('#screen-main') as HTMLElement).classList.contains('hidden')).toBe(false);
    expect(hudEl.classList.contains('hidden')).toBe(true);

    // Gameplay starts: every screen must disappear, HUD appears.
    flow.setGameVisible(true);
    expect((container.querySelector('#screen-main') as HTMLElement).classList.contains('hidden')).toBe(true);
    expect(hudEl.classList.contains('hidden')).toBe(false);

    // Pause overlay shows, then resume hides it again.
    flow.showState('pause');
    expect((container.querySelector('#screen-pause') as HTMLElement).classList.contains('hidden')).toBe(false);
    flow.setGameVisible(true);
    expect((container.querySelector('#screen-pause') as HTMLElement).classList.contains('hidden')).toBe(true);
    expect(hudEl.classList.contains('hidden')).toBe(false);

    // Leaving to the menu re-shows the menu scene.
    flow.showState('main');
    expect((container.querySelector('#screen-main') as HTMLElement).classList.contains('hidden')).toBe(false);
  });

  it('only offers Restart Match on the single-player pause screen', () => {
    const container = document.createElement('div');
    const registry = new UiComponentRegistry();
    registerDefaultUiComponents(registry);
    const flow = new SceneFlowPresenter(container, document.createElement('div'), registry);
    flow.bind({} as never);

    flow.setSceneContext('scene.pause', { singleMode: false });
    flow.showState('pause');
    const restart = container.querySelector('#pause-single') as HTMLButtonElement;
    expect(restart.textContent).toBe('RESTART MATCH');
    expect(restart.classList.contains('hidden')).toBe(true);

    flow.setSceneContext('scene.pause', { singleMode: true });
    expect(restart.classList.contains('hidden')).toBe(false);
  });

  it('presents victory and game-over with distinct outcome states', () => {
    const container = document.createElement('div');
    const registry = new UiComponentRegistry();
    registerDefaultUiComponents(registry);
    const flow = new SceneFlowPresenter(container, document.createElement('div'), registry);
    flow.bind({} as never);
    const results = {
      score: 4200,
      bestCombo: 4,
      chargedCannonShots: 2,
      fullChargeShots: 1,
      kills: 12,
      scrapCollected: 8,
      links: 0,
      wipeouts: 0,
      grade: 'A',
      title: 'SOLO',
      modifier: 'none',
    };

    flow.showSinglePlayerResults(results, 'victory');
    const root = container.querySelector('#screen-results') as HTMLElement;
    expect(root.classList.contains('is-victory')).toBe(true);
    expect(root.classList.contains('is-defeat')).toBe(false);
    expect(container.querySelector('#results-heading')?.textContent).toBe('VICTORY');

    flow.showSinglePlayerResults(results, 'defeat');
    expect(root.classList.contains('is-victory')).toBe(false);
    expect(root.classList.contains('is-defeat')).toBe(true);
    expect(container.querySelector('#results-heading')?.textContent).toBe('GAME OVER');
  });
});

describe('SceneFlowPresenter menu archetype', () => {
  it('swaps command pages without replacing shared menu elements or the presentation world', () => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    const themeRoot = document.createElement('div');
    const registry = new UiComponentRegistry();
    registerDefaultUiComponents(registry);
    const flow = new SceneFlowPresenter(container, themeRoot, registry);
    const started = vi.fn();
    const disposed = vi.fn();
    flow.setPresentationFactory((() => ({ start: started, dispose: disposed })) as never);
    flow.bind({} as never);
    flow.showState('main');

    const root = container.querySelector('#screen-main') as HTMLElement;
    const mainPage = container.querySelector('#main-menu-page') as HTMLElement;
    const multiplayerPage = container.querySelector('#multiplayer-menu-page') as HTMLElement;
    const nickname = container.querySelector('#main-playing-as') as HTMLElement;
    const logo = container.querySelector('#main-logo') as HTMLElement;
    flow.actionRegistry.execute('app.openMultiplayer');

    expect(root.classList.contains('hidden')).toBe(false);
    expect(mainPage.classList.contains('is-leaving')).toBe(true);
    expect(multiplayerPage.classList.contains('hidden')).toBe(true);
    expect(multiplayerPage.classList.contains('is-entering')).toBe(false);
    expect(mainPage.contains(nickname)).toBe(true);
    expect(logo.classList.contains('is-leaving')).toBe(false);
    expect(started).toHaveBeenCalledTimes(1);
    expect(disposed).not.toHaveBeenCalled();

    vi.advanceTimersByTime(561);
    expect(mainPage.classList.contains('hidden')).toBe(true);
    expect(multiplayerPage.classList.contains('hidden')).toBe(false);
    expect(multiplayerPage.classList.contains('is-entering')).toBe(true);
    vi.advanceTimersByTime(561);
    expect(multiplayerPage.classList.contains('is-entering')).toBe(false);
    expect(multiplayerPage.textContent).toContain('CREATE CREW');
    expect(multiplayerPage.textContent).toContain('JOIN CREW');
    expect(multiplayerPage.textContent).toContain('GO BACK');

    flow.actionRegistry.execute('app.closeMultiplayer');
    expect(multiplayerPage.classList.contains('is-leaving')).toBe(true);
    expect(mainPage.classList.contains('hidden')).toBe(true);
    expect(mainPage.classList.contains('is-entering')).toBe(false);
    vi.advanceTimersByTime(561);
    expect(multiplayerPage.classList.contains('hidden')).toBe(true);
    expect(mainPage.classList.contains('is-entering')).toBe(true);
    vi.advanceTimersByTime(561);
    expect(mainPage.classList.contains('hidden')).toBe(false);
    expect(multiplayerPage.classList.contains('hidden')).toBe(true);
    expect(started).toHaveBeenCalledTimes(1);
    expect(disposed).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('can return directly to the multiplayer command page after leaving a crew', () => {
    const container = document.createElement('div');
    const themeRoot = document.createElement('div');
    const registry = new UiComponentRegistry();
    registerDefaultUiComponents(registry);
    const flow = new SceneFlowPresenter(container, themeRoot, registry);
    flow.bind({} as never);
    flow.showState('main');
    flow.showMainMenuPage('multiplayer');

    expect(container.querySelector('#main-menu-page')?.classList.contains('hidden')).toBe(true);
    expect(container.querySelector('#multiplayer-menu-page')?.classList.contains('hidden')).toBe(false);
  });

  it('splits the menu out for a crew scene and restores Multiplayer directionally', () => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    const themeRoot = document.createElement('div');
    const registry = new UiComponentRegistry();
    registerDefaultUiComponents(registry);
    const flow = new SceneFlowPresenter(container, themeRoot, registry);
    flow.bind({} as never);
    flow.showState('main');
    flow.showMainMenuPage('multiplayer');

    const root = container.querySelector('#screen-main') as HTMLElement;
    const completed = vi.fn();
    flow.transitionMainToCrew(completed);
    expect(root.classList.contains('ui-choreography--menu-exit')).toBe(true);
    expect(root.getAttribute('aria-busy')).toBe('true');
    vi.advanceTimersByTime(601);
    expect(root.classList.contains('hidden')).toBe(true);
    expect(completed).toHaveBeenCalledTimes(1);

    flow.showMainMenuFromCrew('multiplayer');
    expect(root.classList.contains('hidden')).toBe(false);
    expect(root.classList.contains('ui-choreography--split-enter')).toBe(true);
    expect(container.querySelector('#main-menu-page')?.classList.contains('hidden')).toBe(true);
    expect(container.querySelector('#multiplayer-menu-page')?.classList.contains('hidden')).toBe(false);
    vi.useRealTimers();
  });
});
