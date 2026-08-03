# Refractor 02 — Implementation Plan
## Data-Driven Scene, HUD, and Asset Authoring Foundation

**Binding spec:** `docs/refractor02/REFRACTOR02_SCENE_UI_ASSET_AUTHORING_DESIGN.md`
**Base branch:** `map-lab`

## 0. Current-state audit (Milestone 0)

### 0.1 Non-gameplay screens (all hardcoded in `src/client/hud.ts`)

| Screen | Node id | Buttons/actions (data-act or id) |
| --- | --- | --- |
| boot | `screen-boot` | click → `onBoot` |
| main | `screen-main` | `data-act=create`, `data-act=join`, `data-act=practice`, `data-act=howto` |
| create | `screen-create` | `#copy-code`, `#create-ready`, `data-act=back` |
| join | `screen-join` | `#join-code` input, `#join-go`, `data-act=back` |
| ready | `screen-ready` | `#ready-go`, `#leave-btn`, `#copy-code` (room code) |
| countdown | `screen-countdown` | none (`#countdown-num`, `#countdown-sub`) |
| results | `screen-results` | `#results-score`, `#results-title`, `#results-grade`, `#results-stats`, rematch chips, `#rematch-info`, `#leave-btn` |
| error | `screen-error` | `#error-msg`, `#retry-btn`, `#menu-btn` |
| pause | `screen-pause` | `#resume-btn`, `#menu-btn` |
| howto | `screen-howto` | `data-act=back` |

Flow states in `src/client/main.ts`: `boot → main → create/join → ready → game → results`, plus `error`, `howto`, `pause`. Network-driven transitions: `created`/`joined` → ready, `start` → game/countdown, `results` → results, `error` → error, disconnect → error/practice retry.

### 0.2 Gameplay HUD (hardcoded in `Hud.makeHud`)

`#hud` contains: `#role-chip`, `#conn-dot`, `#ping`, `#practice-tag`, `#timer`, `#score`, `#combo`, `#integrity`, `#jackpot-bar`/`#jackpot`, `#charge-row`/`#charge-fill`, `#speed`, `#dash-ind`, `#crosshair`/`#ch-ring`, `#prompt`, `#prompt-sub`, `#objective-arrow`, `#pip`/`#pip-label`/`#pip-status`, `#fps`, `#popups`, `#pause-btn`.

### 0.3 Update paths and events

`Hud.update(state, context)` writes timer/score/combo/integrity/jackpot/speed/dash/prompt/crosshair/PIP/FPS/objective; `Hud.onEvent` handles score popups, combo pulse, charge rows, damage flashes, results reveal; `showCountdown/hideCountdown`, `updateLobby`, `setCreateCode`, `showJoinError`, `showError`, `showResults`, `updateRematch`, `setTheme(role)` (CSS variable theme from `ui.driverTheme`/`ui.gunnerTheme`), `floatText`, `comboPulse`, `onUiSound`.

### 0.4 DOM/style inventory

Presentation CSS lives in `src/client/styles.css` (`.screen`, `.panel`, `.btn`, `.code-box`, `.hud-*`, `.pip`, `.bar`, `.crosshair`, `.prompt`, `.popup`, plus `--driver-*`/`--gunner-*` theme variables). Cached nodes: ~30 private fields in `Hud`. `document.getElementById` calls: one per cached HUD node plus `#app` mount.

### 0.5 Assets

`REQUIRED_ASSET_IDS` (47 ids) in `src/shared/assetRegistry.ts`; manifest `public/assets/manifest.json` (currently `{"assets": []}`); `AssetService` (`src/client/assets.ts`) maps semantic id → file/prototype/fallback; unknown ids are skipped. `content/presentation/demoScoreAttack.json` declares models/vfx/ui/audio.

### 0.6 Environment/lighting

`RenderWorld` hardcodes gameplay environment (lights, fog, stars, post-processing). Menu screens have no 3D background today.

### 0.7 Lifecycle

`Hud` mounts once (`#app`); screens toggled by class; HUD toggled by class; listeners attached per button at construction; no scene-level disposal (single long-lived app).

## 1. Migration sequence

### Milestone 1 — Presentation content pipeline

1. `src/shared/presentation/schemas.ts` (Zod): Scene, UiNode, Entity, Flow, Hud, Theme, ProjectAsset, Binding, ActionBinding, Transition, PreviewState.
2. `content/scenes/*.json` (10 seed scenes), `content/hud/gameplay.json`, `content/scene-flows/primary.json`, `content/themes/{base,driver,gunner}.json`, `content/assets/{builtins,project}.json`.
3. `src/client/presentation/componentRegistry.ts` + `uiComponents.ts` (Container, Panel, Text, Button, Input, Horizontal, Vertical, Grid, Spacer, Conditional, Repeater, ProgressBar, Image) with inspector metadata.
4. `scripts/generate-presentation-content.ts` → `src/generated/presentationContent.generated.ts` (source hash + stale test), `npm run generate:presentation-content`, wired into `build:client`.
5. Old `Hud` stays active; no behavior change.

### Milestone 2 — Scene runtime + flow migration

1. `bindingRuntime.ts` (compiled path accessors + transforms), `actionRegistry.ts` (allowlisted actions), `sceneRuntime.ts` (SceneRuntime: load/update/dispatch/unload/dispose, enter/exit transitions, theme, action handlers).
2. `appFlowController.ts` extracts flow ownership from `main.ts` (state, scene selection, network-driven transitions, gameplay start/teardown, pointer/input policy, error/results/practice).
3. Migrate screens in order boot → main → howto → create → join → ready → countdown → pause → error → results; each screen's DOM comes from content with identical ids; parity tests per screen; `Hud` becomes a facade delegating to the flow/runtime.

### Milestone 3 — Gameplay HUD runtime

1. `hudViewModel.ts` (`HudViewModel` + `HudProjector`; every field documented).
2. `hudRuntime.ts`: HUD document from `content/hud/gameplay.json`, cached binding handles, high-frequency `apply(vm)` updating only changed values; `HudEventPresenter` for popups/pulses/countdown/result reveal.
3. Role themes from `content/themes/driver|gunner.json`; keep current layout/ids.

### Milestone 4 — Extensible asset catalog

1. `src/shared/assetCatalog.ts` (built-in vs project, namespaces `custom.*`, `scene.*`, `environment.*`, `ui.*`, override field, `assertResolvableAssetId`).
2. `content/assets/builtins.json` + `project.json`; `AssetService` consumes the catalog; unknown valid project ids resolve; built-in fallbacks preserved; one sample custom asset (`scene.menuTank`) used by the hybrid main menu.

### Milestone 5 — Hybrid scenes + preview tool

1. `presentationWorld.ts` (Model/Camera/DirectionalLight/HemisphereLight/PointLight/RotateAnimation/FloatAnimation/LookAt/AudioSource + simple post-process preset; no gameplay sim).
2. Hybrid Main Menu (3D tank background + UI overlay, low-quality toggle, disabled in test mode).
3. `tools/presentation-preview/` (separate Vite app; scene/HUD/state/role/theme/resolution selectors, hierarchy, binding/asset diagnostics, screenshot-stable mode).

### Milestone 6 — Cleanup + docs

Remove old screen construction and cached DOM fields after parity; write report + authoring guides; update docs; run full gate.

## 2. Parity strategy

Parity tests (`tests/presentation/parity.test.ts`) assert, per screen: stable DOM structure, node ids, text, action wiring, and hidden-state toggling. HUD parity asserts ids + projected values. E2E keeps using the same selectors (`#screen-*`, `[data-act=*]`, `#hud`, `#results-*`, `#error-msg`, `#resume-btn`).
