# Gameplay 04 Implementation Report
## Single Player Mode, PIP Removal, and Model-Driven Aim Alignment

**Branch:** `single-player-addition`  
**Design:** `docs/gameplay04/PLAYER_MODE_PIP_AND_AIM_ALIGNMENT_DESIGN.md`  
**Audit:** `docs/gameplay04/PLAYER_MODE_PIP_AND_AIM_ALIGNMENT_CODE_AUDIT.md`

---

## 1. Current-state audit

The code audit (see `PLAYER_MODE_PIP_AND_AIM_ALIGNMENT_CODE_AUDIT.md`) recorded
every PIP runtime/UI/tuning/metric reference, every Practice/practice
reference, role-swap paths, mode creation flow, local match creation flow,
results/rematch flow, and every hardcoded turret/barrel/muzzle/aim-pivot
offset. The audit was the source of truth for this implementation; no item on
that inventory was skipped without a note in this report.

## 2. PIP files and systems removed

```text
src/client/app/pipRenderer.ts          deleted
src/client/cameras.ts (PipCamera)      deleted
GameClient pip field/creation/render   removed
RenderWorld.renderWithCamera           removed
RenderWorld.resetViewport              removed
QualityManager.setPipRate/Scale        removed
NET_TUNING.pip                         removed
netcodeMetrics.pipRenderMs             removed
#pip / pip-label / pip-status / FEED    removed from HUD content
pipFrame component type                removed from schema/registry/factories
HudViewModel.pip + partnerAction        removed
.pip* CSS                              removed
```

## 3. Render-count change

- Before: one main render + one separate partner-camera render per frame (PIP
  at its own reduced cadence).
- After: exactly one world render per gameplay frame.
- Regression guard: `RenderWorld.renderCount` plus
  `e2e/pip-removal.spec.ts` proves one render per frame and no `#pip`/FEED
  nodes; `tests/gameplay04/pipRemoval.test.ts` statically forbids the removed
  modules, fields, knobs, and bindings.

## 4. Single Player architecture

Single Player is a first-class session kind:

```text
content/modes/singlePlayerScoreAttack.json
  → CLIENT_CONTENT_PACK (generated, browser-safe)
  → MatchRules (mode.singlePlayerScoreAttack session policy)
  → MatchRuntime (the same shared simulation as multiplayer)
  → GameClient.startSinglePlayer(pack, world)
```

`GameClient` replaces `mode: 'online' | 'practice'` with a typed
`GameSessionContext` (`kind`, `networked`, `localControl`, `rulesModeId`).
There is no second simulation and no AI partner.

## 5. Mode policy schema

`modeSessionPolicySchema` validates:

```text
kind, networkRequired, controlScheme, showRoleIdentity, showPeerStatus,
allowRoleSwap, resultsFlow
```

Contradictory combinations are rejected (e.g. singlePlayer + networkRequired,
singlePlayer + allowRoleSwap, multiplayer + combinedDriverAndGunner). The
resolved policy is exposed through `MatchRules.sessionPolicy`; legacy rules
default to multiplayer.

## 6. New mode content

`content/modes/singlePlayerScoreAttack.json` (kind singlePlayer, combined
controls, no role/peer UI, local restart) and `mode.demoScoreAttack` received
the explicit multiplayer policy. Both initially share the same gameplay
definitions, creating the future divergence seam.

## 7. Practice → Single Player renames

```text
practiceMatch            → singlePlayerMatch
startPractice            → startSinglePlayer
stepPractice             → stepSinglePlayer
applyPracticeWeapons     → applySinglePlayerWeapons
onPracticeResults        → onSinglePlayerResults
practiceViewRole         → removed
togglePracticeView       → removed
app.startPractice        → app.startSinglePlayer (+ app.restartSinglePlayer)
PRACTICE button          → SINGLE PLAYER (main menu, pause, error scenes)
practice tag / bindings  → removed
```

No permanent aliases were left in production code.

## 8. Role-swap removal

`InputManager` no longer maps Tab/Q, has no `swapPressed`, and exposes no
`consumeSwap()`. No replacement keys were assigned. Tests assert the absence
of swap state and that Tab/Q produce no input.

## 9. Results-flow change

Results are mode-aware:

- Multiplayer: modifier chips, rematch info, LEAVE CREW (crew rematch vote).
- Single Player: PLAY AGAIN (`app.restartSinglePlayer`) + MAIN MENU, no crew
  readiness, no modifier vote.

`SceneFlowPresenter.showSinglePlayerResults()` supplies the single-player
context; `content/scenes/results.json` toggles both sections through
`crewMode`/`singleMode` bindings.

## 10. Offline behavior

- Single Player starts without a room or server.
- The periodic gameplay ping is skipped in local sessions.
- `net.onStatus` ignores disconnects during Single Player.
- The client constructs the match from the generated `CLIENT_CONTENT_PACK`
  (`npm run generate:content-pack`), so no server-side content loader or node
  crypto ships in the browser bundle.

## 11. Rig schema

`TankRigDefinition` (Zod) added to `tankSchema`:

```text
chassisAssetId, turretAssetId, barrelAssetId,
turretPivot, barrelPivot, muzzleLocal, aimPivotLocal (required)
cameraAnchorLocal?, forwardAxis?, socketBindings? (optional)
```

`content/tanks/default.json` carries the canonical values:

```json
{
  "turretPivot": [0, 1.15, 0],
  "barrelPivot": [0, 0.62, 0],
  "muzzleLocal": [0, 0.75, 2.9],
  "aimPivotLocal": [0, 1.15, 0],
  "cameraAnchorLocal": [0, 1.35, 0],
  "forwardAxis": [0, 0, 1]
}
```

The legacy client-safe fixture (`createLegacyDefaultTankDefinition`) mirrors
the same values; parity is tested.

## 12. Shared geometry math

`src/shared/vehicle/tankRigGeometry.ts` is Three.js-free:

```text
computeWeaponMountWorldPose(tank, turret, rig) → pivots, muzzle, direction
computeAimPivotWorld(tank, rig)               → aim pivot
solveTurretAim(tank, rig, point, limits)      → desired local yaw + pitch
```

The transform order is exactly `chassis yaw → turret pivot → turret local yaw
→ barrel pivot → barrel pitch → muzzle local`, matching the Three.js
hierarchy (`barrel.rotation.x = -pitch`). A parity test compares the shared
math against a real `THREE.Group` hierarchy and against the built client rig.

## 13. Server muzzle migration

`src/shared/weapons/weaponBehaviors.ts` `muzzleWorld()` now resolves through
`computeWeaponMountWorldPose` with `ctx.rules.tank.rig`. MG hitscan, cannon
projectile, JACKPOT projectile, shot events, and recoil directions all read
the same mount. The old under-chassis ground clamp was removed so
authoritative geometry equals visual geometry.

## 14. Client rig migration

- `AssetInstanceFactory.buildTankRig(rig)` positions turret/barrel from the
  rig and stores `rigDefinition`, pivots, muzzle, aim pivot, camera anchor,
  and forward axis.
- `AssetService.tankRig(rig?)` accepts resolved rig data.
- `GameClient.applyTankRig()` swaps the scene rig for Single Player rules or
  a replicated `TankRigRulesBlock` (rides the movement rules block online).
- `NetworkStatePresenter` owns the active rig and recomputes the aim pivot
  from rig data; all local muzzle VFX use `getMuzzleWorld()`.

## 15. Socket integration

`socketBindings` (turretPivotNode, barrelPivotNode, muzzleNode,
cameraAnchorNode) are optional client binding aids. Numeric shared content
remains authoritative; the server never reads node names. A
`TankRigRulesBlock` (`revision`, `tankId`, `rig`) is delivered through the
existing movement rules block so online clients construct the exact selected
rig.

## 16. Crosshair projection

`src/client/aim/trajectoryReticleProjector.ts`:

```text
predicted tank pose + predicted turret pose + rig
  → shared muzzle ray
  → spatial obstruction raycast (camera query index)
  → fallback plane/range
  → NDC → CSS screen position
```

The HUD crosshair node is moved with cached DOM style updates (no rebuild).
While the turret catches up, the reticle honestly sits off-center; when the
shot line is off-screen or non-finite it hides.

## 17. Obstruction behavior

The muzzle ray is raycast against the spatial camera-collision index. A hit
closer than the fallback marks the reticle `blocked` and projects the
obstacle point; the reticle never draws a fake line through cover.

## 18. Files added / modified / deleted

Added:

```text
src/shared/session/gameSessionKind.ts
src/shared/vehicle/tankRigTypes.ts
src/shared/vehicle/tankRigGeometry.ts
src/client/aim/trajectoryReticleProjector.ts
scripts/generate-content-pack.ts
src/generated/contentPack.generated.ts
content/modes/singlePlayerScoreAttack.json
content/themes/singlePlayer.json
docs/gameplay04/PLAYER_MODE_PIP_AND_AIM_ALIGNMENT_CODE_AUDIT.md
docs/gameplay04/PLAYER_MODE_PIP_AND_AIM_ALIGNMENT_IMPLEMENTATION_REPORT.md
docs/guides/SINGLE_PLAYER_MODE_GUIDE.md
docs/guides/TANK_RIG_AND_WEAPON_SOCKET_GUIDE.md
tests/gameplay04/{pipRemoval,sessionPolicy,singlePlayer,tankRigGeometry,
trajectoryReticle,contentPackGenerated}.test.ts
e2e/singlePlayer.spec.ts
e2e/pip-removal.spec.ts
```

Deleted:

```text
src/client/app/pipRenderer.ts
src/client/cameras.ts
e2e/practice.spec.ts (replaced by e2e/singlePlayer.spec.ts)
```

Modified: `gameClient`, `networkStatePresenter`, `cameraManager`,
`hudViewModel`, `hudRuntime`, `hudController`, `hud`, `sceneFlowPresenter`,
`flowTypes`, `uiComponents`, `input`, `main`, `assets/*`, `match`,
`matchRuntime` (mode id pass-through), `matchRules`, `rulesRevision`,
`legacyDemoRules`, `weaponBehaviors`, `tank` schema/content, scene/HUD/theme
content, room message, styles, tests, and the Demo golden fixture.

## 19. Automated test outputs (executed 2026-08-04)

```text
npm run generate:presentation-content   PASS (10 scenes, 1 hud)
npm run generate:content-pack           PASS (3 modes)
npm run generate:map-profiles           PASS (5 maps)
npm run build                           PASS
npm test                                515/515 PASS (57 files)
npm run test:demo                       PASS (golden matches; regenerated once
                                        for the intentional muzzle change)
npm run test:e2e                        32/32 PASS (Chrome)
npm run test:loop                       PASS (1804 snapshots, rematch ok)
npm run test:maps                       26/26 PASS + mapgen report PASS
npm run test:maps:sweep                 PASS (1000/profile)
npm run test:maps:sweep:full            PASS (1000/profile full)
npm run build:maplab                    PASS
npm run test:maplab                     32/32 PASS
npm run build:presentation-preview      PASS
npm run test:presentation               37/37 PASS
npm run test:netcode                    27/27 PASS
npm run test:netcode:e2e                4/4 PASS (0/50/100/150 ms + jitter)
```

The Demo golden was regenerated once because the authoritative muzzle moved
from the legacy under-chassis clamp `(y = max(1.55 + dy*1.4, ground+0.25),
forward 2.7)` to the true rig muzzle `(turret 1.15 → barrel 0.62 → local
[0,0.75,2.9])`. Intermediate checkpoints changed (e.g. t30 score 1550 → 1450,
kills 9 → 8); final results remain score 7956, grade B, JACKPOT ×2, kills 30.
This is the intended server/client alignment, not a fixture masking.

## 20. Manual visual check status

Automated Chrome e2e covered: Single Player full round (drive/jump/dash,
results, local restart), pause/resume, one-canvas rendering, Driver/Gunner
online camera directions, wall collisions, rematch/reconnect shared
prediction, gunner responsiveness at 0/50/100/150 ms RTT and jitter, and the
trajectory reticle math (unit-level). Interactive visual spot checks for
fast turret traverse, JACKPOT charge, slopes, and near-wall reticle states are
documented in `docs/guides/SMOKE_TEST.md` and remain the final release check
on a physical display.

## 21. Performance before/after

- PIP removed: one world render per frame (was main + partner render).
- Reticle: shared math + spatial query; no per-frame DOM rebuild; the HUD
  crosshair moves via cached style updates. Unit tests cover reusable result
  objects and NaN/offscreen handling.
- Reticle cost is bounded by the spatial camera query (nearby candidates
  only); no full collider scans were added.
- Bundle: preview/editor code remains excluded from the normal client bundle.

## 22. Remaining limitations

- No ballistic-drop impact reticle; the reticle represents the initial shot
  line (documented design decision).
- Interactive visual verification on a physical display is the final
  remaining step before release (checklist in SMOKE_TEST.md).
- Single Player shares the Demo balance by design; divergence can now be
  authored through `mode.singlePlayerScoreAttack` without code changes.

## 23. Completion-gate status

Implemented and passing:

```text
1.  Partner PIP fully removed
2.  No hidden PIP render (one-render spy)
3.  Single Player replaces Practice in production UI
4.  Distinct content mode (mode.singlePlayerScoreAttack)
5.  Combined controls without role swapping
6.  Role/peer UI absent in Single Player
7.  Works without multiplayer connectivity
8.  Results restart locally (PLAY AGAIN)
9.  Multiplayer behavior intact (full e2e + netcode + loop PASS)
10. One shared rig geometry drives server and client
11. Hardcoded muzzle/pivot duplicates removed
12. MG/cannon/JACKPOT share one muzzle resolver
13. Local VFX originates from the resolved muzzle
14. Crosshair represents the actual predicted shot ray
15. Near-muzzle obstruction represented honestly
16. Future tank models adjust sockets via content/asset metadata
17. Netcode/map systems unregressed (full gates PASS)
18. Required automated tests pass; manual visual checklist documented
```

Final invariant:

> Single Player is a first-class combined-control mode, Multiplayer remains
> role-based, and every shot originates from one shared model-driven weapon
> mount.
