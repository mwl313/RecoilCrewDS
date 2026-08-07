# TPS Aim Camera Stability Phase Handoff

## Status

The original implementation was completed on `quality-improvement`, merged to
`main`, and later amended there with pole-safe camera input and vertical weapon
lock. The current pole-control amendment remains uncommitted until requested.

- Original implementation baseline: `1e7307357a5daf26b6281163f01ef67ba5528488`
- Branch: `main` (the original work was completed on `quality-improvement`).
- Main inclusion: merged; subsequent pole-control amendments are maintained on `main`.
- Live development server: port 5050 was running from this worktree during qualification.
- Detailed rationale/results: [AIM_CAMERA_STABILITY_FIX_REPORT.md](AIM_CAMERA_STABILITY_FIX_REPORT.md)
- Binding specification: [AIM_CAMERA_STABILITY_FIX_SPECIFICATION.md](AIM_CAMERA_STABILITY_FIX_SPECIFICATION.md)

## Acceptance checklist

### Camera feel

- [x] No temporal camera smoothing added.
- [x] Rigid horizontal follow preserved (`horizontalFollowSeconds = 0`).
- [x] Mouse delta remains raw and independent of `dt`.
- [x] Physical boom is continuous, monotonic, and pole-safe.
- [x] Visual camera pitch stops at `±86°`; weapon pitch retains exact `±π/2`.
- [x] Horizontal camera input fades from 78° and is zero at/after 84°.
- [x] Collision changes position only, never yaw/pitch.

### Aim stability

- [x] Dedicated TPS resolver replaces presenter-local Euler blending.
- [x] Direct target/pivot conditioning ratio is used.
- [x] Safe-boom exact-pole intent is also recognized.
- [x] Pitch and shortest-path yaw are interpolated separately; opposing 3D
      direction vectors cannot cancel near the pole.
- [x] Last stable weapon yaw is latched through vertical lock.
- [x] Pitch assist begins at 70° and reaches exact vertical at 84°.
- [x] Fine up/down approach and return sweeps pass.
- [x] 360°+ yaw near both poles passes.
- [x] Direct-pivot singularity passes.
- [x] No arbitrary 180° flip was observed.

### World targeting

- [x] Scalar tank-height plane removed from production aim.
- [x] Actual `groundHeightAt(x, z)` is used.
- [x] Terrain march is bounded to 64 samples.
- [x] Binary refinement is bounded to 10 samples.
- [x] Closest positive terrain/collider ordering is tested.
- [x] Flat, slope, raised surface/roof, and transition cases pass.
- [x] Terrain parallax is unchanged through 10° of camera divergence.
- [x] Larger close-cover divergence compresses continuously toward 14°.
- [x] No hard near-wall aim-mode switch or temporal barrel smoothing is used.

### Input ownership

- [x] Pointer delta consumed once per active RAF.
- [x] Last valid render-tank anchor is retained.
- [x] Missing presentation frame does not stop local camera update.
- [x] Missing-frame test shows no later accumulated burst.
- [x] Lock acquisition and loss both zero pointer accumulators.
- [x] Acquisition click does not fire.
- [x] Non-finite movement is rejected.
- [x] Large finite flick remains uncapped and immediate.

### Weapon/reticle

- [x] Exact straight-down cannon pitch works.
- [x] Exact straight-up cannon pitch works.
- [x] Single Player, multiplayer Driver, and multiplayer Gunner share the same
      camera controls, geometry, sensitivity, FOV behavior, and full range/path.
- [x] Local predicted turret remains instant.
- [x] Terrain-safe downward muzzle direction is preserved.
- [x] Truthful predicted-projectile reticle remains on-screen and finite.
- [x] A compact green diamond identifies exact vertical lock.
- [x] Network cadence/protocol unchanged.

### Qualification

- [x] TypeScript passed.
- [x] Focused suite passed: 70 tests.
- [x] Netcode suite passed: 33 tests.
- [x] Demo golden passed unchanged.
- [x] Client and server builds passed.
- [x] Relevant Playwright matrix passed: 20 tests.
- [x] Missing-frame and query-performance Playwright tests passed.
- [x] Dedicated 60-second real-pointer-lock qualification passed.
- [x] Live 5050 in-app browser acquired pointer lock with no console errors.
- [x] Camera query p95 0.10 ms; aim query p95 0.20 ms.
- [ ] Full repository suite is not entirely green: 1,166/1,170 passed, with three stable unrelated Driver predictor assertions and one non-reproducing charge-state flake documented in the report.

## Safe staging scope

The worktree contains extensive unrelated monster-pipeline changes. A future commit should stage only these camera milestone paths unless the user explicitly requests combining work:

```text
docs/quality/AIM_CAMERA_STABILITY_FIX_SPECIFICATION.md
docs/quality/CODEX_AIM_CAMERA_STABILITY_FIX_PROMPT.md
docs/quality/AIM_CAMERA_STABILITY_FIX_REPORT.md
docs/quality/AIM_CAMERA_STABILITY_PHASE_HANDOFF.md
src/client/aim/tpsWeaponAimResolver.ts
src/client/tpsCamera.ts
src/client/app/cameraManager.ts
src/client/app/gameClient.ts
src/client/app/networkStatePresenter.ts
src/client/input.ts
src/client/main.ts
tests/tpsWeaponAimResolver.test.ts
tests/tpsCamera.test.ts
tests/input.test.ts
e2e/tps.spec.ts
e2e/aim-camera-stability.spec.ts
```

Do not stage the modified Quaternius GLBs, monster manifests, generated presentation content, monster importer scripts, ZIPs, or monster reports as part of the camera commit without explicit approval.

## Reproduction commands

```powershell
npx tsc --noEmit
npx vitest run tests/tpsWeaponAimResolver.test.ts tests/tpsCamera.test.ts tests/input.test.ts tests/gameplay04/tankRigGeometry.test.ts tests/gameplay04/trajectoryReticle.test.ts
npm run test:netcode
npm run test:demo
npm run build
npx playwright test e2e/tps.spec.ts e2e/controls.spec.ts e2e/gunner-responsiveness.spec.ts e2e/trajectoryReticle.spec.ts
npx playwright test e2e/aim-camera-stability.spec.ts
```

## Next-agent notes

1. Do not reintroduce camera input into `NetworkStatePresenter.syncWorld()`.
2. Do not replace the direction-space resolver with Euler yaw interpolation.
3. Do not reduce weapon pitch range to avoid the singularity.
4. Do not add time-based boom smoothing or mouse rate limiting.
5. Preserve the actual terrain callback through center-ray, muzzle, and reticle paths.
6. If tuning thresholds for a new tank rig, record `horizontalRatio`, `cameraHorizontalRatio`, `conditioningRatio`, blend weight, and reticle continuity first.
7. If committing, stage selectively because unrelated monster changes are still present.
