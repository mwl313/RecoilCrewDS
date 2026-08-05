import { z } from 'zod';
import { commonDefinition, nonNegativeInt } from './common';

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
});

export type EnemyXpRewardsDefinition = z.infer<typeof enemyXpRewardsSchema>;
