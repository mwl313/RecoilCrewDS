import { z } from 'zod';
import { commonDefinition, positiveInt, positiveNumber } from './common';

export const meleeEngagementProfileSchema = z.object({
  ...commonDefinition,
  id: z.string().regex(/^meleeEngagement\./, 'id must start with meleeEngagement.'),
  spacingMultiplier: positiveNumber,
  minimumSlots: positiveInt,
  maximumSlots: positiveInt,
  reservationGraceSeconds: positiveNumber,
  releaseDistanceMultiplier: positiveNumber,
});

export type MeleeEngagementProfileDefinition = z.infer<typeof meleeEngagementProfileSchema>;
