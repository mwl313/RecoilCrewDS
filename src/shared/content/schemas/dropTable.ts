import { z } from 'zod';
import { commonDefinition, nonNegativeNumber, positiveInt } from './common';

export const dropTableSchema = z.object({
  ...commonDefinition,
  id: z.string().regex(/^drops\./, 'drop table id must start with drops.'),
  entries: z
    .array(
      z.object({
        kind: z.enum(['normal', 'heavy', 'jackpot']),
        count: positiveInt,
        offsetX: z.number().finite().optional(),
        offsetZ: z.number().finite().optional(),
        scatter: z
          .object({
            minRadius: nonNegativeNumber,
            maxRadius: nonNegativeNumber,
            angleJitter: nonNegativeNumber,
          })
          .optional(),
      }),
    )
    .min(1),
});

export type DropTableDefinition = z.infer<typeof dropTableSchema>;
