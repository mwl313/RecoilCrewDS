// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TacticalDrawer } from '../src/client/tactical/tacticalDrawer';
import type { ArenaWorld } from '../src/shared/sim/arenaWorld';

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
});
