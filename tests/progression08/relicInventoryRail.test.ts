// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import type { MatchState } from '../../src/shared/types';
import { RelicInventoryRail } from '../../src/client/progression/relicInventoryRail';

afterEach(() => {
  document.body.replaceChildren();
});

function state(stacks: Record<string, number>, order: string[]): MatchState {
  return { teamProgression: { relicStacks: stacks, relicAcquisitionOrder: order } } as unknown as MatchState;
}

describe('persistent relic inventory rail', () => {
  it('uses stable acquisition order, fallback art, and incremental stack updates', () => {
    const container = document.createElement('main');
    document.body.appendChild(container);
    const rail = new RelicInventoryRail(container, (id) => ({
      label: id === 'relic.alpha' ? 'ALPHA CORE' : 'BETA CORE',
      description: id === 'relic.alpha' ? 'Max integrity +200.' : 'Unrelated authored copy.',
      rarity: id === 'relic.alpha' ? 'rare' : 'common',
      iconId: `${id}.icon`,
      iconUrl: null,
    }));

    rail.update(state({ 'relic.beta': 1, 'relic.alpha': 1 }, ['relic.alpha', 'relic.beta']));
    const cells = [...container.querySelectorAll<HTMLElement>('.relic-rail-cell')];
    expect(cells.map((cell) => cell.title)).toEqual([
      'ALPHA CORE — Max integrity +200.',
      'BETA CORE — Unrelated authored copy.',
    ]);
    expect(container.textContent).not.toContain('relic.');
    expect(container.querySelectorAll('img')).toHaveLength(0);
    expect(container.querySelectorAll('.relic-rail-icon--fallback')).toHaveLength(2);

    const alphaCell = cells[0];
    rail.update(state({ 'relic.beta': 1, 'relic.alpha': 3 }, ['relic.alpha', 'relic.beta']));
    expect(container.querySelector('.relic-rail-cell')).toBe(alphaCell);
    expect(alphaCell.textContent).toContain('×3');
    expect(alphaCell.title).toBe('ALPHA CORE ×3 — Max integrity +200.');
    expect(alphaCell.classList.contains('relic-rail-cell--stacked')).toBe(true);
    rail.dispose();
    expect(container.children).toHaveLength(0);
  });

  it('uses measured HUD clusters for the available vertical lane', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
    const top = document.createElement('div');
    top.id = 'hud-right';
    top.getBoundingClientRect = () => ({ bottom: 170 } as DOMRect);
    const bottom = document.createElement('div');
    bottom.id = 'hud-role-actions';
    bottom.getBoundingClientRect = () => ({ top: 710 } as DOMRect);
    const container = document.createElement('main');
    document.body.append(top, bottom, container);
    const rail = new RelicInventoryRail(container, () => ({
      label: 'RELIC', rarity: 'common', iconId: 'icon.relic', iconUrl: null,
    }));
    rail.update(state({ relic: 1 }, ['relic']));
    const root = container.querySelector<HTMLElement>('#relic-inventory-rail')!;
    expect(root.style.top).toBe('182px');
    expect(root.style.bottom).toBe('202px');
  });
});
