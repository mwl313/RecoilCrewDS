# Gameplay Readability, Tactical Drawer & Environment — Implementation Report

Date: 2026-08-08  
Branch: `codex/gameplay-readability-tactical-environment`  
Base: `origin/main` at `66cc5ddd35c672b1d68cda564925dac8123ade4c`

## Outcome

Implemented the requested gameplay-readability and environment presentation milestone without adding new authoritative gameplay surfaces beyond the explicitly requested perimeter blockers and stable real-bound response.

## Delivered

Primary milestone files changed/added:

- Authority/state: `src/shared/damage/damageSystem.ts`, `src/shared/progression/progressionTypes.ts`, `src/shared/progression/progressionSystem.ts`, `src/shared/progression/upgradeEffectApplier.ts`, `src/shared/sim/matchRuntime.ts`, `src/shared/net/protocol.ts`.
- Boundary/map: `src/shared/mapgen/urbanLayout.ts`, `src/shared/mapgen/compat.ts`, `src/shared/sim/tankKinematics.ts`.
- Client wiring/input: `src/client/app/gameClient.ts`, `src/client/app/networkStatePresenter.ts`, `src/client/input.ts`, `src/client/main.ts`, `src/client/app/qualityManager.ts`, `src/client/app/renderWorld.ts`.
- New presentation modules: `src/client/worldUi/enemyWorldUiLayer.ts`, `src/client/tactical/*`, `src/client/environment/*`.
- Styling: `src/client/ui/world-ui.css`, `src/client/ui/tactical.css`, `src/client/ui/index.css`.
- Tests: `tests/gameplayReadability*.test.ts`, `tests/input.test.ts`, `tests/urbanCityMaps.test.ts`, relevant protocol/progression fixtures, `tests/fixtures/demo-golden.json`, and `e2e/gameplay-readability-tactical.spec.ts`.

### Enemy readability

- Added one bounded, pooled, screen-space Canvas 2D layer for all enemy bars and damage values.
- Health bars render only for living, damaged enemies and are distance-scaled, capped, camera-culled, and anchored from normalized monster height.
- Enemy hit events now carry the exact authoritative post-defense HP loss, clamped to remaining HP so lethal overkill never displays inflated damage.
- MG values coalesce only for the same enemy inside a 60 ms window. Cannon and other hits remain separate.
- Damage values use a short punch/rise/fade treatment with a hard dark outline; no DOM node is created per enemy or per hit.

### Tactical drawer

- Added a left-side, no-scrim tactical drawer toggled by Tab during gameplay.
- Opening the drawer does not change input context, release pointer lock, or pause simulation.
- Progression, relic opening/reveal, pause, results, errors, reset, and teardown force the drawer closed.
- Added a cached Canvas 2D north-up minimap using only real authoritative arena bounds.
- Static roads/buildings/blockers are cached. Dynamic markers cover the chassis, chests, ordinary enemies, elites, and bosses.
- Player marker rotation is derived only from chassis yaw; camera orbit, camera yaw, turret yaw, and aim yaw are not inputs.
- Added responsive art direction for 1280×720, 1920×1080, 800×720, and 560×720.

### Truthful level-up summary

- Added replicated `LevelUpgradeStatSummary[]` state to `TeamProgressionState` and bumped the multiplayer protocol to 17.
- Summary entries are recorded only after successful level-up stat effects.
- Additive values accumulate by sum; multiplicative values accumulate by product.
- Base values, difficulty scaling, relic projection, temporary effects, and failed effects are excluded.
- The drawer groups human-readable rows into Crew, Driver, and Gunner sections and never exposes raw stat IDs.
- Because the summary is authoritative match state, Single Player, multiplayer snapshots, and reconnect snapshots share the same representation; a fresh match resets it.

### Environment and boundaries

- Added the authored sky slot `/assets/environment/sky/recoil-day-01.webp`.
- The slot is currently absent, so the client immediately uses a procedural blue-zenith/warm-horizon equirectangular fallback. A failed optional fetch never replaces the fallback with black.
- Removed the daytime star field and retuned fog and lighting for the daylight horizon.
- Added deterministic `VisualWorldApron` presentation around urban maps:
  - instanced authored building and prop families in the near parallax layer;
  - instanced road continuations;
  - cheap shared-material box silhouettes in the far skyline;
  - no collision, navigation, spawn, minimap, replication, or shadow participation;
  - high/medium/low instance budgets, with adaptive quality connected to high/low modes.
- Exact placement budgets for the whole apron are:
  - High: 156 near placements (112 buildings, 24 props, 20 road strips) + 72 far silhouettes = 228.
  - Medium: 108 near placements (78 buildings, 16 props, 14 road strips) + 43 far silhouettes = 151.
  - Low: 8 continuation road strips + 18 far silhouettes = 26; detailed near buildings/props are disabled.
- Added authored authoritative perimeter blockers at eligible road exits.
- Replaced whole-axis boundary stops with a stable normal response that preserves tangential and inward velocity while removing only outward velocity.

## Qualification

Passed:

- `npx tsc --noEmit`
- `npm run build`
- Focused gameplay-readability suite: 75/75 tests
- Final focused world UI/input suite: 29/29 tests
- `npm run test:netcode`: 33/33 tests
- `npm run test:horde`: 101/101 tests
- `npm run test:progression`: 200/201 tests; the only failure is the pre-existing relic magnet-radius expectation listed below.
- `npx playwright test e2e/gameplay-readability-tactical.spec.ts`
  - exact damaged-enemy canvas paint
  - pointer lock retained
  - gameplay time advances while open
  - progression auto-close and post-selection summary
  - real-bounds minimap and urban apron diagnostics
  - no apron shadows
  - 1280×720, 1920×1080, 800×720, 560×720 viewport fit
  - apron-on versus apron-off median RAF cost ratio at or below 20%
- Visual screenshots reviewed at desktop and narrow qualification widths.

Urban apron A/B diagnostics from the passing headless Chrome run (same urban400 scene and camera, high quality):

| Metric | Apron off | Apron on | Change |
| --- | ---: | ---: | ---: |
| Median RAF interval | 8.6 ms | 8.8 ms | +2.3% |
| Frame interval p50 | 8.5 ms | 8.6 ms | +1.2% |
| Frame interval p95 | 10.2 ms | 10.5 ms | +2.9% |
| Render-submit p50 | 5.9 ms | 6.2 ms | +5.1% |
| Render-submit p95 | 7.2 ms | 7.3 ms | +1.4% |
| Estimated draw calls | 1,007 | 1,032 | +25 / +2.5% |
| Estimated triangles | 1,836,280 | 2,371,308 | +535,028 / +29.1% |
| Renderer geometries | 460 | 460 | 0 |
| Renderer textures | 51 | 51 | 0 |
| Smoothed FPS | 119.35 | 117.14 | −1.9% |

The primary median-frame cost was +2.3% (excellent band) and both render-submit measures remained below the binding 20% ceiling. Diagnostics report 25 instanced apron draw batches and 238 rendered mesh instances at high quality; this is slightly above the 228 logical placements because several reused authored models contain multiple mesh parts. The triangle estimate rises because instanced authored near buildings retain their source geometry, but batching keeps the measured submit/frame cost low.

The full repository run completed with 1,303/1,310 tests passing. Its seven remaining failures are outside this milestone and reproduce in untouched/pre-existing areas:

- three predictor tests expect replay queues to be emptied, while the current predictor intentionally preserves unacknowledged inputs;
- one relic hardening expectation conflicts with the current projected magnet-radius result;
- two Monster Pack importer tests require the absent local ZIP at `local-imports/monsterpack09/Ultimate monster pack - Horde Ready.zip`;
- one baseline characterization still expects an empty asset manifest, while the pre-existing tank-asset worktree changes add four model overrides.

The deterministic Demo golden was regenerated and now passes. Its expected movement differences are caused by the requested stable boundary behavior; damage event values also now reflect clamped authoritative HP loss.

The working tree remains intentionally uncommitted at the user's requested handoff point, so the end `HEAD` is still the recorded starting SHA. The implementation and this report are working-tree changes on the dedicated branch.

## Resource status

- Authored sky resource: not present; procedural fallback active.
- No new authored images, textures, sounds, or fonts were required for the implemented fallback path.
- Existing urban model families are reused through instancing; no duplicate presentation assets were added.
