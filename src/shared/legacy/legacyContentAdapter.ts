import type { EnemyType, ModifierId } from '../types';

/**
 * Content-id ↔ legacy-enum adapters. These are the seam Phase 3+ will use
 * when the sim consumes content ids directly; for now they only translate.
 */
export function legacyEnemyTypeFromContentId(id: string): EnemyType {
  const type = id.replace(/^enemy\./, '');
  if (type === 'scrapBug' || type === 'rammer' || type === 'gunTower' || type === 'lootTruck') {
    return type;
  }
  throw new Error(`unknown enemy content id: ${id}`);
}

export function contentEnemyIdFromType(type: EnemyType): string {
  return `enemy.${type}`;
}

export function legacyWeaponKindFromContentId(id: string): 'mg' | 'cannon' | 'jackpot' {
  const kind = id.replace(/^weapon\./, '');
  if (kind === 'machineGun') return 'mg';
  if (kind === 'mainCannon') return 'cannon';
  if (kind === 'jackpotShell') return 'jackpot';
  throw new Error(`unknown weapon content id: ${id}`);
}

export function legacyModifierIdFromDifficultyId(id: string): ModifierId {
  return id.replace(/^difficulty\./, '') as ModifierId;
}

export function difficultyIdFromModifierId(modifier: ModifierId): string {
  return `difficulty.${modifier}`;
}
