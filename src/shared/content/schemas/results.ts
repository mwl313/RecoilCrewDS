import { z } from 'zod';
import { commonDefinition, nonNegativeInt } from './common';

const gradeRequire = z
  .object({
    kills: nonNegativeInt.optional(),
    jackpotFired: nonNegativeInt.optional(),
    bestCombo: nonNegativeInt.optional(),
    links: nonNegativeInt.optional(),
  })
  .optional();

const titleRequire = z
  .object({
    wipeouts: nonNegativeInt.optional(),
    jackpotFired: nonNegativeInt.optional(),
    links: nonNegativeInt.optional(),
    dashKills: nonNegativeInt.optional(),
    minScore: nonNegativeInt.optional(),
    grade: z.enum(['D', 'C', 'B', 'A', 'S']).optional(),
  })
  .optional();

export const resultsSchema = z.object({
  ...commonDefinition,
  id: z.string().regex(/^results\./, 'results id must start with results.'),
  grades: z
    .array(
      z.object({
        grade: z.enum(['D', 'C', 'B', 'A', 'S']),
        minScore: nonNegativeInt,
        require: gradeRequire,
      }),
    )
    .min(1),
  titles: z
    .array(
      z.object({
        id: z.string().regex(/^title\./, 'title id must start with title.'),
        text: z.string().min(1),
        require: titleRequire,
      }),
    )
    .min(1),
});

export type ResultsDefinition = z.infer<typeof resultsSchema>;
