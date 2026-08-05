import { clamp } from '../math';

export interface MonsterLevelCurveData {
  levelIntervalSeconds: number;
  minimumLevel: number;
  maximumLevel: number;
  healthMultiplierPerLevel: number;
  damageMultiplierPerLevel: number;
  bossPhaseLevel: number;
}

export type MonsterRewardClass = 'ambient' | 'wave' | 'elite' | 'boss';
export type MonsterTier = 'fodder' | 'specialist' | 'elite' | 'boss';

export interface MonsterXpRewardClassData {
  base: number;
  perLevel: number;
}

export interface MonsterXpRewardsData {
  classes: Record<MonsterRewardClass, MonsterXpRewardClassData>;
}

/** Authoritative, spawn-time-locked monster scaling (shared server/SP/tests). */
export interface MonsterSpawnLock {
  level: number;
  healthMultiplierAtSpawn: number;
  damageMultiplierAtSpawn: number;
  maxHpAtSpawn: number;
  resolvedRewardXp: number;
  /** Resolved contact DPS for melee monsters (undefined for ranged/boss). */
  scaledContactDps?: number;
  /** Resolved per-hit damage for ranged monsters (undefined otherwise). */
  scaledProjectileDamage?: number;
}

/** Content-backed defaults mirrored from `enemyLevelCurve.mainStage`. */
export const MAIN_STAGE_CURVE: MonsterLevelCurveData = {
  levelIntervalSeconds: 15,
  minimumLevel: 1,
  maximumLevel: 13,
  healthMultiplierPerLevel: 1.2,
  damageMultiplierPerLevel: 1.18,
  bossPhaseLevel: 13,
};

/** Content-backed defaults mirrored from `enemyXpRewards.mainStage`. */
export const MAIN_STAGE_XP_REWARDS: MonsterXpRewardsData = {
  classes: {
    ambient: { base: 1, perLevel: 1 },
    wave: { base: 2, perLevel: 2 },
    elite: { base: 40, perLevel: 8 },
    boss: { base: 150, perLevel: 0 },
  },
};

export function monsterLevelAtTime(elapsedSeconds: number, curve: MonsterLevelCurveData): number {
  return clamp(
    curve.minimumLevel + Math.floor(elapsedSeconds / curve.levelIntervalSeconds),
    curve.minimumLevel,
    curve.maximumLevel,
  );
}

export function monsterHealthMultiplier(level: number, curve: MonsterLevelCurveData): number {
  return Math.pow(curve.healthMultiplierPerLevel, level - 1);
}

export function monsterDamageMultiplier(level: number, curve: MonsterLevelCurveData): number {
  return Math.pow(curve.damageMultiplierPerLevel, level - 1);
}

export function monsterXpReward(
  level: number,
  rewardClass: MonsterRewardClass,
  rewards: MonsterXpRewardsData,
  singlePlayerMultiplier = 1,
): number {
  const cls = rewards.classes[rewardClass];
  const value = cls.base + cls.perLevel * level;
  return Math.max(0, Math.round(value * singlePlayerMultiplier));
}

/**
 * Lock every scaling input at spawn time. Boss HP scales, boss damage is
 * fixed; ordinary/elite HP and damage both scale.
 */
export function resolveMonsterSpawnLock(options: {
  tier: MonsterTier;
  baseHp: number;
  /** Melee: contact DPS; Ranged: per-shot damage; Boss: undefined (fixed patterns). */
  baseDamage: number | undefined;
  rewardClass: MonsterRewardClass;
  level: number;
  curve: MonsterLevelCurveData;
  rewards: MonsterXpRewardsData;
  singlePlayerMultiplier?: number;
}): MonsterSpawnLock {
  const healthMult = monsterHealthMultiplier(options.level, options.curve);
  const damageScales = options.tier !== 'boss';
  const damageMult = damageScales
    ? monsterDamageMultiplier(options.level, options.curve)
    : 1;
  return {
    level: options.level,
    healthMultiplierAtSpawn: healthMult,
    damageMultiplierAtSpawn: damageMult,
    maxHpAtSpawn: options.baseHp * healthMult,
    resolvedRewardXp: monsterXpReward(
      options.level,
      options.rewardClass,
      options.rewards,
      options.singlePlayerMultiplier ?? 1,
    ),
    scaledContactDps:
      options.baseDamage !== undefined && damageScales
        ? options.baseDamage * damageMult
        : undefined,
    scaledProjectileDamage:
      options.baseDamage !== undefined && damageScales
        ? options.baseDamage * damageMult
        : undefined,
  };
}
