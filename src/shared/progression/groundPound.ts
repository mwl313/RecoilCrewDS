export interface GroundPoundTuning {
  minimumFallDistance: number;
  baseDamagePerStack: number;
  fallBonusPerMeter: number;
  baseRadius: number;
  radiusPerMeter: number;
  maximumRadius: number;
  baseKnockback: number;
  knockbackPerMeter: number;
  maximumKnockback: number;
}

export interface GroundPoundMetrics {
  effectiveFall: number;
  damage: number;
  radius: number;
  knockback: number;
  stacks: number;
}

/** Binding values from LANDING_AND_GROUND_POUND_DESIGN.md. */
export const GROUND_POUND_TUNING: Readonly<GroundPoundTuning> = Object.freeze({
  minimumFallDistance: 1.5,
  baseDamagePerStack: 10,
  fallBonusPerMeter: 5,
  baseRadius: 5,
  radiusPerMeter: 0.65,
  maximumRadius: 12,
  baseKnockback: 4,
  knockbackPerMeter: 0.75,
  maximumKnockback: 12,
});

export function resolveGroundPoundTuning(params: Readonly<Record<string, unknown>>): GroundPoundTuning {
  return {
    minimumFallDistance: numberParameter(params, 'minimumFallDistance', GROUND_POUND_TUNING.minimumFallDistance),
    baseDamagePerStack: numberParameter(params, 'baseDamagePerStack', GROUND_POUND_TUNING.baseDamagePerStack),
    fallBonusPerMeter: numberParameter(params, 'fallBonusPerMeter', GROUND_POUND_TUNING.fallBonusPerMeter),
    baseRadius: numberParameter(params, 'baseRadius', GROUND_POUND_TUNING.baseRadius),
    radiusPerMeter: numberParameter(params, 'radiusPerMeter', GROUND_POUND_TUNING.radiusPerMeter),
    maximumRadius: numberParameter(params, 'maximumRadius', GROUND_POUND_TUNING.maximumRadius),
    baseKnockback: numberParameter(params, 'baseKnockback', GROUND_POUND_TUNING.baseKnockback),
    knockbackPerMeter: numberParameter(params, 'knockbackPerMeter', GROUND_POUND_TUNING.knockbackPerMeter),
    maximumKnockback: numberParameter(params, 'maximumKnockback', GROUND_POUND_TUNING.maximumKnockback),
  };
}

/** Returns null below the activation threshold or without an owned stack. */
export function calculateGroundPound(
  fallDistance: number,
  stacksRaw: number,
  tuning: Readonly<GroundPoundTuning> = GROUND_POUND_TUNING,
): GroundPoundMetrics | null {
  const fall = Number.isFinite(fallDistance) ? Math.max(0, fallDistance) : 0;
  const stacks = Number.isFinite(stacksRaw) ? Math.max(0, Math.floor(stacksRaw)) : 0;
  if (stacks === 0 || fall < tuning.minimumFallDistance) return null;

  const effectiveFall = Math.max(0, fall - tuning.minimumFallDistance);
  const baseDamage = tuning.baseDamagePerStack * stacks;
  const fallBonus = effectiveFall * tuning.fallBonusPerMeter;
  return {
    effectiveFall: stableFormulaValue(effectiveFall),
    damage: stableFormulaValue(baseDamage + fallBonus),
    radius: stableFormulaValue(Math.min(tuning.maximumRadius, tuning.baseRadius + effectiveFall * tuning.radiusPerMeter)),
    knockback: stableFormulaValue(Math.min(tuning.maximumKnockback, tuning.baseKnockback + effectiveFall * tuning.knockbackPerMeter)),
    stacks,
  };
}

function numberParameter(params: Readonly<Record<string, unknown>>, key: string, fallback: number): number {
  const value = params[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Keep networked formula values deterministic and human-inspectable. */
function stableFormulaValue(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
