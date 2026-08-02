import { z } from 'zod';
import { commonDefinition, nonNegativeNumber, positiveNumber } from './common';

export const effectModifierSchema = z.object({
  stat: z.string().regex(/^(tank|weapon|enemy|match)\./, 'effect stat must be a known stat id'),
  operation: z.enum(['add', 'multiply', 'override']),
  value: z.number().finite(),
  priority: z.number().int().optional(),
  stacking: z.enum(['stack', 'refresh', 'replace', 'highest', 'lowest']).optional(),
  durationSeconds: positiveNumber.optional(),
});

/** Items are empty in the Demo pack; the schema exists for later phases. */
export const itemSchema = z.object({
  ...commonDefinition,
  id: z.string().regex(/^item\./, 'item id must start with item.'),
  kind: z.string().min(1),
  duration: positiveNumber.optional(),
  stackable: z.boolean().optional(),
  modifiers: z.array(effectModifierSchema).optional(),
  presentationId: z.string().optional(),
});

export type ItemDefinition = z.infer<typeof itemSchema>;

export const statusEffectSchema = z.object({
  ...commonDefinition,
  id: z.string().regex(/^status\./, 'status effect id must start with status.'),
  kind: z.string().min(1),
  duration: positiveNumber.optional(),
  stackable: z.boolean().optional(),
  magnitude: nonNegativeNumber.optional(),
  modifiers: z.array(effectModifierSchema).optional(),
  presentationId: z.string().optional(),
});

export type StatusEffectDefinition = z.infer<typeof statusEffectSchema>;
