import type { GameConfig } from '../config';
import type { MatchConfig } from '../types';

/**
 * Compact resolved movement block replicated to clients (REFACTOR_02 §13).
 * The Driver predictor applies this before simulating subsequent inputs so
 * local prediction and authority use the same movement-critical values.
 */
export interface MovementRulesBlock {
  tank: GameConfig['tank'];
  match: Pick<MatchConfig, 'timeScale' | 'grip' | 'gravity'>;
  /** Turret tracking rates (gunner prediction must mirror authority). */
  turret: { turnRate: number; pitchFollowRate: number; minPitch: number; maxPitch: number };
  /**
   * Weapon constants for presentation (HUD denominators). Optional so older
   * fixtures/rooms without the block keep BASE_CONFIG fallbacks; the server
   * always sends it with snapshots after a movement-rules revision.
   */
  weapon?: { cannonCooldown: number; jackpotChargeTime: number };
}

/** Reliable metadata attached to snapshots/events (REFACTOR_02 §13). */
export interface RulesRevisionSnapshot {
  packId: string;
  packVersion: string;
  contentHash: string;
  modeId: string;
  rulesRevision: number;
  movementRulesRevision: number;
}
