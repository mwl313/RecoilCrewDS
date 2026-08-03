import { z } from 'zod';
import { commonDefinition, positiveNumber } from './common';

export const pickupSchema = z.object({
  ...commonDefinition,
  id: z.string().regex(/^pickup\./, 'pickup id must start with pickup.'),
  kind: z.enum(['normal', 'heavy', 'jackpot']),
  life: positiveNumber,
  magnetRadius: positiveNumber,
  presentationId: z.string().optional(),
});

export type PickupDefinition = z.infer<typeof pickupSchema>;
