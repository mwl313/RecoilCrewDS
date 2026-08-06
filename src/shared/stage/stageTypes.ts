/**
 * Core Loop 06 stage types. The stage director owns progression only; it
 * never spawns monsters. All values here are typed contracts that content
 * definitions will supply from Milestone 3 onward.
 */
export type StagePhase =
  | 'farming1'
  | 'wave1'
  | 'farming2'
  | 'wave2'
  | 'farming3'
  | 'bossWave'
  | 'clear'
  | 'gameOver';

export interface StageRuntimeState {
  phase: StagePhase;
  /** Remaining farming time before the next scripted threat escalation. */
  farmingTimeRemaining: number;
  /** Independent of the paused countdown; always advances with sim time. */
  totalElapsedTime: number;
  /** Farming time that actually counted down (excludes elite-wave pauses). */
  activeFarmingElapsed: number;
  /** activeFarmingElapsed when the current farming phase began. */
  phaseActiveFarmingStartedAt: number;
  /** Seconds remaining in the authoritative boss intro (0 outside bossWave). */
  bossIntroRemaining: number;
  activeWaveId: number | null;
  activeLeaderId: number | null;
  phaseStartedAt: number;
  phaseSequence: number;
}

export interface StageSequenceConfig {
  farmingCountdownSeconds: number;
  triggers: Array<{ atRemainingSeconds: number; waveId: string }>;
  bossAtRemainingSeconds: number;
  pauseCountdownDuringWave: boolean;
  /** Authoritative boss intro window; the boss wave simulates only after it. */
  bossIntroSeconds: number;
}

export interface StageStepInput {
  dt: number;
  tankDead: boolean;
}

export type StageEventType =
  | 'stageStarted'
  | 'phaseChanged'
  | 'waveRequested'
  | 'waveStarted'
  | 'waveLeaderKilled'
  | 'waveCleared'
  | 'bossStarted'
  | 'bossActive'
  | 'stageCleared'
  | 'gameOver';

export interface StageEvent {
  type: StageEventType;
  phase: StagePhase;
  farmingTimeRemaining: number;
  totalElapsedTime: number;
  waveId?: number;
}

export const DEFAULT_STAGE_SEQUENCE: StageSequenceConfig = {
  farmingCountdownSeconds: 180,
  triggers: [
    { atRemainingSeconds: 120, waveId: 'wave.1' },
    { atRemainingSeconds: 60, waveId: 'wave.2' },
  ],
  bossAtRemainingSeconds: 0,
  pauseCountdownDuringWave: true,
  bossIntroSeconds: 4,
};

/**
 * Active phase-local farming progress (0..1). Elite-wave time never counts
 * toward farming progress because activeFarmingElapsed pauses with the clock.
 */
export function phaseFarmingProgress(state: StageRuntimeState, durationSeconds: number): number {
  const elapsed = Math.max(0, state.activeFarmingElapsed - state.phaseActiveFarmingStartedAt);
  return Math.max(0, Math.min(1, elapsed / Math.max(0.001, durationSeconds)));
}
