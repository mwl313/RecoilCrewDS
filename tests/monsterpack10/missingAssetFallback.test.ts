import { describe, expect, it } from 'vitest';
import { PRESENTATION_ASSET_CATALOG } from '../../src/generated/presentationContent.generated';
import { REQUIRED_ASSET_IDS } from '../../src/shared/assetRegistry';
import { fallbackFor } from '../../scripts/monsterpack10/convert';

describe('monsterpack10 missing asset fallback', () => {
  it('every quaternius asset registers a required built-in fallback', () => {
    const required = new Set<string>(REQUIRED_ASSET_IDS);
    for (const p of PRESENTATION_ASSET_CATALOG.project) {
      if (!p.id.startsWith('custom.enemy.quaternius.')) continue;
      expect(required.has(p.fallbackAssetId ?? ''), p.id).toBe(true);
    }
  });

  it('role-class fallback classification is deterministic', () => {
    expect(fallbackFor({ classification: { roleCandidates: ['fodder', 'swarm'], commonEligibility: 'candidate' } } as never)).toBe('enemy.scrapBug');
    expect(fallbackFor({ classification: { roleCandidates: ['charger'], commonEligibility: 'not_common_eligible' } } as never)).toBe('enemy.rammer');
    expect(fallbackFor({ classification: { roleCandidates: ['ranged'], commonEligibility: 'not_common_eligible' } } as never)).toBe('enemy.gunTower');
    expect(fallbackFor({ classification: { roleCandidates: ['boss'], commonEligibility: 'not_common_eligible' } } as never)).toBe('enemy.witch');
  });
});
