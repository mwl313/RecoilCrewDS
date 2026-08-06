import { describe, expect, it } from 'vitest';
import { StageDirector } from '../../src/shared/stage/stageDirector';
import { FarmingClock } from '../../src/shared/stage/farmingClock';
import { GameplayEventBus } from '../../src/shared/core/gameplayEventBus';
import type { StageEvent } from '../../src/shared/stage/stageTypes';
import type { StageSequenceConfig } from '../../src/shared/stage/stageTypes';

const DT = 1 / 30;

function makeStage(): { stage: StageDirector; events: StageEvent[]; flush: () => void } {
  const bus = new GameplayEventBus();
  const events: StageEvent[] = [];
  bus.subscribe('stageEvent', (e) => events.push(e as StageEvent));
  const stage = new StageDirector(undefined, bus);
  stage.start();
  bus.drain();
  return { stage, events, flush: () => bus.drain() };
}

function step(stage: StageDirector, seconds: number, flush: () => void): void {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) stage.step({ dt: DT, tankDead: false });
  flush();
}

function killLeader(stage: StageDirector, flush: () => void): void {
  stage.notifyLeaderKilled();
  flush();
}

const PRODUCTION_SEQUENCE: StageSequenceConfig = {
  farmingCountdownSeconds: 180,
  triggers: [
    { atRemainingSeconds: 120, waveId: 'wave.production.wave1' },
    { atRemainingSeconds: 60, waveId: 'wave.production.wave2' },
  ],
  bossAtRemainingSeconds: 0,
  pauseCountdownDuringWave: false,
};

function makeProductionStage(): { stage: StageDirector; events: StageEvent[]; flush: () => void } {
  const bus = new GameplayEventBus();
  const events: StageEvent[] = [];
  bus.subscribe('stageEvent', (e) => events.push(e as StageEvent));
  const stage = new StageDirector(PRODUCTION_SEQUENCE, bus);
  stage.start();
  bus.drain();
  return { stage, events, flush: () => bus.drain() };
}

describe('FarmingClock', () => {
  it('advances only while running and pauses/resumes', () => {
    const c = new FarmingClock(180);
    c.advance(10);
    expect(c.remaining).toBe(170);
    c.pause();
    c.advance(50);
    expect(c.remaining).toBe(170);
    c.resume();
    c.advance(10);
    expect(c.remaining).toBe(160);
  });
});

describe('StageDirector production sequence (non-pausing countdown)', () => {
  it('keeps the farming clock running through wave1 and opens wave2 at 60 remaining', () => {
    const { stage, flush } = makeProductionStage();
    step(stage, 60 + DT, flush);
    expect(stage.state.phase).toBe('wave1');
    expect(stage.state.activeWaveId).toBe(1);
    expect(stage.state.farmingTimeRemaining).toBeLessThanOrEqual(120);
    expect(stage.state.farmingTimeRemaining).toBeGreaterThan(119.9);
    // Countdown keeps running while the wave is active (no pause).
    step(stage, 30, flush);
    expect(stage.state.phase).toBe('wave1');
    expect(stage.state.farmingTimeRemaining).toBeLessThan(90);
    expect(stage.state.farmingTimeRemaining).toBeGreaterThan(89.9);
    killLeader(stage, flush);
    expect(stage.state.phase).toBe('farming2');
    // The countdown never paused, so wave2 still opens when it crosses the
    // 60-second threshold (sim time ~120), not after the wave clears.
    step(stage, 30 + DT, flush);
    expect(stage.state.phase).toBe('wave2');
    expect(stage.state.activeWaveId).toBe(2);
    expect(stage.state.farmingTimeRemaining).toBeLessThanOrEqual(60);
  });

  it('reaches the boss wave at 180 sim seconds and stays at zero', () => {
    const { stage, events, flush } = makeProductionStage();
    step(stage, 60 + DT, flush);
    killLeader(stage, flush);
    step(stage, 60 + DT, flush);
    killLeader(stage, flush);
    expect(stage.state.phase).toBe('farming3');
    step(stage, 60, flush);
    expect(stage.state.phase).toBe('bossWave');
    expect(stage.state.farmingTimeRemaining).toBeCloseTo(0, 5);
    expect(events.some((e) => e.type === 'bossStarted')).toBe(true);
    step(stage, 20, flush);
    expect(stage.state.farmingTimeRemaining).toBeCloseTo(0, 5);
  });
});

describe('StageDirector core loop', () => {
  it('starts at 180 farming seconds in farming1', () => {
    const { stage } = makeStage();
    expect(stage.state.phase).toBe('farming1');
    expect(stage.state.farmingTimeRemaining).toBeCloseTo(180, 6);
    expect(stage.state.totalElapsedTime).toBe(0);
    expect(stage.state.activeWaveId).toBeNull();
  });

  it('crosses exactly at 120 remaining into wave1 and pauses the countdown', () => {
    const { stage, events, flush } = makeStage();
    step(stage, 60, flush);
    expect(stage.state.farmingTimeRemaining).toBeCloseTo(120, 6);
    expect(stage.state.phase).toBe('farming1');
    step(stage, DT, flush);
    expect(stage.state.phase).toBe('wave1');
    expect(stage.state.activeWaveId).toBe(1);
    expect(events.some((e) => e.type === 'waveRequested')).toBe(true);
    expect(events.some((e) => e.type === 'waveStarted')).toBe(true);
    // Countdown paused: keep stepping, remaining stays at 120.
    step(stage, 30, flush);
    expect(stage.state.farmingTimeRemaining).toBeCloseTo(120, 6);
    expect(stage.state.phase).toBe('wave1');
    // One-shot: continuing does not re-trigger.
    expect(events.filter((e) => e.type === 'waveStarted').length).toBe(1);
  });

  it('wave1 leader death resumes at 120 and wave2 triggers at 60', () => {
    const { stage, events, flush } = makeStage();
    step(stage, 60 + DT, flush);
    killLeader(stage, flush);
    expect(stage.state.phase).toBe('farming2');
    expect(stage.state.farmingTimeRemaining).toBeCloseTo(120, 6);
    expect(events.some((e) => e.type === 'waveLeaderKilled')).toBe(true);
    expect(events.some((e) => e.type === 'waveCleared')).toBe(true);
    step(stage, 60, flush);
    expect(stage.state.farmingTimeRemaining).toBeCloseTo(60, 6);
    expect(stage.state.phase).toBe('farming2');
    step(stage, DT, flush);
    expect(stage.state.phase).toBe('wave2');
    expect(stage.state.activeWaveId).toBe(2);
  });

  it('wave2 leader death resumes at 60, then boss triggers at 0', () => {
    const { stage, events, flush } = makeStage();
    step(stage, 60 + DT, flush);
    killLeader(stage, flush);
    step(stage, 60 + DT, flush);
    expect(stage.state.phase).toBe('wave2');
    killLeader(stage, flush);
    expect(stage.state.phase).toBe('farming3');
    expect(stage.state.farmingTimeRemaining).toBeCloseTo(60, 6);
    step(stage, 60, flush);
    expect(stage.state.phase).toBe('farming3');
    step(stage, DT, flush);
    expect(stage.state.phase).toBe('bossWave');
    expect(stage.state.activeWaveId).toBe(3);
    expect(events.some((e) => e.type === 'bossStarted')).toBe(true);
    // Countdown stays at zero while the boss is active.
    step(stage, 20, flush);
    expect(stage.state.farmingTimeRemaining).toBeCloseTo(0, 6);
  });

  it('boss death clears the stage exactly once', () => {
    const { stage, events, flush } = makeStage();
    step(stage, 60 + DT, flush);
    killLeader(stage, flush);
    step(stage, 60 + DT, flush);
    killLeader(stage, flush);
    step(stage, 60 + DT, flush);
    killLeader(stage, flush);
    expect(stage.state.phase).toBe('clear');
    expect(events.some((e) => e.type === 'stageCleared')).toBe(true);
    const cleared = events.filter((e) => e.type === 'stageCleared').length;
    step(stage, 30, flush);
    killLeader(stage, flush);
    expect(stage.state.phase).toBe('clear');
    expect(events.filter((e) => e.type === 'stageCleared').length).toBe(cleared);
  });

  it('tank death causes immediate game over from any phase', () => {
    for (const targetPhase of ['farming1', 'wave1', 'farming3', 'bossWave'] as const) {
      const { stage, events, flush } = makeStage();
      if (targetPhase === 'wave1') step(stage, 60 + DT, flush);
      if (targetPhase === 'farming3') {
        step(stage, 60 + DT, flush);
        killLeader(stage, flush);
        step(stage, 60 + DT, flush);
        killLeader(stage, flush);
      }
      if (targetPhase === 'bossWave') {
        step(stage, 60 + DT, flush);
        killLeader(stage, flush);
        step(stage, 60 + DT, flush);
        killLeader(stage, flush);
        step(stage, 60 + DT, flush);
      }
      stage.step({ dt: DT, tankDead: true });
      flush();
      expect(stage.state.phase, targetPhase).toBe('gameOver');
      expect(events.some((e) => e.type === 'gameOver')).toBe(true);
      // One-shot.
      stage.step({ dt: DT, tankDead: true });
      expect(stage.state.phase).toBe('gameOver');
    }
  });

  it('total elapsed time is independent of the paused countdown', () => {
    const { stage, flush } = makeStage();
    step(stage, 60, flush);
    const elapsedAtWave = stage.state.totalElapsedTime;
    step(stage, 60 + DT, flush); // wave1
    step(stage, 30, flush); // paused countdown, elapsed still advances
    expect(stage.state.totalElapsedTime).toBeGreaterThan(elapsedAtWave + 30);
    expect(stage.state.farmingTimeRemaining).toBeCloseTo(120, 6);
  });

  it('phase sequence increments on every transition', () => {
    const { stage, flush } = makeStage();
    const seq0 = stage.state.phaseSequence;
    step(stage, 60 + DT, flush);
    expect(stage.state.phaseSequence).toBe(seq0 + 1);
    killLeader(stage, flush);
    expect(stage.state.phaseSequence).toBe(seq0 + 2);
  });
});
