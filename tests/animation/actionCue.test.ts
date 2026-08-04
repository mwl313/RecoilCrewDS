import { beforeEach, describe, expect, it } from 'vitest';
import { EnemyAnimationController } from '../../src/client/animation/enemyAnimationController';
import { resetAnimationTelemetry } from '../../src/client/animation/animationTelemetry';
import type { EnemyAnimationProfileDefinition } from '../../src/shared/animation/animationProfileTypes';
import { buildModelInstance } from '../../src/client/animation/animatedModelInstanceFactory';
import { buildProceduralSkinnedAsset } from './proceduralRig';

const PROFILE: EnemyAnimationProfileDefinition = {
  id: 'enemyAnimation.test',
  label: 'Test',
  clips: { idle: 'Walk', walk: 'Walk', attackPrimary: 'Attack', death: 'Death' },
  fallbacks: { walk: 'idle' },
  stateMap: {
    'enemy.attack.primary': 'attackPrimary',
    'enemy.phase.transition': 'death',
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
    defaultCrossFadeSeconds: 0.05,
    locomotionCrossFadeSeconds: 0.05,
    attackCrossFadeSeconds: 0.05,
    hitCrossFadeSeconds: 0.05,
    deathCrossFadeSeconds: 0.05,
  },
  playback: {
    attackPrimary: { loop: 'once', clampWhenFinished: true },
    death: { loop: 'once', clampWhenFinished: true, interruptPriority: 100 },
  },
  rootMotion: false,
};

function makeController(): EnemyAnimationController {
  const model = buildModelInstance(buildProceduralSkinnedAsset('test.cue'), { cloneMaterials: true });
  return EnemyAnimationController.create(PROFILE, model, 0.25);
}

describe('authoritative action cues (animation07 M8)', () => {
  beforeEach(() => resetAnimationTelemetry());

  it('a cue maps to a semantic role through content', () => {
    const c = makeController();
    c.update(
      {
        alive: true,
        state: 'hunt',
        stateT: 0,
        speed: 0,
        telegraph: 0,
        flash: 0,
        airborne: false,
        cue: { sequence: 1, actionId: 'enemy.attack.primary', startedAtTick: 0, durationTicks: 30 },
        currentTick: 1,
      },
      0.01,
    );
    expect(c.instance.currentRole).toBe('attackPrimary');
    c.dispose();
  });

  it('duplicate sequences are ignored after the first cue', () => {
    const c = makeController();
    const base = {
      alive: true,
      state: 'hunt',
      stateT: 0,
      speed: 0,
      telegraph: 0,
      flash: 0,
      airborne: false,
      currentTick: 1,
    };
    c.update({ ...base, cue: { sequence: 1, actionId: 'enemy.attack.primary', startedAtTick: 0, durationTicks: 30 } }, 0.01);
    c.update({ ...base, cue: { sequence: 1, actionId: 'enemy.attack.primary', startedAtTick: 0, durationTicks: 30 } }, 0.3);
    expect(c.instance.currentAction!.time).toBeGreaterThan(0.3);
    c.dispose();
  });

  it('a late cue aligns to authoritative elapsed time (reconnect reconstruction)', () => {
    const c = makeController();
    c.update(
      {
        alive: true,
        state: 'hunt',
        stateT: 0,
        speed: 0,
        telegraph: 0,
        flash: 0,
        airborne: false,
        cue: { sequence: 5, actionId: 'enemy.attack.primary', startedAtTick: 0, durationTicks: 30 },
        currentTick: 15,
      },
      0.01,
    );
    const clipDuration = c.instance.currentAction!.getClip().duration;
    expect(Math.abs(c.instance.currentAction!.time - 0.5 * clipDuration)).toBeLessThan(0.02);
    c.dispose();
  });

  it('cues only drive presentation; authoritative state fields are untouched', () => {
    const c = makeController();
    const state = {
      alive: true,
      state: 'hunt',
      stateT: 0,
      speed: 0,
      telegraph: 0,
      flash: 0,
      airborne: false,
      cue: { sequence: 1, actionId: 'enemy.attack.primary', startedAtTick: 0, durationTicks: 30 },
      currentTick: 1,
    };
    c.update(state, 0.01);
    expect(state.state).toBe('hunt');
    expect(state.speed).toBe(0);
    expect(state.telegraph).toBe(0);
    expect(state.cue.sequence).toBe(1);
    c.dispose();
  });
});
