import { z } from 'zod';

export const animationLodPolicySchema = z
  .object({
    id: z.string().regex(/^animationLod\./, 'lod policy id must start with animationLod.'),
    heroAlwaysNear: z.boolean(),
    nearEnter: z.number().nonnegative(),
    nearLeave: z.number().positive(),
    midEnter: z.number().nonnegative(),
    midLeave: z.number().positive(),
    farEnter: z.number().nonnegative(),
    farLeave: z.number().positive(),
    nearUpdateHz: z.number().positive(),
    midUpdateHz: z.number().positive(),
    maximumNearMixers: z.number().int().positive(),
    maximumMidMixers: z.number().int().positive(),
    priorityWeights: z
      .object({
        boss: z.number().nonnegative(),
        elite: z.number().nonnegative(),
        attacking: z.number().nonnegative(),
        telegraphing: z.number().nonnegative(),
        damagedRecently: z.number().nonnegative(),
        distance: z.number().nonnegative(),
      })
      .strict(),
  })
  .strict();

export type AnimationLodPolicySchema = z.infer<typeof animationLodPolicySchema>;
