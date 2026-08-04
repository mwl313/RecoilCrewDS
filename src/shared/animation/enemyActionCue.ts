/**
 * Compact authoritative action cue. Replicated only when inference from
 * existing state is insufficient. A cue never applies damage — gameplay owns
 * the hit; clients only choose presentation.
 */
export interface EnemyActionCue {
  /** Monotonic per-enemy sequence; duplicates/late repeats are ignored. */
  sequence: number;
  /** Semantic action id (e.g. enemy.attack.primary), mapped via content. */
  actionId: string;
  /** Authoritative tick/time when the action started. */
  startedAtTick: number;
  /** Duration in ticks; clients align elapsed presentation to authority. */
  durationTicks: number;
}

export const ENEMY_ACTION_CUE_PREFIX = /^enemy\./;

export function isValidActionCueId(id: string): boolean {
  return ENEMY_ACTION_CUE_PREFIX.test(id);
}

/**
 * True when `next` is a new cue for the client (either no previous cue or a
 * strictly newer sequence). Duplicate sequences are ignored.
 */
export function isNewActionCue(previous: EnemyActionCue | undefined, next: EnemyActionCue | undefined): boolean {
  if (!next) return false;
  if (!previous) return true;
  return next.sequence > previous.sequence;
}

/**
 * Align a late cue to authoritative elapsed time. Returns the elapsed
 * fraction [0..1] of the action at `currentTick`, clamped for reconnect
 * reconstruction of long attacks/boss transitions.
 */
export function actionCueElapsedFraction(cue: EnemyActionCue, currentTick: number): number {
  const durationTicks = Math.max(1, cue.durationTicks);
  return Math.max(0, Math.min(1, (currentTick - cue.startedAtTick) / durationTicks));
}
