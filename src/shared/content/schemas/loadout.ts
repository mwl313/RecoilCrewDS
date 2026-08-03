import { z } from 'zod';
import { commonDefinition, nonNegativeNumber, positiveNumber } from './common';

export const loadoutSchema = z.object({
  ...commonDefinition,
  id: z.string().regex(/^loadout\./, 'loadout id must start with loadout.'),
  primary: z.string().regex(/^weapon\./, 'primary must reference a weapon'),
  secondary: z.string().regex(/^weapon\./, 'secondary must reference a weapon'),
  ability: z.string().regex(/^weapon\./, 'ability must reference a weapon'),
  turret: z.object({
    turnRate: positiveNumber,
    pitchFollowRate: positiveNumber.optional(),
    maxPitch: z.number().finite(),
    minPitch: z.number().finite(),
  }),
});

export type LoadoutDefinition = z.infer<typeof loadoutSchema>;
