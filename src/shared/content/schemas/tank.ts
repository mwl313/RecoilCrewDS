import { z } from 'zod';
import { commonDefinition, nonNegativeNumber, positiveInt, positiveNumber } from './common';

export const tankSchema = z.object({
  ...commonDefinition,
  id: z.string().regex(/^tank\./, 'tank id must start with tank.'),
  forwardSpeed: positiveNumber,
  reverseSpeed: positiveNumber,
  accel: positiveNumber,
  reverseAccel: positiveNumber,
  steerLow: nonNegativeNumber,
  steerHigh: nonNegativeNumber,
  normalGrip: positiveNumber,
  airControl: nonNegativeNumber,
  gravity: positiveNumber,
  jumpHeight: nonNegativeNumber,
  rampLaunchSpeed: nonNegativeNumber,
  dashImpulse: nonNegativeNumber,
  dashCooldown: nonNegativeNumber,
  dashAirMultiplier: nonNegativeNumber,
  dashMaxHorizontalSpeed: positiveNumber,
  dashPresentationSeconds: nonNegativeNumber,
  collisionRadius: positiveNumber,
  footprint: z
    .array(
      z.object({
        offset: z.number().finite(),
        radius: positiveNumber,
      }),
    )
    .min(1),
  maxSafeStep: positiveNumber,
  maxSubsteps: positiveInt,
  reverseSteerMult: nonNegativeNumber,
  maxIntegrity: positiveNumber,
  respawnTime: nonNegativeNumber,
  shieldTime: nonNegativeNumber,
  autoRightTime: nonNegativeNumber,
  autoRightRoll: nonNegativeNumber,
  fallDamageSpeed: nonNegativeNumber,
  fallDamage: nonNegativeNumber,
  recoilImpulse: nonNegativeNumber,
  recoilSpin: nonNegativeNumber,
  jackpotRecoilImpulse: nonNegativeNumber,
  jackpotSpin: nonNegativeNumber,
  mgRecoilImpulse: nonNegativeNumber,
});

export type TankDefinition = z.infer<typeof tankSchema>;
