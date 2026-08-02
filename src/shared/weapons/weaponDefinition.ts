import type { WeaponDefinition } from '../content/schemas/weapon';
import type { StatBlock } from '../stats/statBlock';

export type { WeaponDefinition };

/** Resolve a weapon stat from its frozen statBlock with a legacy fallback. */
export function weaponStat(weapon: WeaponDefinition, stat: string, fallback: number): number {
  const value = weapon.statBlock[stat];
  return value === undefined ? fallback : value;
}

/** Merge statBlocks (used by tests to build variant weapons). */
export function mergeStatBlocks(...blocks: StatBlock[]): StatBlock {
  return Object.assign({}, ...blocks);
}
