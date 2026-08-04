import type { MatchRules } from '../rules/matchRules';
import { statModifier } from '../stats/statModifier';
import type { UpgradeCard } from './progressionTypes';
import type { ProgressionTelemetry } from './progressionTelemetry';

/**
 * Level-up cards become individual stat modifiers. Percent upgrades use
 * multiply with stack=true (duplicate cards multiply); flat upgrades use
 * add with stack=true.
 */
export function applyUpgradeCard(
  rules: MatchRules,
  offerId: string,
  card: UpgradeCard,
  telemetry: ProgressionTelemetry,
): void {
  const modifierId = `upgrade.${offerId}.${card.cardId}`;
  for (const effect of card.rolledEffects) {
    rules.addModifier(
      statModifier(modifierId, effect.statId, effect.operation, effect.value, {
        source: `progression:level:${card.categoryId}`,
        priority: 40,
        stacking: 'stack',
        tags: ['levelUpgrade', card.categoryId],
      }),
    );
  }
  telemetry.upgradePickRates[card.categoryId] = (telemetry.upgradePickRates[card.categoryId] ?? 0) + 1;
  telemetry.rarityDistribution[card.rarity] = (telemetry.rarityDistribution[card.rarity] ?? 0) + 1;
}
