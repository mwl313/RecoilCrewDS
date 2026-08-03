import { z } from 'zod';
import { commonDefinition, nonNegativeInt, nonNegativeNumber, positiveInt, positiveNumber, probability } from './common';

export const scoringSchema = z.object({
  ...commonDefinition,
  id: z.string().regex(/^scoring\./, 'scoring id must start with scoring.'),
  enemyScores: z.record(z.string().regex(/^enemy\./), nonNegativeInt),
  scrapScores: z.record(z.enum(['normal', 'heavy', 'jackpot']), nonNegativeInt),
  jackpotGains: z.record(z.string(), nonNegativeNumber),
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
  ramScore: nonNegativeInt,
  wipeoutPenalty: probability,
  jackpotCooldown: nonNegativeNumber,
  assist: z.object({
    floor55: nonNegativeNumber,
    floor66: nonNegativeNumber,
    floor70: nonNegativeNumber,
    requireContributions: nonNegativeInt,
  }),
  finalChaos: z.object({
    mult: positiveNumber,
    start: positiveNumber,
  }),
});

export type ScoringDefinition = z.infer<typeof scoringSchema>;
