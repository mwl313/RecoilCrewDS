import { z } from 'zod';
import { commonDefinition, nonNegativeNumber, positiveNumber } from './common';

/** Items are empty in the Demo pack; the schema exists for later phases. */
export const itemSchema = z.object({
  ...commonDefinition,
  id: z.string().regex(/^item\./, 'item id must start with item.'),
  kind: z.string().min(1),
  duration: positiveNumber.optional(),
  stackable: z.boolean().optional(),
});

export type ItemDefinition = z.infer<typeof itemSchema>;

export const statusEffectSchema = z.object({
  ...commonDefinition,
  id: z.string().regex(/^status\./, 'status effect id must start with status.'),
  kind: z.string().min(1),
  duration: positiveNumber.optional(),
  stackable: z.boolean().optional(),
  magnitude: nonNegativeNumber.optional(),
});

export type StatusEffectDefinition = z.infer<typeof statusEffectSchema>;
