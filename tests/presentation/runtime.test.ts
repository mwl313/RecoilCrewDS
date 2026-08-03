// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { SceneActionRegistry } from '../../src/client/presentation/actionRegistry';
import { UiComponentRegistry } from '../../src/client/presentation/componentRegistry';
import { registerDefaultUiComponents } from '../../src/client/presentation/uiComponents';
import { SceneRuntime } from '../../src/client/presentation/sceneRuntime';
import { HudProjector, emptyHudViewModel } from '../../src/client/presentation/hudViewModel';
import type { MatchState } from '../../src/shared/types';
import { PRESENTATION_SCENES, PRESENTATION_HUDS } from '../../src/generated/presentationContent.generated';

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
    actions.register('app.test', () => clicked++);
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
          { id: 'btn', type: 'button', text: 'GO', actions: [{ event: 'click', action: 'app.test' }] },
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
    actions.register('app.rematch', (payload) => rematched.push(String(payload)));
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
    expect((container.querySelector('[data-act="create"]') as HTMLElement).textContent).toBe('CREATE CREW');
    runtime.unload();
  });

  it('hud document mounts with the same node ids', async () => {
    const container = document.createElement('div');
    const { runtime } = makeRuntime(container);
    const hud = PRESENTATION_HUDS['hud.gameplay'];
    await runtime.load({ id: hud.id, label: hud.label, type: 'gameplayOverlay', root: hud.root });
    for (const id of ['hud', 'role-chip', 'timer', 'score', 'combo', 'integrity', 'jackpot', 'speed', 'dash-ind', 'prompt', 'crosshair', 'pip', 'fps', 'popups', 'pause-btn']) {
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
    runtime.unload();
  });
});

describe('HudProjector', () => {
  function state(partial: Partial<MatchState> = {}): MatchState {
    return {
      tank: { x: 0, y: 0, z: 0, vx: 10, vy: 0, vz: 0, yaw: 0, yawVel: 0, pitch: 0, roll: 0, grounded: true, dashCooldown: 0, dashPresentationT: 0, drift: false, deadT: 0, prevOnRamp: false },
      turret: { yaw: 0, pitch: 0, cannonCooldown: 0, mgCooldown: 0, mgFiring: false, chargeT: 0, jackpotReady: false },
      combo: { multiplier: 1 },
      stats: { score: 0, jackpotMeter: 0, scrapCollected: 0, kills: 0, links: 0, wipeouts: 0, time: 0 },
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
    const vm = projector.project(state({ stats: { score: 12345, jackpotMeter: 80, scrapCollected: 5, kills: 4, links: 2, wipeouts: 1, time: 0 } }), {
      role: 'driver',
      peerConnected: true,
      ping: 24.2,
      fps: 59.8,
      pointerLocked: true,
      practice: false,
      objective: { x: 100, y: 80, visible: true },
    });
    expect(vm.match.scoreText).toBe('12,345');
    expect(vm.connection.pingMs).toBe(24);
    expect(vm.connection.fps).toBe(60);
    expect(vm.tank.speed).toBe(36); // 10 m/s * 3.6
    expect(vm.pip.roleLabel).toBe('GUNNER FEED');
    expect(vm.crosshairVisible).toBe(false);
    expect(vm.objective.visible).toBe(false); // truck inactive
  });

  it('gunner/practice projection and prompts', () => {
    const projector = new HudProjector();
    const vm = projector.project(
      state({ time: 3, turret: { yaw: 0, pitch: 0, cannonCooldown: 1.2, mgCooldown: 0, mgFiring: false, chargeT: 0.5, jackpotReady: true } }),
      { role: 'gunner', peerConnected: true, ping: 10, fps: 60, pointerLocked: false, practice: true, objective: null },
    );
    expect(vm.crosshairVisible).toBe(true);
    expect(vm.prompt).toBe('JACKPOT READY');
    expect(vm.gunner.cooldownRatio).toBeCloseTo(0.75);
    expect(vm.gunner.chargeRatio).toBeCloseTo(0.5);
    expect(vm.tank.dashCooling).toBe(false);
  });

  it('empty view model is stable', () => {
    const vm = emptyHudViewModel();
    expect(vm.match.timeRemaining).toBe(90);
    expect(vm.pip.roleLabel).toBe('GUNNER FEED');
  });
});
