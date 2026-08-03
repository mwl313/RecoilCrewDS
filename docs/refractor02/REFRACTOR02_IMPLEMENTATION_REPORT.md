# Refractor 02 — Implementation Report
## Data-Driven Scene, HUD, and Asset Authoring Foundation

**Branch:** `map-lab` | **Plan:** `docs/refractor02/REFRACTOR02_IMPLEMENTATION_PLAN.md`

## 1. Current-state audit

All ten non-gameplay screens and the gameplay HUD were hardcoded in
`src/client/hud.ts` (30+ cached DOM fields, per-screen innerHTML, direct
getElementById wiring). Flow lived in `src/client/main.ts` with a thin
`HudController` forwarding state. Assets were a fixed compile-time set with
an optional manifest; unknown ids were skipped. The full inventory is in
the implementation plan.

## 2. Final architecture

```text
content/{scenes,hud,scene-flows,themes,assets}
  → Zod schemas + cross-reference validation (scripts/generate-presentation-content.ts)
  → src/generated/presentationContent.generated.ts
  → AppFlowController (flow + scene selection + safe actions)
      → SceneRuntime (component tree, bindings, transitions, disposal)
  → HudRuntime (content HUD + HudProjector view model)
  → PresentationWorld (hybrid 3D, disposed before gameplay)
  → AssetCatalog (built-ins + project assets)
```

## 3. Content schemas

`src/shared/presentation/schemas.ts` defines SceneDefinition, UiNodeDefinition,
SceneEntityDefinition, SceneFlowDefinition, HudDefinition, ThemeDefinition,
ProjectAssetDefinition, BindingDefinition, ActionBindingDefinition,
TransitionDefinition, PreviewStateDefinition with id-prefix, uniqueness,
depth/node-count, component/action/transform/binding-path/theme/asset rules.

## 4. Component registries

`UiComponentRegistry` + `registerDefaultUiComponents` register 23 UI
component types (generic + HUD-specialized) with Zod schemas and inspector
descriptors. `createUiComponent` is registry-driven (no central switch).

## 5. Generated bundle

`npm run generate:presentation-content` produces the client-safe module with
a source hash and stale-generation test; wired into `build:client`.

## 6. SceneRuntime

Builds trees once, caches binding handles, attaches allowlisted actions,
plays enter/exit transitions, supports repeaters with item bindings, and
disposes every node/listener on unload. Scene runtimes are cached per scene
(screens are built once, like the old behavior).

## 7. AppFlowController

Owns flow state, scene selection, network-driven transitions, HUD/game
visibility, theme, results/error/countdown contexts, practice entry, and
the hybrid presentation world lifecycle. `Hud` is now a small facade.

## 8. Safe actions

14 allowlisted action ids (`app.enter` … `app.copyRoomCode`) registered in
code; scene JSON references ids only. No expressions or eval.

## 9. HudViewModel + projector

`HudProjector.project(state, context)` produces a typed view model with all
fields documented; content bindings may only read allowlisted paths.

## 10. Binding runtime

`bindingRuntime.ts` compiles path accessors once, supports
text/value/visible/class/style/attribute targets and 8 transforms, caches
last applied values, and skips unchanged DOM writes.

## 11. HUD component migration

`content/hud/gameplay.json` reproduces the full HUD (role chip, connection,
timer, score, combo, integrity, jackpot, charge, speed, dash, prompts,
crosshair/cooldown arc, PIP, FPS, popups, pause). `HudRuntime` applies the
projected view model; transient effects are event-driven.

## 12. Asset catalog migration

`src/shared/assetCatalog.ts` + `content/assets/{builtins,project}.json`.
`AssetManifestLoader` accepts registered project ids; `AssetService` exposes
`projectAsset()` and preloads custom model files. Built-in fallbacks are
untouched.

## 13. Hybrid presentation world

`PresentationWorld` renders scene entities (model/cameras/lights/rotate/
float/audio metadata) with its own renderer, disposed on scene leave —
documented decision: one extra renderer only while a hybrid menu is
visible; never concurrent with gameplay.

## 14. Preview tool

`tools/presentation-preview/` (separate Vite app): scene/HUD selectors,
preview states, role/theme selectors, resolution presets, component
hierarchy, binding/asset diagnostics, hybrid toggle, `?stable=1` mode.

## 15. Files added/modified

Added: presentation schemas/runtime modules, assetCatalog, generated
content, content/{scenes,hud,scene-flows,themes,assets}, generator script,
preview tool, tests/presentation, guides/report. Modified: hud.ts (facade),
main.ts (flow + hybrid factory), assetService/assetManifestLoader,
styles.css (scene transitions), package.json (commands), docs.

## 16. Compatibility paths removed

`Hud.makeScreens` and all screen HTML/cached screen fields removed; the
legacy HUD construction path was replaced by the content HUD runtime; the
old screen-map ownership is gone.

## 17. Unit test results

```text
npm test                411/411 PASS (40 files)
npm run test:presentation 24/24 PASS (4 files)
npm run test:maplab      32/32  PASS
```

## 18. E2E results

```text
npm run test:e2e  23/23 PASS (two-browser full flow incl. rematch)
```

## 19. Performance results

- HUD bindings cache last values; no DOM write per frame for unchanged
  fields (unit-tested node count stable across updates).
- Scenes are built once and reused; repeaters re-render only on signature
  change.
- Hybrid world is disposed on scene leave (no retained renderer).

## 20. Bundle separation results

- `dist/` game chunks contain no preview markers
  (`tests/presentation/bundleSeparation.test.ts`).
- Preview tool is a separate entry (`dist-presentation-preview/`).

## 21. Remaining limitations

- Repeater item jobs are scoped and disposed on rebuild (audit P1-2); the
  remaining cost is bounded by list size.
- `audioSource`, `particleEmitter`, `billboard`, `postProcessPreset`, and
  `lookAt` are explicitly reserved/unsupported scene components (warned at
  runtime, documented for the editor); `lookAt` has a basic target
  implementation.
- The HUD projector handles the current HUD surface; new fields require a
  typed projector extension (by design).
- While the pointer is locked, DOM HUD buttons are unreachable by the
  browser (input routes to the canvas); players pause with Escape, and the
  pause button is clickable once the lock is released. The button fires
  `app.pause` either way.

## 21a. Verification-audit hardening pass (2026-08-04)

The independent audit (`REFRACTOR02_VERIFICATION_AUDIT.md`) found six
critical and six high-priority defects. All were fixed:

- P0-1 hybrid worlds now `start()` (and dispose) exactly once per show,
  owned by the flow lifecycle.
- P0-2 `PresentationWorld` no longer disposes geometry/materials cloned from
  `AssetService` prototypes (shared gameplay resources stay owned by the
  asset service).
- P0-3 project models are registered before the preload pass; the
  `scene.menuTank` hardcode was removed in favor of catalog-driven
  `fallbackAssetId` + project transform metadata.
- P0-4 `SceneRuntime` constructs nodes through `UiComponentRegistry`;
  every default registration now carries a component-specific Zod schema
  (no `z.any()`).
- P0-5 HUD bindings use the real view model paths (`match.comboHot`,
  `gunner.cooldownRatio`, `gunner.chargeMax`); generator + tests reject any
  binding/prop source that does not resolve on the empty view model.
- P0-6 `app.pause` added to the action schema/registry/HUD document/handlers;
  the gameplay pause button opens the overlay (tested in e2e).
- P1-1 flow ownership documented: `main.ts` owns application state;
  `AppFlowController` renamed to `SceneFlowPresenter` and scoped to
  presentation.
- P1-2 repeater items get scoped ids (`template::index`) and stale subtrees
  (instances, jobs, listeners) are disposed before rebuild.
- P1-3 nested scene entities mount under their parent group (transforms
  compose).
- P1-4 cached scenes replay enter/leave transitions per show.
- P1-5 reserved scene components are explicit (warned, not silently no-op);
  UI `image` nodes resolve `assetId` → URL through the asset service.
- P1-6 HUD denominators (`integrityMax`, cannon cooldown, jackpot charge
  time) come from replicated movement/weapon rules with BASE_CONFIG
  fallbacks; the server movement block now carries `weapon`.

Regression coverage: `tests/presentation/hardening.test.ts` (10 tests) +
extended `tests/presentation/schemas.test.ts` + the e2e pause-button flow.
Full results in `docs/planning/BUILD_STATUS.md`.

## 22. Recommended Studio editor next phase

Build on the inspector metadata: a drag-and-drop scene tree editor, token
pick from themes, binding pickers fed by the view-model path allowlists,
preview-state editing, and `maplab:apply`-style safe content apply for
scene/HUD/asset documents.
