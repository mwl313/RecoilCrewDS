/** Player-facing scale for raw combat health and damage values. */
export const COMBAT_DISPLAY_SCALE = 10;

const NUMBER_FORMATTER = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
  useGrouping: true,
});

/** Convert one authoritative internal combat value at the presentation boundary. */
export function toCombatDisplayValue(value: number): number {
  return Math.round(value * COMBAT_DISPLAY_SCALE);
}

export function formatCombatDisplayValue(value: number): string {
  return NUMBER_FORMATTER.format(toCombatDisplayValue(value));
}

export function formatCombatDamage(actualHpLoss: number): string {
  return `-${formatCombatDisplayValue(Math.abs(actualHpLoss))}`;
}

export type CombatDamagePresentationTier = 'LIGHT' | 'STANDARD' | 'HEAVY' | 'MASSIVE';

export interface CombatDamagePresentationStyle {
  tier: CombatDamagePresentationTier;
  fontPx: number;
  startScale: number;
  risePx: number;
  lifetimeMs: number;
  impactAccent: boolean;
}

const DAMAGE_PRESENTATION: Record<CombatDamagePresentationTier, CombatDamagePresentationStyle> = {
  LIGHT: { tier: 'LIGHT', fontPx: 18, startScale: 1.15, risePx: 24, lifetimeMs: 600, impactAccent: false },
  STANDARD: { tier: 'STANDARD', fontPx: 22, startScale: 1.3, risePx: 30, lifetimeMs: 700, impactAccent: false },
  HEAVY: { tier: 'HEAVY', fontPx: 27, startScale: 1.45, risePx: 36, lifetimeMs: 760, impactAccent: false },
  MASSIVE: { tier: 'MASSIVE', fontPx: 34, startScale: 1.6, risePx: 42, lifetimeMs: 860, impactAccent: true },
};

/**
 * Presentation-only classification in internal HP-loss units.
 * Current baselines: MG 2, cannon/Dash 12, full charge 60.
 */
export function classifyCombatDamageMagnitude(actualHpLoss: number): CombatDamagePresentationTier {
  const amount = Math.abs(actualHpLoss);
  if (amount < 4) return 'LIGHT';
  if (amount < 12) return 'STANDARD';
  if (amount < 36) return 'HEAVY';
  return 'MASSIVE';
}

export function combatDamagePresentationStyle(actualHpLoss: number): CombatDamagePresentationStyle {
  return DAMAGE_PRESENTATION[classifyCombatDamageMagnitude(actualHpLoss)];
}
