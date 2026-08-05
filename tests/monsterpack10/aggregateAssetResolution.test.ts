import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRESENTATION_ASSET_CATALOG } from '../../src/generated/presentationContent.generated';
import { ENEMY_ANIMATION_CONTENT } from '../../src/generated/enemyAnimationContent.generated';
import { readGlbSummary } from '../../scripts/monsterpack10/glbSummary';

const ROOT = path.resolve(path.dirname(path.dirname(__dirname)));
const STAGING = path.join(ROOT, 'build', 'monsterpack10-import', 'Ultimate monster pack - Horde Ready');
const HAS_STAGING = existsSync(STAGING);

describe('monsterpack10 aggregate asset resolution', () => {
  const project = new Map(PRESENTATION_ASSET_CATALOG.project.map((p) => [p.id, p]));

  it('every common profile resolves an aggregate asset', () => {
    const commons = Object.values(ENEMY_ANIMATION_CONTENT.presentationProfiles).filter(
      (p) => p.id.startsWith('enemyPresentation.quaternius.') && p.id.endsWith('.common'),
    );
    expect(commons.length).toBe(15);
    for (const profile of commons) {
      expect(profile.aggregateModelAssetId, profile.id).toBeTruthy();
      expect(project.has(profile.aggregateModelAssetId!), profile.aggregateModelAssetId ?? '').toBe(true);
    }
  });

  it('aggregate GLBs are rigid and hero GLBs are skinned', () => {
    if (!HAS_STAGING) return;
    const aggregateIds = PRESENTATION_ASSET_CATALOG.project
      .filter((p) => p.id.startsWith('custom.enemy.quaternius.') && p.id.endsWith('.aggregate'))
      .map((p) => p.id);
    const heroIds = PRESENTATION_ASSET_CATALOG.project
      .filter((p) => p.id.startsWith('custom.enemy.quaternius.') && p.id.endsWith('.hero'))
      .map((p) => p.id);
    for (const id of aggregateIds) {
      const file = project.get(id)!.file!;
      const summary = readGlbSummary(readFileSync(path.join(ROOT, 'public', file.replace(/^\//, ''))));
      expect(summary.hasSkinnedMesh, id).toBe(false);
      expect(summary.hasAnimation, id).toBe(false);
    }
    for (const id of heroIds) {
      const file = project.get(id)!.file!;
      const summary = readGlbSummary(readFileSync(path.join(ROOT, 'public', file.replace(/^\//, ''))));
      expect(summary.hasSkinnedMesh, id).toBe(true);
    }
  });
});
