import { describe, expect, it } from 'vitest';
import {
  assertNoFallbackCycles,
  ENEMY_ANIMATION_ROLES,
  isAnimationRole,
  walkFallbackChain,
} from '../../src/shared/animation/animationRoles';
import {
  actionCueElapsedFraction,
  isNewActionCue,
  type EnemyActionCue,
} from '../../src/shared/animation/enemyActionCue';
import { animationLodPolicySchema } from '../../src/shared/animation/animationLodPolicySchema';
import { animationShadowPolicySchema } from '../../src/shared/animation/animationShadowPolicySchema';
import { enemyAnimationProfileSchema } from '../../src/shared/animation/enemyAnimationProfileSchema';
import { enemyPresentationProfileSchema } from '../../src/shared/animation/enemyPresentationProfileSchema';
import {
  resolveRoleWithFallback,
  validateAnimationContent,
  type AnimationContentSource,
} from '../../src/shared/animation/animationContentValidation';
import type { EnemyAnimationProfileDefinition } from '../../src/shared/animation/animationProfileTypes';

const VALID_PROFILE: EnemyAnimationProfileDefinition = {
  id: 'enemyAnimation.witch.common',
  label: 'Witch Common',
  clips: { idle: 'Idle', walk: 'Walk', attackPrimary: 'Attack', death: 'Death' },
  fallbacks: { walk: 'idle', attackPrimary: 'idle', death: 'idle' },
  locomotion: {
    idleSpeedMax: 0.1,
    walkSpeedMax: 3,
    walkSpeedReference: 3,
    runSpeedReference: 6,
    playbackMin: 0.5,
    playbackMax: 1.5,
    randomStartPhase: true,
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

describe('animation content schemas (animation07 M3)', () => {
  it('presentation profile schema validates required fields and id prefix', () => {
    const ok = enemyPresentationProfileSchema.safeParse({
      id: 'enemyPresentation.witch.common',
      label: 'Witch Common',
      nearModelAssetId: 'custom.enemy.witch.common.skinned',
      farModelAssetId: 'custom.enemy.witch.common.far',
      animationProfileId: 'enemyAnimation.witch.common',
      lodPolicyId: 'animationLod.defaultHorde',
      shadowPolicyId: 'animationShadow.defaultHorde',
      transform: { scale: [1, 1, 1], position: [0, 0, 0], rotation: [0, 0, 0] },
      materialPolicy: { cloneForHitFlash: true, allowSharedMaterials: false },
      tags: ['witch', 'common'],
    });
    expect(ok.success).toBe(true);
    expect(enemyPresentationProfileSchema.safeParse({ id: 'nope', label: 'x' }).success).toBe(false);
    expect(
      enemyPresentationProfileSchema.safeParse({
        id: 'enemyPresentation.witch.common',
        label: 'x',
        nearModelAssetId: 'a',
        lodPolicyId: 'animationLod.x',
        shadowPolicyId: 'animationShadow.x',
      }).success,
    ).toBe(true);
  });

  it('animation profile schema validates roles, fallbacks, and rootMotion=false', () => {
    const ok = enemyAnimationProfileSchema.safeParse(VALID_PROFILE);
    expect(ok.success).toBe(true);
    expect(enemyAnimationProfileSchema.safeParse({ ...VALID_PROFILE, rootMotion: true }).success).toBe(false);
    expect(
      enemyAnimationProfileSchema.safeParse({ ...VALID_PROFILE, fallbacks: { bogus: 'idle' } }).success,
    ).toBe(false);
    expect(
      enemyAnimationProfileSchema.safeParse({
        ...VALID_PROFILE,
        playback: { idle: { loop: 'once', interruptPriority: 2 } },
      }).success,
    ).toBe(true);
  });

  it('LOD policy schema enforces mixer budgets and weights', () => {
    const ok = animationLodPolicySchema.safeParse({
      id: 'animationLod.defaultHorde',
      heroAlwaysNear: true,
      nearEnter: 18,
      nearLeave: 26,
      midEnter: 24,
      midLeave: 48,
      farEnter: 42,
      farLeave: 90,
      nearUpdateHz: 30,
      midUpdateHz: 12,
      maximumNearMixers: 48,
      maximumMidMixers: 96,
      priorityWeights: {
        boss: 100,
        elite: 50,
        attacking: 20,
        telegraphing: 15,
        damagedRecently: 10,
        distance: 1,
      },
    });
    expect(ok.success).toBe(true);
    expect(animationLodPolicySchema.safeParse({ id: 'bad' }).success).toBe(false);
  });

  it('shadow policy schema keeps per-tier rules content-driven', () => {
    const ok = animationShadowPolicySchema.safeParse({
      id: 'animationShadow.defaultHorde',
      tiers: {
        hero: { castShadow: true, receiveShadow: true },
        near: { castShadow: false, receiveShadow: true },
        mid: { castShadow: false, receiveShadow: false },
        far: { castShadow: false, receiveShadow: false },
        aggregate: { castShadow: false, receiveShadow: false },
      },
    });
    expect(ok.success).toBe(true);
    expect(
      animationShadowPolicySchema.safeParse({
        id: 'animationShadow.defaultHorde',
        tiers: { hero: { castShadow: true, receiveShadow: true } },
      }).success,
    ).toBe(false);
  });
});

describe('role vocabulary and fallback chains', () => {
  it('exports the full semantic role list', () => {
    expect(ENEMY_ANIMATION_ROLES).toContain('idle');
    expect(ENEMY_ANIMATION_ROLES).toContain('attackSpecial');
    expect(ENEMY_ANIMATION_ROLES).toContain('phaseTransition');
    expect(isAnimationRole('idle')).toBe(true);
    expect(isAnimationRole('Action.003')).toBe(false);
  });

  it('rejects fallback cycles', () => {
    expect(() =>
      assertNoFallbackCycles({ run: 'walk', walk: 'run' }, 'test'),
    ).toThrow(/cycle/);
    expect(() => assertNoFallbackCycles({ run: 'walk', walk: 'idle' }, 'test')).not.toThrow();
  });

  it('resolves roles through the fallback chain only when needed', () => {
    const profile: EnemyAnimationProfileDefinition = {
      ...VALID_PROFILE,
      clips: { idle: 'Idle', attackPrimary: 'Attack' },
      fallbacks: { run: 'walk', walk: 'idle' },
    };
    expect(resolveRoleWithFallback(profile, 'idle', (n) => n === 'Idle')).toBe('idle');
    expect(resolveRoleWithFallback(profile, 'walk', (n) => n === 'Idle')).toBe('idle');
    expect(resolveRoleWithFallback(profile, 'run', (n) => n === 'Idle')).toBe('idle');
    expect(resolveRoleWithFallback(profile, 'run', () => false)).toBeNull();
  });

  it('walkFallbackChain never loops on cycles', () => {
    const role = walkFallbackChain('run', { run: 'walk', walk: 'run' }, () => false);
    expect(role).toBeNull();
  });
});

describe('content reference validation', () => {
  const source: AnimationContentSource = {
    presentationProfiles: [
      {
        id: 'enemyPresentation.witch.common',
        label: 'Witch Common',
        nearModelAssetId: 'custom.enemy.witch.common.skinned',
        farModelAssetId: 'custom.enemy.witch.common.far',
        animationProfileId: 'enemyAnimation.witch.common',
        lodPolicyId: 'animationLod.defaultHorde',
        shadowPolicyId: 'animationShadow.defaultHorde',
      },
    ],
    animationProfiles: [VALID_PROFILE],
    lodPolicies: [
      {
        id: 'animationLod.defaultHorde',
        heroAlwaysNear: true,
        nearEnter: 18,
        nearLeave: 26,
        midEnter: 24,
        midLeave: 48,
        farEnter: 42,
        farLeave: 90,
        nearUpdateHz: 30,
        midUpdateHz: 12,
        maximumNearMixers: 48,
        maximumMidMixers: 96,
        priorityWeights: { boss: 1, elite: 1, attacking: 1, telegraphing: 1, damagedRecently: 1, distance: 1 },
      },
    ],
    shadowPolicies: [
      {
        id: 'animationShadow.defaultHorde',
        tiers: {
          hero: { castShadow: true, receiveShadow: true },
          near: { castShadow: false, receiveShadow: true },
          mid: { castShadow: false, receiveShadow: false },
          far: { castShadow: false, receiveShadow: false },
          aggregate: { castShadow: false, receiveShadow: false },
        },
      },
    ],
  };

  it('rejects duplicate ids and unknown references', () => {
    const issues = validateAnimationContent(
      {
        ...source,
        presentationProfiles: [...source.presentationProfiles, source.presentationProfiles[0]],
      },
      (id) => id.startsWith('custom.'),
    );
    expect(issues.join('\n')).toContain('duplicate presentation profile');
  });

  it('rejects unknown model, animation, LOD, and shadow references', () => {
    const issues = validateAnimationContent(
      {
        ...source,
        presentationProfiles: [
          {
            ...source.presentationProfiles[0],
            nearModelAssetId: 'missing.model',
            animationProfileId: 'enemyAnimation.missing',
            lodPolicyId: 'animationLod.missing',
            shadowPolicyId: 'animationShadow.missing',
          },
        ],
      },
      () => false,
    );
    const all = issues.join('\n');
    expect(all).toContain('unknown nearModelAssetId');
    expect(all).toContain('unknown animationProfileId');
    expect(all).toContain('unknown lodPolicyId');
    expect(all).toContain('unknown shadowPolicyId');
  });

  it('rejects fallback cycles and unknown enemy presentationProfileId refs', () => {
    const issues = validateAnimationContent(
      {
        ...source,
        animationProfiles: [
          { ...VALID_PROFILE, id: 'enemyAnimation.witch.common', fallbacks: { run: 'walk', walk: 'run' } },
        ],
      },
      (id) => id.startsWith('custom.'),
      [{ id: 'enemy.witch', presentationProfileId: 'enemyPresentation.nope' }],
    );
    const all = issues.join('\n');
    expect(all).toContain('fallback cycle');
    expect(all).toContain('unknown presentationProfileId');
  });
});

describe('action cue helpers', () => {
  const cue = (sequence: number, startedAtTick = 0, durationTicks = 30): EnemyActionCue => ({
    sequence,
    actionId: 'enemy.attack.primary',
    startedAtTick,
    durationTicks,
  });

  it('deduplicates repeated sequences', () => {
    expect(isNewActionCue(undefined, cue(1))).toBe(true);
    expect(isNewActionCue(cue(1), cue(1))).toBe(false);
    expect(isNewActionCue(cue(1), cue(2))).toBe(true);
    expect(isNewActionCue(cue(2), undefined)).toBe(false);
  });

  it('aligns late cues to authoritative elapsed time', () => {
    expect(actionCueElapsedFraction(cue(1, 100, 30), 115)).toBeCloseTo(0.5);
    expect(actionCueElapsedFraction(cue(1, 100, 30), 80)).toBe(0);
    expect(actionCueElapsedFraction(cue(1, 100, 30), 200)).toBe(1);
  });
});
