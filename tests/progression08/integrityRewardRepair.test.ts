import { describe, expect, it } from 'vitest';
import { repairForMaxIntegrityGain } from '../../src/shared/progression/maxIntegrityRewardRepair';
import type { UpgradeCard } from '../../src/shared/progression/progressionTypes';
import { claimChest, completeRelicReveal, makeMatch } from './helpers';

function resolveUpgrade(m: ReturnType<typeof makeMatch>, card: UpgradeCard): void {
  m.systems.progression.addXp(1_000);
  const active = m.state.teamProgression.activeSelection;
  if (!active?.singlePlayerOffer) throw new Error('expected a single-player upgrade offer');
  active.singlePlayerOffer[0] = card;
  const result = m.submitProgressionSelection('single', active.offerId, 0);
  expect(result.accepted).toBe(true);
}

function acquireRelic(m: ReturnType<typeof makeMatch>, relicId: string, nowMs: number): void {
  const chest = m.systems.progression.spawnChest('map', m.state.tank.x + 2, m.state.tank.z);
  const offer = claimChest(m, chest, nowMs);
  offer.candidates[0].relicId = relicId;
  const openSeconds = m.rules.relicChestSpawnPolicy?.openAnimationSeconds ?? 0.65;
  m.checkProgressionTimeout(nowMs + openSeconds * 1_000 + 1);
}

describe('max-integrity reward repair', () => {
  it('repairs only gained capacity, is inert on refresh, and clamps a decrease', () => {
    const tank = { integrity: 55, deadT: 0 };
    expect(repairForMaxIntegrityGain(tank, 100, 120)).toEqual({
      maxBefore: 100, maxAfter: 120, gained: 20, repaired: 20,
    });
    expect(tank.integrity).toBe(75);
    expect(repairForMaxIntegrityGain(tank, 120, 120).repaired).toBe(0);
    tank.integrity = 110;
    expect(repairForMaxIntegrityGain(tank, 120, 90)).toEqual({
      maxBefore: 120, maxAfter: 90, gained: 0, repaired: 0,
    });
    expect(tank.integrity).toBe(90);
  });

  it('never revives a dead tank', () => {
    const tank = { integrity: 0, deadT: 1 };
    expect(repairForMaxIntegrityGain(tank, 100, 120).repaired).toBe(0);
    expect(tank.integrity).toBe(0);
  });

  it('wraps one accepted level-up transaction and repairs its aggregate resolved gain', () => {
    const m = makeMatch();
    m.state.tank.integrity = 43;
    resolveUpgrade(m, {
      cardId: 'armor-bundle',
      categoryId: 'upgrade.tank.maxIntegrity',
      rarity: 'rare',
      rolledEffects: [
        { statId: 'tank.maxIntegrity', operation: 'add', value: 12 },
        { statId: 'tank.maxIntegrity', operation: 'add', value: 20 },
      ],
    });
    expect(m.rules.resolver.resolve('tank.maxIntegrity')).toBe(132);
    expect(m.state.tank.integrity).toBe(75);
  });

  it('repairs each successful HEARTY TANK stack once, never on reprojection', () => {
    const m = makeMatch();
    m.state.tank.integrity = 45;
    acquireRelic(m, 'relic.hearty_tank', 1_000);
    expect(m.rules.resolver.resolve('tank.maxIntegrity')).toBe(120);
    expect(m.state.tank.integrity).toBe(65);

    completeRelicReveal(m);
    acquireRelic(m, 'relic.hearty_tank', 3_000);
    expect(m.rules.resolver.resolve('tank.maxIntegrity')).toBe(140);
    expect(m.state.tank.integrity).toBe(85);

    m.systems.progression.projectionRefresh();
    expect(m.state.tank.integrity).toBe(85);
  });

  it('allows max growth but no repair when the tank is dead', () => {
    const m = makeMatch();
    m.state.tank.integrity = 0;
    m.state.tank.deadT = 1;
    acquireRelic(m, 'relic.hearty_tank', 1_000);
    expect(m.rules.resolver.resolve('tank.maxIntegrity')).toBe(120);
    expect(m.state.tank.integrity).toBe(0);
  });
});
