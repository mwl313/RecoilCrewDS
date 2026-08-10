import type {
  FirstTreasureRuleDefinition,
  TreasureRarityTableDefinition,
} from '../content/schemas/progression';
import type { TreasureChestState, TreasureChestSource } from './progressionTypes';
import { rollWeighted } from './progressionRng';
import type { UpgradeRarity } from '../content/schemas/progression';

const RARITY_ORDER: UpgradeRarity[] = ['common', 'rare', 'epic', 'legendary'];

export type TreasureRewardTarget =
  | { kind: 'fixedRelic'; relicId: string }
  | { kind: 'rarity'; rarity: UpgradeRarity };

/**
 * The first chest opened in the match uses its dedicated reward branches
 * regardless of source. Every later chest rolls from the normal rarity table.
 */
export class TreasureChestSystem {
  constructor(
    private readonly getChestsOpened: () => number,
    private readonly incrementOpened: () => void,
  ) {}

  rollReward(
    rand: () => number,
    firstRule: FirstTreasureRuleDefinition,
    normalTable: TreasureRarityTableDefinition,
  ): TreasureRewardTarget {
    const first = this.getChestsOpened() === 0;
    return this.rollRewardFor(first, rand, firstRule, normalTable);
  }

  /**
   * Reward roll with an explicit captured first/later state. The caller
   * captures `isFirstChest` before consuming the chest so the first open
   * always uses the first-chest rule.
   */
  rollRewardFor(
    isFirstChest: boolean,
    rand: () => number,
    firstRule: FirstTreasureRuleDefinition,
    normalTable: TreasureRarityTableDefinition,
  ): TreasureRewardTarget {
    if (isFirstChest) {
      const index = rollWeighted(
        rand,
        firstRule.branches.map((branch) => branch.probability),
      );
      const branch = firstRule.branches[Math.max(0, index)];
      return branch.kind === 'fixedRelic'
        ? { kind: 'fixedRelic', relicId: branch.relicId }
        : { kind: 'rarity', rarity: branch.rarity };
    }
    const index = rollWeighted(
      rand,
      RARITY_ORDER.map((r) => normalTable.rarities[r]),
    );
    return { kind: 'rarity', rarity: RARITY_ORDER[Math.max(0, index)] };
  }

  open(chest: TreasureChestState): void {
    chest.opened = true;
    this.incrementOpened();
  }

  makeChest(
    id: number,
    source: TreasureChestSource,
    x: number,
    z: number,
    groundY: number,
    spawnStartedAtGameTime = 0,
    spawnAnimationSeconds = 0,
  ): TreasureChestState {
    return {
      id,
      source,
      x,
      y: groundY + 0.4,
      z,
      lifecycle: spawnAnimationSeconds > 0 ? 'spawning' : 'closed',
      spawnStartedAtGameTime,
      claimableAtGameTime: spawnStartedAtGameTime + spawnAnimationSeconds,
      rewardResolved: false,
      opened: false,
    };
  }
}
