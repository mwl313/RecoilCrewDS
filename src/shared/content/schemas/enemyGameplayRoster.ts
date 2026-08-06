import { z } from 'zod';
import { commonDefinition, positiveInt, positiveNumber } from './common';

export const ORDINARY_ROSTER_SLOTS = ['closeFodder', 'rangedFodder', 'specialist'] as const;

const ordinaryRosterCandidateSchema = z.object({
  enemyId: z.string().regex(/^enemy\./, 'enemyId must be a semantic enemy id'),
  slot: z.enum(ORDINARY_ROSTER_SLOTS),
  /** Phase 1, Phase 2, Phase 3 weights. 0 = unavailable; positive = weighted. */
  phaseWeights: z
    .tuple([
      z.number().finite().nonnegative(),
      z.number().finite().nonnegative(),
      z.number().finite().nonnegative(),
    ])
    .refine((weights) => weights.some((w) => w > 0), 'at least one phase weight must be positive'),
});

const featuredWaveRuleSchema = z.object({
  waveIndex: z.union([z.literal(1), z.literal(2)]),
  eliteCount: z.number().int().min(0).max(2),
});

const featuredMonsterIdentitySchema = z.object({
  identityId: z.string().regex(/^featuredMonster\./, 'identityId must start with featuredMonster.'),
  label: z.string().min(1),
  eliteEnemyId: z.string().regex(/^enemy\./),
  bossEnemyId: z.string().regex(/^enemy\./),
  selectionWeight: positiveNumber,
});

export const enemyGameplayRosterSchema = z
  .object({
    ...commonDefinition,
    id: z.string().regex(/^enemyGameplayRoster\./, 'id must start with enemyGameplayRoster.'),
    phaseDurationSeconds: positiveNumber,
    ordinaryMix: z
      .object({
        closeFodder: z.number().finite().min(0).max(1),
        rangedFodder: z.number().finite().min(0).max(1),
        specialist: z.number().finite().min(0).max(1),
      })
      .refine(
        (mix) => Math.abs(mix.closeFodder + mix.rangedFodder + mix.specialist - 1) < 1e-6,
        'ordinaryMix ratios must sum to 1',
      ),
    featuredWaves: z.array(featuredWaveRuleSchema).min(1),
    maximumSupportedEliteCountPerWave: z.number().int().min(1).max(2),
    bossEscortCount: z.tuple([positiveInt, positiveInt]),
    featuredIdentities: z.array(featuredMonsterIdentitySchema).min(1),
    ordinaryCandidates: z.array(ordinaryRosterCandidateSchema).min(1),
  })
  .superRefine((roster, ctx) => {
    const seen = new Set<string>();
    for (const candidate of roster.ordinaryCandidates) {
      if (seen.has(candidate.enemyId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${roster.id}: duplicate ordinary candidate '${candidate.enemyId}'`,
        });
      }
      seen.add(candidate.enemyId);
    }
    const identityIds = new Set<string>();
    for (const identity of roster.featuredIdentities) {
      if (identityIds.has(identity.identityId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${roster.id}: duplicate featured identity '${identity.identityId}'`,
        });
      }
      identityIds.add(identity.identityId);
    }
    for (const wave of roster.featuredWaves) {
      if (wave.eliteCount > roster.maximumSupportedEliteCountPerWave) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${roster.id}: wave ${wave.waveIndex} eliteCount exceeds supported maximum`,
        });
      }
    }
    const totalElites = roster.featuredWaves.reduce((sum, wave) => sum + wave.eliteCount, 0);
    if (roster.featuredIdentities.length < totalElites + 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${roster.id}: featured pool must be >= ${totalElites} elites + 1 boss`,
      });
    }
    // Every phase/slot must have at least one available candidate.
    for (const phase of [0, 1, 2] as const) {
      for (const slot of ORDINARY_ROSTER_SLOTS) {
        const available = roster.ordinaryCandidates.some(
          (c) => c.slot === slot && c.phaseWeights[phase] > 0,
        );
        if (!available) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${roster.id}: no candidate available for ${slot} in phase ${phase + 1}`,
          });
        }
      }
    }
  });

export type EnemyGameplayRosterDefinition = z.infer<typeof enemyGameplayRosterSchema>;
export type OrdinaryRosterSlot = (typeof ORDINARY_ROSTER_SLOTS)[number];
