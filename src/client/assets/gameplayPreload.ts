import type { ContentPack } from '../../shared/content/contentPack';
import { resolveClientMapBundle } from '../../shared/mapgen/arenaSession';
import { createUrbanLayout, urbanAssetIds } from '../../shared/mapgen/urbanLayout';
import { resolveSelectedPreloadAssetIds } from '../../shared/monsters/monsterPreload';
import type { SelectedMonsterRun } from '../../shared/monsters/monsterRunSelection';

/**
 * Resolve every lazy model needed before a multiplayer countdown may begin.
 *
 * Monster models are selected per authoritative run. Environment models are
 * selected from the mode's primary and fallback map profiles so a fresh client
 * can synchronously construct either arena after acknowledging assetReady.
 */
export function resolveGameplayPreloadAssetIds(
  pack: ContentPack,
  modeId: string,
  run: SelectedMonsterRun | null,
): string[] {
  const ids = new Set(run ? resolveSelectedPreloadAssetIds(pack, run) : []);
  const mapId = pack.getMode(modeId).mapProfileId;
  const { bundle, fallbackBundle } = resolveClientMapBundle(mapId);

  for (const candidate of new Set([bundle, fallbackBundle])) {
    const prototypeId = candidate.map.urbanPrototypeId;
    if (!prototypeId) continue;
    for (const id of urbanAssetIds(createUrbanLayout(prototypeId))) ids.add(id);
  }

  return [...ids].sort();
}
