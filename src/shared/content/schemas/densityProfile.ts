import { z } from 'zod';
import { commonDefinition, nonNegativeInt, positiveInt } from './common';

export const densityProfileSchema = z.object({
  ...commonDefinition,
  id: z.string().regex(/^densityProfile\./, 'density profile id must start with densityProfile.'),
  budgets: z.object({
    maxObjects: nonNegativeInt,
    maxColliders: nonNegativeInt,
    maxBarrels: nonNegativeInt,
    maxCrates: nonNegativeInt,
    maxRamps: nonNegativeInt,
    maxMedium: nonNegativeInt,
    maxDecorations: nonNegativeInt,
    maxBarrelChain: positiveInt,
  }),
});

export type DensityProfileDefinition = z.infer<typeof densityProfileSchema>;
