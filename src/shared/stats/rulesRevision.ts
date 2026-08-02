import type { GameConfig } from '../config';
import type { MatchConfig } from '../types';

/**
 * Compact resolved movement block replicated to clients (REFACTOR_02 §13).
 * The Driver predictor applies this before simulating subsequent inputs so
 * local prediction and authority use the same movement-critical values.
 */
export interface MovementRulesBlock {
  tank: GameConfig['tank'];
  match: Pick<MatchConfig, 'timeScale' | 'grip' | 'boostGrip' | 'gravity'>;
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
