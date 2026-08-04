import { z } from 'zod';
import { commonDefinition, finiteNumber, nonNegativeNumber, positiveNumber } from './common';

export const weaponChargeSchema = z
  .object({
    capabilityId: z.string().min(1),
    tapMaxSeconds: positiveNumber,
    fullChargeSeconds: positiveNumber,
    fullDamageMultiplier: nonNegativeNumber,
    fullSplashRadiusMultiplier: nonNegativeNumber,
    fullRecoilMultiplier: nonNegativeNumber,
    fullKnockbackMaxMultiplier: nonNegativeNumber,
    fullKnockbackMinMultiplier: nonNegativeNumber,
    fullKnockbackVerticalMultiplier: nonNegativeNumber,
    fullShellVisualScale: nonNegativeNumber.optional(),
  })
  .strict();

export const weaponSchema = z.object({
  ...commonDefinition,
  id: z.string().regex(/^weapon\./, 'weapon id must start with weapon.'),
  behaviorId: z.enum(['weapon.hitscan', 'weapon.projectile']),
  fireMode: z.enum(['auto', 'semi', 'charge']),
  cooldownSeconds: nonNegativeNumber,
  chargeSeconds: positiveNumber.optional(),
  /** Combat 05: relic-gated cannon charge profile (secondary cannon only). */
  charge: weaponChargeSchema.optional(),
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
