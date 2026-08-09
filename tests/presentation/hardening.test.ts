// @vitest-environment happy-dom
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import * as THREE from 'three';
import { AssetService } from '../../src/client/assets';
import { AssetTransformResolver } from '../../src/client/assets/assetTransformResolver';
import { SceneActionRegistry } from '../../src/client/presentation/actionRegistry';
import { UiComponentRegistry } from '../../src/client/presentation/componentRegistry';
import { registerDefaultUiComponents } from '../../src/client/presentation/uiComponents';
import { SceneRuntime } from '../../src/client/presentation/sceneRuntime';
import { SceneFlowPresenter } from '../../src/client/presentation/sceneFlowPresenter';
import { HudProjector, emptyHudViewModel } from '../../src/client/presentation/hudViewModel';
import { BASE_CONFIG } from '../../src/shared/config';
import { loadContentPackFromFilesystem } from '../../src/shared/content/contentLoader';
import { MatchRules } from '../../src/shared/rules/matchRules';
import { HUD_BINDING_PATHS } from '../../src/shared/presentation/schemas';
import type { UiNodeInput } from '../../src/shared/presentation/schemas';
import { PRESENTATION_HUDS } from '../../src/generated/presentationContent.generated';

const CONTENT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../content');

function makeRuntime(container: HTMLElement): { runtime: SceneRuntime; actions: SceneActionRegistry } {
  const registry = new UiComponentRegistry();
  registerDefaultUiComponents(registry);
  const actions = new SceneActionRegistry();
  const runtime = new SceneRuntime({ actions, registry }, container);
  return { runtime, actions };
}

function readPath(context: Record<string, unknown>, source: string): unknown {
  let current: unknown = context;
  for (const part of source.split('.')) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function walkUi(node: UiNodeInput, visit: (n: UiNodeInput) => void): void {
  visit(node);
  for (const child of node.children ?? []) walkUi(child, visit);
}

function state(partial: Partial<Record<string, unknown>> = {}): never {
  return {
    tank: {
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, yawVel: 0, pitch: 0, roll: 0,
      grounded: true, dashCooldown: 0, dashPresentationT: 0, dashDamageT: 0, drift: false, deadT: 0, prevOnRamp: false,
      ...(partial.tank as Record<string, unknown> | undefined),
    },
    turret: {
      yaw: 0, pitch: 0, cannonCooldown: 0, mgCooldown: 0, mgFiring: false,
      cannonHeld: false, cannonHoldT: 0, cannonChargeRatio: 0, cannonChargeFull: false,
      cannonFlash: 0,
      ...(partial.turret as Record<string, unknown> | undefined),
    },
    combo: { multiplier: 1, points: 0, lastDriverT: 0, lastGunnerT: 0, lastAnyT: 0, best: 1 },
    build: { capabilities: [] },
    stats: {
      score: 0, chargedCannonShots: 0, fullChargeShots: 0, scrapCollected: 0, kills: 0, links: 0, wipeouts: 0,
      bestCombo: 1, dashKills: 0, dodgeCount: 0, anyContribution: false,
    },
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
  } as never;
}

describe('Refractor 02 hardening — P0 fixes', () => {
  it('P0-1: SceneFlowPresenter starts the hybrid world exactly once per show and disposes on leave', () => {
    const container = document.createElement('div');
    const themeRoot = document.createElement('div');
    const registry = new UiComponentRegistry();
    registerDefaultUiComponents(registry);
    const flow = new SceneFlowPresenter(container, themeRoot, registry);
    const started: number[] = [];
    const disposed: number[] = [];
    let next = 0;
    flow.setPresentationFactory((() => {
      const id = next++;
      return {
        start: () => started.push(id),
        dispose: () => disposed.push(id),
      };
    }) as never);
    flow.bind({} as never);
    flow.showState('main');
    expect(started).toEqual([0]);
    flow.showState('create');
    expect(disposed).toEqual([0]);
    flow.showState('main');
    expect(started).toEqual([0, 1]);
    flow.setGameVisible(true);
    expect(disposed).toEqual([0, 1]);
  });

  it('P0-6: app.pause is a registered scene action that reaches the pause handler', () => {
    const container = document.createElement('div');
    const themeRoot = document.createElement('div');
    const registry = new UiComponentRegistry();
    registerDefaultUiComponents(registry);
    const flow = new SceneFlowPresenter(container, themeRoot, registry);
    const onPause = vi.fn();
    flow.bind({ onPause } as never);
    expect(flow.actionRegistry.has('app.pause')).toBe(true);
    flow.actionRegistry.execute('app.pause');
    expect(onPause).toHaveBeenCalledTimes(1);

    // The live HUD document must wire the pause button to app.pause (not resume).
    const hud = PRESENTATION_HUDS['hud.gameplay'];
    let pauseAction = '';
    walkUi(hud.root, (n) => {
      if (n.id === 'pause-btn') pauseAction = n.actions?.[0]?.action ?? '';
    });
    expect(pauseAction).toBe('app.pause');
  });

  it('P0-5: every HUD binding/prop source resolves on the empty view model and the allowlist has no stale paths', () => {
    const vm = emptyHudViewModel() as unknown as Record<string, unknown>;
    const hud = PRESENTATION_HUDS['hud.gameplay'];
    const sources = new Set<string>();
    walkUi(hud.root, (n) => {
      for (const b of n.bindings ?? []) sources.add(b.source);
      for (const key of ['valueSource', 'maxSource', 'listSource'] as const) {
        const src = (n.props as Record<string, unknown> | undefined)?.[key];
        if (typeof src === 'string') sources.add(src);
      }
    });
    for (const source of sources) {
      if (source.startsWith('item.')) continue;
      expect(readPath(vm, source), `hud document source ${source}`).not.toBeUndefined();
    }
    for (const allowed of HUD_BINDING_PATHS) {
      expect(readPath(vm, allowed), `allowlisted path ${allowed}`).not.toBeUndefined();
    }
    expect(HUD_BINDING_PATHS).not.toContain('combo.hot');
    expect(HUD_BINDING_PATHS).not.toContain('cooldownRatio');
    expect(HUD_BINDING_PATHS).not.toContain('gunner.machineGunHeat');
    expect(sources.has('combo.hot')).toBe(false);
    expect(sources.has('cooldownRatio')).toBe(false);
  });

  it('P0-4: SceneRuntime constructs nodes through the component registry', async () => {
    const container = document.createElement('div');
    const registry = new UiComponentRegistry();
    registerDefaultUiComponents(registry);
    registry.register({
      type: 'customThing',
      schema: z.object({}).strict(),
      create: (def) => {
        const el = document.createElement('div');
        el.id = def.id;
        el.dataset.custom = '1';
        return {
          id: def.id,
          element: el,
          mount(parent) {
            parent.appendChild(el);
          },
          setVisible() {},
          dispose() {
            el.remove();
          },
        };
      },
      inspector: { label: 'Custom', fields: [] },
    });
    const runtime = new SceneRuntime({ actions: new SceneActionRegistry(), registry }, container);
    await runtime.load({
      id: 'scene.custom',
      label: 'Custom',
      type: 'ui',
      root: { id: 'root', type: 'customThing', children: [] } as unknown as UiNodeInput,
    });
    expect(container.querySelector('[data-custom="1"]')).not.toBeNull();
    runtime.unload();
  });

  it('P0-4: every default registration carries a component-specific schema (no z.any())', () => {
    const registry = new UiComponentRegistry();
    registerDefaultUiComponents(registry);
    for (const type of registry.types()) {
      const registration = registry.get(type);
      expect(registration, type).toBeDefined();
      // z.any() would accept any value; a real component schema rejects a string.
      expect(registration!.schema.safeParse('nope').success, type).toBe(false);
      expect(registration!.schema.safeParse({}).success, type).toBe(true);
      expect(registration!.inspector.label.length, type).toBeGreaterThan(0);
    }
  });
});

describe('Refractor 02 hardening — P1 fixes', () => {
  it('P1-2: repeaters dispose stale item subtrees and scope instance ids', async () => {
    const container = document.createElement('div');
    const { runtime } = makeRuntime(container);
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
            type: 'text',
            bindings: [{ target: 'text', source: 'item.label' }],
          },
        ],
      },
    });
    runtime.setContext({ items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] });
    const firstItem = container.querySelector('[data-repeater-item]') as HTMLElement;
    const oldFirst = runtime.getNode('item::0');
    expect(oldFirst).toBeDefined();

    runtime.setContext({ items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }] });
    expect(container.querySelectorAll('[data-repeater-item]').length).toBe(3);
    expect(container.contains(firstItem)).toBe(false); // old subtree disposed
    const newFirst = runtime.getNode('item::0');
    expect(newFirst).toBeDefined();
    expect(newFirst).not.toBe(oldFirst);

    // Same signature must not rebuild or accumulate DOM.
    const nodeCount = container.querySelectorAll('*').length;
    runtime.setContext({ items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }] });
    expect(container.querySelectorAll('*').length).toBe(nodeCount);
    runtime.unload();
  });

  it('P1-4: enter/leave transitions replay per cached show', async () => {
    vi.useFakeTimers();
    try {
      const container = document.createElement('div');
      const { runtime } = makeRuntime(container);
      await runtime.load({
        id: 'scene.trans',
        label: 'Trans',
        type: 'ui',
        enterTransition: { type: 'fade', durationMs: 0 },
        exitTransition: { type: 'fade', durationMs: 100 },
        root: { id: 'root', type: 'container' },
      });
      const root = container.querySelector('#root') as HTMLElement;
      runtime.leave();
      expect(root.classList.contains('scene-exit')).toBe(true);
      expect(root.classList.contains('hidden')).toBe(false); // hides after the exit window
      vi.advanceTimersByTime(150);
      expect(root.classList.contains('hidden')).toBe(true);
      runtime.enter();
      expect(root.classList.contains('hidden')).toBe(false);
      expect(root.classList.contains('scene-enter')).toBe(true);
      runtime.unload();
    } finally {
      vi.useRealTimers();
    }
  });

  it('P1-6: HudProjector denominators come from resolved rules and fall back to BASE_CONFIG', () => {
    const projector = new HudProjector();
    const base = projector.project(
      state({ tank: { integrity: 150 }, turret: { cannonHeld: true, cannonHoldT: 0.25, cannonChargeRatio: 0.25, cannonChargeFull: false, cannonCooldown: 1.2 } }),
      {
        role: 'driver',
        peerConnected: true,
        ping: 0,
        fps: 60,
        pointerLocked: true,
        session: { kind: 'multiplayer', showRoleIdentity: true, showPeerStatus: true },
        objective: null,
        rules: { maxIntegrity: 200, cannonCooldown: 2.0, chargeTapMaxSeconds: 0.16, chargeFullSeconds: 1.0 },
      },
    );
    expect(base.tank.integrityMax).toBe(200);
    expect(base.tank.integrityText).toBe('1,500 / 2,000');
    expect(base.tank.integrityLow).toBe(false);
    expect(base.gunner.cooldownRatio).toBeCloseTo(0.6);
    expect(base.gunner.chargeRatio).toBeCloseTo(0.25);

    const fallback = projector.project(
      state(),
      { role: 'driver', peerConnected: true, ping: 0, fps: 60, pointerLocked: true, session: { kind: 'multiplayer', showRoleIdentity: true, showPeerStatus: true }, objective: null },
    );
    expect(fallback.tank.integrityMax).toBe(BASE_CONFIG.tank.maxIntegrity);
    const percentageLow = projector.project(
      state({ tank: { integrity: 60 } }),
      { role: 'driver', peerConnected: true, ping: 0, fps: 60, pointerLocked: true, session: { kind: 'multiplayer', showRoleIdentity: true, showPeerStatus: true }, objective: null, rules: { maxIntegrity: 200 } },
    );
    expect(percentageLow.tank.integrityLow).toBe(true);
  });

  it('P1-6: the replicated movement block carries weapon values (and modifier changes)', () => {
    const pack = loadContentPackFromFilesystem(CONTENT_ROOT);
    const none = MatchRules.fromContentPack(pack, 'none');
    expect(none.movementBlock().weapon).toEqual({
      cannonCooldown: BASE_CONFIG.weapons.cannonCooldown,
      cannonSpeed: BASE_CONFIG.weapons.cannonSpeed,
      cannonGravity: BASE_CONFIG.weapons.cannonGravity,
      cannonLife: BASE_CONFIG.weapons.cannonLife,
      chargeTapMaxSeconds: BASE_CONFIG.weapons.chargeTapMaxSeconds,
      chargeFullSeconds: BASE_CONFIG.weapons.chargeFullSeconds,
    });
    const doubleBarrel = MatchRules.fromContentPack(pack, 'doubleBarrel');
    expect(doubleBarrel.movementBlock().weapon?.cannonCooldown).toBe(2.4);
  });

  it('P0-3: project models with a catalog fallback resolve after AssetService.load (no hardcode)', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({ ok: false })) as unknown as typeof fetch;
    try {
      const service = await AssetService.load({
        gltfLoaderFactory: async () => ({
          load(_url: string, onLoad: (gltf: { scene: THREE.Object3D }) => void) {
            onLoad({ scene: new THREE.Group() });
          },
        }),
      });
      const menuTank = service.model('scene.menuTank');
      expect(menuTank).toBeInstanceOf(THREE.Object3D);
      // Project transform (scale 1.2) applies to the fallback prototype clone.
      expect(menuTank.scale.x).toBeCloseTo(1.2);
      expect(service.assetUrl('scene.menuTank')).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('applies ordered palette overrides to named materials on multi-material GLB meshes', () => {
    const root = new THREE.Group();
    const main = new THREE.MeshStandardMaterial({ color: 0xffffff });
    main.name = 'Main';
    const dark = new THREE.MeshStandardMaterial({ color: 0xffffff });
    dark.name = 'Main_Dark';
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), [main, dark]);
    mesh.name = 'chassis_body';
    root.add(mesh);

    new AssetTransformResolver().apply(root, 'playerTank.chassis', undefined, [
      { match: 'Main', color: 0xa88e55 },
      { match: 'Main_Dark', color: 0x4a5034 },
    ]);

    expect(main.color.getHex()).toBe(0xa88e55);
    expect(dark.color.getHex()).toBe(0x4a5034);
  });
});
