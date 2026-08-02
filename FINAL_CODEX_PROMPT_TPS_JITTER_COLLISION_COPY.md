# FINAL CODEX PROMPT — Fix Recoil Crew DS Controls, TPS Cameras, Jitter, Collision, and Copy

You are applying a foundational corrective patch to an existing complete game.

Do not replace the game.

Do not reduce it to a prototype.

Do not stop after planning.

Read every file in the repository, then read these reference documents in full:

```text
RECOIL_CREW_ONESHOT_DESIGN.md
README.md
DECISIONS.md
BUILD_STATUS.md
BUGFIX_REPORT_1.md

MILESTONE_2_1_GUNNER_TPS_FIX.md
MILESTONE_2_1_1_MODERN_TPS_CAMERA(2).md
MILESTONE_2_1_2_DRIVER_TPS_CAMERA(2).md
MODERN_TPS_CAMERA_FEEL_CHECKLIST(1).md

FINAL_BUGFIX_TPS_JITTER_COLLISION_COPY.md
```

Treat `FINAL_BUGFIX_TPS_JITTER_COLLISION_COPY.md` as the binding implementation contract.

The Unity documents define behavior and acceptance quality only.

This project remains TypeScript, Three.js, Node.js, and WebSocket.

Do not add Unity or Cinemachine.

---

# Objective

Deliver all of the following together:

1. Correct, standard, non-inverted Driver TPS controls
2. Correct, standard, non-inverted Gunner TPS controls
3. Independent Driver and Gunner local camera state
4. Correct Gunner world-to-local turret aiming
5. Smooth tank rendering instead of low-rate snapshot stepping
6. Driver local prediction with authoritative reconciliation
7. Correct stable tank/world collision
8. Camera-radius collision without tank/floor/wall clipping
9. Reliable room-code copy with fallback and feedback
10. No regression to the complete 90-second game loop

---

# Required initial report

Before editing, identify exact files, functions, and current behavior for:

- Mouse X and Y signs
- Driver A/D mapping
- Reverse steering handling
- Camera yaw/pitch state
- Camera `lookAt` target
- Recenter formula
- Gunner world aim calculation
- Turret local/world yaw handling
- Predicted turret overwrite
- Snapshot buffer and pair selection
- Interpolation alpha use
- Driver prediction status
- Circle-box resolution formula
- Tank collision footprint
- Obstacle width/depth conversion
- Camera collision method
- Clipboard handler
- Duplicate UI handlers
- EffectComposer pass lifecycle

Write a concise plan in `BUGFIX_PLAN_FINAL.md`, then implement immediately.

---

# Phase 1 — Add failure-reproducing tests

Before changing behavior, add tests proving the current failures.

Required failures:

```text
mouse-right does not reliably look right
mouse-up does not reliably look up
reverse A/D semantics are inverted or inconsistent
camera recenter is wrong or snaps
Gunner world aim is treated as local yaw
chassis yaw is applied twice to turret rendering
snapshot alpha does not affect rendered pose
snapshot pair does not surround render time
circle-box correction does not produce exact separation
8×2 obstacles become square camera colliders
Clipboard rejection has no fallback
one UI click can invoke duplicate handlers
```

Do not delete or weaken current tests.

---

# Phase 2 — Establish conventions

Document one coordinate convention in code comments and `DECISIONS.md`.

User-facing requirements are fixed:

```text
Mouse right → look right
Mouse up → look up
A → chassis left
D → chassis right
```

Add:

```ts
invertMouseX = false
invertMouseY = false
```

Do not hide direction fixes inside arbitrary negative signs.

---

# Phase 3 — Replace the orbit camera with a real Three.js TPS rig

Create or refactor a reusable role-independent implementation such as:

```text
src/client/tpsCamera.ts
```

Driver and Gunner must own separate instances.

The rig must:

- Own unbounded yaw
- Own clamped pitch
- Consume raw pointer-lock delta without multiplying by `dt`
- Build forward from yaw/pitch
- Build shoulder/right vector
- Apply shoulder offset
- Apply vertical arm
- Place camera behind view-forward
- Orient camera along view-forward
- Avoid tank-centered `lookAt`
- Resolve camera-radius collision
- Apply ground clearance
- Pull inward quickly
- Release outward promptly
- Recenter through shortest-angle damping
- Remain local
- Never read network turret correction

Starting values come from the final contract.

Do not merely adjust the current orbit camera sensitivity.

---

# Phase 4 — Fix Driver controls

Driver requirements:

```text
A always turns chassis left.
D always turns chassis right.
Reverse may reduce steering strength but does not flip direction.
Mouse changes camera only.
W remains chassis-forward regardless of camera direction.
R recenters local camera behind chassis.
```

Remove implicit reverse inversion.

Ensure camera yaw never enters authoritative Driver movement input.

Add browser tests for forward, reverse, side-look, and backward-look driving.

---

# Phase 5 — Fix Gunner camera and turret spaces

Maintain separate:

```ts
cameraYawWorld
cameraPitch

desiredTurretYawLocal
desiredTurretPitch

predictedTurretYawLocal
predictedTurretPitch

authoritativeTurretYawLocal
authoritativeTurretPitch
```

After final camera collision:

```text
center ray
→ world aim point
→ desired world yaw
→ subtract chassis world yaw
→ desired local turret yaw
```

Render:

```ts
turretRoot.rotation.y = predictedTurretYawLocal;
```

Authoritative muzzle:

```ts
worldMuzzleYaw = tankYawWorld + authoritativeTurretYawLocal;
```

Add chassis yaw exactly once.

Do not overwrite predicted turret from authoritative state every frame.

Move predicted turret at finite configured rates.

Reconcile using shortest angular distance.

Never rotate camera from turret state.

---

# Phase 6 — Fix snapshot interpolation

Refactor snapshot buffering so it uses server sequence/time and discards out-of-order data.

Choose the actual pair surrounding render time.

Apply alpha to continuous render state.

Interpolate:

- Tank position/yaw/pitch/roll
- Authoritative turret
- Enemies
- Loot Truck
- Snapshot-rendered projectiles

Use shortest-angle interpolation.

Do not interpolate discrete events or score state.

Add deterministic tests proving alpha changes the rendered position.

---

# Phase 7 — Add Driver local prediction

Extract or reuse shared deterministic tank movement and collision logic.

Add Driver input sequence and processed-input acknowledgement.

Driver client must:

```text
predict immediately
→ send sequenced input
→ receive authority
→ discard acknowledged input
→ replay remaining input
→ smooth small visual error
```

Snap only for respawn, Wipeout, or extreme invalid divergence.

The dedicated server remains authoritative.

Do not predict enemies or Gunner-controlled shared physics beyond the defined turret presentation.

---

# Phase 8 — Fix authoritative collision

Correct `resolveCircleBox()`.

Return normal and penetration.

Replace the single tank circle with an oriented capsule or three-circle chassis footprint.

Use exact obstacle dimensions.

Recompute basis after steering.

Use displacement-based substeps during boost/recoil/high speed.

Remove inward velocity and preserve tangent sliding.

Use repeated resolution iterations where needed.

Add tests for:

- exact separation
- no deeper push
- no tank-nose penetration
- no tunneling
- no resting oscillation
- wall sliding

---

# Phase 9 — Fix camera collision

Replace the thin camera ray with a swept-sphere approximation.

Expand obstacle AABBs by camera radius or implement equivalent sphere/AABB sweep.

Use exact obstacle width and depth.

Exclude tank visuals, pickups, VFX, UI, and triggers.

Prevent:

- floor clipping
- tank clipping
- corner clipping
- invisible square collision volumes
- long compressed recovery

Camera collision changes position only.

It never changes yaw, pitch, crosshair, or gameplay aim state.

---

# Phase 10 — Fix clipboard, UI, and lifecycle

Create:

```text
src/client/clipboard.ts
```

Implement:

```text
secure Clipboard API
→ awaited result
→ textarea selection fallback
→ success/failure feedback
```

Disable Copy before valid code.

Keep code selectable.

Remove duplicate menu handlers.

Ensure one click triggers one action.

Ensure camera/role swaps do not accumulate composer passes.

Add explicit input enable/disable.

Clear held state on blur, visibility loss, pointer loss, pause, disconnect, and teardown.

The pointer-capture click must not fire.

---

# Phase 11 — Run complete verification

Run and truthfully report:

```bash
npm run build
npm test
npm run test:e2e
npm run test:loop
```

Add or update Playwright tests for:

- Copy code
- Driver mouse directions
- Driver A/D forward and reverse
- Driver camera recenter
- Driver camera independence
- Gunner mouse directions
- Gunner aim while chassis rotates
- Smooth render movement
- Wall collision
- High-speed collision
- Pointer capture
- Pause/overlay neutral input
- Full round
- Results
- Rematch
- Practice

Update:

```text
README.md
BUILD_STATUS.md
DECISIONS.md
SMOKE_TEST.md
BUGFIX_REPORT_FINAL.md
```

---

# Non-negotiable acceptance

Do not claim completion unless all are true:

```text
Mouse right looks right for Driver.
Mouse right looks right for Gunner.
Mouse up looks up for Driver.
Mouse up looks up for Gunner.

A turns chassis left.
D turns chassis right.
Reverse does not unexpectedly invert A/D.

Driver camera does not alter steering.
Driver camera does not alter turret.
Gunner camera does not wait for network.
Network correction moves turret only.

Gunner aim remains on the intended world point while chassis turns.
Turret local yaw is rendered locally.
Chassis yaw is added exactly once.

Rendered tank no longer steps at snapshot rate.
Driver input has immediate predicted response.
Prediction reconciles to server authority.

Collision resolution reaches valid separation.
Tank nose does not visibly enter walls.
Boost and recoil do not tunnel.
Camera does not clip tank, floor, walls, or corners.

Copy code works or gives a usable fallback.
The complete game loop still works.
```

---

# Forbidden shortcuts

Do not:

- Reverse the entire world or tank model to hide input signs.
- Make Driver movement camera-relative.
- Network camera transforms.
- Couple Gunner camera to turret.
- Add heavy rotation smoothing.
- Call the existing orbit camera “fixed” after tuning values.
- Smooth the tank visually while leaving snapshot pairing broken.
- Hide collision jitter with interpolation alone.
- Increase collider size to hide tunneling.
- Remove enemies, PIP, JACKPOT, results, or rematch.
- Claim success without running browser tests.

---

# Final report

Return:

1. Root causes confirmed
2. Coordinate convention
3. Files added
4. Files modified
5. Driver control changes
6. Driver camera architecture
7. Gunner camera architecture
8. Turret coordinate correction
9. Snapshot interpolation implementation
10. Prediction/reconciliation implementation
11. Collision implementation
12. Camera collision implementation
13. Clipboard implementation
14. Tests added
15. Build result
16. Unit result
17. E2E result
18. Full-loop result
19. Remaining limitations
20. Exact manual validation instructions
