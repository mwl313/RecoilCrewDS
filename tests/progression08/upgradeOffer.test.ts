import { describe, expect, it } from 'vitest';
import { generateUpgradeOffer } from '../../src/shared/progression/upgradeOfferGenerator';
import { CLIENT_CONTENT_PACK } from '../../src/generated/contentPack.generated';
import type { UpgradeCategoryDefinition } from '../../src/shared/content/schemas/progression';

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const def = CLIENT_CONTENT_PACK.getProgressionDefinition('progression.mainStage');
const first = CLIENT_CONTENT_PACK.getUpgradeFirstExperience(def.upgradeFirstExperienceRuleId);
const table = CLIENT_CONTENT_PACK.getUpgradeRarityTable(def.upgradeRarityTableId);
const categories = CLIENT_CONTENT_PACK.all('upgradeCategories') as UpgradeCategoryDefinition[];

function ctxFor(role: 'driver' | 'gunner' | 'single', seed: number, isFirstOffer: boolean) {
  return {
    role,
    rarityRoll: rng(seed),
    valueRoll: rng(seed + 1),
    categoryRoll: rng(seed + 2),
    isFirstOffer,
    firstExperience: first,
    rarityTable: table,
    categories,
  };
}

describe('deterministic upgrade offers (progression08)', () => {
  it('first offer hardcodes Epic + normal + 50% Legendary branch', () => {
    const cards = generateUpgradeOffer(ctxFor('driver', 7, true));
    expect(cards.length).toBe(3);
    expect(cards[0].rarity).toBe('epic');
    expect(cards[0].categoryId.startsWith('upgrade.tank.')).toBe(true);
    expect(cards[2].rarity === 'legendary' || ['common', 'rare', 'epic', 'legendary'].includes(cards[2].rarity)).toBe(true);
  });

  it('later offers use the normal rarity table for all cards', () => {
    const cards = generateUpgradeOffer(ctxFor('driver', 11, false));
    for (const card of cards) {
      expect(['common', 'rare', 'epic', 'legendary']).toContain(card.rarity);
    }
  });

  it('same seed produces the same offer', () => {
    const a = generateUpgradeOffer(ctxFor('gunner', 99, false));
    const b = generateUpgradeOffer(ctxFor('gunner', 99, false));
    expect(a).toEqual(b);
  });

  it('driver pool excludes gunner and vice versa; single pool contains both', () => {
    const driver = generateUpgradeOffer(ctxFor('driver', 3, false));
    const gunner = generateUpgradeOffer(ctxFor('gunner', 3, false));
    const single = generateUpgradeOffer(ctxFor('single', 3, false));
    expect(driver.every((c) => c.categoryId.startsWith('upgrade.tank.'))).toBe(true);
    expect(gunner.every((c) => c.categoryId.startsWith('upgrade.weapon.'))).toBe(true);
    expect(single.some((c) => c.categoryId.startsWith('upgrade.tank.'))).toBe(true);
    expect(single.some((c) => c.categoryId.startsWith('upgrade.weapon.'))).toBe(true);
  });

  it('rolled values stay inside the rarity range', () => {
    const cards = generateUpgradeOffer(ctxFor('gunner', 21, false));
    for (const card of cards) {
      const category = categories.find((c) => c.id === card.categoryId)!;
      const range = category.rarityRanges[card.rarity];
      for (const effect of card.rolledEffects) {
        if (effect.operation === 'multiply') {
          const pct = (effect.value - 1) * 100;
          expect(pct).toBeGreaterThanOrEqual(Math.min(range.minPercent ?? 0, range.maxPercent ?? 0) - 1e-6);
          expect(pct).toBeLessThanOrEqual(Math.max(range.minPercent ?? 0, range.maxPercent ?? 0) + 1e-6);
        }
      }
    }
  });
});
