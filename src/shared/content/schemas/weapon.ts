import { z } from 'zod';
import { commonDefinition, nonNegativeNumber, positiveInt, positiveNumber } from './common';

const base = {
  ...commonDefinition,
  id: z.string().regex(/^weapon\./, 'weapon id must start with weapon.'),
};

export const weaponSchema = z.discriminatedUnion('kind', [
  z.object({
    ...base,
    kind: z.literal('mg'),
    damage: positiveNumber,
    rate: positiveNumber,
    range: positiveNumber,
    spread: nonNegativeNumber,
    speed: positiveNumber,
    recoilImpulse: nonNegativeNumber,
  }),
  z.object({
    ...base,
    kind: z.literal('cannon'),
    damage: positiveNumber,
    radius: positiveNumber,
    cooldown: nonNegativeNumber,
    speed: positiveNumber,
    gravity: nonNegativeNumber,
    life: positiveNumber,
    burst: positiveInt,
    burstSpacing: positiveNumber,
    recoilImpulse: nonNegativeNumber,
    recoilSpin: nonNegativeNumber,
  }),
  z.object({
    ...base,
    kind: z.literal('jackpot'),
    damage: positiveNumber,
    radius: positiveNumber,
    cooldown: nonNegativeNumber,
    speed: positiveNumber,
    gravity: nonNegativeNumber,
    chargeTime: positiveNumber,
    life: positiveNumber,
    recoilImpulse: nonNegativeNumber,
    recoilSpin: nonNegativeNumber,
    braceMult: nonNegativeNumber,
  }),
]);

export type WeaponDefinition = z.infer<typeof weaponSchema>;
