// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { AssetManifestLoader } from '../../src/client/assets/assetManifestLoader';
import { PRESENTATION_ASSET_CATALOG } from '../../src/generated/presentationContent.generated';
import { assertResolvableAssetId, isBuiltInAssetId, isProjectAssetId, resolvableAssetIds } from '../../src/shared/assetCatalog';

describe('project asset catalog', () => {
  it('classifies built-in vs project ids', () => {
    expect(isBuiltInAssetId('playerTank.chassis')).toBe(true);
    expect(isProjectAssetId('scene.menuTank', PRESENTATION_ASSET_CATALOG)).toBe(true);
    expect(resolvableAssetIds(PRESENTATION_ASSET_CATALOG)).toContain('scene.menuTank');
    expect(() => assertResolvableAssetId('unknown.id', PRESENTATION_ASSET_CATALOG)).toThrow();
  });

  it('manifest loader accepts registered project asset entries', async () => {
    const loader = new AssetManifestLoader(async () => ({
      ok: true,
      json: async () => ({
        assets: [
          { id: 'scene.menuTank', category: 'model', file: '/assets/models/menu-tank.glb', transform: { scale: 1.2 } },
          { id: 'totally.unknown', category: 'model' },
        ],
      }),
    }));
    const result = await loader.load('/assets/manifest.json', PRESENTATION_ASSET_CATALOG);
    expect(result.loaded).toBe(true);
    expect(result.entries.map((e) => e.id)).toContain('scene.menuTank');
    expect(result.entries.map((e) => e.id)).not.toContain('totally.unknown');
    expect(result.entries[0].transform?.scale).toBe(1.2);
  });

  it('missing manifest still yields empty entries (fallback path)', async () => {
    const loader = new AssetManifestLoader(async () => ({ ok: false, json: async () => ({}) }));
    const result = await loader.load();
    expect(result.entries).toEqual([]);
    expect(result.loaded).toBe(false);
  });
});
