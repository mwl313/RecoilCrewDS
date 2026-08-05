# Monster Pack 10 — Stage Roster Guide

Art rosters are data-driven:

```text
content/enemy-art-rosters/<id>.json
```

Schema:

```ts
interface EnemyArtRosterDefinition {
  id: string;
  commonPresentationProfileIds: string[];
  elitePresentationProfileIds: string[];
  bossPresentationProfileIds: string[];
  preloadAssetIds: string[];
}
```

The integration preview roster is:

```text
enemyArtRoster.quaternius.integrationPreview
```

It uses Mushnub/Wizard/Orc Enemy/Armabee/Glub for common, Blue Demon and
Mushroom King for elite presentation, and Dragon Evolved for boss
presentation. It is **not** activated in release modes.

## Adding a model to a stage roster

1. Look up the slug in `generated/NATIVE_CONTENT_INDEX.json`.
2. Add the hero profile id (`enemyPresentation.quaternius.<slug>.hero`) to
   the elite/boss list, or the common profile id to the common list.
3. Add the asset ids you want preloaded to `preloadAssetIds` (hero only, or
   hero + commonNear/commonFar/aggregate for common-ready models).
4. Call `AssetService.preloadModels(preloadAssetIds)` before spawning; all
   other heroes stay lazy and are never downloaded at startup.

## Selective preloading

`AssetService.load()` preloads built-ins, required project assets, and
file-less placeholder fallbacks only. File-backed optional assets
(all Quaternius GLBs) load on demand through `preloadModels()`, with
telemetry (`registeredModelCount`, `requestedPreloadCount`,
`loadedModelCount`, `loadedGlbBytes`, `loadDurationMs`, `cacheHits`).
