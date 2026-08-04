import { z } from 'zod';
import { ENEMY_ANIMATION_LOD_TIERS } from './animationProfileTypes';

const shadowRules = z
  .object({
    castShadow: z.boolean(),
    receiveShadow: z.boolean(),
  })
  .strict();

export const animationShadowPolicySchema = z
  .object({
    id: z.string().regex(/^animationShadow\./, 'shadow policy id must start with animationShadow.'),
    tiers: z.record(z.enum(ENEMY_ANIMATION_LOD_TIERS), shadowRules),
  })
  .strict();

export type AnimationShadowPolicySchema = z.infer<typeof animationShadowPolicySchema>;
