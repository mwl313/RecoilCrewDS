import { beforeEach, describe, expect, it } from 'vitest';
import { createAnimationClipResolver, resetClipResolverWarnings } from '../../src/client/animation/animationClipResolver';
import type { EnemyAnimationProfileDefinition } from '../../src/shared/animation/animationProfileTypes';
import { buildProceduralSkinnedAsset } from './proceduralRig';

const BASE: EnemyAnimationProfileDefinition = {
  id: 'enemyAnimation.test',
  label: 'Test',
  clips: { idle: 'Walk', walk: 'Walk', attackPrimary: 'Attack', death: 'Death' },
  fallbacks: { run: 'walk', walk: 'idle', attackSecondary: 'attackPrimary' },
  locomotion: {
    idleSpeedMax: 0.1,
    walkSpeedMax: 3,
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

describe('animation clip resolver (animation07 M6)', () => {
  beforeEach(() => resetClipResolverWarnings());

  it('resolves a semantic role to its clip by name', () => {
    const resolver = createAnimationClipResolver();
    const asset = buildProceduralSkinnedAsset();
    const resolved = resolver.resolve(BASE, 'attackPrimary', asset.animations);
    expect(resolved?.clipName).toBe('Attack');
    expect(resolved?.clip.name).toBe('Attack');
  });

  it('resolves through the fallback chain', () => {
    const resolver = createAnimationClipResolver();
    const asset = buildProceduralSkinnedAsset();
    const resolved = resolver.resolve(BASE, 'run', asset.animations);
    expect(resolved?.role).toBe('walk');
    expect(resolved?.clipName).toBe('Walk');
  });

  it('missing optional clips fall back safely', () => {
    const resolver = createAnimationClipResolver();
    const asset = buildProceduralSkinnedAsset();
    const resolved = resolver.resolve(BASE, 'attackSecondary', asset.animations);
    expect(resolved?.role).toBe('attackPrimary');
  });

  it('missing all usable clips leaves a static pose (resolve null)', () => {
    const resolver = createAnimationClipResolver();
    const asset = buildProceduralSkinnedAsset('empty');
    const profile = { ...BASE, clips: { idle: 'NoSuchClip' } };
    expect(resolver.resolve(profile, 'idle', asset.animations)).toBeNull();
  });

  it('reports resolved names for diagnostics without gameplay coupling', () => {
    const resolver = createAnimationClipResolver();
    const names = resolver.resolvedNames(BASE);
    expect(names).toContain('attackPrimary -> Attack');
  });
});
