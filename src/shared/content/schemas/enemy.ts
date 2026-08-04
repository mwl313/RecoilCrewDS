import { z } from 'zod';
import {
  commonDefinition,
  nonNegativeInt,
  nonNegativeNumber,
  positiveInt,
  positiveNumber,
} from './common';

const enemyBase = {
  ...commonDefinition,
  id: z.string().regex(/^enemy\./, 'enemy id must start with enemy.'),
  presentationId: z.string().optional(),
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
]);

export type EnemyDefinition = z.infer<typeof enemySchema>;
