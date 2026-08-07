import { describe, expect, it } from 'vitest';
import { resolveGameplayPreloadAssetIds } from '../src/client/assets/gameplayPreload';
import { loadContentPackFromFilesystem } from '../src/shared/content/contentLoader';
import { createUrbanLayout, urbanAssetIds } from '../src/shared/mapgen/urbanLayout';
import { resolveSelectedMonsterRun } from '../src/shared/monsters/monsterPreload';

const pack = loadContentPackFromFilesystem('content');

describe('gameplay asset preload', () => {
  it('includes every production urban model before multiplayer assetReady', () => {
    const run = resolveSelectedMonsterRun(pack, 'fresh-multiplayer-client', 'mode.mainStage');
    expect(run).not.toBeNull();

    const ids = resolveGameplayPreloadAssetIds(pack, 'mode.mainStage', run);
    const requiredUrbanIds = urbanAssetIds(createUrbanLayout('urban400'));

    expect(ids).toContain('environment.urban.zombie.streetStraight');
    for (const id of requiredUrbanIds) expect(ids).toContain(id);
  });

  it('deduplicates and sorts the combined environment and monster preload set', () => {
    const run = resolveSelectedMonsterRun(pack, 'stable-preload-order', 'mode.mainStage');
    const ids = resolveGameplayPreloadAssetIds(pack, 'mode.mainStage', run);

    expect(ids).toEqual([...new Set(ids)].sort());
  });
});
