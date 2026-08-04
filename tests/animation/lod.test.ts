import { describe, expect, it } from 'vitest';
import {
  AnimationLodManager,
  selectAnimationLod,
  type AnimationLodCandidate,
} from '../../src/client/animation/animationLodSelector';
import type { AnimationLodPolicyDefinition } from '../../src/shared/animation/animationProfileTypes';

const POLICY: AnimationLodPolicyDefinition = {
  id: 'animationLod.test',
  heroAlwaysNear: true,
  nearEnter: 18,
  nearLeave: 26,
  midEnter: 24,
  midLeave: 48,
  farEnter: 42,
  farLeave: 90,
  nearUpdateHz: 30,
  midUpdateHz: 12,
  maximumNearMixers: 4,
  maximumMidMixers: 8,
  priorityWeights: {
    boss: 100,
    elite: 50,
    attacking: 20,
    telegraphing: 15,
    damagedRecently: 10,
    distance: 1,
  },
};

function candidate(overrides: Partial<AnimationLodCandidate>): AnimationLodCandidate {
  return {
    enemyId: 1,
    distance: 20,
    telegraphing: false,
    attacking: false,
    damagedRecently: false,
    currentTier: 'near',
    ...overrides,
  };
}

describe('animation LOD selection (animation07 M9)', () => {
  it('bosses and elites always receive the hero tier', () => {
    expect(selectAnimationLod(POLICY, candidate({ distance: 200, populationClass: 'boss' }))).toBe('hero');
    expect(selectAnimationLod(POLICY, candidate({ distance: 200, populationClass: 'elite' }))).toBe('hero');
  });

  it('uses hysteresis to prevent tier thrashing', () => {
    expect(selectAnimationLod(POLICY, candidate({ distance: 25, currentTier: 'near' }))).toBe('near');
    expect(selectAnimationLod(POLICY, candidate({ distance: 27, currentTier: 'near' }))).toBe('mid');
    expect(selectAnimationLod(POLICY, candidate({ distance: 25, currentTier: 'mid' }))).toBe('mid');
    expect(selectAnimationLod(POLICY, candidate({ distance: 15, currentTier: 'mid' }))).toBe('near');
  });

  it('demotes far enemies only outside the far leave distance', () => {
    expect(selectAnimationLod(POLICY, candidate({ distance: 85, currentTier: 'far' }))).toBe('far');
    expect(selectAnimationLod(POLICY, candidate({ distance: 95, currentTier: 'far' }))).toBe('far');
    expect(selectAnimationLod(POLICY, candidate({ distance: 40, currentTier: 'far' }))).toBe('mid');
  });

  it('low graphics quality demotes common enemies earlier (presentation only)', () => {
    const d = 22; // just past scaled nearEnter (14.4) and midEnter (19.2)
    expect(selectAnimationLod(POLICY, candidate({ distance: d, currentTier: 'near' }), 'high')).toBe('near');
    expect(selectAnimationLod(POLICY, candidate({ distance: d, currentTier: 'near' }), 'low')).toBe('mid');
  });
});

describe('animation mixer budgets (animation07 M9)', () => {
  it('hero enemies are never displaced by common mixer demand', () => {
    const manager = new AnimationLodManager(POLICY);
    const inputs: AnimationLodCandidate[] = [
      candidate({ enemyId: 1, distance: 5, populationClass: 'boss' }),
      ...Array.from({ length: 10 }, (_, i) => candidate({ enemyId: 10 + i, distance: 10, currentTier: 'near' })),
    ];
    const tiers = manager.update(inputs);
    expect(tiers.get(1)).toBe('hero');
    const nearCount = [...tiers.values()].filter((t) => t === 'near').length;
    expect(nearCount).toBeLessThanOrEqual(POLICY.maximumNearMixers);
  });

  it('keeps stable allocations across frames instead of flickering', () => {
    const manager = new AnimationLodManager(POLICY);
    const inputs = Array.from({ length: 10 }, (_, i) =>
      candidate({ enemyId: 10 + i, distance: 10 + i, currentTier: 'near' }),
    );
    const first = manager.update(inputs);
    const second = manager.update(inputs);
    const nearIds = (m: Map<number, string>) => [...m.entries()].filter(([, t]) => t === 'near').map(([id]) => id).sort();
    expect(nearIds(first)).toEqual(nearIds(second));
  });

  it('mid tier candidates beyond the budget are demoted to far (no mixer)', () => {
    const manager = new AnimationLodManager(POLICY);
    const inputs = Array.from({ length: 20 }, (_, i) =>
      candidate({ enemyId: 100 + i, distance: 30, currentTier: 'mid' }),
    );
    const tiers = manager.update(inputs);
    const farCount = [...tiers.values()].filter((t) => t === 'far').length;
    expect(farCount).toBe(20 - POLICY.maximumMidMixers);
  });
});
