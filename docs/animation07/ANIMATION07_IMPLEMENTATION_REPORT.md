# Animation07 — Implementation Report

Canonical branch: `combat-rework`. All animation work landed on this branch
in reviewable milestone commits.

## 1. Code audit

See `ANIMATION07_CODE_AUDIT.md`. Key findings: GLB clips were discarded,
skinned meshes were not detected, all clones shared materials, model
selection used a hardcoded type switch, and no animation content existed.

## 2. Baseline command results

See `ANIMATION07_BASELINE_REPORT.md` — all pre-change gates passed
(tsc, generators, build, 74 vitest files / 623 tests, demo golden, coreloop,
horde, netcode, presentation, maplab).

## 3. Files added / modified / deleted

Added:

```text
src/shared/animation/ (roles, types, schemas, cues, validation)
src/client/animation/ (controller, resolver, instance, clip resolver, LOD,
  telemetry, cleanup, presentation resolver, model instance factory)
src/client/assets/loadedModelAsset.ts
scripts/generate-enemy-animation-content.ts
scripts/validate-enemy-animations.ts
scripts/benchmark-enemy-animation.ts
tools/enemy-animation-preview/
content/enemy-presentation-profiles/ (13)
content/enemy-animation-profiles/ (10)
content/animation-lod-policies/ (2)
content/animation-shadow-policies/ (2)
src/generated/enemyAnimationContent.generated.ts
tests/animation/ (10 files)
docs/animation07/ (this report + guides)
```

Modified: `ModelProvider`, `AssetService`, `AssetInstanceFactory`,
`EntityViewFactory`, `EntityViewRegistry`, `NetworkStatePresenter`,
`GameClient`, `QualityManager` deps, `EnemyState`, enemy schema/content,
asset registry/catalog, horde protocol/replication, package scripts, tsconfig,
existing guides, README.

Deleted: none.

## 4. Loaded-model asset changes

`LoadedModelAsset { id, scene, animations, hasSkinnedMesh }` is the immutable
cached asset. `AssetService.model(id)` still returns `THREE.Object3D`;
`modelAsset(id)` and `createModelInstance(id)` are additive. Manifest model
files are preloaded (fixed placeholder project assets). Failed GLBs and
missing files resolve to registered procedural fallbacks.

## 5. Safe clone behavior

Skinned models clone through `SkeletonUtils.clone` (independent bones);
rigid models use `Object3D.clone(true)`. Geometry and clips are shared;
materials are cloned only when needed (animated enemy rigs, manifest
overrides) and marked `userData.ownedByInstance`.

## 6. Content schemas and generated output

Presentation/animation/LOD/shadow profiles are Zod-validated by the focused
generator invoked from `generate:presentation-content`. Cross-references,
duplicate ids, and fallback cycles are rejected. Output is a plain-data
typed bundle with O(1) maps, legacy type mapping, and a deterministic hash
parity test.

## 7. Legacy compatibility

Existing enemy JSON keeps `presentationId`; the generator derives
`enemyPresentation.legacy.*` profiles per type. Resolution order:
`presentationProfileId` → legacy profile → registered fallback + one
diagnostic warning. Demo golden, simulation, and content hashes are
unchanged.

## 8. Animation state selection

Priority: death > authoritative action cue > knockback/airborne > stagger >
hit flash > explicit stateMap > telegraphing attack > run > walk > idle.
No family-specific branches.

## 9. Action-cue architecture

`EnemyActionCue { sequence, actionId, startedAtTick, durationTicks }` is
optional on `EnemyState`. Duplicates are ignored; late cues align to
authoritative elapsed time (reconnect reconstruction); cues map to roles
through content and never apply damage. Horde materialize records carry a
presentation profile index (protocol v5).

## 10. LOD and mixer budgets

`AnimationLodManager` selects hero/near/mid/far/aggregate with enter/leave
hysteresis, stable allocations (stability bonus), and per-policy near/mid
mixer caps. Bosses/elites always receive hero tier. Mid mixers update at
reduced rate with real accumulated elapsed time. Low graphics quality
demotes common enemies earlier (presentation only).

## 11. Model swapping

Near skinned model ↔ far rigid model swaps share the same root transform,
remove the old model before adding the new one, suspend/dispose the mixer on
demotion and recreate it on promotion, and expose
`FarEnemyPresentationRecord` for the future instanced horde renderer.

## 12. Material ownership

Enemy rigs clone the minimal material set; hit flash mutates only owned
clones. Cleanup disposes only `ownedByInstance` materials. Cached prototype
materials are never disposed.

## 13. Cleanup lifecycle

Removal, wave purge, reset/rematch, and LOD demotion stop actions, uncache
the root, clear maps, remove the model, and release owned materials.
Telemetry counters (`liveMixers`, `liveSkinnedRoots`, `liveRigidFarRoots`,
`ownedMaterialClones`, `animationActionCount`) prove zero growth in soak
tests and the benchmark.

## 14. Preview tool

`tools/enemy-animation-preview` uses production loaders, registries, clip
resolver, model instance factory, and controller. Features: profile/variant/
role selection, play/pause/restart, scrub, speed, loop, skeleton/bounds/
origin/ground/shadow/hit-flash toggles, movement speed, attack cue, death,
near/mid/far LOD preview, 1/10/25/50 spawn counts, and diagnostics
(triangles, meshes, materials, bones, clips, mixers, update time, draw
calls, LOD counts, warnings). See `ANIMATION07_PREVIEW_TOOL_GUIDE.md`.

## 15. Validation CLI

`npm run validate:enemy-animations` validates all registered profiles and
supplied GLBs: load, clip-name uniqueness, semantic role resolution,
root-motion tolerance, skinned/rigid form, bone/material budgets, plausible
bounds, no cameras/lights. Manual export checks are documented in
`ANIMATION07_GLTF_EXPORT_GUIDE.md`.

## 16. Benchmark results

See `ANIMATION07_PERFORMANCE_REPORT.md`. Headless run on the procedural
skinned rig: 100 near mixers update in ~0.024 ms p50; 150 mixers
(50 near + 100 mid) ~0.050 ms p50; no leaks after cleanup.

## 17. Unit / integration / E2E results

Final gate: `npm test` 87 files / 700 tests PASS (including the animation
suites); `test:animation` PASS (13 files / 75 tests);
`test:animation-preview` PASS (3 tests);
`test:demo` PASS (golden unchanged); coreloop/horde/netcode/presentation/
maplab PASS; `build:animation-preview` PASS; E2E `npm run test:e2e`
PASS — 33/33 Playwright tests (8.4 min, includes full round, rematch,
reconnect, single player restart, map lab, netcode suites).

## 18. Manual verification

Automated coverage: rigid legacy fallback, procedural skinned enemy, two
independent clones, idle/walk/run transitions, attack one-shot, hit/stagger,
knockback, death lock, missing clip fallback, missing GLB fallback, LOD
hysteresis, near→far→near swap, boss priority, 25-enemy purge, restart
cycles, duplicate/late/reconnect cues, plus the full 33-test Playwright E2E
suite (online round, rematch, reconnect, single player restart).

## 19. Known limitations

- Final Witch/Spider/Beast GLBs are not supplied; placeholders use
  procedural fallbacks and validation reports info (not errors).
- Horde materialize transports the profile index; action cues in horde mode
  remain a documented seam until new families are activated.
- Aggregate tier currently presents through the far rigid path (no
  individual hierarchy) — the instanced aggregate renderer is a future
  renderer milestone.
- Vertex influence count, texture dimensions, and unsupported compression
  are manual export checks.

## 20. Completion checklist

All 40 completion-gate items from the prompt are satisfied: profiles and
clips are content-driven, skinned/rigid/far paths behave correctly, no bone
data is networked, gameplay outcomes and the Demo golden are unchanged, and
the full test/build/validation/benchmark gates pass.
