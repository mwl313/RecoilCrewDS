import type { UpgradeRarity } from '../content/schemas/progression';
import type { EnemyActionCue } from '../animation/enemyActionCue';

export type MatchFlowState = 'playing' | 'upgradeSelection' | 'relicSelection' | 'clear' | 'gameOver';

export interface TeamProgressionState {
  level: number;
  currentXp: number;
  xpForNextLevel: number;
  totalXpCollected: number;
  pendingLevelUps: number;
  levelUpOffersCompleted: number;
  treasureChestsOpened: number;
  relicStacks: Record<string, number>;
  activeSelection: ProgressionSelectionState | null;
  lastRelicResult: RelicRollResult | null;
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
  expiresAtWallMs: number;
  driverOffer?: UpgradeCard[];
  gunnerOffer?: UpgradeCard[];
  singlePlayerOffer?: UpgradeCard[];
  relicResult?: RelicRollResult;
  driverSelection?: number;
  gunnerSelection?: number;
  singlePlayerSelection?: number;
  resolved: boolean;
}

export interface RelicRollResult {
  relicId: string;
  rarity: UpgradeRarity;
  duplicateConverted: boolean;
  replacementXp: number;
  stackCountAfter: number;
}

export type TreasureChestSource = 'map' | 'enemyDrop' | 'waveClear';

export interface TreasureChestState {
  id: number;
  source: TreasureChestSource;
  x: number;
  y: number;
  z: number;
  opened: boolean;
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
