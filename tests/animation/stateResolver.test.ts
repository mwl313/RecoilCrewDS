import { describe, expect, it } from 'vitest';
import { resolveEnemyAnimationState } from '../../src/client/animation/enemyAnimationStateResolver';
import type { EnemyAnimationProfileDefinition } from '../../src/shared/animation/animationProfileTypes';
import type { EnemyActionCue } from '../../src/shared/animation/enemyActionCue';

const PROFILE: EnemyAnimationProfileDefinition = {
  id: 'enemyAnimation.test',
  label: 'Test',
  clips: {},
  fallbacks: {},
  stateMap: {
    hunt: 'walk',
    charge: 'charge',
    phaseTransition: 'phaseTransition',
    'enemy.attack.primary': 'attackPrimary',
    'enemy.cast.release': 'castRelease',
  },
  locomotion: {
    idleSpeedMax: 0.2,
    walkSpeedMax: 3.5,
    walkSpeedReference: 3,
    runSpeedReference: 6,
    playbackMin: 0.5,
    playbackMax: 1.5,
    randomStartPhase: false,
  },
  transitions: {
    defaultCrossFadeSeconds: 0.2,
    locomotionCrossFadeSeconds: 0.25,
    attackCrossFadeSeconds: 0.1,
    hitCrossFadeSeconds: 0.08,
    deathCrossFadeSeconds: 0.3,
  },
  rootMotion: false,
};

const cue = (actionId: string): EnemyActionCue => ({
  sequence: 1,
  actionId,
  startedAtTick: 0,
  durationTicks: 30,
});

describe('enemy animation state resolver (animation07 M6)', () => {
  it('death has the highest priority', () => {
    expect(resolveEnemyAnimationState(PROFILE, { alive: false, state: 'hunt', stateT: 0, speed: 9, telegraph: 1, flash: 1, airborne: true, cue: cue('enemy.attack.primary'), currentTick: 1 }).role).toBe('death');
  });

  it('authoritative action cues win over inference', () => {
    const r = resolveEnemyAnimationState(PROFILE, { alive: true, state: 'hunt', stateT: 0, speed: 9, telegraph: 1, flash: 0, airborne: false, cue: cue('enemy.cast.release'), currentTick: 5 });
    expect(r.role).toBe('castRelease');
    expect(r.reason).toContain('action cue');
  });

  it('semantic monster cues map to Idle/Walk/Attack/Death roles', () => {
    expect(resolveEnemyAnimationState(PROFILE, { alive: true, state: 'hunt', stateT: 0, speed: 0, telegraph: 0, flash: 0, airborne: false, cue: cue('enemy.semantic.idle') }).role).toBe('idle');
    expect(resolveEnemyAnimationState(PROFILE, { alive: true, state: 'hunt', stateT: 0, speed: 2, telegraph: 0, flash: 0, airborne: false, cue: cue('enemy.semantic.walk') }).role).toBe('walk');
    expect(resolveEnemyAnimationState(PROFILE, { alive: true, state: 'hunt', stateT: 0, speed: 9, telegraph: 0, flash: 0, airborne: false, cue: cue('enemy.semantic.walk') }).role).toBe('run');
    expect(resolveEnemyAnimationState(PROFILE, { alive: true, state: 'hunt', stateT: 0, speed: 0, telegraph: 0, flash: 0, airborne: false, cue: cue('enemy.semantic.attack') }).role).toBe('attackPrimary');
    expect(resolveEnemyAnimationState(PROFILE, { alive: false, state: 'dead', stateT: 0, speed: 0, telegraph: 0, flash: 0, airborne: false, cue: cue('enemy.semantic.death') }).role).toBe('death');
  });

  it('a finished cue falls through to normal inference', () => {
    const r = resolveEnemyAnimationState(PROFILE, { alive: true, state: 'hunt', stateT: 0, speed: 1, telegraph: 0, flash: 0, airborne: false, cue: cue('enemy.attack.primary'), currentTick: 60 });
    expect(r.role).toBe('walk');
  });

  it('knockback/airborne outranks stagger/hit inference', () => {
    const r = resolveEnemyAnimationState(PROFILE, { alive: true, state: 'stagger', stateT: 0, speed: 0, telegraph: 0, flash: 1, airborne: true });
    expect(r.role).toBe('knockback');
  });

  it('stagger and hit reactions map before stateMap locomotion', () => {
    expect(resolveEnemyAnimationState(PROFILE, { alive: true, state: 'stagger', stateT: 0, speed: 0, telegraph: 0, flash: 0, airborne: false }).role).toBe('stagger');
    expect(resolveEnemyAnimationState(PROFILE, { alive: true, state: 'hunt', stateT: 0, speed: 0, telegraph: 0, flash: 1, airborne: false }).role).toBe('hit');
  });

  it('explicit stateMap entries resolve to content roles', () => {
    expect(resolveEnemyAnimationState(PROFILE, { alive: true, state: 'charge', stateT: 0, speed: 8, telegraph: 1, flash: 0, airborne: false }).role).toBe('charge');
    expect(resolveEnemyAnimationState(PROFILE, { alive: true, state: 'phaseTransition', stateT: 0, speed: 0, telegraph: 0, flash: 0, airborne: false }).role).toBe('phaseTransition');
  });

  it('telegraphing selects an attack role', () => {
    const r = resolveEnemyAnimationState(PROFILE, { alive: true, state: 'waiting', stateT: 0, speed: 0, telegraph: 1, flash: 0, airborne: false });
    expect(r.role).toBe('attackPrimary');
  });

  it('run/walk/idle thresholds use profile locomotion', () => {
    expect(resolveEnemyAnimationState(PROFILE, { alive: true, state: 'x', stateT: 0, speed: 5, telegraph: 0, flash: 0, airborne: false }).role).toBe('run');
    expect(resolveEnemyAnimationState(PROFILE, { alive: true, state: 'x', stateT: 0, speed: 1.5, telegraph: 0, flash: 0, airborne: false }).role).toBe('walk');
    expect(resolveEnemyAnimationState(PROFILE, { alive: true, state: 'x', stateT: 0, speed: 0, telegraph: 0, flash: 0, airborne: false }).role).toBe('idle');
  });
});
