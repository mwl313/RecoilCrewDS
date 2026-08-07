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
  revealStartedAtWallMs?: number;
  continueAllowedAtWallMs?: number;
  driverRelicAcknowledged?: boolean;
  gunnerRelicAcknowledged?: boolean;
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
    revealStartedAtWallMs: 0,
    continueAllowedAtWallMs: 350,
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
  sounds: Array<{ name: string; rarity?: string; progress?: number }>;
  impacts: number[];
  root: HTMLElement;
  selectionHost: HTMLElement;
  relicHost: HTMLElement;
  debugHost: HTMLElement;
} {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const selected: number[] = [];
  const skipped: number[] = [];
  const sounds: Array<{ name: string; rarity?: string; progress?: number }> = [];
  const impacts: number[] = [];
  const overlay = new ProgressionOverlay(container, {
    selectUpgrade: (index) => selected.push(index),
    acknowledgeRelic: () => skipped.push(1),
    rewardSound: (name, detail) => sounds.push({ name, ...detail }),
    rewardImpact: (intensity) => impacts.push(intensity),
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
  return { overlay, container, selected, skipped, sounds, impacts, root, selectionHost, relicHost, debugHost };
}

describe('progression overlay lifecycle (progression08 hardening)', () => {
  it('relic presentation is visible without an upgrade selection', () => {
    const { overlay, relicHost, selectionHost, root } = mount();
    const state = fakeState({
      matchFlow: 'relicSelection',
      teamProgression: { activeSelection: relicReveal(1, 1) },
    });
    overlay.update(state, 'single', 0);
    expect(root.hidden).toBe(false);
    expect(selectionHost.hidden).toBe(true);
    expect(relicHost.hidden).toBe(false);
    expect(relicHost.textContent).toContain('MAGNET CORE');
    expect(relicHost.textContent).toContain('×1');
    expect(relicHost.textContent).toContain('XP magnet radius +50% per stack.');
  });

  it('hiding the selection layer does not destroy an active relic presentation', () => {
    const { overlay, selectionHost, relicHost } = mount();
    overlay.update(fakeState({ matchFlow: 'upgradeSelection', teamProgression: { activeSelection: upgradeSelection() } }), 'single', 0);
    expect(selectionHost.hidden).toBe(false);
    overlay.update(fakeState({ matchFlow: 'relicSelection', teamProgression: { activeSelection: relicReveal(1, 1) } }), 'single', 1);
    expect(selectionHost.hidden).toBe(true);
    expect(relicHost.textContent).toContain('MAGNET CORE');
    overlay.update(fakeState({ matchFlow: 'upgradeSelection', teamProgression: { activeSelection: upgradeSelection() } }), 'single', 2);
    expect(selectionHost.hidden).toBe(false);
    expect(relicHost.textContent).toContain('MAGNET CORE');
  });

  it('subtle final-three-second fuse updates without rebuilding card DOM', () => {
    const { overlay, selectionHost } = mount();
    const state = fakeState({ matchFlow: 'upgradeSelection', teamProgression: { activeSelection: upgradeSelection() } });
    overlay.update(state, 'single', 0);
    const timer = selectionHost.querySelector('[data-progression-timer]')!;
    expect(timer.textContent).toBe('');
    const firstButton = selectionHost.querySelectorAll('button')[0];
    const buttonCount = selectionHost.querySelectorAll('button').length;
    overlay.update(state, 'single', 8000);
    expect(timer.textContent).toContain('AUTO 2');
    expect(selectionHost.querySelectorAll('button').length).toBe(buttonCount);
    expect(selectionHost.querySelectorAll('button')[0]).toBe(firstButton);
  });

  it('formats absolute combat upgrades in display units without scaling percentages', () => {
    const { overlay, selectionHost } = mount();
    overlay.update(
      fakeState({ matchFlow: 'upgradeSelection', teamProgression: { activeSelection: upgradeSelection() } }),
      'single',
      0,
    );
    const effects = [...selectionHost.querySelectorAll<HTMLElement>('.reward-card__effect')]
      .map((node) => node.textContent ?? '');
    expect(effects[1]).toContain('MG DAMAGE\n+10%');
    expect(effects[2]).toContain('MAX INTEGRITY\n+100');
    expect(effects[2]).not.toContain('+1,000');
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

  it('has no relic countdown and early input fast-forwards without acknowledging', () => {
    const { overlay, relicHost, skipped, impacts, root } = mount();
    const state = fakeState({ matchFlow: 'relicSelection', teamProgression: { activeSelection: relicReveal(3, 1) } });
    overlay.update(state, 'single', 0);
    expect(relicHost.textContent).not.toMatch(/auto\s+\d|skip\s+available/i);
    overlay.handleInput({ dx: 0, actions: [{ kind: 'confirm' }] });
    expect(skipped).toEqual([]);
    expect(relicHost.dataset['phase']).toBe('revealed');
    expect(impacts).toHaveLength(1);
    expect(root.classList.contains('reward-overlay--shake')).toBe(true);
    overlay.update(state, 'single', 300);
    overlay.handleInput({ dx: 0, actions: [{ kind: 'confirm' }] });
    expect(skipped).toEqual([1]);
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
    expect(root.hidden).toBe(true);
    expect(selectionHost.hidden).toBe(true);
    expect(relicHost.hidden).toBe(true);
  });

  it('single player omits peer status while Multiplayer reports real readiness', () => {
    const { overlay, root } = mount();
    const single = fakeState({ matchFlow: 'upgradeSelection', teamProgression: { activeSelection: upgradeSelection('sp') } });
    overlay.update(single, 'single', 2_000);
    expect(root.querySelector('.reward-peer-status')).toBeNull();
    const multiplayer = upgradeSelection('mp');
    multiplayer.singlePlayerOffer = undefined;
    multiplayer.driverOffer = upgradeSelection('source').singlePlayerOffer;
    multiplayer.driverSelection = 1;
    overlay.update(fakeState({ matchFlow: 'upgradeSelection', teamProgression: { activeSelection: multiplayer } }), 'driver', 3_000);
    expect(root.textContent).toContain('YOU // READY');
    expect(root.textContent).toContain('GUNNER // CHOOSING...');
  });

  it('matches the relic outline to the currently visible reel rarity before revealing the result', () => {
    const { overlay, relicHost } = mount();
    const selection = relicReveal(14, 1);
    selection.relicResult!.rarity = 'legendary';
    const state = fakeState({ matchFlow: 'relicSelection', teamProgression: { activeSelection: selection } });
    overlay.update(state, 'single', 0);
    const plate = relicHost.querySelector<HTMLElement>('.reward-relic')!;
    const firstSymbol = relicHost.querySelector<HTMLElement>('.reward-relic__symbol')!;
    expect(plate.dataset['rarity']).toBe(firstSymbol.dataset['rarity']);
    expect(relicHost.querySelector('.reward-relic__roulette-outline--flash')).not.toBeNull();
    overlay.update(state, 'single', 2_551);
    expect(plate.dataset['rarity']).toBe('legendary');
  });

  it('manual upgrade selection throws sparks and shakes immediately', () => {
    const { overlay, selectionHost, impacts, selected, root } = mount();
    const state = fakeState({ matchFlow: 'upgradeSelection', teamProgression: { activeSelection: upgradeSelection() } });
    overlay.update(state, 'single', 0);
    selectionHost.querySelector<HTMLButtonElement>('.reward-card')!.click();
    expect(selected).toEqual([0]);
    expect(impacts).toHaveLength(1);
    expect(root.classList.contains('reward-overlay--shake')).toBe(true);
    expect(root.querySelectorAll('.reward-shard--active').length).toBeGreaterThan(0);
  });

  it('builds a real clipped reel track with at least eight full symbol cells per card', () => {
    const { overlay, selectionHost } = mount();
    overlay.update(fakeState({ matchFlow: 'upgradeSelection', teamProgression: { activeSelection: upgradeSelection() } }), 'single', 0);
    const windows = [...selectionHost.querySelectorAll('.reward-card__reel-window')];
    expect(windows).toHaveLength(3);
    for (const window of windows) expect(window.querySelectorAll('.reward-card__symbol').length).toBeGreaterThanOrEqual(8);
  });

  it('fires natural relic final impact exactly once and never replays it on repeated snapshots', () => {
    const { overlay, sounds, impacts } = mount();
    const state = fakeState({ matchFlow: 'relicSelection', teamProgression: { activeSelection: relicReveal(11, 1) } });
    overlay.update(state, 'single', 0);
    expect(sounds.filter((sound) => sound.name === 'relicLock')).toHaveLength(0);
    overlay.update(state, 'single', 2_551);
    overlay.update(state, 'single', 2_620);
    expect(sounds.filter((sound) => sound.name === 'relicLock')).toEqual([
      { name: 'relicLock', rarity: 'common' },
    ]);
    expect(impacts).toHaveLength(1);
    overlay.handleInput({ dx: 0, actions: [{ kind: 'confirm' }] });
    expect(impacts).toHaveLength(1);
  });

  it('passes the authoritative rarity to each card lock callback', () => {
    const { overlay, sounds } = mount();
    const state = fakeState({ matchFlow: 'upgradeSelection', teamProgression: { activeSelection: upgradeSelection() } });
    overlay.update(state, 'single', 0);
    overlay.update(state, 'single', 1_451);
    expect(sounds.filter((sound) => sound.name === 'cardLock')).toEqual([
      { name: 'cardLock', rarity: 'epic' },
    ]);
  });
});
