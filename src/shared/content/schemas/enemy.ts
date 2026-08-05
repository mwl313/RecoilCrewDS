import { z } from 'zod';
import {
  commonDefinition,
  nonNegativeInt,
  nonNegativeNumber,
  positiveInt,
  positiveNumber,
} from './common';

export const ENEMY_TIERS = ['fodder', 'specialist', 'elite', 'boss'] as const;
export const ENEMY_SIZE_CLASSES = ['small', 'medium', 'large'] as const;
export const ENEMY_REWARD_CLASSES = ['ambient', 'wave', 'elite', 'boss'] as const;

const behaviorEntrySchema = z.object({
  id: z.string().regex(/^(movement|attack|defense|trait)\./, 'behavior id must be namespaced'),
  parameters: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional(),
});

const cueNormalizedSchema = z.number().min(0).max(1).optional();

/** Ordinary melee attack: sustained contact DPS normalized over cadence. */
const ordinaryMeleeAttackSchema = z.object({
  type: z.literal('melee'),
  damageModel: z.literal('contactDps'),
  contactDps: positiveNumber,
  rate: positiveNumber,
  range: positiveNumber,
  engagementProfileId: z.string().regex(/^meleeEngagement\./, 'engagement profile ref must start with meleeEngagement.'),
  attackCueNormalized: cueNormalizedSchema,
});

/** Ordinary ranged attack: exactly one slow projectile per accepted attack. */
const ordinaryRangedAttackSchema = z.object({
  type: z.literal('ranged'),
  damage: positiveNumber,
  rate: positiveNumber,
  range: positiveNumber,
  preferredRange: positiveNumber.optional(),
  projectileId: z.string().regex(/^projectile\./, 'projectile ref must start with projectile.'),
  telegraphTime: positiveNumber,
  shotCount: z.literal(1),
  attackCueNormalized: cueNormalizedSchema,
});

const bossPatternSchema = z.discriminatedUnion('type', [
  z.object({
    id: z.string().min(1),
    type: z.literal('melee'),
    damage: positiveNumber,
    rate: positiveNumber,
    range: positiveNumber,
    attackCueNormalized: cueNormalizedSchema,
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal('ranged'),
    damage: positiveNumber,
    rate: positiveNumber,
    range: positiveNumber,
    projectileId: z.string().regex(/^projectile\./),
    telegraphTime: positiveNumber,
    attackCueNormalized: cueNormalizedSchema,
  }),
]);

const monsterAttackSchema = z.discriminatedUnion('type', [
  ordinaryMeleeAttackSchema,
  ordinaryRangedAttackSchema,
  z.object({
    type: z.literal('mixed'),
    selection: z.object({ mode: z.literal('orderedCycle') }),
    patterns: z.array(bossPatternSchema).min(2),
  }),
]);

const enemyBase = {
  ...commonDefinition,
  id: z.string().regex(/^enemy\./, 'enemy id must start with enemy.'),
  presentationId: z.string().optional(),
  /**
   * Animation07: explicit presentation profile. Resolution order is
   * presentationProfileId -> legacy profile from presentationId -> fallback.
   */
  presentationProfileId: z.string().optional(),
  hp: positiveNumber,
  /** Core Loop 06: weighted threat contribution to population budgets. */
  threat: nonNegativeNumber.optional(),
  radius: positiveNumber,
  score: nonNegativeInt,
  contributionPoints: nonNegativeInt,
  dropTableId: z.string().regex(/^drops\./, 'dropTableId must reference a drop table'),
  behaviors: z
    .array(
      z.object({
        id: z.string().regex(/^(movement|attack|defense|trait)\./, 'behavior id must be namespaced'),
        parameters: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional(),
      }),
    )
    .min(1),
  knockback: z
    .object({
      immovable: z.boolean(),
      horizontalResistance: nonNegativeNumber,
      verticalResistance: nonNegativeNumber,
      groundDrag: nonNegativeNumber,
      airDrag: nonNegativeNumber,
      gravityScale: positiveNumber,
    })
    .strict()
    .optional(),
};

const monsterEnemySchema = z
  .object({
    id: z.string().regex(/^enemy\./, 'enemy id must start with enemy.'),
    label: z.string().min(1),
    type: z.literal('monster'),
    tier: z.enum(ENEMY_TIERS),
    sizeClass: z.enum(ENEMY_SIZE_CLASSES),
    tierScale: positiveNumber,
    optionalVariantScale: positiveNumber.optional(),
    presentationProfileId: z.string().regex(/^enemyPresentation\./),
    animationProfileId: z.string().regex(/^enemyAnimation\./),
    stats: z.object({
      hp: positiveNumber,
      speed: positiveNumber,
      threat: nonNegativeNumber,
    }),
    rewardClass: z.enum(ENEMY_REWARD_CLASSES),
    levelScaling: z.object({
      health: z.boolean(),
      damage: z.boolean(),
    }),
    attack: monsterAttackSchema,
    behaviors: z.array(behaviorEntrySchema).min(1),
    spawnTags: z.array(z.string()).optional(),
    score: nonNegativeInt.optional(),
    contributionPoints: nonNegativeInt.optional(),
    dropTableId: z.string().optional(),
    radius: positiveNumber.optional(),
    knockback: z
      .object({
        immovable: z.boolean(),
        horizontalResistance: nonNegativeNumber,
        verticalResistance: nonNegativeNumber,
        groundDrag: nonNegativeNumber,
        airDrag: nonNegativeNumber,
        gravityScale: positiveNumber,
      })
      .strict()
      .optional(),
  })
  .superRefine((monster, ctx) => {
    const ordinary = monster.tier === 'fodder' || monster.tier === 'specialist' || monster.tier === 'elite';
    const boss = monster.tier === 'boss';
    if (ordinary && monster.attack.type === 'mixed') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${monster.id}: ordinary/elite monsters must use exactly one melee or ranged attack`,
      });
    }
    if (boss) {
      if (monster.attack.type !== 'mixed') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${monster.id}: bosses require a mixed pattern set`,
        });
      } else {
        if (monster.attack.patterns.length < 2) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${monster.id}: bosses require at least two patterns`,
          });
        }
        if (!monster.attack.patterns.some((p) => p.type === 'ranged')) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${monster.id}: bosses require at least one ranged pattern`,
          });
        }
      }
      if (monster.levelScaling.damage !== false) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${monster.id}: boss damage must not scale with level`,
        });
      }
    } else if (monster.levelScaling.damage !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${monster.id}: ordinary/elite damage must scale with level`,
      });
    }
    if (monster.attack.type === 'ranged' && monster.attack.shotCount !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${monster.id}: ordinary ranged attacks fire exactly one projectile`,
      });
    }
  });

export const enemySchema = z.discriminatedUnion('type', [
  z.object({
    ...enemyBase,
    type: z.literal('scrapBug'),
    speed: positiveNumber,
    damage: positiveNumber,
    hitCooldown: positiveNumber,
    circleDistance: positiveNumber,
    circleStrength: positiveNumber,
    separationDistance: positiveNumber,
    separationStrength: positiveNumber,
    obstacleAvoidTurn: positiveNumber,
    speedWobbleAmplitude: nonNegativeNumber,
    speedWobbleFrequency: positiveNumber,
  }),
  z.object({
    ...enemyBase,
    type: z.literal('rammer'),
    approachSpeed: positiveNumber,
    chargeSpeed: positiveNumber,
    damage: positiveNumber,
    telegraphTime: positiveNumber,
    chargeTime: positiveNumber,
    recoveryTime: positiveNumber,
    lockTime: nonNegativeNumber,
    lockDistance: positiveNumber,
    dodgeDistance: positiveNumber,
    recoveryDecel: positiveNumber,
    rearBonus: positiveNumber,
  }),
  z.object({
    ...enemyBase,
    type: z.literal('gunTower'),
    damage: positiveNumber,
    shotSpeed: positiveNumber,
    shotInterval: positiveNumber,
    shotCount: positiveInt,
    firePause: nonNegativeNumber,
    telegraphTime: positiveNumber,
    trackRate: positiveNumber,
    idleTime: nonNegativeNumber,
    aimJitter: nonNegativeNumber,
    muzzleOffsetX: nonNegativeNumber,
    muzzleHeight: positiveNumber,
    shotLife: positiveNumber,
  }),
  z.object({
    ...enemyBase,
    type: z.literal('lootTruck'),
    speed: positiveNumber,
    spawnTime: positiveNumber,
    escapeTime: positiveNumber,
    waypointReach: positiveNumber,
    escapeShortcut: positiveNumber,
    collisionPushTank: nonNegativeNumber,
    collisionPushTruck: nonNegativeNumber,
  }),
  monsterEnemySchema,
]);

export type EnemyDefinition = z.infer<typeof enemySchema>;
export type MonsterEnemyDefinition = z.infer<typeof monsterEnemySchema>;
export type BossAttackPattern = z.infer<typeof bossPatternSchema>;
