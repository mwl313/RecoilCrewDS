import { z } from 'zod';
import { commonDefinition } from './common';

export const modeSchema = z.object({
  ...commonDefinition,
  id: z.string().regex(/^mode\./, 'mode id must start with mode.'),
  mapProfileId: z
    .string()
    .regex(/^map\./, 'mapProfileId must reference a map definition')
    .optional(),
  difficulty: z.string().regex(/^difficulty\./, 'difficulty must reference a difficulty definition'),
  tank: z.string().regex(/^tank\./, 'tank must reference a tank definition'),
  loadout: z.string().regex(/^loadout\./, 'loadout must reference a loadout definition'),
  objectives: z.array(z.string().regex(/^objective\./, 'objectives must reference objective definitions')).min(1),
  spawnDirector: z.string().regex(/^spawn\./, 'spawnDirector must reference a spawn director'),
  scoring: z.string().regex(/^scoring\./, 'scoring must reference a scoring definition'),
  results: z.string().regex(/^results\./, 'results must reference a results definition'),
  presentation: z.string().regex(/^presentation\./, 'presentation must reference a presentation definition'),
  rematch: z
    .object({
      modifiers: z.array(z.string().regex(/^difficulty\./, 'rematch modifiers must reference difficulty definitions')),
    })
    .optional(),
});

export type ModeDefinition = z.infer<typeof modeSchema>;
