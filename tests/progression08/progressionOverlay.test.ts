// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { ProgressionOverlay } from '../../src/client/progression/progressionOverlay';
import type { MatchState } from '../../src/shared/types';

const mounted: ProgressionOverlay[] = [];

afterEach(() => {
  for (const overlay of mounted) overlay.dispose();
  mounted.length = 0;
});

interface FakeSelection {
  offerId: string;
  kind: 'upgrade' | 'relic';
  level: number;
  expiresAtWallMs: number;
  driverOffer?: Array<{ cardId: string; categoryId: string; rarity: string; rolledEffects: Array<{ statId: string; operation: 'multiply' | 'add'; value: number }> }>;
  singlePlayerOffer?: FakeSelection['driverOffer'];
  driverSelection?: number;
  gunnerSelection?: number;
  singlePlayerSelection?: number;
  relicResult?: {
    relicId: string;
    rarity: string;
    duplicateConverted: boolean;
    replacementXp: number;
    stackCountAfter: number;
    acquisitionSequence: number;
  };
  resolved?: boolean;
}

interface FakeTeamProgression {
  activeSelection: FakeSelection | null;
  lastRelicResult: FakeSelection['relicResult'] | null;
  relicAcquisitionSequence: number;
}

function fakeState(partial: {
  matchFlow?: string;
  teamProgression?: Partial<FakeTeamProgression>;
}): MatchState {
  const teamProgression: FakeTeamProgression = {
    activeSelection: partial.teamProgression?.activeSelection ?? null,
    lastRelicResult: partial.teamProgression?.lastRelicResult ?? null,
    relicAcquisitionSequence: partial.teamProgression?.relicAcquisitionSequence ?? 0,
  };
  return {
    matchFlow: partial.matchFlow ?? 'playing',
    teamProgression,
  } as unknown as MatchState;
}

function upgradeSelection(offerId = 'offer-1', selected?: number): FakeSelection {
  return {
    offerId,
    kind: 'upgrade',
    level: 2,
    expiresAtWallMs: 10_000,
    singlePlayerOffer: [
      {
        cardId: `${offerId}.0`,
        categoryId: 'upgrade.tank.dashDamage',
        rarity: 'epic',
        rolledEffects: [{ statId: 'tank.dashDamage', operation: 'multiply', value: 1.15 }],
      },
      {
        cardId: `${offerId}.1`,
        categoryId: 'upgrade.gunner.mgDamage',
        rarity: 'rare',
        rolledEffects: [{ statId: 'weapon.mgDamage', operation: 'multiply', value: 1.1 }],
      },
      {
        cardId: `${offerId}.2`,
        categoryId: 'upgrade.tank.maxIntegrity',
        rarity: 'common',
        rolledEffects: [{ statId: 'tank.maxIntegrity', operation: 'add', value: 10 }],
      },
    ],
    singlePlayerSelection: selected,
  };
}

function relicReveal(sequence: number, stack: number, duplicate = false): FakeSelection {
  return {
    offerId: `reveal-${sequence}`,
    kind: 'relic',
    level: 1,
    expiresAtWallMs: 20_000,
    relicResult: {
      relicId: 'relic.magnet_core',
      rarity: 'common',
      duplicateConverted: duplicate,
      replacementXp: duplicate ? 250 : 0,
      stackCountAfter: stack,
      acquisitionSequence: sequence,
    },
    resolved: false,
  };
}

function mount(): {
  overlay: ProgressionOverlay;
  container: HTMLElement;
  selected: number[];
  skipped: number[];
  root: HTMLElement;
  selectionHost: HTMLElement;
  relicHost: HTMLElement;
  debugHost: HTMLElement;
} {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const selected: number[] = [];
  const skipped: number[] = [];
  const overlay = new ProgressionOverlay(container, {
    selectUpgrade: (index) => selected.push(index),
    skipRelicPresentation: () => skipped.push(1),
    relicInfo: (id) =>
      id === 'relic.magnet_core'
        ? { label: 'MAGNET CORE', description: 'XP magnet radius +50% per stack.' }
      : null,
  });
  mounted.push(overlay);
  const root = document.getElementById('progression-overlay')!;
  const selectionHost = document.getElementById('progression-selection-layer')!;
  const relicHost = document.getElementById('progression-relic-layer')!;
  const debugHost = document.getElementById('progression-debug-layer')!;
  return { overlay, container, selected, skipped, root, selectionHost, relicHost, debugHost };
}

describe('progression overlay lifecycle (progression08 hardening)', () => {
  it('relic presentation is visible without an upgrade selection', () => {
    const { overlay, relicHost, selectionHost, root } = mount();
    const state = fakeState({
      matchFlow: 'relicSelection',
      teamProgression: { activeSelection: relicReveal(1, 1) },
    });
    overlay.update(state, 'single', 0);
    expect(root.style.display).not.toBe('none');
    expect(selectionHost.style.display).toBe('none');
    expect(relicHost.style.display).not.toBe('none');
    expect(relicHost.textContent).toContain('MAGNET CORE');
    expect(relicHost.textContent).toContain('×1');
    expect(relicHost.textContent).toContain('XP magnet radius +50% per stack.');
  });

  it('hiding the selection layer does not destroy an active relic presentation', () => {
    const { overlay, selectionHost, relicHost } = mount();
    overlay.update(fakeState({ matchFlow: 'upgradeSelection', teamProgression: { activeSelection: upgradeSelection() } }), 'single', 0);
    expect(selectionHost.style.display).not.toBe('none');
    overlay.update(fakeState({ matchFlow: 'relicSelection', teamProgression: { activeSelection: relicReveal(1, 1) } }), 'single', 1);
    expect(selectionHost.style.display).toBe('none');
    expect(relicHost.textContent).toContain('MAGNET CORE');
    overlay.update(fakeState({ matchFlow: 'upgradeSelection', teamProgression: { activeSelection: upgradeSelection() } }), 'single', 2);
    expect(selectionHost.style.display).not.toBe('none');
    expect(relicHost.textContent).toContain('MAGNET CORE');
  });

  it('timer text updates live without rebuilding card DOM', () => {
    const { overlay, selectionHost } = mount();
    const state = fakeState({ matchFlow: 'upgradeSelection', teamProgression: { activeSelection: upgradeSelection() } });
    overlay.update(state, 'single', 0);
    const timer = selectionHost.querySelector('[data-progression-timer]')!;
    expect(timer.textContent).toContain('10s');
    const firstButton = selectionHost.querySelectorAll('button')[0];
    const buttonCount = selectionHost.querySelectorAll('button').length;
    overlay.update(state, 'single', 3000);
    expect(timer.textContent).toContain('7s');
    expect(selectionHost.querySelectorAll('button').length).toBe(buttonCount);
    expect(selectionHost.querySelectorAll('button')[0]).toBe(firstButton);
  });

  it('same stackable relic presents again through the acquisition sequence', () => {
    const { overlay, relicHost } = mount();
    const first = fakeState({ matchFlow: 'relicSelection', teamProgression: { activeSelection: relicReveal(1, 1) } });
    overlay.update(first, 'single', 0);
    expect(relicHost.textContent).toContain('×1');
    const second = fakeState({ matchFlow: 'relicSelection', teamProgression: { activeSelection: relicReveal(2, 2) } });
    overlay.update(second, 'single', 1);
    expect(relicHost.textContent).toContain('×2');
    expect(relicHost.textContent).toContain('MAGNET CORE');
  });

  it('duplicate conversion presentation is visible', () => {
    const { overlay, relicHost } = mount();
    const state = fakeState({ matchFlow: 'relicSelection', teamProgression: { activeSelection: relicReveal(3, 1, true) } });
    overlay.update(state, 'single', 0);
    expect(relicHost.textContent).toContain('DUPLICATE');
    expect(relicHost.textContent).toContain('+250 XP');
  });

  it('local buttons disable after a selection is recorded', () => {
    const { overlay, selectionHost } = mount();
    const state = fakeState({ matchFlow: 'upgradeSelection', teamProgression: { activeSelection: upgradeSelection('offer-x', 1) } });
    overlay.update(state, 'single', 0);
    const buttons = [...selectionHost.querySelectorAll<HTMLButtonElement>('button')];
    expect(buttons.length).toBe(3);
    expect(buttons.every((b) => b.disabled)).toBe(true);
  });

  it('dispose removes every layer', () => {
    const { overlay, container, root, debugHost } = mount();
    overlay.dispose();
    expect(root.isConnected).toBe(false);
    expect(debugHost.isConnected).toBe(false);
    expect(container.children.length).toBe(0);
  });

  it('progression-disabled state creates no visible overlay', () => {
    const { overlay, root, selectionHost, relicHost } = mount();
    overlay.update(fakeState({}), 'single', 0);
    expect(root.style.display).toBe('none');
    expect(selectionHost.style.display).toBe('none');
    expect(relicHost.style.display).toBe('none');
  });
});
