import { z } from 'zod';
import { commonDefinition, positiveNumber } from './common';

export const objectiveSchema = z.object({
  ...commonDefinition,
  id: z.string().regex(/^objective\./, 'objective id must start with objective.'),
  kind: z.enum(['scoreAttack']),
  durationSeconds: positiveNumber,
  /** Completion rule: end the round when the Loot Truck escapes/dies. */
  completionOnTruckEscape: z.boolean().optional(),
  scoring: z.string().regex(/^scoring\./).optional(),
  results: z.string().regex(/^results\./).optional(),
  spawnDirector: z.string().regex(/^spawn\./).optional(),
});

export type ObjectiveDefinition = z.infer<typeof objectiveSchema>;
