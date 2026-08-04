import { z } from 'zod';

const vec3 = z.tuple([z.number(), z.number(), z.number()]);

export const enemyPresentationProfileSchema = z
  .object({
    id: z.string().regex(/^enemyPresentation\./, 'presentation profile id must start with enemyPresentation.'),
    label: z.string().min(1),
    nearModelAssetId: z.string().min(1),
    farModelAssetId: z.string().min(1).optional(),
    aggregateModelAssetId: z.string().min(1).optional(),
    animationProfileId: z.string().regex(/^enemyAnimation\./).optional(),
    lodPolicyId: z.string().regex(/^animationLod\./),
    shadowPolicyId: z.string().regex(/^animationShadow\./),
    transform: z
      .object({
        scale: z.union([z.number(), vec3]).optional(),
        position: vec3.optional(),
        rotation: vec3.optional(),
      })
      .strict()
      .optional(),
    socketBindings: z.record(z.string().min(1), z.string().min(1)).optional(),
    materialPolicy: z
      .object({
        cloneForHitFlash: z.boolean(),
        allowSharedMaterials: z.boolean(),
      })
      .strict()
      .optional(),
    tags: z.array(z.string().min(1)).optional(),
  })
  .strict();

export type EnemyPresentationProfileSchema = z.infer<typeof enemyPresentationProfileSchema>;
