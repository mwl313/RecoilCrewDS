import { z } from 'zod';
import { commonDefinition, nonNegativeInt, nonNegativeNumber, positiveInt, positiveNumber, probability } from './common';

export const scoringSchema = z.object({
  ...commonDefinition,
  id: z.string().regex(/^scoring\./, 'scoring id must start with scoring.'),
  enemyScores: z.record(z.string().regex(/^enemy\./), nonNegativeInt),
  scrapScores: z.record(z.enum(['normal', 'heavy']), nonNegativeInt),
  comboGains: z.object({
    dash: nonNegativeNumber,
    dodge: nonNegativeNumber,
    link: nonNegativeNumber,
  }),
  combo: z.object({
    pointsPerLevel: positiveNumber,
    max: positiveInt,
    decayTime: positiveNumber,
    bothWindow: positiveNumber,
  }),
  links: z.object({
    scrapLoop: nonNegativeInt,
    ramFinish: nonNegativeInt,
  }),
  atSpeed: z.object({
    threshold: positiveNumber,
    bonus: nonNegativeInt,
  }),
  scrapLoopWindow: positiveNumber,
  dashScore: nonNegativeInt,
  wipeoutPenalty: probability,
  finalChaos: z.object({
    mult: positiveNumber,
    start: positiveNumber,
  }),
});

export type ScoringDefinition = z.infer<typeof scoringSchema>;
