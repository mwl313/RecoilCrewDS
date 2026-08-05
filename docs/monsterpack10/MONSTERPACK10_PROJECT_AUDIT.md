# Monster Pack 10 — Project Audit

Date: 2026-08-05. Branch: `models-added` (contains Progression08 hardening).

## Input artifact

- ZIP: `local-imports/monsterpack09/Ultimate monster pack - Horde Ready.zip`
- Size: 163,448,290 bytes; SHA-256 `CD7D01BAE2F6F7177570DBBC8960E7BFE59B0BCE5D09CA9FB5F98AC7688132F8`
- Entries: 706 (includes the single wrapper directory
  `Ultimate monster pack - Horde Ready/`).

## Asset pipeline

### Registration

`content/assets/project.json` is the native project asset catalog. It is
validated by `assetCatalogDefinitionSchema`, merged by
`scripts/generate-presentation-content.ts` into
`src/generated/presentationContent.generated.ts`
(`PRESENTATION_ASSET_CATALOG`), and consumed by `AssetService`.

The schema (`src/shared/presentation/schemas.ts`) supports:

```text
id, kind(model/image/...), file, fallbackAssetId, namespace(custom/scene/
environment/ui), replacesBuiltIn, defaultTransform, materialOverrides,
sockets, collider, tags, thumbnail, lodRefs, optional
```

`src/shared/assetCatalog.ts` asserts resolvability against built-ins +
project entries. Built-ins come from `src/shared/assetRegistry.ts`
(`REQUIRED_ASSET_IDS`).

### Loading

`AssetService.load()`:

1. loads `/assets/manifest.json` (runtime manifest, additive metadata);
2. registers manifest model files + all project model files;
3. **preloads every project model with a `file`, plus every fallback**;
4. exposes synchronous `model(id)`, `modelAsset(id)`,
   `createModelInstance(id, {cloneMaterials})`.

This indiscriminate preload is the reason stage-selective loading is
required before registering 90 new models (Section 13 of the prompt).
`ModelProvider.getModelAsset(id)` is already async with a shared promise
cache, so lazy loading is architecturally available.

`FallbackAssetFactory` provides procedural fallbacks for every required
asset id; `AssetInstanceFactory.resolvePrototype` falls back to a project
asset's `fallbackAssetId` when the file is absent/not loaded — a project
asset registered as `optional` with no eager preload safely resolves to its
fallback until explicitly preloaded.

### Instancing and animation

- `AssetInstanceFactory.createModelInstance` uses `SkeletonUtils.clone` for
  skinned models (`src/client/animation/animatedModelInstanceFactory.ts`).
- `EnemyAnimationController` owns per-instance mixers, semantic role
  resolution, cross-fades, death lock, one-shots, and cleanup.
- `resolveEnemyPresentation` resolves `presentationProfileId` →
  near/far/aggregate asset ids, animation profile, LOD policy, shadow
  policy.
- `EntityViewFactory.applyPresentationTier` swaps near ↔ far rigid models
  per LOD tier without duplicating models.
- `InstancedEnemyRenderer` (fodder only, `scrapBug`) provides a bounded
  per-archetype InstancedMesh batch host.
- `HordeSectorAggregator` (Coreloop 06 M10) merges tier-3 enemies into
  sector records on the authority; the client currently does not render
  sector records as aggregate meshes.

## Animation 07 status

Implemented and green (13 files / 75 tests). Native content:

```text
content/enemy-animation-profiles/   (semantic role → clip maps)
content/enemy-presentation-profiles/ (near/far/aggregate + policies)
content/animation-lod-policies/      (defaultHorde, hero)
content/animation-shadow-policies/   (defaultHorde, hero)
```

Schema supports `clips`, `fallbacks`, `stateMap`, `locomotion`,
`transitions`, `playback`, `presentationEvents`, `rootMotion: false`.
Generation: `scripts/generate-enemy-animation-content.ts` →
`src/generated/enemyAnimationContent.generated.ts`, with
`animationContentValidation.ts` cross-checks (clip existence, fallback
cycles, resolvable asset ids, enemy presentation references).

## Enemy content

`content/enemies/*.json` defines gameplay enemy definitions. They carry
`presentationId` (not `presentationProfileId`) — Animation 07 generation
derives legacy type→profile mappings from these files. Existing definitions:
scrapBug, scrapBugHorde, rammer, gunTower, lootTruck, testHound.

## Preview tools

- `tools/enemy-animation-preview/` — production-loaders gallery: profile
  dropdown, semantic roles, near/far variant, shadows, hit flash, LOD
  preview, spawn copies, telemetry readout.
- `tools/presentation-preview/` and `tools/maplab/` — presentation/map
  previews.

## Gaps for Monster Pack 10

1. No importer for the standalone pack (staging, hashes, ownership).
2. `AssetService` preloads all project models at startup (needs
   stage-selective preload).
3. No art-roster content category.
4. No aggregate-asset consumption in the far-sector presentation path.
5. No Quaternius profiles/content.
6. No monster-pack preview gallery entry point.
