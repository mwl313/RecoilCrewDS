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
};
