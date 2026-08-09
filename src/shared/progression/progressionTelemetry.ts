/** Balance telemetry for later leveling tuning (authoritative, shared). */
export interface ProgressionTelemetry {
  killsPerMinute: number;
  xpPerFarmingSecond: number;
  xpCollectedPerMinute: number;
  xpMissed: number;
  levelUpTimes: number[];
  levelsPerStage: number;
  upgradePickRates: Record<string, number>;
  rarityDistribution: Record<string, number>;
  relicRarityResolutions: Array<{
    requestedRarity: string;
    resolvedRarity: string;
    fallbackUsed: boolean;
  }>;
  chestsPerStage: number;
  relicDistribution: Record<string, number>;
  roadkillHits: number;
  roadkillKills: number;
  triggerActivations: Record<string, number>;
  selectionTimeouts: number;
  initialMapChestsSpawned: number;
  periodicMapChestsSpawned: number;
  enemyDropChestsSpawned: number;
  leaderChestsSpawned: number;
  chestsClaimed: number;
  unopenedChestsAtEnd: number;
  timeToFirstChestClaim: number | null;
  enemyChestRollsByClass: Record<string, number>;
  enemyChestDropsByClass: Record<string, number>;
  relicsAcquired: number;
  duplicateConversions: number;
  activeChestPeak: number;
  mapSpawnAttempts: number;
  mapSpawnCandidateFailures: number;
  rewardSuppressedKills: number;
}

export function createProgressionTelemetry(): ProgressionTelemetry {
  return {
    killsPerMinute: 0,
    xpPerFarmingSecond: 0,
    xpCollectedPerMinute: 0,
    xpMissed: 0,
    levelUpTimes: [],
    levelsPerStage: 0,
    upgradePickRates: {},
    rarityDistribution: {},
    relicRarityResolutions: [],
    chestsPerStage: 0,
    relicDistribution: {},
    roadkillHits: 0,
    roadkillKills: 0,
    triggerActivations: {},
    selectionTimeouts: 0,
    initialMapChestsSpawned: 0,
    periodicMapChestsSpawned: 0,
    enemyDropChestsSpawned: 0,
    leaderChestsSpawned: 0,
    chestsClaimed: 0,
    unopenedChestsAtEnd: 0,
    timeToFirstChestClaim: null,
    enemyChestRollsByClass: {},
    enemyChestDropsByClass: {},
    relicsAcquired: 0,
    duplicateConversions: 0,
    activeChestPeak: 0,
    mapSpawnAttempts: 0,
    mapSpawnCandidateFailures: 0,
    rewardSuppressedKills: 0,
  };
}
