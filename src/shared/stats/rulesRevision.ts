import type { GameConfig } from '../config';
import type { MatchConfig } from '../types';
import type { TankRigDefinition } from '../content/schemas/tank';

/** Typed tank-rig delivery block (gameplay04 M4). */
export interface TankRigRulesBlock {
  revision: number;
  tankId: string;
  rig: TankRigDefinition;
}

/**
 * Compact resolved movement block replicated to clients (REFACTOR_02 §13).
 * The Driver predictor applies this before simulating subsequent inputs so
 * local prediction and authority use the same movement-critical values.
 */
export interface MovementRulesBlock {
  tank: GameConfig['tank'];
  match: Pick<MatchConfig, 'timeScale' | 'grip' | 'gravity'>;
  /** Turret tracking mode + rates (gunner prediction must mirror authority). */
  turret: {
    responseMode: 'instant' | 'rateLimited';
    turnRate: number;
    pitchFollowRate: number;
    minPitch: number;
    maxPitch: number;
  };
  /**
   * Weapon constants for presentation (HUD denominators). Optional so older
   * fixtures/rooms without the block keep BASE_CONFIG fallbacks; the server
   * always sends it with snapshots after a movement-rules revision.
   */
  weapon?: { cannonCooldown: number; chargeTapMaxSeconds?: number; chargeFullSeconds?: number };
  /** Resolved tank rig geometry; the server always sends it with the block. */
  tankRig?: TankRigRulesBlock;
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
