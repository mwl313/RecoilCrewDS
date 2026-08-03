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

- Repeater item jobs accumulate per render (bounded by re-renders; results
  scenes re-render rarely).
- `audioSource`, `particleEmitter`, `billboard`, and `postProcessPreset`
  scene components are metadata/no-op in this milestone.
- The HUD projector handles the current HUD surface; new fields require a
  typed projector extension (by design).
- `test:loop` is seed-flaky for the headless bot (one of three runs scored
  85 / JACKPOT 0); two of three runs passed (1020/525/1200, JACKPOT ≥1).

## 22. Recommended Studio editor next phase

Build on the inspector metadata: a drag-and-drop scene tree editor, token
pick from themes, binding pickers fed by the view-model path allowlists,
preview-state editing, and `maplab:apply`-style safe content apply for
scene/HUD/asset documents.
