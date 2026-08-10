import type { StatResolver } from '../stats/statResolver';
import { BASE_MULTIPLIER_CAPS } from '../stats/statCaps';

export const MACHINE_GUN_DAMAGE_CAP_MULTIPLIER = BASE_MULTIPLIER_CAPS['weapon.mgDamage'];
export const MACHINE_GUN_RANGE_CAP_MULTIPLIER = BASE_MULTIPLIER_CAPS['weapon.mgRange'];
export const MACHINE_GUN_RATE_CAP_MULTIPLIER = BASE_MULTIPLIER_CAPS['weapon.mgRate'];

/**
 * Canonical authoritative cadence. `weapon.mgRate` is rounds per second.
 * Level-up/relic modifiers resolve first, the mode multiplier composes next,
 * and the final result is bounded to 2.25x the authored base rate.
 */
export function resolveMachineGunRoundsPerSecond(resolver: StatResolver): number {
  const baseRate = resolver.getBase('weapon.mgRate');
  const weaponRate = resolver.resolve('weapon.mgRate');
  const modeMultiplier = resolver.resolve('match.mgRate');
  return Math.min(baseRate * MACHINE_GUN_RATE_CAP_MULTIPLIER, weaponRate * modeMultiplier);
}

export function machineGunShotInterval(roundsPerSecond: number): number {
  return 1 / Math.max(Number.EPSILON, roundsPerSecond);
}
