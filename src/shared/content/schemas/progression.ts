import { z } from 'zod';
import { commonDefinition, nonNegativeNumber, positiveNumber, probability } from './common';

/**
 * Progression08 — power-up / level-up / relic progression content.
 * All numeric values here are prototype tuning; no schema comment claims a
 * final balance value.
 */

export const RELIC_RARITY = ['common', 'rare', 'epic', 'legendary'] as const;
export type RelicRarity = (typeof RELIC_RARITY)[number];

export const UPGRADE_RARITY = ['common', 'rare', 'epic', 'legendary'] as const;
export type UpgradeRarity = (typeof UPGRADE_RARITY)[number];

export const RELIC_ROLE = ['driver', 'gunner', 'crew'] as const;
export type RelicRole = (typeof RELIC_ROLE)[number];

export const RELIC_STACK_POLICY = [
  'addPercent',
  'addFlat',
  'grantCapabilityAndAddPercent',
  'unique',
] as const;
export type RelicStackPolicy = (typeof RELIC_STACK_POLICY)[number];

/**
 * Known triggered-effect handlers. New behaviors add a handler here and
 * register it in the trigger registry — no central gameplay switch.
 */
export const RELIC_EFFECT_TYPES = [
  'statPercent',
  'statFlat',
  'capability',
  'heal',
  'magnetMultiplier',
  'xpMultiplier',
  'incomingDamageReduction',
  'outgoingDamageMultiplier',
  'conditionalIncomingReduction',
  'conditionalOutgoingIncrease',
  'dashDamagePercent',
  'dashCooldownPercent',
  'airControlPercent',
  'extraJumps',
  'airDashCharges',
  'mgBuffOnCannonFire',
  'enemySpeedDebuffOnMgHit',
  'enemyVulnerabilityOnMgHit',
  'cannonKillHeal',
  'cannonKillExplosion',
  'cannonHitCooldownReduction',
  'dashHitCooldownReduction',
  'airCooldownRecovery',
  'groundPound',
  'waveClearHeal',
  'revive',
  'roadkill',
  'phaseDash',
  'twinShell',
  'zeroDashCooldown',
  'cannonRadiusAndKnockbackPercent',
] as const;

export type RelicEffectType = (typeof RELIC_EFFECT_TYPES)[number];

/**
 * Parameters each effect type must supply. Tuning values must come from
 * validated content; handlers may only rely on generic (non relic-specific)
 * defaults when a key is explicitly optional.
 */
export const RELIC_EFFECT_REQUIRED_PARAMETERS: Record<RelicEffectType, readonly string[]> = {
  statPercent: ['statId', 'percentPerStack'],
  statFlat: ['statId', 'flatPerStack'],
  capability: ['capabilityId'],
  heal: ['amount'],
  magnetMultiplier: ['percentPerStack'],
  xpMultiplier: ['percentPerStack'],
  incomingDamageReduction: ['percentPerStack'],
  outgoingDamageMultiplier: ['percentPerStack'],
  conditionalIncomingReduction: ['condition', 'percentPerStack'],
  conditionalOutgoingIncrease: ['condition', 'percentPerStack'],
  dashDamagePercent: ['percentPerStack'],
  dashCooldownPercent: ['percentPerStack'],
  airControlPercent: ['percentPerStack'],
  extraJumps: ['countPerStack'],
  airDashCharges: ['countPerStack'],
  mgBuffOnCannonFire: ['percentPerStack', 'durationSeconds'],
  enemySpeedDebuffOnMgHit: ['percentPerStack', 'durationSeconds'],
  enemyVulnerabilityOnMgHit: ['percentPerStack', 'durationSeconds'],
  cannonKillHeal: ['amountPerStack'],
  cannonKillExplosion: ['radius', 'damageBase', 'damagePerStack'],
  cannonHitCooldownReduction: ['percentPerStack'],
  dashHitCooldownReduction: ['percentPerStack'],
  airCooldownRecovery: ['recoveryMultiplierPerStack'],
  groundPound: ['radius', 'damageBase', 'damagePerStack', 'knockback'],
  waveClearHeal: ['amountPerStack'],
  revive: ['integrityPercent', 'shockwaveRadius', 'shockwaveDamage'],
  roadkill: [
    'minimumSpeedRatio',
    'baseDamageCoefficient',
    'coefficientPerAdditionalStack',
    'perTargetCooldownSeconds',
    'knockbackCoefficient',
  ],
  phaseDash: [],
  twinShell: ['cooldownMultiplier'],
  zeroDashCooldown: [],
  cannonRadiusAndKnockbackPercent: ['radiusPercentPerStack', 'knockbackPercentPerStack'],
};

/** Returns the required parameter keys missing from the merged parameters. */
export function missingRelicEffectParameters(
  effectType: string,
  params: Record<string, unknown> | undefined,
): string[] {
  const required = RELIC_EFFECT_REQUIRED_PARAMETERS[effectType as RelicEffectType] ?? [];
  return required.filter((key) => !(params && key in params));
}

export const levelCurveSchema = z
  .object({
    ...commonDefinition,
    id: z.string().regex(/^levelCurve\./, 'level curve id must start with levelCurve.'),
    thresholds: z.array(positiveNumber).min(1),
    overflowRule: z.enum(['repeatLastDelta', 'formula', 'cap']),
    maximumLevel: z.number().int().positive().optional(),
  })
  .strict();

export const xpPickupDefinitionSchema = z
  .object({
    ...commonDefinition,
    id: z.string().regex(/^xpPickup\./, 'xp pickup id must start with xpPickup.'),
    life: positiveNumber,
    magnet: z
      .object({
        baseRadius: positiveNumber,
        minimumPullSpeed: positiveNumber,
        maximumPullSpeed: positiveNumber,
        accelerationExponent: positiveNumber,
        collectRadius: positiveNumber,
      })
      .strict(),
  })
  .strict();

const rarityChances = z
  .object({
    common: probability,
    rare: probability,
    epic: probability,
    legendary: probability,
  })
  .strict();

export const upgradeRarityTableSchema = z
  .object({
    ...commonDefinition,
    id: z.string().regex(/^rarity\.upgrade\./, 'upgrade rarity table id must start with rarity.upgrade.'),
    rarities: rarityChances,
  })
  .strict();

export const upgradeCategorySchema = z
  .object({
    ...commonDefinition,
    id: z.string().regex(/^upgrade\./, 'upgrade category id must start with upgrade.'),
    label: z.string().min(1),
    role: z.enum(['driver', 'gunner']),
    iconId: z.string().min(1),
    tags: z.array(z.string().min(1)).optional(),
    effects: z
      .array(
        z
          .object({
            statId: z.string().min(1),
            operation: z.enum(['multiply', 'add']),
          })
          .strict(),
      )
      .min(1),
    rarityRanges: z
      .object({
        common: z
          .object({
            minPercent: z.number().optional(),
            maxPercent: z.number().optional(),
            minFlat: z.number().optional(),
            maxFlat: z.number().optional(),
          })
          .strict(),
        rare: z
          .object({
            minPercent: z.number().optional(),
            maxPercent: z.number().optional(),
            minFlat: z.number().optional(),
            maxFlat: z.number().optional(),
          })
          .strict(),
        epic: z
          .object({
            minPercent: z.number().optional(),
            maxPercent: z.number().optional(),
            minFlat: z.number().optional(),
            maxFlat: z.number().optional(),
          })
          .strict(),
        legendary: z
          .object({
            minPercent: z.number().optional(),
            maxPercent: z.number().optional(),
            minFlat: z.number().optional(),
            maxFlat: z.number().optional(),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

const upgradeRarityEnum = z.enum(UPGRADE_RARITY);

export const upgradeFirstExperienceSchema = z
  .object({
    ...commonDefinition,
    id: z.string().regex(/^firstExperience\.levelUp\./, 'id must start with firstExperience.levelUp.'),
    cardRules: z
      .array(
        z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('fixed'), rarity: upgradeRarityEnum }).strict(),
          z.object({ kind: z.literal('normal') }).strict(),
          z
            .object({
              kind: z.literal('branch'),
              branches: z
                .array(
                  z
                    .object({
                      rarity: z.enum([...UPGRADE_RARITY, 'normal']),
                      probability: probability,
                    })
                    .strict(),
                )
                .min(1),
            })
            .strict(),
        ]),
      )
      .length(3),
  })
  .strict();

export const treasureRarityTableSchema = z
  .object({
    ...commonDefinition,
    id: z.string().regex(/^rarity\.treasure\./, 'treasure rarity table id must start with rarity.treasure.'),
    rarities: rarityChances,
  })
  .strict();

export const firstTreasureRuleSchema = z
  .object({
    ...commonDefinition,
    id: z.string().regex(/^firstExperience\.treasure\./, 'id must start with firstExperience.treasure.'),
    rarities: z
      .object({
        epic: probability,
        legendary: probability,
      })
      .strict(),
  })
  .strict();

export const relicEffectTemplateSchema = z
  .object({
    ...commonDefinition,
    id: z.string().regex(/^relicEffect\./, 'relic effect template id must start with relicEffect.'),
    effectType: z.enum(RELIC_EFFECT_TYPES),
    parameters: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const relicSchema = z
  .object({
    ...commonDefinition,
    id: z.string().regex(/^relic\./, 'relic id must start with relic.'),
    label: z.string().min(1),
    rarity: z.enum(RELIC_RARITY),
    role: z.enum(RELIC_ROLE),
    iconId: z.string().min(1),
    description: z.string().min(1),
    tags: z.array(z.string().min(1)).optional(),
    stackPolicy: z.enum(RELIC_STACK_POLICY),
    capabilityId: z.string().min(1).optional(),
    effects: z
      .array(
        z
          .object({
            templateId: z.string().regex(/^relicEffect\./),
            parameters: z.record(z.string(), z.unknown()).optional(),
          })
          .strict(),
      )
      .min(1),
    duplicateReplacement: z
      .object({
        type: z.literal('xp'),
        amount: positiveNumber,
      })
      .strict()
      .optional(),
  })
  .strict();

export const relicPoolSchema = z
  .object({
    ...commonDefinition,
    id: z.string().regex(/^relicPool\./, 'relic pool id must start with relicPool.'),
    relicIds: z.array(z.string().regex(/^relic\./)).min(1),
  })
  .strict();

export const progressionModePolicySchema = z
  .object({
    ...commonDefinition,
    id: z.string().regex(/^progressionMode\./, 'progression mode policy id must start with progressionMode.'),
    levelUpSelection: z.enum(['roleSeparated', 'unified']),
    xpMultiplier: positiveNumber,
    selectionTimeoutSeconds: positiveNumber,
  })
  .strict();

export const progressionDefinitionSchema = z
  .object({
    ...commonDefinition,
    id: z.string().regex(/^progression\./, 'progression id must start with progression.'),
    levelCurveId: z.string().regex(/^levelCurve\./),
    xpPickupDefinitionId: z.string().regex(/^xpPickup\./),
    upgradeRarityTableId: z.string().regex(/^rarity\.upgrade\./),
    upgradeFirstExperienceRuleId: z.string().regex(/^firstExperience\.levelUp\./),
    treasureRarityTableId: z.string().regex(/^rarity\.treasure\./),
    firstTreasureRuleId: z.string().regex(/^firstExperience\.treasure\./),
    relicPoolId: z.string().regex(/^relicPool\./),
    multiplayerPolicyId: z.string().regex(/^progressionMode\./),
    singlePlayerPolicyId: z.string().regex(/^progressionMode\./),
    enemyXpRewards: z
      .object({
        ambient: positiveNumber,
        wave: positiveNumber,
        elite: positiveNumber,
        boss: positiveNumber,
      })
      .strict(),
    enemyChestDropChance: probability,
    duplicateUniqueRelicXp: positiveNumber,
  })
  .strict();

export type LevelCurveDefinition = z.infer<typeof levelCurveSchema>;
export type XpPickupDefinition = z.infer<typeof xpPickupDefinitionSchema>;
export type UpgradeRarityTableDefinition = z.infer<typeof upgradeRarityTableSchema>;
export type UpgradeCategoryDefinition = z.infer<typeof upgradeCategorySchema>;
export type UpgradeFirstExperienceDefinition = z.infer<typeof upgradeFirstExperienceSchema>;
export type TreasureRarityTableDefinition = z.infer<typeof treasureRarityTableSchema>;
export type FirstTreasureRuleDefinition = z.infer<typeof firstTreasureRuleSchema>;
export type RelicEffectTemplateDefinition = z.infer<typeof relicEffectTemplateSchema>;
export type RelicDefinition = z.infer<typeof relicSchema>;
export type RelicPoolDefinition = z.infer<typeof relicPoolSchema>;
export type ProgressionModePolicyDefinition = z.infer<typeof progressionModePolicySchema>;
export type ProgressionDefinition = z.infer<typeof progressionDefinitionSchema>;
