import { z } from 'zod';
import { ENEMY_ANIMATION_ROLES } from './animationRoles';

const roleEnum = z.enum(ENEMY_ANIMATION_ROLES);

/** Optional map keyed by every semantic role (Zod 4 partial record). */
function roleRecord<T extends z.ZodType>(value: T): z.ZodObject<Record<(typeof ENEMY_ANIMATION_ROLES)[number], z.ZodOptional<T>>> {
  const shape = Object.fromEntries(ENEMY_ANIMATION_ROLES.map((role) => [role, value.optional()])) as Record<
    (typeof ENEMY_ANIMATION_ROLES)[number],
    z.ZodOptional<T>
  >;
  return z.object(shape).strict();
}

export const enemyAnimationProfileSchema = z
  .object({
    id: z.string().regex(/^enemyAnimation\./, 'animation profile id must start with enemyAnimation.'),
    label: z.string().min(1),
    clips: roleRecord(z.string().min(1)).optional(),
    fallbacks: roleRecord(roleEnum).optional(),
    stateMap: z.record(z.string().min(1), roleEnum).optional(),
    locomotion: z
      .object({
        idleSpeedMax: z.number().nonnegative(),
        walkSpeedMax: z.number().positive(),
        walkSpeedReference: z.number().positive(),
        runSpeedReference: z.number().positive(),
        playbackMin: z.number().min(0.1),
        playbackMax: z.number().min(0.1),
        randomStartPhase: z.boolean(),
      })
      .strict(),
    transitions: z
      .object({
        defaultCrossFadeSeconds: z.number().nonnegative(),
        locomotionCrossFadeSeconds: z.number().nonnegative(),
        attackCrossFadeSeconds: z.number().nonnegative(),
        hitCrossFadeSeconds: z.number().nonnegative(),
        deathCrossFadeSeconds: z.number().nonnegative(),
      })
      .strict(),
    playback: roleRecord(
      z
        .object({
          loop: z.enum(['repeat', 'once', 'pingPong']),
          clampWhenFinished: z.boolean().optional(),
          timeScale: z.number().positive().optional(),
          interruptPriority: z.number().int().optional(),
        })
        .strict(),
    ).optional(),
    presentationEvents: roleRecord(
      z
        .array(
          z
            .object({
              normalizedTime: z.number().min(0).max(1),
              eventId: z.string().min(1),
            })
            .strict(),
        )
        .min(1),
    ).optional(),
    rootMotion: z.literal(false),
  })
  .strict();

export type EnemyAnimationProfileSchema = z.infer<typeof enemyAnimationProfileSchema>;
