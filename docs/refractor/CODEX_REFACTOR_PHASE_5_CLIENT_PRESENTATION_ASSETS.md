# Codex Prompt — Refactor Phase 5
## Client Coordinator Split and Complete Asset/Presentation Architecture

Prerequisite: Phase 4 complete; authoritative systems emit stable semantic state and events.

Read all authority documents and status.

# Shared governance

- Read every refactor authority document before editing.
- Read and update `REFACTOR_STATUS.md`.
- Inspect the current repository; do not assume paths are unchanged.
- Do not rewrite the game or change stacks.
- Preserve server authority, Driver prediction, Gunner prediction, independent TPS cameras, and the complete Demo loop.
- Do not start a later phase.
- Do not delete compatibility code before all callers migrate.
- Do not weaken tests.
- Run all four phase-gate commands.
- Return a truthful completion report.


## Goal

Turn `Game` into a thin client coordinator and make semantic assets/presentation definitions the real runtime path.

## Required work

1. Await `AssetService.load()` before dependent game construction.
2. Implement or complete:
   - `AssetService`
   - `AssetManifestLoader`
   - `ModelProvider`
   - `FallbackAssetFactory`
   - `AssetInstanceFactory`
   - `AssetTransformResolver`
3. Ensure custom GLB files are actually used, cached as prototypes, cloned as instances, and transformed by metadata.
4. Support socket metadata, materials/overrides where appropriate, and clear errors.
5. Gameplay must not depend on model child names.
6. Route models, VFX, audio, UI themes, icons, and camera impulses through semantic presentation definitions.
7. Keep procedural/hardcoded presentation only as registered fallback behavior.
8. Split `Game` into:
   - `RenderWorld`
   - `EntityViewRegistry`
   - `EntityViewFactory`
   - `NetworkStatePresenter`
   - `CameraManager`
   - `PredictionController`
   - `PresentationEventRouter`
   - `HudController`
   - `PipRenderer`
   - `QualityManager`
9. Keep `GameClient` as coordinator.
10. Keep prediction separate from interpolation and TPS math outside the coordinator.
11. Route authoritative semantic events into VFX/audio/HUD/camera impulses.
12. Ensure rematch, Practice swaps, event listeners, views, passes, and pooled effects reset/dispose correctly.

## Tests

- Manifest awaited
- Custom GLB resolver used
- Fallback
- Transform/socket metadata
- VFX/audio/theme definitions used
- Entity factory selected by ID/category
- No ordinary content branches in `GameClient`
- No view/pass/listener growth after rematches/swaps
- Current HUD, cameras, PIP, audio, and VFX remain functional

## Forbidden

No art redesign, removal of procedural fallbacks, TPS behavior changes, authoritative gameplay changes, or Phase 6 proof content.

## Gate/report

Run all gates. Report client split, asset flow, metadata, presentation routing, disposal, regressions, and Phase 6 prerequisites.
