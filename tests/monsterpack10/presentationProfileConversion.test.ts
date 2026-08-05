import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ENEMY_ANIMATION_CONTENT,
} from '../../src/generated/enemyAnimationContent.generated';

describe('monsterpack10 presentation profile conversion', () => {
  const profiles = Object.values(ENEMY_ANIMATION_CONTENT.presentationProfiles).filter((p) =>
    p.id.startsWith('enemyPresentation.quaternius.'),
  );
  const catalog = ENEMY_ANIMATION_CONTENT.presentationProfiles;

  it('generates 45 hero + 15 common profiles with unique ids', () => {
    const hero = profiles.filter((p) => p.id.endsWith('.hero'));
    const common = profiles.filter((p) => p.id.endsWith('.common'));
    expect(hero.length).toBe(45);
    expect(common.length).toBe(15);
    expect(new Set(profiles.map((p) => p.id)).size).toBe(profiles.length);
  });

  it('hero profiles reference hero assets and hero policies', () => {
    for (const profile of profiles.filter((p) => p.id.endsWith('.hero'))) {
      expect(profile.nearModelAssetId.endsWith('.hero')).toBe(true);
      expect(profile.animationProfileId?.endsWith('.hero')).toBe(true);
      expect(profile.lodPolicyId).toBe('animationLod.hero');
      expect(profile.shadowPolicyId).toBe('animationShadow.hero');
      expect(ENEMY_ANIMATION_CONTENT.lodPolicies[profile.lodPolicyId]).toBeDefined();
      expect(ENEMY_ANIMATION_CONTENT.shadowPolicies[profile.shadowPolicyId]).toBeDefined();
    }
  });

  it('common profiles connect near/far/aggregate tiers and resolve policies', () => {
    for (const profile of profiles.filter((p) => p.id.endsWith('.common'))) {
      expect(profile.nearModelAssetId.endsWith('.commonNear')).toBe(true);
      expect(profile.farModelAssetId?.endsWith('.commonFar')).toBe(true);
      expect(profile.aggregateModelAssetId?.endsWith('.aggregate')).toBe(true);
      expect(profile.animationProfileId?.endsWith('.common')).toBe(true);
      expect(profile.lodPolicyId).toBe('animationLod.defaultHorde');
      expect(profile.shadowPolicyId).toBe('animationShadow.defaultHorde');
      expect(ENEMY_ANIMATION_CONTENT.lodPolicies[profile.lodPolicyId]).toBeDefined();
      expect(ENEMY_ANIMATION_CONTENT.shadowPolicies[profile.shadowPolicyId]).toBeDefined();
    }
  });

  it('all transform values are finite', () => {
    for (const profile of profiles) {
      if (!profile.transform) continue;
      const values: number[] = [];
      if (typeof profile.transform.scale === 'number') values.push(profile.transform.scale);
      else if (profile.transform.scale) values.push(...profile.transform.scale);
      if (profile.transform.position) values.push(...profile.transform.position);
      if (profile.transform.rotation) values.push(...profile.transform.rotation);
      for (const v of values) expect(Number.isFinite(v), `${profile.id}`).toBe(true);
    }
  });

  it('every profile is reachable from the generated bundle', () => {
    for (const profile of profiles) {
      expect(catalog[profile.id]).toBeDefined();
    }
  });
});
