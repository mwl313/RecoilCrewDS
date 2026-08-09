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

/** Stateful encounter entities are never eligible for pressure abstraction. */
export function isPersistentThreat(enemy: EnemyState): boolean {
  const cls = normalizedEnemyClass(enemy);
  const ownership = enemy.ownership;
  return (
    cls === 'elite' ||
    cls === 'boss' ||
    ownership?.populationClass === 'boss' ||
    ownership?.populationClass === 'special' ||
    ownership?.leaderId === enemy.id ||
    ownership?.priority === 1 ||
    ownership?.priority === 2
  );
}

/** Disposable survivor-style population; identity and HP may be abstracted. */
export function isOrdinaryPressure(enemy: EnemyState): boolean {
  return enemy.alive && !isPersistentThreat(enemy);
}
