import { beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { EnemyAnimationController } from '../../src/client/animation/enemyAnimationController';
import { animationTelemetry, resetAnimationTelemetry } from '../../src/client/animation/animationTelemetry';
import type { EnemyAnimationProfileDefinition } from '../../src/shared/animation/animationProfileTypes';
import { buildModelInstance } from '../../src/client/animation/animatedModelInstanceFactory';
import { buildProceduralSkinnedAsset } from './proceduralRig';

const PROFILE: EnemyAnimationProfileDefinition = {
  id: 'enemyAnimation.test',
  label: 'Test',
  clips: { idle: 'Walk', walk: 'Walk', run: 'Walk', attackPrimary: 'Attack', stagger: 'Stagger', death: 'Death' },
  fallbacks: { run: 'walk', walk: 'idle', stagger: 'hit', hit: 'idle' },
  locomotion: {
    idleSpeedMax: 0.2,
    walkSpeedMax: 3.5,
    walkSpeedReference: 3,
    runSpeedReference: 6,
    playbackMin: 0.5,
    playbackMax: 2,
    randomStartPhase: true,
  },
  transitions: {
    defaultCrossFadeSeconds: 0.05,
    locomotionCrossFadeSeconds: 0.05,
    attackCrossFadeSeconds: 0.05,
    hitCrossFadeSeconds: 0.05,
    deathCrossFadeSeconds: 0.05,
  },
  playback: {
    idle: { loop: 'repeat' },
    walk: { loop: 'repeat' },
    run: { loop: 'repeat' },
    attackPrimary: { loop: 'once', clampWhenFinished: true, interruptPriority: 2 },
    stagger: { loop: 'once', clampWhenFinished: true, interruptPriority: 3 },
    death: { loop: 'once', clampWhenFinished: true, interruptPriority: 100 },
  },
  rootMotion: false,
};

function makeController(): EnemyAnimationController {
  const model = buildModelInstance(buildProceduralSkinnedAsset('test.controller'), { cloneMaterials: true });
  return EnemyAnimationController.create(PROFILE, model, 0.5);
}

describe('enemy animation controller (animation07 M6)', () => {
  beforeEach(() => resetAnimationTelemetry());

  it('plays looping locomotion and animates bones', () => {
    const c = makeController();
    const bone = c.instance.root.getObjectByName('mid') as THREE.Bone;
    const y0 = bone.position.y;
    c.update({ alive: true, state: 'hunt', stateT: 0, speed: 3, telegraph: 0, flash: 0, airborne: false }, 0.25);
    c.update({ alive: true, state: 'hunt', stateT: 0, speed: 3, telegraph: 0, flash: 0, airborne: false }, 0.25);
    expect(c.instance.currentRole).toBe('walk');
    expect(bone.position.y).not.toBeCloseTo(y0);
    c.dispose();
  });

  it('plays a one-shot attack and returns to locomotion', () => {
    const c = makeController();
    c.update({ alive: true, state: 'hunt', stateT: 0, speed: 3, telegraph: 0, flash: 0, airborne: false }, 0.01);
    expect(c.instance.currentRole).toBe('walk');
    c.update({ alive: true, state: 'hunt', stateT: 0, speed: 3, telegraph: 1, flash: 0, airborne: false }, 0.01);
    expect(c.instance.currentRole).toBe('attackPrimary');
    expect(c.instance.currentAction?.loop).toBe(THREE.LoopOnce);
    // Advance past the attack duration.
    for (let i = 0; i < 40; i++) {
      c.update({ alive: true, state: 'hunt', stateT: 0, speed: 3, telegraph: 0, flash: 0, airborne: false }, 0.03);
    }
    expect(c.instance.currentRole).toBe('walk');
    c.dispose();
  });

  it('scales locomotion playback with authoritative speed', () => {
    const c = makeController();
    c.update({ alive: true, state: 'hunt', stateT: 0, speed: 1.5, telegraph: 0, flash: 0, airborne: false }, 0.01);
    const slow = c.instance.currentAction!.timeScale;
    expect(slow).toBeCloseTo(0.5);
    c.update({ alive: true, state: 'hunt', stateT: 0, speed: 3, telegraph: 0, flash: 0, airborne: false }, 0.01);
    expect(c.instance.currentAction!.timeScale).toBeGreaterThan(slow);
    c.dispose();
  });

  it('randomizes loop phase deterministically from the seed', () => {
    const c = makeController();
    c.update({ alive: true, state: 'hunt', stateT: 0, speed: 3, telegraph: 0, flash: 0, airborne: false }, 0.01);
    const clipDuration = c.instance.currentAction!.getClip().duration;
    expect(c.instance.currentAction!.time).toBeGreaterThan(0);
    expect(c.instance.currentAction!.time).toBeLessThan(clipDuration);
    c.dispose();
  });

  it('death locks the final state and cannot be interrupted', () => {
    const c = makeController();
    c.update({ alive: false, state: 'dead', stateT: 0, speed: 0, telegraph: 0, flash: 0, airborne: false }, 0.01);
    expect(c.instance.dead).toBe(true);
    expect(c.instance.currentRole).toBe('death');
    c.update({ alive: true, state: 'hunt', stateT: 0, speed: 5, telegraph: 0, flash: 0, airborne: false }, 0.05);
    expect(c.instance.currentRole).toBe('death');
    c.dispose();
  });

  it('cleanup stops actions, clears maps, and decrements mixer telemetry', () => {
    const c = makeController();
    expect(animationTelemetry.liveMixers).toBe(1);
    expect(animationTelemetry.animationActionCount).toBeGreaterThan(0);
    const actionCount = animationTelemetry.animationActionCount;
    c.dispose();
    expect(animationTelemetry.liveMixers).toBe(0);
    expect(animationTelemetry.animationActionCount).toBe(0);
    expect(c.instance.actions.size).toBe(0);
    expect(c.instance.currentAction).toBeNull();
    void actionCount;
  });

  it('cross-fades between roles with profile transition times', () => {
    const c = makeController();
    c.update({ alive: true, state: 'hunt', stateT: 0, speed: 3, telegraph: 0, flash: 0, airborne: false }, 0.01);
    const walk = c.instance.currentAction;
    c.update({ alive: true, state: 'stagger', stateT: 0, speed: 0, telegraph: 0, flash: 0, airborne: false }, 0.01);
    expect(c.instance.currentRole).toBe('stagger');
    expect(c.instance.currentAction).not.toBe(walk);
    c.update({ alive: true, state: 'stagger', stateT: 0, speed: 0, telegraph: 0, flash: 0, airborne: false }, 0.1);
    expect(walk?.getEffectiveWeight()).toBeLessThan(0.01);
    c.dispose();
  });
});
