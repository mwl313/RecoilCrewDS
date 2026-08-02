# Final Foundational Bugfix — Plan and Initial Defect Report

Binding contract: `FINAL_BUGFIX_TPS_JITTER_COLLISION_COPY.md`.
Reference milestone/checklist documents (`MILESTONE_2_1_*.md`,
`MODERN_TPS_CAMERA_FEEL_CHECKLIST(1).md`) are **not present** in this
repository; the contract file itself is treated as the implementation
authority and its described behavior is implemented directly.

---

## 1. Initial defect report (exact files, functions, current behavior)

### Mouse X and Y signs
- `src/client/cameras.ts` — `TpsCamera.addMouse()`:
  `desiredYaw = wrapAngle(desiredYaw - dx * 0.0024)`.
  Mouse right (`dx > 0`) **decreases** yaw. Under the documented convention
  (forward `= (sin yaw, cos yaw)`, +X right), mouse right must **increase**
  yaw. Horizontal look is inverted.
  Vertical: `desiredPitch = clamp(desiredPitch - dy * 0.0022, ...)`; mouse up
  (`dy < 0`) increases pitch — currently correct, but the sign is implicit
  and there are no `invertMouseX/invertMouseY` flags.

### Driver A/D mapping
- `src/client/game.ts` — `sendInputs()`: `steer = keyAxis('right') - keyAxis('left')`,
  so D sends `+1`, A sends `-1`. The mapping is standard, but the server
  reverses it while reversing (below).

### Reverse steering handling
- `src/shared/sim/match.ts` — `stepTank()`:
  `const reverseSign = newFwd < -0.1 ? -0.7 : 1; t.yaw += inp.steer * steerRate * dt * reverseSign;`
  A/D direction flips (and weakens) while reversing. Contract: direction must
  never flip; strength may be reduced by a non-sign factor.

### Camera yaw/pitch state
- `src/client/cameras.ts` — `TpsCamera` stores `yaw/pitch` plus
  `desiredYaw/desiredPitch`; yaw is wrapped to `[-π, π]` (bounded, not
  "unbounded" as required). Camera and look target are shared by both roles
  through the same class instance pattern; each role does get its own
  instance, but the rig is orbit-style, not a shooter rig.

### Camera `lookAt` target
- `src/client/cameras.ts` — `update()` ends with
  `camera.lookAt(tankPos + (0,1.35,0) [+ forward*2.5 for driver])`.
  Tank-centered orbit look — explicitly forbidden by the contract.

### Recenter formula
- `src/client/cameras.ts` — `update()`: `desiredYaw = tankYaw + Math.PI`.
  With the documented forward convention this places the camera **in front of
  the chassis looking backward**, not behind it. Also snaps: it directly
  overwrites `desiredYaw` (one-frame reorientation) instead of damping through
  the shortest angle.

### Gunner world aim calculation
- `src/client/cameras.ts` — `computeAim()` returns
  `yaw = Math.atan2(dx, dz)` (a **world** yaw) plus pitch.
- `src/client/game.ts` — `syncWorld()` assigns that world yaw directly to
  `this.localTurretYaw` and sends it as `aimYaw`; the server
  (`src/server/room.ts` `sanitizeGunner`, `src/shared/sim/match.ts`
  `stepWeapons`) treats it as the turret target. The client also renders
  `turret.rotation.y = tank.yaw + turretYaw`, so the world yaw is treated as
  local in the server/state while chassis yaw is added again at render —
  world/local spaces are mixed.

### Turret local/world yaw handling
- `src/shared/types.ts` — `TurretState.yaw` is commented `// world`; in
  practice the protocol carries the client's world aim into a field that is
  then summed with chassis yaw (`muzzleWorld()` adds `t.yaw + tur.yaw`) and
  again at render (`t.yaw + state.turret.yaw`). Chassis yaw is applied twice
  in the client render path and the space is inconsistent.

### Predicted turret overwrite
- `src/client/game.ts` — `syncWorld()`:
  `if (role === 'gunner' && mode === 'online') { this.localTurretYaw = turretYaw; ... }`
  — the locally predicted turret is overwritten from authoritative state every
  render frame.

### Snapshot buffer and pair selection
- `src/client/game.ts` — `setSnapshot()` stores
  `{ t: performance.now()/1000, state }` (local arrival time, not server time)
  and keeps only two entries; `getRenderState()` picks the latest entry with
  `t <= targetT` and the entry before it — when render time is after the
  newest snapshot, the pair does **not** surround render time.

### Interpolation alpha use
- `src/client/game.ts` — `getRenderState()` computes `alpha` but `syncWorld()`
  never reads it; entities are placed at raw snapshot values (20 Hz stepping).

### Driver prediction status
- **Absent.** No local tank simulation, no input sequencing for prediction,
  no acknowledgement field in snapshots, no replay, no visual-error smoothing.

### Circle-box resolution formula
- `src/shared/math.ts` — `resolveCircleBox()`:
  `return { x: nx + dx * push, ... }` with `push = (r - dLen)/dLen`; the
  correction is applied from the closest point instead of the circle center,
  so penetrating circles are not moved to exact separation (a 0.5-penetration
  case resolves to the original position). No normal/penetration returned.

### Tank collision footprint
- `src/shared/sim/match.ts` — `stepTank()` uses a **single** circle
  (`tankCfg.collisionRadius = 1.35`) via `resolveCircle()`. Long chassis can
  enter walls. No substeps.

### Obstacle width/depth conversion
- `src/client/arenaView.ts` — camera colliders use
  `new BoxAround(x, z, Math.max(w, d), h)` — an 8×2 obstacle becomes 8×8.
  Physics uses exact `w/d` (via `resolveCircleBox`), but camera colliders are
  square-inflated.

### Camera collision method
- `src/client/arenaView.ts` — `cameraRayHit()` is a zero-width ray against
  exact AABBs; no camera-radius expansion (corner clipping), no ground
  clearance beyond a raw `eye.y` clamp, no pull-in/release damping.

### Clipboard handler
- `src/client/hud.ts` — `bind()`: `void navigator.clipboard?.writeText(code)`;
  no await, no rejection fallback, no success/failure feedback, Copy enabled
  before a real code exists (`------`).

### Duplicate UI handlers
- `src/client/hud.ts` — `makeScreens()` generic `data-act` wiring binds
  `practice`/`howto`/`back`/`main`, and `bind()` **also** binds
  `[data-act="practice"]` and `[data-act="howto"]` in the main menu — one
  click fires two handlers (e.g., Practice starts twice).

### EffectComposer pass lifecycle
- `src/client/game.ts` — `setRole()` calls `composer.reset()` and adds two
  fresh passes on every role/camera swap (practice Tab). Pass count stays at
  2 after reset, but passes/RTs are churned per swap and the camera reference
  is captured at creation time; refactor to reuse one pass set.

---

## 2. Coordinate convention (to be documented in code and `DECISIONS.md`)

```text
+Y: world up
+Z: chassis forward at yaw 0
+X: chassis right at yaw 0
positive yaw: clockwise viewed from above (+Z toward +X)
forward = (sin yaw, 0, cos yaw)
camera looks along forward

Mouse right  → yaw += dx * sensitivityX   (invertMouseX = false)
Mouse up     → pitch += -dy * sensitivityY (invertMouseY = false)
A → steer -1 → yaw decreases → chassis left
D → steer +1 → yaw increases → chassis right
Reverse reduces steering strength by a non-sign factor only.
```

---

## 3. Implementation plan

1. **Phase 1 — failing tests** (before behavior changes):
   - `tests/tpsCamera.test.ts` — mouse-right/up signs, recenter target and
     damping, unbounded yaw, pitch clamp, behind-chassis placement, camera
     collision pull-in, ground clearance, aim conversion.
   - `tests/tankKinematics.test.ts` — A/D forward and reverse, chassis-relative
     W, basis recompute, exact separation, multi-circle footprint, tunneling,
     wall sliding, resting stability.
   - `tests/interpolation.test.ts` — pair selection, alpha effect, shortest
     angle, out-of-order rejection, NaN safety.
   - `tests/clipboard.test.ts` — success, rejection fallback, missing API,
     invalid code.
   - Update `tests/math.test.ts` to the exact-separation contract.
2. **Shared modules**:
   - `src/shared/math.ts` — `CollisionContact`, corrected `resolveCircleBox`.
   - `src/shared/arena.ts` — contact-aware resolution with exact dims.
   - `src/shared/sim/tankKinematics.ts` — deterministic shared tank step
     (steering order, multi-circle footprint, substeps, ground).
   - `src/shared/net/interpolation.ts` — snapshot buffer + state interpolation.
   - `src/shared/config.ts` — footprint and safe-step tuning.
   - `src/shared/sim/match.ts` — use shared kinematics; local turret space.
   - `src/server/room.ts` — snapshot headers (`serverTime`, seq, ack seqs).
3. **Client**:
   - `src/client/tpsCamera.ts` — reusable shooter TPS rig (yaw/pitch,
     shoulder, vertical arm, swept-sphere collision, recenter damping, aim
     conversion helpers).
   - `src/client/game.ts` — separate Driver/Gunner controllers, predicted
     turret spaces, snapshot interpolation, Driver predictor + reconciliation,
     composer pass reuse, input enable/disable, `renderTank` test hook.
   - `src/client/input.ts` — `enabled`, clear on blur/visibility/pointer loss.
   - `src/client/arenaView.ts` — exact-width camera colliders.
   - `src/client/clipboard.ts` — secure copy + textarea fallback.
   - `src/client/hud.ts` — copy feedback/disable, remove duplicate handlers.
   - `src/client/main.ts` — wire new snapshot fields, input lifecycle, hooks.
4. **Verification** — `npm run build`, `npm test`, `npm run test:e2e`,
   `npm run test:loop`; new `e2e/tps.spec.ts` covering copy, directions,
   recenter, aim-while-turning, smooth movement, wall/high-speed collision,
   pointer capture, pause neutrality, full round, results, rematch, practice.
5. **Docs** — `README.md`, `BUILD_STATUS.md`, `DECISIONS.md`,
   `SMOKE_TEST.md`, `BUGFIX_REPORT_FINAL.md`.
