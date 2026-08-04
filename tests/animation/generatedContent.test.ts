import { describe, expect, it } from 'vitest';
import {
  buildEnemyAnimationContent,
  readEnemyAnimationSourceHash,
} from '../../scripts/generate-enemy-animation-content';
import {
  ENEMY_ANIMATION_ANIMATION_PROFILES,
  ENEMY_ANIMATION_CONTENT,
  ENEMY_ANIMATION_LEGACY_TYPE_PRESENTATION,
  ENEMY_ANIMATION_LOD_POLICIES,
  ENEMY_ANIMATION_PRESENTATION_PROFILE_ORDER,
  ENEMY_ANIMATION_PRESENTATION_PROFILES,
  ENEMY_ANIMATION_SHADOW_POLICIES,
} from '../../src/generated/enemyAnimationContent.generated';
import { PRESENTATION_ASSET_CATALOG } from '../../src/generated/presentationContent.generated';
import { isBuiltInAssetId, isProjectAssetId } from '../../src/shared/assetCatalog';

describe('generated enemy animation content (animation07 M4)', () => {
  it('generated bundle is deterministic and matches source content', () => {
    const built = buildEnemyAnimationContent();
    expect(readEnemyAnimationSourceHash()).toBe(built.sourceHash);
    expect(ENEMY_ANIMATION_CONTENT.sourceHash).toBe(built.sourceHash);
    expect(ENEMY_ANIMATION_CONTENT.format).toBe(1);
  });

  it('contains all family templates and legacy profiles', () => {
    for (const family of ['witch', 'spider', 'beast']) {
      for (const tier of ['common', 'elite', 'boss']) {
        expect(ENEMY_ANIMATION_PRESENTATION_PROFILES[`enemyPresentation.${family}.${tier}`]).toBeDefined();
        expect(ENEMY_ANIMATION_ANIMATION_PROFILES[`enemyAnimation.${family}.${tier}`]).toBeDefined();
      }
    }
    expect(ENEMY_ANIMATION_PRESENTATION_PROFILES['enemyPresentation.legacy.scrapBug']).toBeDefined();
    expect(ENEMY_ANIMATION_ANIMATION_PROFILES['enemyAnimation.none']).toBeDefined();
    expect(ENEMY_ANIMATION_LOD_POLICIES['animationLod.defaultHorde']).toBeDefined();
    expect(ENEMY_ANIMATION_LOD_POLICIES['animationLod.hero']).toBeDefined();
    expect(ENEMY_ANIMATION_SHADOW_POLICIES['animationShadow.defaultHorde']).toBeDefined();
    expect(ENEMY_ANIMATION_SHADOW_POLICIES['animationShadow.hero']).toBeDefined();
  });

  it('generates the legacy type -> presentation mapping from enemy JSON', () => {
    expect(ENEMY_ANIMATION_LEGACY_TYPE_PRESENTATION.scrapBug).toBe('enemyPresentation.legacy.scrapBug');
    expect(ENEMY_ANIMATION_LEGACY_TYPE_PRESENTATION.rammer).toBe('enemyPresentation.legacy.rammer');
    expect(ENEMY_ANIMATION_LEGACY_TYPE_PRESENTATION.gunTower).toBe('enemyPresentation.legacy.gunTower');
    expect(ENEMY_ANIMATION_LEGACY_TYPE_PRESENTATION.lootTruck).toBe('enemyPresentation.legacy.lootTruck');
  });

  it('every model reference resolves through the presentation catalog', () => {
    const resolvable = (id: string): boolean => isBuiltInAssetId(id) || isProjectAssetId(id, PRESENTATION_ASSET_CATALOG);
    for (const profile of Object.values(ENEMY_ANIMATION_PRESENTATION_PROFILES)) {
      expect(resolvable(profile.nearModelAssetId), `${profile.id} near`).toBe(true);
      if (profile.farModelAssetId) expect(resolvable(profile.farModelAssetId), `${profile.id} far`).toBe(true);
      if (profile.aggregateModelAssetId) {
        expect(resolvable(profile.aggregateModelAssetId), `${profile.id} aggregate`).toBe(true);
      }
      expect(ENEMY_ANIMATION_LOD_POLICIES[profile.lodPolicyId], `${profile.id} lod`).toBeDefined();
      expect(ENEMY_ANIMATION_SHADOW_POLICIES[profile.shadowPolicyId], `${profile.id} shadow`).toBeDefined();
      if (profile.animationProfileId) {
        expect(ENEMY_ANIMATION_ANIMATION_PROFILES[profile.animationProfileId], `${profile.id} animation`).toBeDefined();
      }
    }
  });

  it('exposes the ordered presentation profile list for wire indexing', () => {
    expect(ENEMY_ANIMATION_PRESENTATION_PROFILE_ORDER).toContain('enemyPresentation.witch.common');
    expect(ENEMY_ANIMATION_PRESENTATION_PROFILE_ORDER.length).toBe(
      Object.keys(ENEMY_ANIMATION_PRESENTATION_PROFILES).length,
    );
    expect(new Set(ENEMY_ANIMATION_PRESENTATION_PROFILE_ORDER).size).toBe(
      ENEMY_ANIMATION_PRESENTATION_PROFILE_ORDER.length,
    );
  });
});
