# Final Bugfix Report — TPS Controls, Jitter, Collision, and Copy

**Date:** 2026-08-02
**Contract:** `FINAL_BUGFIX_TPS_JITTER_COLLISION_COPY.md`
**Status:** ✅ Implemented and verified (build, 97 unit tests, 14 e2e browser
tests, headless full-round loop)

Reference milestone/checklist documents (`MILESTONE_2_1_*.md`,
`MODERN_TPS_CAMERA_FEEL_CHECKLIST(1).md`) are not present in the repository;
the contract file was treated as the binding implementation authority.

---

## 1. Root Causes Confirmed

| # | Defect | Root cause |
| --- | --- | --- |
| 1 | Mouse right did not reliably look right | Camera yaw used `yaw -= dx` (inverted) with no explicit inversion flags |
| 2 | Reverse A/D semantics inverted | Server steering multiplied steer by `-0.7` when reversing |
| 3 | Recenter wrong/snapped | Recenter overwrote desired yaw (one-frame snap) and used `tankYaw + PI` in front of the chassis |
| 4 | Gunner world aim treated as local yaw | Client sent world aim; server and render treated it as chassis-local, adding chassis yaw twice |
| 5 | Predicted turret overwritten | Render loop copied authoritative turret over the local prediction every frame |
| 6 | 20 Hz visual stepping | Snapshot buffer stored local arrival time, kept only two entries, and `syncWorld` ignored interpolation alpha |
| 7 | No Driver prediction | No local kinematics, input sequencing, or acknowledgement |
| 8 | Circle-box correction imprecise | Correction pushed from the closest point instead of exact center separation; no normal/penetration returned |
| 9 | Long chassis clipped walls | Single-circle footprint; no substeps for high displacement |
| 10 | Square camera colliders | `BoxAround(x, z, Math.max(w, d), h)` inflated 8×2 obstacles to 8×8 |
| 11 | Camera clipped corners/floors | Zero-width ray collision; no camera-radius expansion, no ground-clearance arm |
| 12 | Copy had no fallback | `navigator.clipboard?.writeText()` with no await, no fallback, no feedback |
| 13 | Duplicate UI actions | Generic `data-act` wiring plus explicit `bind()` wiring fired twice for one click |
| 14 | Composer pass churn | `setRole()` reset and rebuilt passes on every camera swap |
| 15 | Input leaked through overlays | No input enable/disable and no clearing on blur/visibility/pointer loss |

## 2. Coordinate Convention

Documented in code (`src/client/tpsCamera.ts`) and `DECISIONS.md`:

```text
+Y world up, +Z chassis forward at yaw 0, +X chassis right at yaw 0
forward = (sin yaw, 0, cos yaw); positive yaw: +Z toward +X (clockwise from above)
Mouse right → yaw += dx * sensitivityX   (invertMouseX = false)
Mouse up    → pitch += -dy * sensitivityY (invertMouseY = false)
A → steer -1 → yaw increases → chassis left (screen-left from behind)
D → steer +1 → yaw decreases → chassis right (screen-right from behind)
Reverse reduces steering strength by a non-sign factor only
Turret state is chassis-local; world muzzle yaw = chassisYaw + turretYawLocal (added once)
```

## 3. Files Added

- `src/client/tpsCamera.ts` — reusable modern shooter TPS rig
- `src/client/predictor.ts` — Driver local prediction + reconciliation
- `src/client/clipboard.ts` — clipboard API + textarea fallback + validation
- `src/shared/net/interpolation.ts` — SnapshotBuffer + `interpolateMatchState`
- `src/shared/sim/tankKinematics.ts` — deterministic shared tank step
- `tests/tpsCamera.test.ts`, `tests/tankKinematics.test.ts`,
  `tests/interpolation.test.ts`, `tests/predictor.test.ts`,
  `tests/clipboard.test.ts`
- `e2e/tps.spec.ts` — 10 browser acceptance tests
- `BUGFIX_PLAN_FINAL.md`, `BUGFIX_REPORT_FINAL.md`

## 4. Files Modified

- `src/shared/math.ts` — exact circle-box separation with normal + penetration
- `src/shared/arena.ts` — contact-aware resolution with exact dimensions
- `src/shared/config.ts` — footprint, safe-step, camera tuning values
- `src/shared/types.ts` — turret yaw is chassis-local; snapshot envelope fields
- `src/shared/sim/match.ts` — uses shared kinematics; local turret space
- `src/server/room.ts` — snapshot `serverTime`, `serverTick`, input ack seqs
- `src/client/game.ts` — two camera rigs, interpolation, prediction,
  turret spaces, composer pass reuse, input enable/disable, test hooks
- `src/client/input.ts` — enabled flag; clear on blur/visibility/pointer loss
- `src/client/arenaView.ts` — exact-width camera colliders
- `src/client/hud.ts` — clipboard feedback/disable, duplicate-handler removal
- `src/client/main.ts` — new snapshot envelope, input lifecycle, hooks
- `src/client/styles.css` — copy feedback styles
- `e2e/controls.spec.ts`, `e2e/full-game.spec.ts`, `e2e/practice.spec.ts`
- `tests/math.test.ts` — exact-separation contract

## 5. Driver Control Changes

- A/D mapping: `steer = right - left` (A=-1, D=+1); chassis yaw
  `-= steer * rate * dt` so D turns the nose toward -X, which is
  screen-right when the camera is behind the chassis.
- Reverse uses `reverseSteerMult` (strength only, never a sign flip).
- Mouse affects camera only; W is chassis-relative regardless of camera yaw.
- R recenters through shortest-angle damping (`recenterSeconds`).

## 6. Driver Camera Architecture

- `TpsCameraController` instance owned per role; local-only state.
- Unbounded yaw, clamped pitch, raw pointer-lock deltas (no `dt` multiply).
- Shoulder offset + vertical arm; camera placed behind view-forward; oriented
  via quaternion along view-forward (no tank-centered `lookAt`).

## 7. Gunner Camera Architecture

- Independent `TpsCameraController`; never reads turret or network state.
- Final collision-adjusted camera center ray → world aim point.
- `worldYawToLocal(worldYaw, chassisYaw)` converts aim to chassis-local turret
  target; chassis yaw is added exactly once (world muzzle).

## 8. Turret Coordinate Correction

- Separate `desiredTurretYawLocal`, `predictedTurretYawLocal`,
  `authoritativeTurretYawLocal` (+ pitch counterparts).
- Render uses `turretRoot.rotation.y = predictedTurretYawLocal`.
- Authoritative snapshots reconcile predicted turret through shortest-angle
  damping on arrival — never every frame, never the camera.

## 9. Snapshot Interpolation

- `SnapshotBuffer` uses server time/seq, rejects out-of-order and stale data,
  picks the pair surrounding render time, and clamps render time to the newest
  snapshot.
- `interpolateMatchState(a, b, alpha)` interpolates tank pose, authoritative
  turret, enemies, Loot Truck, and snapshot-rendered projectiles with
  shortest-angle interpolation; discrete events/score are not interpolated.

## 10. Prediction / Reconciliation

- `DriverPredictor` runs the shared deterministic kinematics locally.
- Driver inputs carry a sequence; server snapshot headers acknowledge the last
  processed input seq.
- Client replays unacknowledged inputs, discards acknowledged ones, and
  smooths small visual error; hard snaps only for respawn/wipeout/extreme
  divergence. Server stays authoritative.

## 11. Collision Implementation

- `resolveCircleBox()` returns exact separated position, contact normal, and
  penetration for outside and center-inside cases.
- Oriented three-circle chassis footprint replaces the single circle.
- Displacement-based substeps (`maxSafeStep`, `maxSubsteps`) prevent boost,
  recoil, and rammer tunneling.
- Basis recomputed after steering; inward velocity removed while tangent
  sliding is preserved; repeated resolution iterations.

## 12. Camera Collision Implementation

- Swept-sphere approximation: obstacle AABBs expanded by `cameraRadius`, ray
  cast from the anchor; minimum distance clamp.
- Exact obstacle width/depth colliders (no square inflation).
- Ground clearance = floor height + camera radius + margin.
- Pull-in ~20 ms, release ~100 ms; collision changes position only — never
  yaw/pitch/crosshair/aim.

## 13. Clipboard Implementation

- `clipboard.ts`: async Clipboard API with awaited result, textarea
  selection fallback, `isValidRoomCode` guard, success/failure feedback.
- Copy button disabled until a valid code exists; code remains selectable.

## 14. Tests Added

Unit (97 total, all passing):
- `tpsCamera` (13), `tankKinematics` (13), `interpolation` (7),
  `predictor` (4), `clipboard` (5), `input` (6), `math` (7, exact separation),
  plus existing match/room/config/asset suites.

E2E (14 total, all passing):
- Copy code feedback (once per click), Driver mouse directions, Gunner mouse
  directions, A/D forward + reverse, recenter, camera independence, aim while
  chassis rotates, smooth render movement, wall + high-speed collision,
  pointer capture, pause/overlay input neutrality, full round, results,
  rematch, practice.

## 15. Build Result

```text
npm run build → PASS (client dist/ + server dist-server/)
```

## 16. Unit Result

```text
npm test → 11 files, 97/97 passed
```

## 17. E2E Result

```text
npm run test:e2e → 14/14 passed (4.4m)
```

## 18. Full-Loop Result

```text
npm run test:loop → PASS
round complete in 91.8s — score 15465, grade S, JACKPOT x4, combo x5
rematch ok (moonYard, fresh score 0, same room)
snapshots received by driver: 1353
```

## 19. Remaining Limitations

- The four Unity reference documents were not present; behavior was
  implemented from the contract text and existing design documents.
- Prediction covers the Driver's own tank physics only (enemies/Gunner shared
  physics remain server-authoritative, as required).
- Audio remains procedural synthesis.
- The full contract changes are committed to the working tree but not yet
  pushed (initial commit `545d6aa` predates them).

## 20. Exact Manual Validation Instructions

1. `npm run build && npm run server`, open http://localhost:8080 in two
   browsers, create/join a crew, READY.
2. Driver: mouse right → camera looks right; mouse up → camera looks up; W/S
   drive chassis-forward/back regardless of look direction; A/D turn chassis
   left/right while reversing too; R recenters smoothly behind the chassis.
3. Gunner: mouse right/up look right/up; crosshair stays centered; while the
   Driver turns, the turret keeps the aimed world point; firing feels
   immediate (predicted turret) and settles to the authoritative state.
4. Tank renders continuously between 20 Hz snapshots (no visible stepping);
   driving has immediate predicted response.
5. Drive into walls at boost/recoil speed: no nose penetration, no tunneling,
   no resting oscillation; camera never clips through the tank, floor, walls,
   or corners.
6. Create screen: Copy is disabled until a code exists; click Copy → visible
   success/error feedback; one click = one copy attempt; code remains
   selectable.
7. Esc → pause overlay: gameplay input is neutralized; Resume re-enables.
8. Play a full 90-second round: JACKPOT fires, results appear, rematch works
   in the same room; Practice runs the full loop offline.
