import path from 'node:path';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { REQUIRED_ASSET_IDS } from '../../src/shared/assetRegistry';
import { PRESENTATION_ASSET_CATALOG } from '../../src/generated/presentationContent.generated';

const ROOT = path.resolve(path.dirname(path.dirname(__dirname)));

describe('monsterpack10 project asset registration', () => {
  const catalog = JSON.parse(
    readFileSync(path.join(ROOT, 'content', 'assets', 'project.json'), 'utf8'),
  ) as { project: Array<{ id: string; kind: string; file?: string; fallbackAssetId?: string; optional?: boolean }> };
  const quaternius = catalog.project.filter((a) => a.id.startsWith('custom.enemy.quaternius.'));

  it('registers exactly 90 quaternius model assets with unique ids', () => {
    expect(quaternius.length).toBe(90);
    expect(new Set(quaternius.map((a) => a.id)).size).toBe(90);
    expect(quaternius.every((a) => a.kind === 'model')).toBe(true);
    expect(
      quaternius.filter((a) => a.id.endsWith('.hero')).length,
    ).toBe(45);
    expect(quaternius.filter((a) => a.id.endsWith('.commonNear')).length).toBe(15);
    expect(quaternius.filter((a) => a.id.endsWith('.commonFar')).length).toBe(15);
    expect(quaternius.filter((a) => a.id.endsWith('.aggregate')).length).toBe(15);
  });

  it('every registered asset file path resolves on disk', () => {
    for (const entry of catalog.project) {
      if (!entry.file) continue;
      expect(existsSync(path.join(ROOT, 'public', entry.file.replace(/^\//, ''))), entry.file).toBe(true);
    }
  });

  it('every fallback resolves to a required asset id', () => {
    const required = new Set<string>(REQUIRED_ASSET_IDS);
    for (const entry of catalog.project) {
      if (!entry.fallbackAssetId) continue;
      expect(required.has(entry.fallbackAssetId), `${entry.id} -> ${entry.fallbackAssetId}`).toBe(true);
    }
  });

  it('all quaternius assets are optional (selective preload)', () => {
    for (const entry of catalog.project) {
      if (entry.id.startsWith('custom.enemy.quaternius.')) {
        expect(entry.optional, entry.id).toBe(true);
      }
    }
  });

  it('generated presentation catalog contains all 90 entries', () => {
    const generated = PRESENTATION_ASSET_CATALOG.project.filter((p) =>
      p.id.startsWith('custom.enemy.quaternius.'),
    );
    expect(generated.length).toBe(90);
  });
});
