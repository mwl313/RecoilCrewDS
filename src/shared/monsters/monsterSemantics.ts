export type EnemySemanticAction = 'Idle' | 'Walk' | 'Attack' | 'Death';

export interface EnemySemanticInput {
  alive: boolean;
  moving: boolean;
  attacking: boolean;
}

export interface EnemySemanticState {
  action: EnemySemanticAction;
  sequence: number;
}

export interface EnemySemanticScratch {
  semanticAction: EnemySemanticAction;
  semanticSequence: number;
  deathLocked: boolean;
}

export function createEnemySemanticScratch(): EnemySemanticScratch {
  return { semanticAction: 'Idle', semanticSequence: 0, deathLocked: false };
}

/**
 * Authoritative semantic state machine:
 * - Death lock: once dead, the action stays Death and never returns.
 * - Attack: while an authoritative attack cycle is active, keep one stable
 *   sequence; each new cycle increments it.
 * - Walk while moving, otherwise Idle.
 * Sequences only advance on action transitions (LOD-safe, replay-safe).
 */
export function updateEnemySemantics(
  state: EnemySemanticScratch,
  input: EnemySemanticInput,
): EnemySemanticState {
  if (!input.alive || state.deathLocked) {
    if (state.semanticAction !== 'Death') {
      state.semanticAction = 'Death';
      state.semanticSequence += 1;
    }
    state.deathLocked = true;
    return { action: state.semanticAction, sequence: state.semanticSequence };
  }
  const next: EnemySemanticAction = input.attacking ? 'Attack' : input.moving ? 'Walk' : 'Idle';
  if (next !== state.semanticAction) {
    state.semanticAction = next;
    state.semanticSequence += 1;
  }
  return { action: state.semanticAction, sequence: state.semanticSequence };
}
