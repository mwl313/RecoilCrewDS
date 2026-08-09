import type { EnemyState } from '../types';

export type PopulationClass = 'ambient' | 'wave' | 'boss' | 'special';

/**
 * Focused ownership block attached to enemies (Core Loop 06 M2). Purge
 * removes only the matching cohort; ambient monsters are never purged.
 */
export interface SpawnOwnership {
  populationClass: PopulationClass;
  waveId: number | null;
  leaderId: number | null;
  packInstanceId: number;
  spawnAnchorId: number | null;
  purgeOnLeaderDeath: boolean;
  /** Authored pack-entry formation role (line/support/vanguard/...). */
  formationRole?: string;
  /** Replicated presentation priority: 0 none, 1 elite, 2 boss. */
  priority?: 0 | 1 | 2;
  /** Persistent leader that owns a renewable maintenance minion. */
  summonedByLeaderId?: number;
  /** Renewable anti-kite pressure, purged with its owning leader. */
  maintenanceSummon?: boolean;
  /** Central kill/progression routing must award nothing for this entity. */
  rewardSuppressed?: boolean;
  /** Recovery hint changes pursuit routing only; it never changes speed. */
  pursuitPriority?: 0 | 1 | 2;
}

export function isWaveOwned(ownership: SpawnOwnership | undefined, waveId: number | null): boolean {
  return (
    ownership !== undefined &&
    ownership.purgeOnLeaderDeath === true &&
    (ownership.waveId === waveId || (waveId === null && ownership.waveId !== null))
  );
}

/** Remove enemies matching the predicate directly (no kill hooks/rewards). */
export function purgeEnemies(
  enemies: EnemyState[],
  predicate: (e: EnemyState) => boolean,
): EnemyState[] {
  const removed: EnemyState[] = [];
  const keep: EnemyState[] = [];
  for (const e of enemies) {
    if (predicate(e)) removed.push(e);
    else keep.push(e);
  }
  enemies.length = 0;
  enemies.push(...keep);
  return removed;
}
