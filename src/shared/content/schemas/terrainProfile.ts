import { z } from 'zod';
import { commonDefinition, finiteNumber, nonNegativeInt, nonNegativeNumber, positiveInt, positiveNumber, probability } from './common';

const featureConfigSchema = z.object({
  count: nonNegativeInt,
  minSeparation: nonNegativeNumber,
  radius: z.tuple([positiveNumber, positiveNumber]).optional(),
  depth: z.tuple([positiveNumber, positiveNumber]).optional(),
  height: z.tuple([positiveNumber, positiveNumber]).optional(),
  length: z.tuple([positiveNumber, positiveNumber]).optional(),
  width: z.tuple([positiveNumber, positiveNumber]).optional(),
  falloff: probability,
});

export const terrainProfileSchema = z.object({
  ...commonDefinition,
  id: z.string().regex(/^terrainProfile\./, 'terrain profile id must start with terrainProfile.'),
  baseHeight: finiteNumber,
  heightRange: z.object({
    min: finiteNumber,
    max: finiteNumber,
  }),
  maxSlope: positiveNumber,
  smoothingPasses: nonNegativeInt,
  slopeCorrectionIterations: nonNegativeInt,
  retryLimit: positiveInt,
  maxGenerationMs: positiveNumber,
  legacySampled: z.boolean().default(false),
  features: z.object({
    basin: featureConfigSchema,
    ridge: featureConfigSchema,
    plateau: featureConfigSchema,
    valley: featureConfigSchema,
    hill: featureConfigSchema,
  }),
});

export type TerrainProfileDefinition = z.infer<typeof terrainProfileSchema>;
