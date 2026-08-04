# Animation07 — Code Audit

Canonical branch: `combat-rework` (HEAD `4a140fe`).

This audit records the exact repository state that the rigged enemy animation
system builds on. It was performed before any animation07 code changes.

---

## 1. Asset pipeline

### `src/client/assets/types.ts`

- Defines `TankRig` and presentation spec types (`VfxSpec`, `UiTheme`,
  `AudioSpec`). No model asset type exists yet.

### `src/client/assets/modelProvider.ts`

- `GltfLoaderLike.load(url, onLoad, onProgress?, onError?)` accepts
  `gltf: { scene: THREE.Object3D }` only. `gltf.animations` is discarded.
- `ModelProvider` caches `THREE.Object3D` prototypes in
  `private readonly prototypes = new Map<string, THREE.Object3D>()`.
- `loading: Map<string, Promise<THREE.Object3D>>` deduplicates concurrent
  loads.
- `registerFile(id, file)` deletes the prototype and in-flight entry.
- `getPrototype(id)` returns the cached prototype or starts a load.
- `load(id)` uses `fallbacks.model(id)` when no file is registered, and when
  `loader.load` errors.
- Fallback and GLB results are both plain scenes; no clip metadata is kept.

### `src/client/assets/fallbackAssetFactory.ts`

- `FallbackAssetFactory` registers procedural models under built-in ids:
  `playerTank.*`, `enemy.scrapBug`, `enemy.rammer`, `enemy.gunTower`,
  `enemy.lootTruck`, pickups, props, arena pieces.
- Every built-in id has a registered factory; `model(id)` throws for unknown
  ids.
- Materials are created fresh inside each factory invocation; the cached
  prototype therefore owns one material set per semantic id.
- VFX/UI/audio fallbacks are registered the same way.

### `src/client/assets/assetInstanceFactory.ts`

- `AssetInstanceFactory.instanceModel(id)`:
  - resolves project placeholder policy (`fallbackAssetId`),
  - `const clone = proto.clone(true)` (rigid clone; materials are shared by
    reference),
  - applies manifest transform/material overrides via
    `AssetTransformResolver.apply`, which mutates material properties on the
    cloned instance — and because `clone(true)` shares material objects, this
    mutates the cached prototype material set.
- `preloadModels(ids)` awaits `ModelProvider.getPrototype` for each id.
- `buildTankRig` composes chassis/turret/barrel instances.

### `src/client/assets/assetTransformResolver.ts`

- `socketChildNames` maps `enemy.gunTower -> towerHead`.
- `apply` mutates instance transform and material properties in place.
- `socketNameFor(id)` returns the child name for presentation sockets.

### `src/client/assets/assetManifestLoader.ts`

- Loads `/assets/manifest.json`; entries validate against built-in ids or the
  project asset catalog. Unknown ids are skipped with a warning.
- Manifest entries carry optional `transform` and `materials` metadata.
- Missing/unreadable manifest returns `{ entries: [], loaded: false }`.

### `src/client/assets/assetService.ts`

- `AssetService.load()`:
  - loads the manifest,
  - registers manifest model files,
  - registers project catalog models (`PRESENTATION_ASSET_CATALOG.project`
    where `kind === 'model'`),
  - preloads presentation models + project files/fallbacks,
  - returns a synchronous-lookup service.
- `model(id): THREE.Object3D` delegates to `instances.instanceModel(id)`.
- `assetUrl(id)` resolves a project asset file URL (or null).

### `src/shared/assetRegistry.ts` / `src/shared/assetCatalog.ts`

- `REQUIRED_ASSET_IDS` is the built-in semantic id allowlist.
- `isValidAssetId`, `isProjectAssetId`, `resolveProjectAsset`,
  `assertResolvableAssetId`, `resolvableAssetIds` define the client asset
  resolution vocabulary.
- Project ids are registered in `content/assets/project.json` and generated
  into `src/generated/presentationContent.generated.ts`.

---

## 2. Enemy presentation

### `src/client/app/entityViewFactory.ts`

- `createEnemyRig(e, scene)`:
  - `enemyModelId(type)` is a hardcoded switch: scrapBug/rammer/gunTower/
    lootTruck → built-in model ids.
  - clones `assets.model(id).clone(true)`, adds to a `THREE.Group`, adds to
    the scene.
  - collects `MeshStandardMaterial`s by traversal (shared material objects).
  - gunTower socket resolution via `transforms.socketNameFor`.
  - rammer cone and gunTower ring telegraphs; `telegraphMat` created per rig.
- `createPickupRig`, `createShellRig`, `makeMarker` are unrelated presentation
  builders.

### `src/client/app/entityViewRegistry.ts`

- `EnemyRig` today:
  `group, model, head?, materials, telegraph, telegraphMat, deadT`.
- `enemyRigs: Map<number, EnemyRig>` plus pickup/shell rigs, instanced fodder
  (`InstancedEnemyRenderer` capacity 512), barrel meshes, truck rig/marker,
  shield mesh.
- `createEnemy` → factory; `reset()` removes groups/telegraphs and clears all
  maps; `removeEnemy` removes group + telegraph.
- No mixer/action/skeleton cleanup exists.

### `src/client/app/networkStatePresenter.ts`

- `syncWorld(frame, renderTank, dt)` is the per-frame entity sync:
  - fodder (`scrapBug`) → `registry.upsertFodder`,
  - unique rigs → `registry.createEnemy` on first sight; transforms copied;
    `head.rotation.y = aimYaw - yaw`;
    `deadT` accumulates; group hidden after 1.2 s;
  - hit flash mutates `rig.materials` emissive intensity/color every frame
    (shared materials across clones → cross-enemy flash leak today);
  - telegraph visibility/opacity for gunTower/rammer;
  - removes unseen rigs via `registry.removeEnemy`.
- Network state arrives through `setSnapshot`/`computeRemote`; Single Player
  uses the same presenter path with `fillFromDiscrete`.

### `src/client/enemies/instancedEnemyRenderer.ts`

- `InstancedEnemyRenderer` manages a bounded slot pool for `scrapBug` fodder.
- `createScrapBugInstancedHost` clones the scrapBug prototype, clones each
  mesh material once, and writes instance matrices/colors per enemy.
- Far-future instanced horde renderer has a clean consumer seam here.

---

## 3. Shared enemy state and simulation

### `src/shared/types.ts`

- `EnemyState` carries `id, type, defId?, x/y/z, yaw, hp/maxHp, state, stateT,
  aimYaw, speed, alive, telegraph, flash, spawnT, hitCd?, shotsFired?,
  impulseVx/Vy/Vz, impulseGrounded?, lastImpulseSource?, lastImpulseT?,
  ownership?`.
- No animation clip names, no presentation profile id, no action cue.

### `src/shared/enemies/enemySystem.ts`

- `ENEMY_TYPE_TO_ID` maps wire type → definition id.
- `spawnEnemyDef` creates full `EnemyState`; sets impulse fields, ownership.
- `update` runs behaviors, impulse controller, LOD (`tierFor`), prunes dead
  enemies after 2.5 s, purges runtimes.
- `purge(predicate)` removes enemies directly (cohort purge).

### `src/shared/enemies/enemyRuntimeState.ts`

- Per-enemy scratch: movement direction, speed, simulation LOD tier
  (`0|1|2|3`), update scheduling, `phaseOffset` (`(id % 16) / 16`).

### `src/shared/enemies/enemyImpulseController.ts`

- Authoritative knockback: impulse velocities, ground/air drag, gravity,
  airborne state, terrain guards, arena bounds.
- `isAirborne(e)` is the presentation hook for knockback animation.

### `src/shared/content/schemas/enemy.ts`

- `enemySchema` is a discriminated union on `type` (`scrapBug | rammer |
  gunTower | lootTruck`).
- `presentationId?: string` exists; no `presentationProfileId`.

---

## 4. Content pipeline

### `scripts/generate-presentation-content.ts`

- Loads `content/scenes|hud|scene-flows|themes|assets`, validates with Zod,
  cross-checks asset references, writes
  `src/generated/presentationContent.generated.ts`.
- Project asset catalog merged from `content/assets/*.json`.

### `scripts/generate-content-pack.ts`

- Loads the full server ContentPack (categories from `CONTENT_CATEGORIES`),
  writes `src/generated/contentPack.generated.ts` for the browser.
- ContentPack categories do not include enemy presentation/animation
  profiles yet.

### `src/shared/content/`

- `contentPack.ts`: `CONTENT_CATEGORIES`, `CategoryRegistries`, `ContentPack`
  (frozen maps, O(1) lookup).
- `contentLoader.ts`: manifest-driven loading, Zod validation per category,
  `ReferenceValidator` cross-checks, deterministic hash.
- `definitionRegistry.ts`: frozen registries, duplicate rejection.
- `referenceValidator.ts`: cross-file reference/behavior/stat/asset checks.

### `content/`

- `manifest.json` lists every gameplay category file.
- `assets/project.json` currently contains only `scene.menuTank`.
- `enemies/*.json` use `presentationId` (e.g. `enemy.scrapBug`).
- `presentation/demoScoreAttack.json` lists built-in model/vfx/ui/audio ids.

---

## 5. Graphics quality

### `src/client/app/qualityManager.ts`

- `QualityManager` samples FPS and flips `quality: 'high' | 'low'`.
- Affects pixel ratio, shadows, bloom. No animation LOD coupling yet.

### `src/client/app/renderWorld.ts`

- WebGLRenderer + EffectComposer + bloom; shadow map enabled by default.
- `scene.fog` 100–150; camera render path.

---

## 6. Network replication

### `src/shared/net/protocol.ts`

- `PROTOCOL_VERSION = 4`; snapshot carries full `MatchState`; horde block is
  optional (`HordeSnapshotBlock`).

### `src/shared/net/horde/hordeProtocol.ts`

- `HordeSnapshotBlock` materialize records are 8 numbers
  `[id, typeIndex, xq, zq, yawq, hpq, maxHpq, flags]`.
- Deltas are 6 numbers; flags cover alive/telegraph/flash.
- No presentation profile index and no action cue wire fields.

### `src/shared/net/horde/hordeReplication.ts`

- `HordeReplicationTracker` (server) rate-limits per-tier deltas; death and
  despawn are immediate.
- `HordeReplicationClient` (client) materializes/deletes/dead-ends enemies.

---

## 7. Tests and tooling

- `tests/assetService.test.ts` injects a fake `GltfLoaderFactory` whose
  `onLoad` receives `{ scene }` only — the only GLTF loader mock.
- `tests/presentation/assets.test.ts` validates catalog classification and
  manifest loading.
- `tests/horde/instancedEnemyRenderer.test.ts`, `tests/horde/*` cover fodder
  instancing, LOD, sectors, waves.
- `tools/presentation-preview/` consumes generated presentation content +
  `AssetService`; `tools/maplab/` is the map editor.
- `scripts/benchmark-enemies.ts` is the existing authoritative benchmark.

No animation code, `AnimationMixer`, `SkeletonUtils`, or clip utilities exist
anywhere in the repository at audit time.

---

## 8. Audit conclusions

1. GLB clips are dropped at the loader boundary.
2. Skinned meshes are not detected; all clones are rigid `clone(true)`.
3. Material overrides and hit flash mutate shared prototype materials.
4. Model selection uses a hardcoded type switch in `EntityViewFactory`.
5. No content category exists for presentation/animation profiles.
6. No mixer budget, LOD selection for animation, or far-model swap exists.
7. `EnemyState` can carry additive presentation fields without breaking the
   wire (full snapshots) and with an intentional horde protocol bump
   (materialize records).
8. Existing gameplay, Demo golden, and horde simulation must be preserved;
   the animation system must be presentation-only.
