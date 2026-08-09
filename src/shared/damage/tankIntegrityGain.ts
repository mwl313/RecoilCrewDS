import { pushEvent, type SystemContext } from '../sim/systems/systemContext';

export type TankIntegrityGainReason =
  | 'maxIntegrityReward'
  | 'cannonKillRepair'
  | 'waveClearRepair'
  | 'revive'
  | 'directRepair';

export interface TankIntegrityGainResult {
  requested: number;
  actual: number;
}

/**
 * The single authoritative current-integrity mutation seam.
 *
 * Ordinary repair cannot revive a zero-integrity tank. The explicit revive
 * effect opts in, while every successful mutation emits its clamped delta.
 */
export function applyTankIntegrityGain(
  ctx: SystemContext,
  requestedAmount: number,
  reason: TankIntegrityGainReason,
  options: { allowRevive?: boolean } = {},
): TankIntegrityGainResult {
  const requested = Math.max(0, Number.isFinite(requestedAmount) ? requestedAmount : 0);
  const tank = ctx.state.tank;
  if (requested <= 0 || (tank.integrity <= 0 && options.allowRevive !== true)) {
    return { requested, actual: 0 };
  }

  const before = tank.integrity;
  const maxIntegrity = Math.max(0, ctx.rules.resolver.resolve('tank.maxIntegrity'));
  tank.integrity = Math.min(maxIntegrity, before + requested);
  const actual = Math.max(0, tank.integrity - before);
  if (actual > 0) {
    pushEvent(ctx, 'tankIntegrityGain', tank.x, tank.y + 2.25, tank.z, {
      value: actual,
      kind: reason,
      deferUntilPlaying: ctx.state.matchFlow !== 'playing',
    });
  }
  return { requested, actual };
}
