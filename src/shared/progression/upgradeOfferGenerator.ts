import type {
  UpgradeCategoryDefinition,
  UpgradeFirstExperienceDefinition,
  UpgradeRarity,
  UpgradeRarityTableDefinition,
} from '../content/schemas/progression';
import { rollWeighted } from './progressionRng';
import type { UpgradeCard, RolledUpgradeEffect } from './progressionTypes';

export interface UpgradeOfferContext {
  role: 'driver' | 'gunner' | 'single';
  rarityRoll: () => number;
  valueRoll: () => number;
  categoryRoll: () => number;
  isFirstOffer: boolean;
  firstExperience: UpgradeFirstExperienceDefinition;
  rarityTable: UpgradeRarityTableDefinition;
  categories: UpgradeCategoryDefinition[];
}

const RARITY_ORDER: UpgradeRarity[] = ['common', 'rare', 'epic', 'legendary'];

/**
 * Deterministic three-card offer. Card rarity uses the first-experience rule
 * on the first offer, then the normal table. Values roll inside the
 * category's rarity range.
 */
export function generateUpgradeOffer(ctx: UpgradeOfferContext): UpgradeCard[] {
  const cards: UpgradeCard[] = [];
  for (let i = 0; i < 3; i++) {
    const rarity = rollCardRarity(ctx, i);
    const category = pickCategory(ctx, i);
    cards.push({
      cardId: `${offerIdFor(ctx)}.${i}`,
      categoryId: category.id,
      rarity,
      rolledEffects: rollEffects(category, rarity, ctx.valueRoll),
    });
  }
  return cards;
}

function rollCardRarity(ctx: UpgradeOfferContext, index: number): UpgradeRarity {
  const rule = ctx.firstExperience.cardRules[index];
  if (ctx.isFirstOffer && rule) {
    if (rule.kind === 'fixed') return rule.rarity;
    if (rule.kind === 'normal') return rollNormalRarity(ctx.rarityTable, ctx.rarityRoll);
    const picked = rollWeighted(
      ctx.rarityRoll,
      rule.branches.map((b) => b.probability),
    );
    const branch = rule.branches[Math.max(0, picked)];
    return branch.rarity === 'normal'
      ? rollNormalRarity(ctx.rarityTable, ctx.rarityRoll)
      : branch.rarity;
  }
  return rollNormalRarity(ctx.rarityTable, ctx.rarityRoll);
}

function rollNormalRarity(
  table: UpgradeRarityTableDefinition,
  rand: () => number,
): UpgradeRarity {
  const weights = RARITY_ORDER.map((r) => table.rarities[r]);
  const index = rollWeighted(rand, weights);
  return RARITY_ORDER[Math.max(0, index)];
}

function pickCategory(ctx: UpgradeOfferContext, _index: number): UpgradeCategoryDefinition {
  const pool = ctx.categories.filter((c) =>
    ctx.role === 'single' ? true : c.role === ctx.role,
  );
  if (pool.length === 0) throw new Error(`no upgrade categories for role '${ctx.role}'`);
  const index = Math.floor(ctx.categoryRoll() * pool.length);
  return pool[Math.min(pool.length - 1, index)];
}

function rollEffects(
  category: UpgradeCategoryDefinition,
  rarity: UpgradeRarity,
  rand: () => number,
): RolledUpgradeEffect[] {
  const range = category.rarityRanges[rarity];
  const effects: RolledUpgradeEffect[] = [];
  for (const effect of category.effects) {
    if (effect.operation === 'multiply') {
      const min = range.minPercent ?? range.maxPercent ?? 0;
      const max = range.maxPercent ?? min;
      const percent = min + rand() * (max - min);
      effects.push({ statId: effect.statId, operation: 'multiply', value: 1 + percent / 100 });
    } else {
      const min = range.minFlat ?? range.maxFlat ?? 0;
      const max = range.maxFlat ?? min;
      effects.push({ statId: effect.statId, operation: 'add', value: Math.round(min + rand() * (max - min)) });
    }
  }
  return effects;
}

function offerIdFor(ctx: UpgradeOfferContext): string {
  return `${ctx.role}:${ctx.isFirstOffer ? 'first' : 'later'}`;
}
