import type { MatchRules } from '../rules/matchRules';
import { statModifier } from '../stats/statModifier';
import type { LevelUpgradeStatSummary, UpgradeCard } from './progressionTypes';
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
  summary?: LevelUpgradeStatSummary[],
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
    if (summary) recordLevelUpgradeEffect(summary, effect);
  }
  telemetry.upgradePickRates[card.categoryId] = (telemetry.upgradePickRates[card.categoryId] ?? 0) + 1;
  telemetry.rarityDistribution[card.rarity] = (telemetry.rarityDistribution[card.rarity] ?? 0) + 1;
}

/** Update replicated summary only after the corresponding modifier succeeds. */
export function recordLevelUpgradeEffect(
  summary: LevelUpgradeStatSummary[],
  effect: UpgradeCard['rolledEffects'][number],
): LevelUpgradeStatSummary {
  let row = summary.find((entry) => entry.statId === effect.statId);
  if (!row) {
    row = { statId: effect.statId, additiveTotal: 0, multiplierProduct: 1, effectCount: 0 };
    summary.push(row);
  }
  if (effect.operation === 'add') row.additiveTotal += effect.value;
  else row.multiplierProduct *= effect.value;
  row.effectCount++;
  return row;
}
