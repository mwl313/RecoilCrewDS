import { z } from 'zod';
import { commonDefinition, nonNegativeInt, positiveInt } from './common';

const rewardClassSchema = z.object({
  base: nonNegativeInt,
  perLevel: nonNegativeInt,
});

export const enemyXpRewardsSchema = z.object({
  ...commonDefinition,
  id: z.string().regex(/^enemyXpRewards\./, 'id must start with enemyXpRewards.'),
  classes: z.object({
    ambient: rewardClassSchema,
    wave: rewardClassSchema,
    elite: rewardClassSchema,
    boss: rewardClassSchema,
  }),
  /** Deterministic visual shard bundle counts per reward class [min, max]. */
  visualShardCounts: z.object({
    ambient: z.tuple([positiveInt, positiveInt]).refine(([a, b]) => b >= a),
    wave: z.tuple([positiveInt, positiveInt]).refine(([a, b]) => b >= a),
    elite: z.tuple([positiveInt, positiveInt]).refine(([a, b]) => b >= a),
    boss: z.tuple([positiveInt, positiveInt]).refine(([a, b]) => b >= a),
  }),
});

export type EnemyXpRewardsDefinition = z.infer<typeof enemyXpRewardsSchema>;
