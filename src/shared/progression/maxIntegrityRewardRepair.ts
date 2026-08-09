import type { TankState } from '../types';

export interface MaxIntegrityRewardRepairResult {
  maxBefore: number;
  maxAfter: number;
  gained: number;
  repaired: number;
}

/**
 * Complete one authoritative max-integrity reward transaction.
 *
 * A live tank gains exactly the newly-created capacity. Re-evaluation with
 * the same max values is therefore inert, while a max decrease only clamps
 * current integrity. Reward growth never doubles as a revive.
 */
export function repairForMaxIntegrityGain(
  tank: Pick<TankState, 'integrity' | 'deadT'>,
  maxBefore: number,
  maxAfter: number,
): MaxIntegrityRewardRepairResult {
  const gained = Math.max(0, maxAfter - maxBefore);
  const integrityBefore = tank.integrity;

  if (maxAfter < maxBefore) {
    tank.integrity = Math.min(tank.integrity, maxAfter);
  } else if (gained > 0 && tank.deadT <= 0) {
    tank.integrity = Math.min(maxAfter, tank.integrity + gained);
  }

  return {
    maxBefore,
    maxAfter,
    gained,
    repaired: Math.max(0, tank.integrity - integrityBefore),
  };
}
