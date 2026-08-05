import { describe, expect, it } from 'vitest';
import { PRESENTATION_ASSET_CATALOG } from '../../src/generated/presentationContent.generated';
import { ENEMY_ANIMATION_CONTENT } from '../../src/generated/enemyAnimationContent.generated';

describe('monsterpack10 near/far asset resolution', () => {
  const project = new Map(PRESENTATION_ASSET_CATALOG.project.map((p) => [p.id, p]));

  it('common profiles resolve near and far assets to registered models', () => {
    for (const profile of Object.values(ENEMY_ANIMATION_CONTENT.presentationProfiles)) {
      if (!profile.id.startsWith('enemyPresentation.quaternius.') || !profile.id.endsWith('.common')) continue;
      expect(project.has(profile.nearModelAssetId), profile.nearModelAssetId).toBe(true);
      expect(profile.farModelAssetId && project.has(profile.farModelAssetId), profile.farModelAssetId ?? '').toBe(true);
    }
  });

  it('hero profiles resolve hero assets to registered models', () => {
    for (const profile of Object.values(ENEMY_ANIMATION_CONTENT.presentationProfiles)) {
      if (!profile.id.startsWith('enemyPresentation.quaternius.') || !profile.id.endsWith('.hero')) continue;
      expect(project.has(profile.nearModelAssetId), profile.nearModelAssetId).toBe(true);
    }
  });

  it('every common near/far pair shares the same slug family', () => {
    for (const profile of Object.values(ENEMY_ANIMATION_CONTENT.presentationProfiles)) {
      if (!profile.id.startsWith('enemyPresentation.quaternius.') || !profile.id.endsWith('.common')) continue;
      const nearSlug = profile.nearModelAssetId.replace(/^custom\.enemy\.quaternius\./, '').replace(/\.commonNear$/, '');
      const farSlug = profile.farModelAssetId?.replace(/^custom\.enemy\.quaternius\./, '').replace(/\.commonFar$/, '');
      expect(farSlug).toBe(nearSlug);
    }
  });
});
