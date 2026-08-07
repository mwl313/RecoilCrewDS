import { formatCombatDisplayValue } from './combatDisplayUnits';

export type StatPresentationUnit =
  | 'combatDamage'
  | 'combatHp'
  | 'percent'
  | 'seconds'
  | 'meters'
  | 'speed'
  | 'plain';

export type StatPresentationGroup = 'CREW' | 'DRIVER' | 'GUNNER';

export interface StatPresentationMetadata {
  label: string;
  unit: StatPresentationUnit;
  group: StatPresentationGroup;
  lowerIsBetterLabel?: 'FASTER' | 'TIGHTER';
}

/** Canonical semantics for upgrade-card and tactical-status presentation. */
export const STAT_PRESENTATION: Readonly<Record<string, StatPresentationMetadata>> = {
  'tank.maxIntegrity': { label: 'MAX INTEGRITY', unit: 'combatHp', group: 'CREW' },
  'tank.accel': { label: 'ACCELERATION', unit: 'plain', group: 'DRIVER' },
  'tank.airControl': { label: 'AIR CONTROL', unit: 'plain', group: 'DRIVER' },
  'tank.dashCooldown': { label: 'DASH COOLDOWN', unit: 'seconds', group: 'DRIVER', lowerIsBetterLabel: 'FASTER' },
  'tank.dashContactDamage': { label: 'DASH DAMAGE', unit: 'combatDamage', group: 'DRIVER' },
  'tank.dashImpulse': { label: 'DASH IMPULSE', unit: 'plain', group: 'DRIVER' },
  'tank.steerHigh': { label: 'STEERING', unit: 'plain', group: 'DRIVER' },
  'tank.normalGrip': { label: 'TRACK GRIP', unit: 'plain', group: 'DRIVER' },
  'tank.forwardSpeed': { label: 'TOP SPEED', unit: 'speed', group: 'DRIVER' },
  'tank.gravity': { label: 'GRAVITY', unit: 'plain', group: 'DRIVER' },
  'tank.jumpHeight': { label: 'JUMP HEIGHT', unit: 'meters', group: 'DRIVER' },
  'match.cannonCooldown': { label: 'CANNON COOLDOWN', unit: 'seconds', group: 'GUNNER', lowerIsBetterLabel: 'FASTER' },
  'weapon.cannonDamage': { label: 'CANNON DAMAGE', unit: 'combatDamage', group: 'GUNNER' },
  'weapon.splashKnockbackMax': { label: 'MAX KNOCKBACK', unit: 'plain', group: 'GUNNER' },
  'weapon.splashKnockbackMin': { label: 'MIN KNOCKBACK', unit: 'plain', group: 'GUNNER' },
  'weapon.splashKnockbackVertical': { label: 'LIFT KNOCKBACK', unit: 'plain', group: 'GUNNER' },
  'weapon.cannonRadius': { label: 'SPLASH RADIUS', unit: 'meters', group: 'GUNNER' },
  'weapon.cannonRecoilImpulse': { label: 'CANNON RECOIL', unit: 'plain', group: 'GUNNER' },
  'weapon.mgDamage': { label: 'MG DAMAGE', unit: 'combatDamage', group: 'GUNNER' },
  'weapon.mgRange': { label: 'MG RANGE', unit: 'meters', group: 'GUNNER' },
  'weapon.mgSpread': { label: 'MG PRECISION', unit: 'plain', group: 'GUNNER', lowerIsBetterLabel: 'TIGHTER' },
};

export function statPresentationMetadata(statId: string): StatPresentationMetadata {
  return STAT_PRESENTATION[statId] ?? {
    label: humanizeStatId(statId),
    unit: 'plain',
    group: fallbackGroup(statId),
  };
}

export function formatStatAdditive(statId: string, value: number): string {
  const metadata = statPresentationMetadata(statId);
  const magnitude = metadata.unit === 'combatDamage' || metadata.unit === 'combatHp'
    ? formatCombatDisplayValue(Math.abs(value))
    : formatPlainNumber(Math.abs(value));
  return `${value >= 0 ? '+' : '−'}${magnitude}`;
}

export function formatStatMultiplier(value: number): string {
  return `×${formatPlainNumber(value)}`;
}

export function formatUpgradeEffectValue(effect: { statId: string; operation: 'add' | 'multiply'; value: number }): string {
  if (effect.operation === 'add') return formatStatAdditive(effect.statId, effect.value);
  const percentage = Math.round((effect.value - 1) * 100);
  return `${percentage >= 0 ? '+' : '−'}${Math.abs(percentage)}%`;
}

export function formatUpgradeEffect(effect: { statId: string; operation: 'add' | 'multiply'; value: number }): string {
  const metadata = statPresentationMetadata(effect.statId);
  return `${metadata.label}\n${formatUpgradeEffectValue(effect)}`;
}

function formatPlainNumber(value: number): string {
  return Number(value.toFixed(2)).toLocaleString('en-US');
}

function humanizeStatId(statId: string): string {
  const leaf = statId.split('.').at(-1) ?? statId;
  return leaf.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toUpperCase();
}

function fallbackGroup(statId: string): StatPresentationGroup {
  if (statId.startsWith('progression.')) return 'CREW';
  if (statId.startsWith('weapon.') || statId.startsWith('match.')) return 'GUNNER';
  return 'DRIVER';
}
