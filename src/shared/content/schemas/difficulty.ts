import { z } from 'zod';
import { commonDefinition, finiteNumber, positiveNumber } from './common';

export const difficultySchema = z.object({
  ...commonDefinition,
  id: z.string().regex(/^difficulty\./, 'difficulty id must start with difficulty.'),
  timeScale: positiveNumber.default(1),
  overrides: z.record(z.string().regex(/^match\./, 'override keys must be match.* stat ids'), finiteNumber).optional(),
});

export type DifficultyDefinition = z.infer<typeof difficultySchema>;
