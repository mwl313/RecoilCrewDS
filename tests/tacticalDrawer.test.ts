// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TacticalDrawer } from '../src/client/tactical/tacticalDrawer';
import type { ArenaWorld } from '../src/shared/sim/arenaWorld';
import type { MatchState } from '../src/shared/types';
import type { ProgressionDebugControls } from '../src/client/tactical/progressionDebugPanel';

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('tactical drawer assembly', () => {
  it('keeps the noninteractive nub and panel in one transformed shell', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
    const container = document.createElement('div');
    const appRoot = document.createElement('div');
    appRoot.className = 'app-root';
    container.appendChild(appRoot);
    document.body.appendChild(container);
    const world = {
      half: 100,
      bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
      obstacles: [],
    } as unknown as ArenaWorld;
    const drawer = new TacticalDrawer(container, world);
    const root = container.querySelector('#tactical-drawer')!;
    const panel = root.querySelector('.tactical-drawer__panel');
    const nub = root.querySelector('.tactical-drawer__nub');

    expect(panel).not.toBeNull();
    expect(nub).not.toBeNull();
    expect(nub?.getAttribute('aria-hidden')).toBe('true');
    expect(root.getAttribute('aria-hidden')).toBe('true');
    expect(root.classList.contains('is-open')).toBe(false);

    drawer.toggle();
    expect(root.classList.contains('is-open')).toBe(true);
    expect(root.getAttribute('aria-hidden')).toBe('false');
    expect(appRoot.classList.contains('tactical-open')).toBe(true);

    drawer.toggle();
    expect(root.classList.contains('is-open')).toBe(false);
    drawer.dispose();
  });

  it('accepts the same aggregate-sector contract in single and multiplayer and clears it on materialization', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
    const container = document.createElement('div');
    container.appendChild(document.createElement('div')).className = 'app-root';
    document.body.appendChild(container);
    const world = {
      half: 200,
      bounds: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 },
      obstacles: [],
    } as unknown as ArenaWorld;
    const state = {
      enemies: [],
      chests: [],
      teamProgression: { level: 1, levelUpgradeSummary: [] },
    } as unknown as MatchState;
    const sector = {
      sectorId: 4,
      x: 120,
      z: -80,
      count: 14,
      enemyDefId: 'enemy.testHound',
      presentationSeed: 22,
    };
    const drawer = new TacticalDrawer(container, world);
    drawer.toggle();

    drawer.update({ state, tank: { x: 0, z: 0, yaw: 0 }, role: 'single', sectors: [sector] });
    expect(drawer.diagnostics()).toMatchObject({ open: true, renderedSectors: 1 });
    expect(container.querySelector('#tactical-drawer')?.getAttribute('data-role')).toBe('single');

    drawer.update({ state, tank: { x: 0, z: 0, yaw: 0 }, role: 'driver', sectors: [sector] });
    expect(drawer.diagnostics().renderedSectors).toBe(1);
    expect(container.querySelector('#tactical-drawer')?.getAttribute('data-role')).toBe('driver');

    drawer.update({ state, tank: { x: 0, z: 0, yaw: 0 }, role: 'driver', sectors: [] });
    expect(drawer.diagnostics().renderedSectors).toBe(0);
    drawer.dispose();
  });

  it('replaces the minimap with interactive progression controls in debug mode', () => {
    const container = document.createElement('div');
    container.appendChild(document.createElement('div')).className = 'app-root';
    document.body.appendChild(container);
    const world = {
      half: 100,
      bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
      obstacles: [],
    } as unknown as ArenaWorld;
    const state = {
      enemies: [],
      chests: [],
      teamProgression: {
        level: 1,
        relicStacks: {},
        levelUpgradeSummary: [],
      },
    } as unknown as MatchState;
    const addRelic = vi.fn(() => ({ accepted: true, message: 'added relic' }));
    const addUpgrade = vi.fn(() => ({ accepted: true, message: 'added upgrade' }));
    const controls: ProgressionDebugControls = {
      catalog: () => ({
        available: true,
        relics: [{
          id: 'relic.test',
          label: 'TEST RELIC',
          rarity: 'common',
          role: 'crew',
          maximumStacks: null,
        }],
        upgrades: [{
          id: 'upgrade.test',
          label: 'TEST UPGRADE',
          role: 'driver',
          statIds: ['tank.forwardSpeed'],
        }],
      }),
      addRelic,
      addUpgrade,
    };
    const drawer = new TacticalDrawer(container, world, undefined, controls);
    drawer.toggle();
    drawer.update({ state, tank: { x: 0, z: 0, yaw: 0 }, role: 'single', sectors: [] });

    expect(container.querySelector('#tactical-minimap')).toBeNull();
    expect(container.querySelector('#tactical-progression-debug')).not.toBeNull();
    (container.querySelector('button[data-debug-action="relic"]') as HTMLButtonElement).click();
    expect(addRelic).toHaveBeenCalledWith('relic.test');

    (container.querySelector('button[data-debug-tab="upgrades"]') as HTMLButtonElement).click();
    (container.querySelector('.tactical-debug__rarity') as HTMLSelectElement).value = 'epic';
    (container.querySelector('button[data-debug-action="upgrade"]') as HTMLButtonElement).click();
    expect(addUpgrade).toHaveBeenCalledWith('upgrade.test', 'epic');
    drawer.dispose();
  });
});
