import { z } from 'zod';
import { commonDefinition, nonNegativeInt, nonNegativeNumber, positiveNumber } from './common';

const formationSchema = z.enum(['cluster', 'line', 'column', 'arc', 'ring', 'pincer', 'scatter']);

export const populationLimitsSchema = z
  .object({
    ...commonDefinition,
    hardEntityCap: positiveNumber,
    ambientSoftEntityCap: positiveNumber,
    ambientSoftThreatCap: positiveNumber,
    waveSoftEntityCap: positiveNumber,
    waveSoftThreatCap: positiveNumber,
    eliteAndBossReserve: positiveNumber,
    technicalEmergencyReserve: positiveNumber,
    aggregateVisualCap: positiveNumber,
    maximumStoredBudget: positiveNumber,
  })
  .strict();

export const farmingPhaseSchema = z
  .object({
    ...commonDefinition,
    durationSeconds: positiveNumber,
    entityTargetStart: nonNegativeInt,
    entityTargetEnd: nonNegativeInt,
    threatTargetStart: nonNegativeNumber,
    threatTargetEnd: nonNegativeNumber,
    spawnIncomeStart: nonNegativeNumber,
    spawnIncomeEnd: nonNegativeNumber,
    nearbyTargetMinimum: nonNegativeInt.optional(),
    nearbyTargetMaximum: nonNegativeInt.optional(),
    eligiblePackTags: z.array(z.string().min(1)),
  })
  .strict()
  .superRefine((phase, ctx) => {
    if (
      phase.nearbyTargetMinimum !== undefined &&
      phase.nearbyTargetMaximum !== undefined &&
      phase.nearbyTargetMinimum > phase.nearbyTargetMaximum
    ) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'nearby pressure minimum must not exceed maximum' });
    }
  });

export const spawnPackAnchorRequirementsSchema = z
  .object({
    terrainTags: z.array(z.string()).optional(),
    regionTags: z.array(z.string()).optional(),
    minimumTankDistance: nonNegativeNumber.optional(),
    maximumTankDistance: nonNegativeNumber.optional(),
  })
  .strict();

export const spawnPackEntrySchema = z
  .object({
    enemyId: z.string().regex(/^enemy\./).optional(),
    /** Production: symbolic selected-slot reference resolved at match setup. */
    slotId: z.string().regex(/^selected\./).optional(),
    count: positiveNumber,
    formationRole: z.string().optional(),
  })
  .strict()
  .superRefine((entry, ctx) => {
    if ((entry.enemyId === undefined) === (entry.slotId === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'spawn pack entry must define exactly one of enemyId or slotId',
      });
    }
  });

export const spawnPackSchema = z
  .object({
    ...commonDefinition,
    tags: z.array(z.string().min(1)),
    entries: z.array(spawnPackEntrySchema).min(1),
    threatCost: positiveNumber,
    entityCost: positiveNumber,
    formation: formationSchema,
    spacing: nonNegativeNumber,
    radius: nonNegativeNumber,
    anchorRequirements: spawnPackAnchorRequirementsSchema.optional(),
    minimumPhase: z.string().optional(),
    maximumConcurrent: positiveNumber.optional(),
    cooldownSeconds: nonNegativeNumber.optional(),
  })
  .strict();

export const stageTriggerSchema = z
  .object({
    atRemainingSeconds: nonNegativeNumber,
    waveId: z.string().regex(/^wave\./),
  })
  .strict();

export const stageSequenceSchema = z
  .object({
    ...commonDefinition,
    farmingCountdownSeconds: positiveNumber,
    triggers: z.array(stageTriggerSchema).min(1),
    bossAtRemainingSeconds: nonNegativeNumber,
    pauseCountdownDuringWave: z.boolean(),
    bossIntroSeconds: positiveNumber.optional(),
  })
  .strict();

export const waveSchema = z
  .object({
    ...commonDefinition,
    leaderEnemyId: z.string().regex(/^enemy\./).optional(),
    /** Production: selected elite encounter resolved at match setup. */
    leaderSlotId: z.string().regex(/^selected\./).optional(),
    openingPackIds: z.array(z.string().regex(/^pack\./)),
    reinforcementPackIds: z.array(z.string().regex(/^pack\./)),
    openingThreat: positiveNumber,
    reinforcementThreat: positiveNumber,
    reinforcementThreatPerSecond: nonNegativeNumber,
    maximumActiveWaveThreat: positiveNumber,
    maximumActiveWaveEntities: positiveNumber,
    nearbyTargetMinimum: nonNegativeInt.optional(),
    nearbyTargetMaximum: nonNegativeInt.optional(),
    approachPolicyId: z.string().regex(/^horde\.navigationPolicy\./),
    rewardTableId: z.string().regex(/^reward\./),
    purgeWaveCohortOnLeaderDeath: z.literal(true),
  })
  .strict()
  .superRefine((wave, ctx) => {
    if ((wave.leaderEnemyId === undefined) === (wave.leaderSlotId === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'wave must define exactly one of leaderEnemyId or leaderSlotId',
      });
    }
    if (
      wave.nearbyTargetMinimum !== undefined &&
      wave.nearbyTargetMaximum !== undefined &&
      wave.nearbyTargetMinimum > wave.nearbyTargetMaximum
    ) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'nearby pressure minimum must not exceed maximum' });
    }
  });

export const bossWaveSchema = z
  .object({
    ...commonDefinition,
    leaderEnemyId: z.string().regex(/^enemy\./).optional(),
    leaderSlotId: z.string().regex(/^selected\./).optional(),
    openingPackIds: z.array(z.string().regex(/^pack\./)),
    reinforcementPackIds: z.array(z.string().regex(/^pack\./)),
    openingThreat: positiveNumber,
    reinforcementThreat: positiveNumber,
    reinforcementThreatPerSecond: nonNegativeNumber,
    maximumActiveWaveThreat: positiveNumber,
    maximumActiveWaveEntities: positiveNumber,
    nearbyTargetMinimum: nonNegativeInt.optional(),
    nearbyTargetMaximum: nonNegativeInt.optional(),
    approachPolicyId: z.string().regex(/^horde\.navigationPolicy\./),
    rewardTableId: z.string().regex(/^reward\./),
    purgeWaveCohortOnLeaderDeath: z.literal(true),
    bossEnemyId: z.string().regex(/^enemy\./).optional(),
    /** Production: selected boss identity resolved at match setup. */
    bossSlotId: z.string().regex(/^selected\./).optional(),
    hpThresholdEvents: z
      .array(
        z
          .object({
            hpRatio: positiveNumber,
            packIds: z.array(z.string().regex(/^pack\./)),
            threatBudget: positiveNumber,
          })
          .strict(),
      )
      .optional(),
    completion: z.literal('clearStage'),
  })
  .strict()
  .superRefine((wave, ctx) => {
    if ((wave.leaderEnemyId === undefined) === (wave.leaderSlotId === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'boss wave must define exactly one of leaderEnemyId or leaderSlotId',
      });
    }
    if ((wave.bossEnemyId === undefined) === (wave.bossSlotId === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'boss wave must define exactly one of bossEnemyId or bossSlotId',
      });
    }
    if (
      wave.nearbyTargetMinimum !== undefined &&
      wave.nearbyTargetMaximum !== undefined &&
      wave.nearbyTargetMinimum > wave.nearbyTargetMaximum
    ) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'nearby pressure minimum must not exceed maximum' });
    }
  });

export const spawnAnchorPolicySchema = z
  .object({
    ...commonDefinition,
    visibleNearField: positiveNumber,
    preferredTankDistance: positiveNumber.optional(),
    safeZoneTags: z.array(z.string()).optional(),
    maximumRecentUseAgeSeconds: nonNegativeNumber,
  })
  .strict();

export const hordeNavigationPolicySchema = z
  .object({
    ...commonDefinition,
    cellSize: positiveNumber,
    fieldRefreshHz: positiveNumber,
    nearWeight: positiveNumber,
    directWeight: positiveNumber,
    densityWeight: positiveNumber,
    stuckProgressThreshold: positiveNumber,
    stuckTimeSeconds: positiveNumber,
  })
  .strict();

export const enemyLodPolicySchema = z
  .object({
    ...commonDefinition,
    tier0Enter: positiveNumber,
    tier0Leave: positiveNumber,
    tier1Enter: positiveNumber,
    tier1Leave: positiveNumber,
    tier2Enter: positiveNumber,
    tier2Leave: positiveNumber,
    tier1Hz: positiveNumber,
    tier2Hz: positiveNumber,
    tier3Hz: positiveNumber,
  })
  .strict();

export const hordeReplicationPolicySchema = z
  .object({
    ...commonDefinition,
    nearHz: positiveNumber,
    midHz: positiveNumber,
    farHz: positiveNumber,
    sectorHz: positiveNumber,
  })
  .strict();

/**
 * Reward tables describe the concentrated reward for a wave leader/boss
 * and the ordinary XP/score contribution of normally killed wave fodder.
 * Purge deletions never resolve a reward table.
 */
export const rewardTableSchema = z
  .object({
    ...commonDefinition,
    ordinaryXp: nonNegativeNumber,
    ordinaryScore: nonNegativeNumber,
    leaderXp: nonNegativeNumber,
    leaderScore: nonNegativeNumber,
    dropTableIds: z.array(z.string().regex(/^drops\./)).optional(),
  })
  .strict();

export const hordeDirectorSchema = z
  .object({
    ...commonDefinition,
    stageSequenceId: z.string().regex(/^horde\.stageSequence\./),
    farmingPhaseIds: z.array(z.string().regex(/^horde\.farming\./)),
    waveIds: z.array(z.string().regex(/^wave\./)),
    bossWaveId: z.string().regex(/^horde\.bossWave\./),
    packIds: z.array(z.string().regex(/^pack\./)),
    limitsId: z.string().regex(/^horde\.populationLimits\./),
    lodPolicyId: z.string().regex(/^horde\.lodPolicy\./),
    replicationPolicyId: z.string().regex(/^horde\.replicationPolicy\./),
    navigationPolicyId: z.string().regex(/^horde\.navigationPolicy\./),
    spawnAnchorPolicyId: z.string().regex(/^horde\.anchorPolicy\./),
    enforceStage: z.boolean().default(false),
    /** Production integration: gameplay-roster reference for selected-slot spawns. */
    gameplayRosterId: z.string().regex(/^enemyGameplayRoster\./).optional(),
  })
  .strict();

export type PopulationLimitsDefinition = z.infer<typeof populationLimitsSchema>;
export type FarmingPhaseDefinition = z.infer<typeof farmingPhaseSchema>;
export type SpawnPackDefinition = z.infer<typeof spawnPackSchema>;
export type StageSequenceDefinition = z.infer<typeof stageSequenceSchema>;
export type WaveDefinition = z.infer<typeof waveSchema>;
export type BossWaveDefinition = z.infer<typeof bossWaveSchema>;
export type SpawnAnchorPolicyDefinition = z.infer<typeof spawnAnchorPolicySchema>;
export type HordeNavigationPolicyDefinition = z.infer<typeof hordeNavigationPolicySchema>;
export type EnemyLodPolicyDefinition = z.infer<typeof enemyLodPolicySchema>;
export type HordeReplicationPolicyDefinition = z.infer<typeof hordeReplicationPolicySchema>;
export type RewardTableDefinition = z.infer<typeof rewardTableSchema>;
export type HordeDirectorDefinition = z.infer<typeof hordeDirectorSchema>;
