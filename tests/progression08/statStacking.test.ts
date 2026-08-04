import { describe, expect, it } from 'vitest';
import { statModifier } from '../../src/shared/stats/statModifier';
import { applyUpgradeCard } from '../../src/shared/progression/upgradeEffectApplier';
import { makeMatch } from './helpers';
import type { UpgradeCard } from '../../src/shared/progression/progressionTypes';
import { createProgressionTelemetry } from '../../src/shared/progression/progressionTelemetry';

function card(factor: number): UpgradeCard {
  return {
    cardId: 'c',
    categoryId: 'upgrade.weapon.cannonRadius',
    rarity: 'common',
    rolledEffects: [{ statId: 'weapon.cannonRadius', operation: 'multiply', value: factor }],
  };
}

describe('stat stacking math (progression08)', () => {
  it('level-up cards multiply: 1.15 × 1.15', () => {
    const m = makeMatch();
    applyUpgradeCard(m.rules, 'offer.a', card(1.15), createProgressionTelemetry());
    applyUpgradeCard(m.rules, 'offer.b', card(1.15), createProgressionTelemetry());
    expect(m.rules.resolver.resolve('weapon.cannonRadius')).toBeCloseTo(3.4 * 1.15 * 1.15);
  });

  it('relic percent stacks add internally: +30% +30% = 1.60', () => {
    const m = makeMatch();
    m.state.teamProgression.relicStacks['relic.he_payload'] = 2;
    m.systems.progression.projectionRefresh();
    expect(m.rules.resolver.resolve('weapon.cannonRadius')).toBeCloseTo(3.4 * 1.6);
  });

  it('level-up and relic layers multiply: 1.56 × 1.60', () => {
    const m = makeMatch();
    applyUpgradeCard(m.rules, 'offer.a', card(1.2), createProgressionTelemetry());
    applyUpgradeCard(m.rules, 'offer.b', card(1.3), createProgressionTelemetry());
    m.state.teamProgression.relicStacks['relic.he_payload'] = 2;
    m.systems.progression.projectionRefresh();
    expect(m.rules.resolver.resolve('weapon.cannonRadius')).toBeCloseTo(3.4 * 1.2 * 1.3 * 1.6);
  });

  it('HEARTY TANK flat adds before level multiplier: (100+40)×1.2 = 168', () => {
    const m = makeMatch();
    m.state.teamProgression.relicStacks['relic.hearty_tank'] = 2;
    m.systems.progression.projectionRefresh();
    applyUpgradeCard(
      m.rules,
      'offer.a',
      {
        cardId: 'c',
        categoryId: 'upgrade.tank.maxIntegrity',
        rarity: 'rare',
        rolledEffects: [{ statId: 'tank.maxIntegrity', operation: 'multiply', value: 1.2 }],
      },
      createProgressionTelemetry(),
    );
    expect(m.rules.resolver.resolve('tank.maxIntegrity')).toBeCloseTo(168);
  });

  it('clamp applies last', () => {
    const m = makeMatch();
    m.rules.addModifier(
      statModifier('test.clamp', 'tank.dashCooldown', 'multiply', 0.5, {
        source: 'test',
        priority: 40,
        stacking: 'stack',
        min: 0.1,
      }),
    );
    const value = m.rules.resolver.resolve('tank.dashCooldown');
    expect(value).toBeGreaterThanOrEqual(0.1);
  });

  it('debug breakdown equals the resolved output', () => {
    const m = makeMatch();
    applyUpgradeCard(m.rules, 'offer.a', card(1.15), createProgressionTelemetry());
    const breakdown = m.rules.resolver.breakdown('weapon.cannonRadius');
    expect(breakdown.final).toBeCloseTo(m.rules.resolver.resolve('weapon.cannonRadius'));
  });
});
