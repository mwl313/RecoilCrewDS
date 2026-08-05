import { clamp } from '../math';

/**
 * Authoritative attack cycle + normalized cue. The gameplay cooldown is the
 * source of truth; presentation playback is fitted to it afterwards.
 */
export interface EnemyAttackRuntime {
  sequence: number;
  cycleStartTime: number;
  cycleDuration: number;
  cueNormalized: number;
  cueFired: boolean;
  active: boolean;
  patternId?: string;
}

export const DEFAULT_ATTACK_CUE_NORMALIZED = 0.55;

export function startAttackCycle(
  now: number,
  attacksPerSecond: number,
  cueNormalized: number | undefined,
  sequence: number,
  patternId?: string,
): EnemyAttackRuntime {
  return {
    sequence,
    cycleStartTime: now,
    cycleDuration: attacksPerSecond > 0 ? 1 / attacksPerSecond : 0,
    cueNormalized: cueNormalized ?? DEFAULT_ATTACK_CUE_NORMALIZED,
    cueFired: false,
    active: true,
    patternId,
  };
}

export type AttackCueResult = 'fired' | 'pending' | 'done';

/**
 * Advance one attack cycle. The cue fires exactly once; frame skips, LOD
 * swaps, or animation restarts cannot duplicate it.
 */
export function advanceAttackCycle(
  runtime: EnemyAttackRuntime,
  now: number,
  onCue: (runtime: EnemyAttackRuntime) => void,
): AttackCueResult {
  if (!runtime.active) return 'done';
  const eventTime = runtime.cycleStartTime + runtime.cycleDuration * runtime.cueNormalized;
  if (!runtime.cueFired && now >= eventTime) {
    runtime.cueFired = true;
    onCue(runtime);
    return 'fired';
  }
  if (now >= runtime.cycleStartTime + runtime.cycleDuration) {
    runtime.active = false;
    return 'done';
  }
  return 'pending';
}

/** Death lock: cancel any pending cue and stop the cycle. */
export function cancelAttackCycle(runtime: EnemyAttackRuntime): void {
  runtime.active = false;
  runtime.cueFired = true;
}

/**
 * Fit the source Attack clip to the authoritative cycle. The visual clamp
 * never changes gameplay timing.
 */
export function attackPlaybackSpeed(
  sourceAttackClipDuration: number,
  attacksPerSecond: number,
  minSpeed = 0.6,
  maxSpeed = 2.5,
): number {
  if (sourceAttackClipDuration <= 0 || attacksPerSecond <= 0) return 1;
  return clamp(sourceAttackClipDuration * attacksPerSecond, minSpeed, maxSpeed);
}
