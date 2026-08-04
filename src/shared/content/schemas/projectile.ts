import { z } from 'zod';
import { commonDefinition, nonNegativeNumber, positiveNumber } from './common';

export const projectileSchema = z.object({
  ...commonDefinition,
  id: z.string().regex(/^projectile\./, 'projectile id must start with projectile.'),
  kind: z.enum(['cannon', 'tower']),
  speed: positiveNumber,
  gravity: nonNegativeNumber,
  life: positiveNumber,
  hitRadius: positiveNumber,
  tankHitRadius: positiveNumber.optional(),
});

export type ProjectileDefinition = z.infer<typeof projectileSchema>;
