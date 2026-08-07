# Codex Prompt — Implement Recoil Crew TPS Aim Camera Stability Fix

Repository:

```text
https://github.com/mwl313/RecoilCrewDS
```

Target branch:

```text
quality-improvement
```

Binding specification:

```text
docs/quality/AIM_CAMERA_STABILITY_FIX_SPECIFICATION.md
```

If the specification is supplied outside the repository, copy it into that path first.

## Mission

Read the binding specification completely, inspect the current `quality-improvement` branch, confirm the described root causes against the actual current code, then implement and qualify the fix.

User requirements:

```text
- aim camera sometimes snaps to apparently random places
- downward aiming can jump unnaturally to exact straight-down
- true straight-down and straight-up cannon aim must remain for rocket jumping
- the camera should feel like a polished modern TPS/FPS mouse camera
- the camera must NOT lag behind the tank
```

Do not make assumption-based fixes.

## Starting audit

Run:

```bash
git fetch --all --prune
git status --short
git branch --show-current
git rev-parse HEAD
git log --oneline --decorate -30
git diff --stat origin/main...HEAD
```

Requirements:

```text
work only on quality-improvement
do not merge main
do not force-push
do not discard user changes
preserve current quality-improvement work
preserve Demo golden behavior
```

Read:

```text
docs/quality/AIM_CAMERA_STABILITY_FIX_SPECIFICATION.md
docs/quality/DASH_AND_CAMERA_TUNING_REPORT.md
docs/quality/QUALITY_IMPROVEMENT_IMPLEMENTATION_REPORT.md
```

Inspect at minimum:

```text
src/client/tpsCamera.ts
src/client/input.ts
src/client/app/cameraManager.ts
src/client/app/networkStatePresenter.ts
src/client/app/gameClient.ts
src/client/app/predictionController.ts
src/client/aim/trajectoryReticleProjector.ts
src/shared/vehicle/tankRigGeometry.ts
src/shared/vehicle/tankRigTypes.ts
src/shared/sim/arenaWorld.ts
src/client/cameraCollision.ts
tests/tpsCamera.test.ts
tests/input.test.ts
tests/gameplay04/tankRigGeometry.test.ts
tests/gameplay04/trajectoryReticle.test.ts
e2e/trajectoryReticle.spec.ts
e2e/controls.spec.ts
```

Discover other relevant current files as needed.

## Reconfirm these risks before editing

```text
1. Full vertical camera/turret limits are exact ±π/2.
2. World-point turret yaw is derived with atan2(dx,dz) as horizontal distance approaches zero.
3. Presenter contains a near-pole blend between world-hit aim and camera-direction aim.
4. Physical camera boom uses the same pitch as look direction all the way toward ±90°.
5. Downward world aim uses a flat scalar ground height rather than real groundHeightAt(x,z).
6. Pointer deltas accumulate in InputManager and are consumed through presentation/world sync instead of being guaranteed every RAF.
```

If newer work already changed any item, adapt to the actual code and document that fact.

## Non-negotiable behavior to preserve

```text
raw pointer-lock response
no dt multiplication on mouse delta
zero-lag horizontal camera follow
instant local turret response
separate Driver/Gunner camera state
camera collision position-only behavior
full straight-up weapon aim
full straight-down weapon aim
terrain-safe downward muzzle behavior
truthful trajectory reticle
server-authoritative weapon input
```

Do NOT add:

```text
camera follow lag
mouse smoothing
mouse acceleration
camera inertia
slow turret response
reduced pitch limits
snap-to-chassis yaw near vertical
arbitrary hard-coded aim offsets
```

## Implementation requirements

1. Keep explicit local camera yaw/pitch intent. At the pole, retain stored yaw rather than deriving yaw from an unstable near-zero horizontal vector.

2. Separate camera look pitch from physical boom pitch. Preserve full ±90° look/weapon intent while using a continuous pole-safe boom mapping. This is geometric mapping only—no temporal lag.

3. Replace the existing near-pole Euler blend with one dedicated pole-safe TPS aim resolver. Base conditioning on actual target geometry such as horizontalDistance / totalDistance. Blend directions, not Euler yaw. Use smooth transition plus hysteresis.

4. Replace flat `groundY` production aiming with actual `groundHeightAt(x,z)` or an equivalent world-surface ray query. Choose the closest valid terrain/collider hit.

5. Consume/update camera input every active gameplay RAF, not only when a fresh world/presentation frame exists. Use the last valid rendered/predicted tank pose as the temporary camera anchor when necessary.

6. Harden pointer-lock transitions: finite movement checks; clear accumulated dx/dy on lock acquire and loss; preserve acquisition-click no-fire behavior. Add diagnostics before introducing any arbitrary delta cap.

7. Preserve instant local turret prediction. Do not rate-limit the turret to conceal the bug.

8. Preserve trajectory-reticle truth and exact straight-up/down projectile behavior.

## Required tests

Implement all tests in the binding specification, especially:

```text
fine pitch sweeps through ±90°
yaw continuity while near vertical
return from vertical without yaw flip
direct target-to-pivot singularity
flat/slope/valley/ramp/roof terrain aim
terrain↔collider closest-hit transitions
missing-presentation-frame mouse input
pointer-lock loss/reacquire
large legitimate fast flick
Single Player vs multiplayer Gunner parity
Driver observation of Gunner turret
shell/reticle parity at normal, steep and exact vertical pitch
```

Endpoint reachability alone is not enough. Continuity is the primary acceptance requirement.

## Browser qualification

Use real pointer lock and run:

```text
60 seconds normal aiming
rapid horizontal flicks
slow/fast downward sweep
slow/fast upward sweep
360° yaw near straight down
360° yaw near straight up
straight-down rocket-jump shot
airborne downward aim
wall collision while near vertical
valley/ramp/rooftop aim
pause/resume
pointer-lock loss/reacquire
Single Player
two-client Gunner
two-client Driver observing Gunner
```

Capture diagnostics and video/trace when possible. Do not claim continuity from screenshots alone.

## Reports

Create:

```text
docs/quality/AIM_CAMERA_STABILITY_FIX_REPORT.md
docs/quality/AIM_CAMERA_STABILITY_PHASE_HANDOFF.md
```

Include:

```text
starting SHA
ending SHA
confirmed root causes
old/new aim pipeline
pole-conditioning formula
thresholds/hysteresis and why
boom-pitch mapping
terrain-ray method
input-loop ownership changes
pointer-lock guards
tests added
tests run
browser scenarios run
performance timings
known limitations
evidence paths
confirmation zero-lag horizontal follow remains
confirmation ±90° weapon articulation remains
confirmation main was not merged
```

## Qualification commands

Inspect the current `package.json` and run the real current equivalents of:

```bash
npx tsc --noEmit
npm test
npm run build
npm run test:demo
npm run test:netcode
npm run test:horde
npm run test:progression
npm run test:e2e
```

Also run focused camera/aim suites directly.

If a monolithic Playwright invocation hits an external timeout, run the same exact set in bounded groups and report it honestly.

## Forbidden shortcuts

Do not:

```text
add camera lag
enable horizontal follow smoothing
smooth normal mouse input
add mouse acceleration
rate-limit camera or turret
remove exact vertical weapon aim
reduce pitch range
snap yaw to chassis
snap yaw to zero
treat atan2(0,0) as meaningful
leave the current near-pole blend as the final solution
retain fake tank-height flat-plane aiming
increase snapshot frequency to hide the issue
rewrite unrelated dash/vehicle/map/monster/UI/audio systems
merge into main
```

## Definition of done

```text
[ ] No random camera snap reproduced under the new tests
[ ] No unnatural jump into straight-down on slow or fast aim
[ ] Upward pole equally stable
[ ] Yaw preserved through vertical aim
[ ] Camera remains immediate
[ ] Camera remains horizontally locked to tank
[ ] Real terrain used for world aim
[ ] Normal TPS parallax preserved
[ ] Full straight-up/down weapon aim preserved
[ ] Rocket-jump shot preserved
[ ] Reticle remains truthful
[ ] Pointer-lock transitions do not accumulate delta
[ ] Single Player and multiplayer Gunner agree
[ ] Driver sees correct Gunner turret
[ ] Tests/build/Demo/netcode pass
[ ] Real pointer-lock browser qualification passes
[ ] Reports complete
[ ] quality-improvement remains unmerged
```

Fix the discontinuous math and input ownership while preserving the fast TPS feel. Do not make the camera slower to make the bug less visible.
