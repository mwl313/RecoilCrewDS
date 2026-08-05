import { describe, expect, it } from 'vitest';
import { convertMonsterPack, nativeIdsFor, slugToCamel } from '../../scripts/monsterpack10/convert';
import { makeFixtureManifests } from './fixtures';

describe('monsterpack10 source manifest conversion', () => {
  it('asset ids are deterministic and slug-derived camelCase', () => {
    expect(slugToCamel('green-blob')).toBe('greenBlob');
    expect(slugToCamel('dragon-evolved')).toBe('dragonEvolved');
    expect(slugToCamel('orc-enemy')).toBe('orcEnemy');
    expect(nativeIdsFor('mushnub')).toEqual({
      heroAssetId: 'custom.enemy.quaternius.mushnub.hero',
      commonNearAssetId: 'custom.enemy.quaternius.mushnub.commonNear',
      commonFarAssetId: 'custom.enemy.quaternius.mushnub.commonFar',
      aggregateAssetId: 'custom.enemy.quaternius.mushnub.aggregate',
    });
  });

  it('converts fixture manifests into native content with expected counts', () => {
    const manifests = makeFixtureManifests();
    const hashes = { hero: 'h', commonNear: 'n', commonFar: 'f', aggregate: 'a' };
    const out = convertMonsterPack({
      manifests,
      variants: manifests.runtimeVariants.variants,
      hashes,
    });
    expect(out.assetEntries.length).toBe(5); // mushnub: hero + 3 common tiers; dragon-evolved: hero only
    expect(out.heroAnimationProfiles.length).toBe(2);
    expect(out.commonAnimationProfiles.length).toBe(1);
    expect(out.heroPresentationProfiles.length).toBe(2);
    expect(out.commonPresentationProfiles.length).toBe(1);
    expect(out.nativeIndex['monster.quaternius.mushnub'].heroAssetId).toBe(
      'custom.enemy.quaternius.mushnub.hero',
    );
    expect(out.nativeIndex['monster.quaternius.mushnub'].commonPresentationProfileId).toBe(
      'enemyPresentation.quaternius.mushnub.common',
    );
  });

  it('all ids are unique across the conversion', () => {
    const manifests = makeFixtureManifests();
    const out = convertMonsterPack({
      manifests,
      variants: manifests.runtimeVariants.variants,
      hashes: { hero: 'h' },
    });
    const allIds = [
      ...out.assetEntries.map((e) => e.id),
      ...out.heroAnimationProfiles.map((p) => p.id),
      ...out.commonAnimationProfiles.map((p) => p.id),
      ...out.heroPresentationProfiles.map((p) => p.id),
      ...out.commonPresentationProfiles.map((p) => p.id),
    ];
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('hero profiles carry hero models; common profiles carry near/far/aggregate', () => {
    const manifests = makeFixtureManifests();
    const out = convertMonsterPack({
      manifests,
      variants: manifests.runtimeVariants.variants,
      hashes: { hero: 'h' },
    });
    const mushnubHero = out.heroPresentationProfiles.find((p) => p.id.endsWith('mushnub.hero'))!;
    expect(mushnubHero.nearModelAssetId).toBe('custom.enemy.quaternius.mushnub.hero');
    const mushnubCommon = out.commonPresentationProfiles[0];
    expect(mushnubCommon.nearModelAssetId).toBe('custom.enemy.quaternius.mushnub.commonNear');
    expect(mushnubCommon.farModelAssetId).toBe('custom.enemy.quaternius.mushnub.commonFar');
    expect(mushnubCommon.aggregateModelAssetId).toBe('custom.enemy.quaternius.mushnub.aggregate');
  });

  it('semantic clips resolve and root motion is false', () => {
    const manifests = makeFixtureManifests();
    const out = convertMonsterPack({
      manifests,
      variants: manifests.runtimeVariants.variants,
      hashes: { hero: 'h' },
    });
    for (const profile of [...out.heroAnimationProfiles, ...out.commonAnimationProfiles]) {
      expect(profile.rootMotion).toBe(false);
      for (const clip of Object.values(profile.clips)) {
        expect(clip).toMatch(/^CharacterArmature\|/);
      }
    }
    const common = out.commonAnimationProfiles[0];
    // Stripped roles must never point at missing clips: fallbacks only.
    expect(common.clips['attackPrimary']).toBe('CharacterArmature|Bite_Front');
  });

  it('conversion is deterministic across two runs', () => {
    const manifests = makeFixtureManifests();
    const a = convertMonsterPack({ manifests, variants: manifests.runtimeVariants.variants, hashes: { hero: 'h' } });
    const b = convertMonsterPack({ manifests, variants: manifests.runtimeVariants.variants, hashes: { hero: 'h' } });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
