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
  edgeWidth: z.tuple([positiveNumber, positiveNumber]).optional(),
  edgeRoughness: probability.optional(),
  accessCount: nonNegativeInt.optional(),
  accessWidth: positiveNumber.optional(),
  accessMaxSlope: positiveNumber.optional(),
  safetyBuffer: nonNegativeNumber.optional(),
  boundaryClearance: nonNegativeNumber.optional(),
  spawnClearance: nonNegativeNumber.optional(),
});

const slopeRulesSchema = z.object({
  driveableMax: positiveNumber,
  riskyMax: positiveNumber,
  blockedMin: positiveNumber,
  cliffMin: positiveNumber,
  spawnMax: positiveNumber,
  recoveryMax: positiveNumber,
  landingMax: positiveNumber,
  maxStepUp: positiveNumber,
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
  slopeRules: slopeRulesSchema.optional(),
  correctAllMap: z.boolean().optional(),
  finalSmoothingPasses: nonNegativeInt.optional(),
  cliffMaterialId: z.string().optional(),
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
    cliffPlateau: featureConfigSchema.optional(),
    escarpment: featureConfigSchema.optional(),
  }),
});

export type TerrainProfileDefinition = z.infer<typeof terrainProfileSchema>;
