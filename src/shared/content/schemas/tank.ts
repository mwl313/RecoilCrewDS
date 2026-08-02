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
  boostMult: positiveNumber,
  boostGrip: positiveNumber,
  normalGrip: positiveNumber,
  braceGrip: positiveNumber,
  braceAccelMult: positiveNumber,
  braceSteerMult: positiveNumber,
  airControl: nonNegativeNumber,
  gravity: positiveNumber,
  jumpImpulse: nonNegativeNumber,
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
  braceRecoilMult: nonNegativeNumber,
  jackpotRecoilImpulse: nonNegativeNumber,
  jackpotSpin: nonNegativeNumber,
  jackpotBraceMult: nonNegativeNumber,
  mgRecoilImpulse: nonNegativeNumber,
});

export type TankDefinition = z.infer<typeof tankSchema>;
