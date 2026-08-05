import { describe, expect, it } from 'vitest';
import { CLIENT_CONTENT_PACK } from '../../src/generated/contentPack.generated';
import { PRESENTATION_ASSET_CATALOG } from '../../src/generated/presentationContent.generated';

describe('monsterpack10 preload roster', () => {
  const roster = CLIENT_CONTENT_PACK.getEnemyArtRoster('enemyArtRoster.quaternius.integrationPreview');
  const projectIds = new Set(PRESENTATION_ASSET_CATALOG.project.map((p) => p.id));

  it('roster preload ids all resolve in the project catalog', () => {
    expect(roster.preloadAssetIds.length).toBeGreaterThan(0);
    for (const id of roster.preloadAssetIds) {
      expect(projectIds.has(id), id).toBe(true);
    }
  });

  it('unused hero models are excluded from the roster preload set', () => {
    const heroes = PRESENTATION_ASSET_CATALOG.project
      .filter((p) => p.id.startsWith('custom.enemy.quaternius.') && p.id.endsWith('.hero'))
      .map((p) => p.id);
    expect(heroes.length).toBe(45);
    expect(roster.preloadAssetIds.length).toBeLessThan(heroes.length);
    for (const id of roster.preloadAssetIds) {
      if (id.endsWith('.hero')) {
        expect(heroes).toContain(id);
      }
    }
  });

  it('profile lists resolve to generated presentation profiles', () => {
    const all = [
      ...roster.commonPresentationProfileIds,
      ...roster.elitePresentationProfileIds,
      ...roster.bossPresentationProfileIds,
    ];
    expect(all.length).toBeGreaterThan(0);
  });

  it('all quaternius assets are optional so startup never downloads them', () => {
    const quaternius = PRESENTATION_ASSET_CATALOG.project.filter((p) =>
      p.id.startsWith('custom.enemy.quaternius.'),
    );
    expect(quaternius.every((p) => p.optional === true)).toBe(true);
  });
});
