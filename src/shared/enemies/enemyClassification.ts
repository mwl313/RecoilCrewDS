import type { EnemyState } from '../types';

export type NormalizedEnemyClass = 'ambient' | 'wave' | 'elite' | 'boss';

/** Shared combat/reward classification. Modern monster metadata is authoritative. */
export function normalizedEnemyClass(enemy: EnemyState): NormalizedEnemyClass {
  const modern = enemy.monster?.rewardClass;
  if (modern) return modern;
  const legacy = enemy.ownership?.populationClass;
  if (legacy === 'special') return 'elite';
  if (legacy === 'wave' || legacy === 'boss' || legacy === 'ambient') return legacy;
  return 'ambient';
}

export function isWaveLeader(enemy: EnemyState): boolean {
  return enemy.ownership?.populationClass === 'wave' && enemy.ownership.leaderId === enemy.id;
}
