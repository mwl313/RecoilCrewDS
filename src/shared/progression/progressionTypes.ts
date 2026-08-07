import type { UpgradeRarity } from '../content/schemas/progression';
import type { EnemyActionCue } from '../animation/enemyActionCue';

export type MatchFlowState = 'playing' | 'upgradeSelection' | 'relicOpening' | 'relicSelection' | 'clear' | 'gameOver';

/**
 * Match-scoped cumulative contribution from successful level-up effects.
 * This intentionally excludes base values, difficulty, relics, and timed
 * modifiers so reconnecting clients can render the same truthful build view.
 */
export interface LevelUpgradeStatSummary {
  statId: string;
  additiveTotal: number;
  multiplierProduct: number;
  effectCount: number;
}

export interface TeamProgressionState {
  level: number;
  currentXp: number;
  xpForNextLevel: number;
  totalXpCollected: number;
  pendingLevelUps: number;
  levelUpOffersCompleted: number;
  levelUpgradeSummary: LevelUpgradeStatSummary[];
  treasureChestsOpened: number;
  /** Monotonic match-scoped sequence; every resolved chest increments it. */
  relicAcquisitionSequence: number;
  relicStacks: Record<string, number>;
  /** Stable first-acquisition order used by the persistent HUD rail. */
  relicAcquisitionOrder?: string[];
  activeSelection: ProgressionSelectionState | null;
  lastRelicResult: RelicRollResult | null;
  /** Chest results that could not start a reveal immediately (serialized). */
  pendingRelicResults: RelicRollResult[];
}

export interface RolledUpgradeEffect {
  statId: string;
  operation: 'multiply' | 'add';
  value: number;
}

export interface UpgradeCard {
  cardId: string;
  categoryId: string;
  rarity: UpgradeRarity;
  rolledEffects: RolledUpgradeEffect[];
}

export interface ProgressionSelectionState {
  offerId: string;
  kind: 'upgrade' | 'relic';
  level: number;
  /** Upgrade auto-pick deadline. Absent for acknowledgement-gated relics. */
  expiresAtWallMs?: number;
  offerStartedAtWallMs?: number;
  driverOffer?: UpgradeCard[];
  gunnerOffer?: UpgradeCard[];
  singlePlayerOffer?: UpgradeCard[];
  relicResult?: RelicRollResult;
  driverSelection?: number;
  gunnerSelection?: number;
  singlePlayerSelection?: number;
  resolved: boolean;
  /** Relic reveal fields (kind === 'relic'). */
  revealStartedAtWallMs?: number;
  continueAllowedAtWallMs?: number;
  singlePlayerRelicAcknowledged?: boolean;
  driverRelicAcknowledged?: boolean;
  gunnerRelicAcknowledged?: boolean;
  chestId?: number;
  relicOffer?: RelicRewardOffer;
  applied?: boolean;
}

export interface RelicRollResult {
  acquisitionSequence: number;
  relicId: string;
  rarity: UpgradeRarity;
  duplicateConverted: boolean;
  replacementXp: number;
  stackCountAfter: number;
}

export type RelicOfferMode = 'automaticSingle' | 'chooseOne';

export interface RelicCandidateResult {
  relicId: string;
  rarity: UpgradeRarity;
}

export interface RelicRewardOffer {
  offerId: string;
  chestId: number;
  candidates: RelicCandidateResult[];
  selectionMode: RelicOfferMode;
  selectedIndex: number | null;
  resolved: boolean;
}

export type TreasureChestSource = 'mapStart' | 'mapPeriodic' | 'enemyDrop' | 'waveClear';
export type TreasureChestLifecycle = 'spawning' | 'closed' | 'opening' | 'revealing' | 'open' | 'despawning';

export type ProgressionXpSource =
  | 'shard'
  | 'elite'
  | 'waveLeader'
  | 'boss'
  | 'duplicateRelic'
  | 'direct';

export interface TreasureChestState {
  id: number;
  source: TreasureChestSource;
  x: number;
  y: number;
  z: number;
  lifecycle: TreasureChestLifecycle;
  spawnStartedAtGameTime: number;
  claimableAtGameTime: number;
  openingStartedAtWallMs?: number;
  fullyOpenAtWallMs?: number;
  rewardOffer?: RelicRewardOffer;
  rewardOfferId?: string;
  rewardResolved?: boolean;
  fullyOpenStartedAtGameTime?: number;
  despawnStartedAtGameTime?: number;
  /** Temporary compatibility for older snapshots/tests. */
  opened?: boolean;
}

export interface RelicAcquireResult {
  relicId: string;
  stackCount: number;
  duplicateConverted: boolean;
  replacementXp: number;
  capabilityGranted: boolean;
}

export interface ProgressionRewardEvent {
  kind: 'enemyKilled' | 'waveLeaderKilled' | 'bossKilled' | 'enemyPurged' | 'waveCleared';
  enemyId?: number;
  enemyDefinitionId?: string;
  populationClass?: 'ambient' | 'wave' | 'boss' | 'special';
  waveId?: number;
  damageSource?: string;
  rewardProfileId?: string;
  leaderEnemyId?: number;
  bossEnemyId?: number;
}

export type { EnemyActionCue };
