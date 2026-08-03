import { z } from 'zod';
import { commonDefinition, finiteNumber, nonNegativeNumber, positiveNumber } from './common';

export const validationProfileSchema = z.object({
  ...commonDefinition,
  id: z.string().regex(/^validationProfile\./, 'validation profile id must start with validationProfile.'),
  heightRange: z.object({
    min: finiteNumber,
    max: finiteNumber,
  }),
  maxSlope: positiveNumber,
  minFeatureSeparation: nonNegativeNumber,
  maxGenerationMs: positiveNumber,
  boundsEpsilon: nonNegativeNumber.default(1e-6),
  checkDeterminism: z.boolean().default(false),
});

export type ValidationProfileDefinition = z.infer<typeof validationProfileSchema>;
