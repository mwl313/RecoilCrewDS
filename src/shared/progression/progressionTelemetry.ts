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
  chestsPerStage: number;
  relicDistribution: Record<string, number>;
  roadkillHits: number;
  roadkillKills: number;
  triggerActivations: Record<string, number>;
  selectionTimeouts: number;
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
    chestsPerStage: 0,
    relicDistribution: {},
    roadkillHits: 0,
    roadkillKills: 0,
    triggerActivations: {},
    selectionTimeouts: 0,
  };
}
