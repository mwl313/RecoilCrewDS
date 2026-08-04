import type {
  FirstTreasureRuleDefinition,
  TreasureRarityTableDefinition,
} from '../content/schemas/progression';
import type { TreasureChestState, TreasureChestSource } from './progressionTypes';
import { rollWeighted } from './progressionRng';
import type { UpgradeRarity } from '../content/schemas/progression';

const RARITY_ORDER: UpgradeRarity[] = ['common', 'rare', 'epic', 'legendary'];

/**
 * Treasure chest rarity: the first chest opened in the match uses the
 * first-chest rule (Epic 70 / Legendary 30) regardless of source; every
 * later chest uses the normal table.
 */
export class TreasureChestSystem {
  constructor(
    private readonly getChestsOpened: () => number,
    private readonly incrementOpened: () => void,
  ) {}

  rollRarity(
    rand: () => number,
    firstRule: FirstTreasureRuleDefinition,
    normalTable: TreasureRarityTableDefinition,
  ): UpgradeRarity {
    const first = this.getChestsOpened() === 0;
    return this.rollRarityFor(first, rand, firstRule, normalTable);
  }

  /**
   * Rarity roll with an explicit captured first/later state. The caller
   * captures `isFirstChest` before consuming the chest so the first open
   * always uses the first-chest table.
   */
  rollRarityFor(
    isFirstChest: boolean,
    rand: () => number,
    firstRule: FirstTreasureRuleDefinition,
    normalTable: TreasureRarityTableDefinition,
  ): UpgradeRarity {
    if (isFirstChest) {
      const index = rollWeighted(rand, [firstRule.rarities.epic, firstRule.rarities.legendary]);
      return index === 1 ? 'legendary' : 'epic';
    }
    const index = rollWeighted(
      rand,
      RARITY_ORDER.map((r) => normalTable.rarities[r]),
    );
    return RARITY_ORDER[Math.max(0, index)];
  }

  open(chest: TreasureChestState): void {
    chest.opened = true;
    this.incrementOpened();
  }

  makeChest(id: number, source: TreasureChestSource, x: number, z: number, groundY: number): TreasureChestState {
    return { id, source, x, y: groundY + 0.4, z, opened: false };
  }
}
