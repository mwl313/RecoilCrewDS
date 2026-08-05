import { z } from 'zod';
import { commonDefinition, positiveInt, positiveNumber } from './common';

export const enemyLevelCurveSchema = z.object({
  ...commonDefinition,
  id: z.string().regex(/^enemyLevelCurve\./, 'id must start with enemyLevelCurve.'),
  levelIntervalSeconds: positiveNumber,
  minimumLevel: positiveInt,
  maximumLevel: positiveInt,
  healthMultiplierPerLevel: positiveNumber,
  damageMultiplierPerLevel: positiveNumber,
  bossPhaseLevel: positiveInt,
});

export type EnemyLevelCurveDefinition = z.infer<typeof enemyLevelCurveSchema>;
