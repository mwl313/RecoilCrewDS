import { describe, expect, it } from 'vitest';
import { DistantEnemyMotion } from '../../src/client/animation/distantEnemyMotion';
import type { EnemyAnimationProfileDefinition } from '../../src/shared/animation/animationProfileTypes';

const PROFILE: EnemyAnimationProfileDefinition = {
  id: 'test.far',
  label: 'Far test',
  clips: {},
  fallbacks: {},
  stateMap: { telegraph: 'attackPrimary' },
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
    defaultCrossFadeSeconds: 0.1,
    locomotionCrossFadeSeconds: 0.1,
    attackCrossFadeSeconds: 0.1,
    hitCrossFadeSeconds: 0.1,
    deathCrossFadeSeconds: 0.1,
  },
  rootMotion: false,
};

const walking = { alive: true, state: 'hunt', stateT: 0, speed: 3, telegraph: 0, flash: 0, airborne: false };

describe('mixer-free distant enemy motion', () => {
  it('far enemy walks without a frozen/T-pose presentation', () => {
    const motion = new DistantEnemyMotion(0.1);
    const first = motion.update(PROFILE, walking, 1 / 60);
    const later = motion.update(PROFILE, walking, 1 / 60);
    expect(later.role).toBe('walk');
    expect(later.phase).not.toBe(first.phase);
    expect(later.roll).not.toBe(first.roll);
  });

  it('far motion changes continuously between sparse snapshots', () => {
    const motion = new DistantEnemyMotion(0.2);
    const samples = Array.from({ length: 6 }, () => motion.update(PROFILE, walking, 1 / 60));
    const jumps = samples.slice(1).map((pose, i) => Math.abs(pose.yOffset - samples[i].yOffset));
    expect(Math.max(...jumps)).toBeLessThan(0.03);
    expect(new Set(samples.map((pose) => pose.phase.toFixed(5))).size).toBe(samples.length);
  });

  it('shows a far attack cue and keeps death visible', () => {
    const motion = new DistantEnemyMotion(0.25);
    const attack = motion.update(PROFILE, { ...walking, speed: 0, telegraph: 1 }, 0.1);
    expect(attack.role).toBe('attackPrimary');
    expect(attack.scale).toBeGreaterThanOrEqual(1);
    const death = motion.update(PROFILE, { ...walking, alive: false, state: 'dead', speed: 0 }, 0.4);
    expect(death.dead).toBe(true);
    expect(death.scale).toBeGreaterThan(0.08);
    expect(death.yOffset).toBeLessThan(0);
  });

  it('preserves action phase and airborne state across far reconstruction', () => {
    const before = new DistantEnemyMotion(0.33);
    const airborne = before.update(PROFILE, { ...walking, airborne: true }, 0.05);
    const restored = new DistantEnemyMotion(0, before.captureContinuity());
    const after = restored.update(PROFILE, { ...walking, airborne: true }, 0);
    expect(after.phase).toBeCloseTo(airborne.phase, 6);
    expect(after.airborne).toBe(true);
    expect(after.yOffset).toBe(0);
  });
});
