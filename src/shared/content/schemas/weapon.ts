import { z } from 'zod';
import { commonDefinition, finiteNumber, nonNegativeNumber, positiveNumber } from './common';

export const weaponSchema = z.object({
  ...commonDefinition,
  id: z.string().regex(/^weapon\./, 'weapon id must start with weapon.'),
  behaviorId: z.enum(['weapon.hitscan', 'weapon.projectile', 'weapon.chargeProjectile']),
  fireMode: z.enum(['auto', 'semi', 'charge']),
  cooldownSeconds: nonNegativeNumber,
  chargeSeconds: positiveNumber.optional(),
  statBlock: z.record(z.string().regex(/^weapon\./, 'statBlock keys must be weapon.* stat ids'), finiteNumber),
  projectileId: z.string().regex(/^projectile\./, 'projectileId must reference a projectile').optional(),
  presentation: z
    .object({
      muzzleVfxId: z.string().optional(),
      fireAudioId: z.string().optional(),
    })
    .optional(),
});

export type WeaponDefinition = z.infer<typeof weaponSchema>;
