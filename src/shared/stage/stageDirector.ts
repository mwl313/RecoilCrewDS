import type { GameplayEventBus } from '../core/gameplayEventBus';
import { FarmingClock } from './farmingClock';
import {
  DEFAULT_STAGE_SEQUENCE,
  type StageEvent,
  type StagePhase,
  type StageRuntimeState,
  type StageSequenceConfig,
  type StageStepInput,
} from './stageTypes';

/**
 * StageDirector owns the core-loop state machine:
 *
 *   farming1 → wave1 → farming2 → wave2 → farming3 → bossWave → clear
 *   tank death in any phase → gameOver
 *
 * It never spawns monsters. Wave triggers are driven by remaining farming
 * time, never by total elapsed match time. Transitions are one-shot.
 */
export class StageDirector {
  readonly state: StageRuntimeState;
  private readonly clock: FarmingClock;
  private started = false;

  constructor(
    private readonly config: StageSequenceConfig = DEFAULT_STAGE_SEQUENCE,
    private readonly eventBus?: GameplayEventBus,
  ) {
    this.clock = new FarmingClock(config.farmingCountdownSeconds);
    this.state = {
      phase: 'farming1',
      farmingTimeRemaining: config.farmingCountdownSeconds,
      totalElapsedTime: 0,
      activeFarmingElapsed: 0,
      phaseActiveFarmingStartedAt: 0,
      bossIntroRemaining: 0,
      activeWaveId: null,
      activeLeaderId: null,
      phaseStartedAt: 0,
      phaseSequence: 0,
    };
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.emit('stageStarted');
  }

  step(input: StageStepInput): void {
    if (!this.started) this.start();
    this.state.totalElapsedTime += input.dt;
    if (input.tankDead) {
      this.toGameOver();
      return;
    }
    if (this.state.phase === 'clear' || this.state.phase === 'gameOver') return;

    const farming = this.state.phase.startsWith('farming');
    if (farming) {
      this.clock.advance(input.dt);
      this.state.farmingTimeRemaining = this.clock.remaining;
      this.state.activeFarmingElapsed += input.dt;
      const remaining = this.clock.remaining;
      if (this.state.phase === 'farming1') {
        const trigger = this.config.triggers[0];
        if (remaining <= trigger.atRemainingSeconds) this.beginWave('wave1', 1, trigger.atRemainingSeconds);
      } else if (this.state.phase === 'farming2') {
        const trigger = this.config.triggers[1];
        if (remaining <= trigger.atRemainingSeconds) this.beginWave('wave2', 2, trigger.atRemainingSeconds);
      } else if (this.state.phase === 'farming3' && remaining <= this.config.bossAtRemainingSeconds) {
        this.beginWave('bossWave', 3, this.config.bossAtRemainingSeconds);
      }
    } else if (this.state.phase === 'bossWave' && this.state.bossIntroRemaining > 0) {
      this.state.bossIntroRemaining = Math.max(0, this.state.bossIntroRemaining - input.dt);
      if (this.state.bossIntroRemaining <= 0) this.emit('bossActive');
    }
  }

  /** Wave leader died: resume farming or clear the stage (boss). */
  notifyLeaderKilled(): void {
    switch (this.state.phase) {
      case 'wave1':
        this.clock.resume();
        this.transition('farming2');
        this.emit('waveLeaderKilled');
        this.emit('waveCleared');
        break;
      case 'wave2':
        this.clock.resume();
        this.transition('farming3');
        this.emit('waveLeaderKilled');
        this.emit('waveCleared');
        break;
      case 'bossWave':
        this.transition('clear');
        this.emit('waveLeaderKilled');
        this.emit('waveCleared');
        this.emit('stageCleared');
        break;
      default:
        break;
    }
  }

  assignLeader(enemyId: number | null): void {
    this.state.activeLeaderId = enemyId;
  }

  private beginWave(phase: 'wave1' | 'wave2' | 'bossWave', waveId: number, resumeRemaining: number): void {
    // Demo pauses the countdown during a wave and resumes at the exact
    // trigger threshold (120/60/0) without accumulated fixed-step drift.
    // Production keeps the clock running, so the current remaining value is
    // preserved rather than snapped backwards.
    if (this.config.pauseCountdownDuringWave) {
      this.clock.remaining = resumeRemaining;
      this.state.farmingTimeRemaining = resumeRemaining;
      this.state.bossIntroRemaining =
        phase === 'bossWave' ? this.config.bossIntroSeconds : 0;
    }
    if (this.config.pauseCountdownDuringWave) this.clock.pause();
    this.transition(phase);
    this.state.activeWaveId = waveId;
    this.state.activeLeaderId = null;
    this.emit('waveRequested');
    this.emit(phase === 'bossWave' ? 'bossStarted' : 'waveStarted');
  }

  private toGameOver(): void {
    if (this.state.phase === 'gameOver' || this.state.phase === 'clear') return;
    this.clock.pause();
    this.transition('gameOver');
    this.emit('gameOver');
  }

  private transition(phase: StagePhase): void {
    this.state.phase = phase;
    this.state.phaseStartedAt = this.state.totalElapsedTime;
    if (phase.startsWith('farming')) {
      this.state.phaseActiveFarmingStartedAt = this.state.activeFarmingElapsed;
    }
    this.state.phaseSequence++;
    this.emit('phaseChanged');
  }

  private emit(type: StageEvent['type']): void {
    const event: StageEvent = {
      type,
      phase: this.state.phase,
      farmingTimeRemaining: this.clock.remaining,
      totalElapsedTime: this.state.totalElapsedTime,
      ...(this.state.activeWaveId !== null ? { waveId: this.state.activeWaveId } : {}),
    };
    this.eventBus?.emit('stageEvent', event);
  }
}
