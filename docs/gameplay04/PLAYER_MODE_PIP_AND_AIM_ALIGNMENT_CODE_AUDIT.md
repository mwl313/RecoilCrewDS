# Gameplay 04 — Code Audit

Date: 2026-08-04 · Branch: `single-player-addition` (local) · Contract:
`docs/gameplay04/PLAYER_MODE_PIP_AND_AIM_ALIGNMENT_DESIGN.md`.

## 1. PIP references

Runtime:
- `src/client/app/pipRenderer.ts` (whole module): `PipRenderer`, `pipRate`,
  `pipScale`, viewport render.
- `src/client/cameras.ts`: `PipCamera` (whole module also contains the main
  TPS camera helper used by PIP only).
- `src/client/app/gameClient.ts`: import, `pip` field, `deps.pip`,
  `new PipRenderer(renderWorld)`, `setPipRate`/`setPipScale` wiring,
  `deps.pip = pip`, `this.pip.reset()`, `this.pip.update(...)`,
  `netcodeMetrics.pipRenderMs`.
- `src/client/app/renderWorld.ts`: `renderWithCamera()`, `resetViewport()`
  (PIP-only; the normal render path uses `render()`).
- `src/client/app/qualityManager.ts`: `setPipRate`/`setPipScale` targets,
  `pipRateFromHz`, PIP degrade logic.
- `src/shared/net/tuning.ts`: `NET_TUNING.pip`.
- `src/client/netcode/netcodeMetrics.ts`: `pipRenderMs` + F4 row.

HUD:
- `content/hud/gameplay.json`: `pip` node, `pip-label`, `pip-status`,
  `pip.jackpot` binding, preview states.
- `src/shared/presentation/schemas.ts`: `HUD_BINDING_PATHS` `pip.*`.
- `src/client/presentation/hudViewModel.ts`: `pip` block, `pipRole`,
  `partnerAction()`.
- `src/client/presentation/uiComponents.ts`: `pipFrame` factory + schema.
- `src/client/styles.css`: `.pip`, `.pip-label`, `.pip-status`,
  `.pip.jackpot`.

Tests: `tests/presentation/*` reference PIP HUD nodes; e2e specs reference
`#pip` implicitly through HUD text (e.g. "GUNNER FEED"/"DRIVER FEED").

## 2. Practice references

- `src/client/app/gameClient.ts`: `mode: 'online' | 'practice'`,
  `practiceMatch`, `practiceAcc`, `practiceResultsShown`,
  `practiceViewRole`, `startPractice`, `stepPractice`,
  `applyPracticeWeapons`, `togglePracticeView`, `onPracticeResults`,
  `setPracticeMode` (camera), comments.
- `src/client/app/networkStatePresenter.ts`: `mode()`, `practiceMatch()`,
  `applyPracticeWeapons`, practice branches in `computeRemote`,
  `syncWorld`, `usePredictedTurret`, `applySinglePlayerWeapons` target.
- `src/client/main.ts`: `practice` flag, `practiceMatchIndex`,
  `onPractice`, `startPractice`, `buildPracticeSession`,
  `game.onPracticeResults`, `input.consumeSwap() && practice →
  g.togglePracticeView()`, `practice` in HUD context, error copy.
- `src/client/presentation/flowTypes.ts` `onPractice`,
  `sceneFlowPresenter` `app.startPractice`, HUD `practiceTag`,
  `content/hud/gameplay.json` `practice-tag` node + `practice` binding,
  `content/scenes/mainMenu.json` PRACTICE button,
  `content/scenes/error.json` PRACTICE button,
  `src/client/presentation/hudViewModel.ts` `practice` field,
  `HudContext.practice`, styles `.practice-tag`.
- `src/client/app/predictionController.ts` "Practice path" comments.
- Server copy: `room.ts` error text, `match.ts`/`legacyDemoRules.ts`
  comments (can stay historical).

## 3. Role-swap references

- `src/client/input.ts`: `Tab`/`Q` keymap entries, `swapPressed`,
  `consumeSwap()`, `debugState().swapPressed`.
- `src/client/app/gameClient.ts`: `practiceViewRole`, `togglePracticeView()`,
  `setRole(practiceViewRole)`.
- `src/client/main.ts`: `input.consumeSwap() && practice →
  g.togglePracticeView()`.
- e2e: `tps.spec.ts` pause test presses Tab and asserts composer pass
  count (used to verify practice view swap); must be migrated.

## 4. Mode creation flow

Server: `RoomManager.startMatch` → `MatchRules.fromContentPack(pack, mod,
modeId)` (mode id from pack default) → `new Match(...)` →
`MatchRuntime.fromContentPackWithWorld(pack, id, world, modifier)`.
Practice: `new Match('practice-…', 'none', undefined, world)` — the legacy
no-pack path (`MatchRuntime` with `MatchRules.fromLegacyConfig`).

## 5. Local Match creation flow

`GameClient.startPractice()` constructs a local `Match` directly with no
ContentPack. `applyArenaSession` recreates it on map reroll.

## 6. Results/rematch flow

- Multiplayer: server broadcasts `results` with a crew rematch readiness
  payload; `Hud.showResults` → `flow.showResults` sets modifier chips.
- Practice: `game.onPracticeResults` → `hud.showResults(results, {driver:
  true, gunner: true, modifier:'none'})` — faked crew rematch state.

## 7. Hardcoded weapon-mount offsets

Authoritative (`src/shared/weapons/weaponBehaviors.ts` `muzzleWorld`):
`forward 2.7`, `base height 1.55`, `pitch height 1.4`, ground clamp 0.25.
Client rig (`src/client/assets/assetInstanceFactory.ts`): turret pivot
`[0,1.15,0]`, barrel pivot `[0,0.62,0]`, muzzle local `[0,0.75,2.9]`,
`turretPivot [0,1.15,0]`.
Aim pivot (`src/client/cameras.ts` `PipCamera` and
`networkStatePresenter.syncWorld`): `tank + [0,1.15,0]`.
Local VFX (`gameClient.applyPracticeWeapons`/`playLocalGunnerAction`):
`new Vector3(0,0.75,2.9)` barrel-local.

## 8. Crosshair path

`content/hud/gameplay.json` `#crosshair` is a static center node; bindings
only toggle visibility. No projection of the actual shot ray.

## 9. Project asset sockets

`content/assets/project.json` supports `defaultTransform`/`sockets` schema;
`AssetTransformResolver` has one socket child name
(`enemy.gunTower → towerHead`). No tank-rig socket resolution exists.

## 10. Files and tests to change

Runtime: gameClient, networkStatePresenter, qualityManager, renderWorld,
cameras, pipRenderer (delete), netcodeMetrics, tuning, tpsCamera,
cameraManager, arenaView (PIP viewport helpers), input, main, hud,
sceneFlowPresenter, flowTypes, hudViewModel/hudRuntime/uiComponents,
presentation schemas, hudController, assetService/assetInstanceFactory,
weaponBehaviors, projectileSystem, match/matchRuntime, matchRules,
contentConfig, legacyDemoRules, rulesRevision, content schemas
(mode/tank), generated modules.

Content: modes (new single player mode + session policy), tanks (rig),
hud, scenes (main menu, error, results), themes (single player), manifest.

Tests: `tests/` PIP/practice/role-swap inventories, new gameplay04 suites
(session policy, rig geometry, crosshair), e2e migrations
(SINGLE PLAYER label/action, no PIP text, play again).
