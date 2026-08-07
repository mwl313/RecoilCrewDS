# TPS Aim Camera Stability Fix Report

## Execution record

- Working branch: `quality-improvement`
- Starting SHA: `1e7307357a5daf26b6281163f01ef67ba5528488`
- Ending source state: uncommitted working tree on the same SHA; this task did not request a commit or push.
- Demo golden: unchanged and passing.
- Current implementation was not merged back to `main`.
- Before implementation, the user explicitly requested that the then-current repository state be merged into local `main`. That pre-task merge is local commit `696fa15`; it does not contain this aim-camera implementation.
- Unrelated in-progress monster source, generated content, GLBs, ZIPs, and reports were preserved and were not edited as part of this fix.

## Confirmed root causes

The random snap was not one isolated camera interpolation bug. Six conditions combined:

1. Exact weapon limits of `-π/2..+π/2` made horizontal yaw mathematically undefined at the poles.
2. The old world-point solver allowed `atan2(0, 0)` or a near-zero horizontal projection to influence turret yaw.
3. The presenter blended Euler yaw values near vertical, so unstable world yaw still participated in the result.
4. Camera look pitch and physical boom pitch were identical; exact vertical intent drove the eye through a singular overhead/under-tank arrangement.
5. The center ray fell back to a scalar tank-height plane instead of the actual terrain surface.
6. Pointer deltas were consumed only when presentation/world sync ran, so a skipped frame could accumulate several RAFs of input and apply them as one burst.

The earlier camera-lag correction remains intact: ordinary horizontal follow is rigid, mouse deltas are not multiplied by `dt`, and no new temporal camera smoothing was introduced.

## Old and new frame paths

Old:

```text
network/simulation frame available
→ presenter sync
→ consume accumulated pointer delta
→ update camera
→ flat-plane/collider aim
→ ad hoc Euler pole blend
→ predicted turret and reticle
```

New:

```text
every active gameplay RAF
→ consume pointer delta exactly once
→ use current render tank or last valid rendered anchor
→ update local camera immediately
→ closest real terrain/collider target
→ dedicated pole-safe direction resolver
→ instant predicted turret
→ truthful predicted-projectile reticle
→ presentation/world sync when a frame exists
```

## Pole-safe physical boom

The gameplay camera is deliberately limited to `±86°`, while the weapon
resolver reaches exact `±90°`. This keeps the view out of the Euler pole and
leaves the exact vertical direction available for recoil movement.

| Parameter | Value |
| --- | ---: |
| Identity region | `0°..50°` absolute pitch |
| Exact-pole boom pitch | `65°` absolute pitch |
| Camera look endpoints | `-86°` and `+86°` |
| Exact weapon endpoints | `-90°` and `+90°` |
| Mapping | monotonic cubic Hermite |
| Temporal damping | none |

The curve has identity slope where it leaves 50°, approaches the bounded 65°
boom with zero end slope, and is mirrored for up/down. Horizontal camera input
remains full through 78°, fades smoothly to zero by 84°, and remains suppressed
through the 86° camera endpoint. Yaw therefore cannot become rapid screen-roll
when the cannon is vertically locked.

## Pole-conditioning metric and resolver

`resolveTpsWeaponAim()` is isolated in `src/client/aim/tpsWeaponAimResolver.ts`. It receives the rendered tank/rig, actual world target, stored camera yaw/pitch, and resolved weapon limits.

The primary geometric condition is:

```text
horizontalRatio = hypot(target.x - pivot.x, target.z - pivot.z)
                / max(distance(target, pivot), epsilon)
```

Because the safe physical boom intentionally leaves the camera laterally offset at exact vertical, its ground hit may not lie directly beneath the turret pivot. The resolver therefore also computes:

```text
cameraHorizontalRatio = abs(cos(lookPitch))
conditioningRatio = min(horizontalRatio, cameraHorizontalRatio)
```

Real target geometry remains authoritative in normal conditions. Down/up pitch
assist begins at 70° absolute camera pitch and smoothly reaches an exact weapon
pitch at 84°. Yaw stabilization begins separately at 78°, captures the last
stable world yaw, and reaches full authority at 84°.

| Threshold | Absolute camera pitch | Behavior |
| --- | ---: | --- |
| Pitch assist begins | 70° | Parallax pitch starts yielding to vertical intent |
| Yaw stabilization begins | 78° | Last stable world yaw is latched |
| Exact vertical lock | 84° | Weapon is exactly ±90° and camera yaw input is zero |
| Camera endpoint | 86° | Visual view remains outside the mathematical pole |

Pitch and yaw use independent smoothstep weights. Yaw is interpolated by the
shortest angle and pitch is interpolated as a scalar; raw 3D directions are no
longer blended near a pole. This prevents opposing shoulder-parallax and camera
vectors from cancelling into a near-zero horizontal vector and accelerating
`atan2()` through a backwards rotation.

## Real terrain-aware center ray

`computeWorldAim()` no longer accepts scalar `groundY`. It receives `groundHeightAt(x, z)` and:

1. Queries candidate collider AABBs out to 90 m.
2. Keeps the nearest positive collider hit.
3. Marches no more than 64 steps along the ray up to that distance.
4. Detects the first positive-to-nonpositive ray/terrain clearance crossing.
5. Refines that interval with exactly 10 or fewer binary steps.
6. Returns the nearer valid terrain or collider hit; otherwise it returns the 90 m range point.

Tests cover flat ground, a slope, raised roof/ramp-like surfaces, and terrain-before-collider/collider-before-terrain ordering. The same actual ground callback is used by the trajectory reticle and terrain-safe muzzle path.

### Close-parallax safety envelope

Terrain following remains exact while the terrain-derived barrel direction is
within 10° of camera intent. Beyond 10°, divergence is compressed continuously
toward an asymptotic 14° limit. This is a soft geometric envelope, not a new
aim mode or a temporal filter: there is no threshold snap, ordinary slope aim
is unchanged, and the reticle still reports the real predicted impact. Because
the envelope is centered on camera intent, deliberate vertical rocket-jump
aiming retains the existing exact-pole assist.

## RAF ownership and pointer-lock hardening

- `GameClient` consumes mouse input every active gameplay RAF, outside presenter sync.
- A cloned last-valid rendered tank is retained as camera anchor when a fresh presentation frame is absent.
- Camera, aim, predicted turret, and reticle are updated before world presentation.
- The presenter no longer owns camera input, pole handling, aim solving, or reticle projection.
- Pointer accumulators are zeroed on both pointer-lock acquisition and loss.
- Loss still clears held gameplay keys/buttons and one-shot edges.
- The acquisition click still only acquires lock; it does not fire a weapon.
- Non-finite movement events are rejected and counted.
- Large legitimate finite flicks remain uncapped, immediate, and unsmoothed.

The test-only missing-frame switch proved that camera update count advances, the expected yaw change applies, and accumulated pointer deltas return to zero while presentation frames are suppressed.

## Weapon and reticle invariants

- Single Player, multiplayer Driver, and multiplayer Gunner use the same camera
  controls and geometry: 70° base FOV, 5.2 m boom, 0.65 m right-shoulder
  offset, 0.35 m shoulder height, identical speed FOV and sensitivity, `±86°`
  visual camera limits, and exact `±π/2` weapon limits. The higher/right placement keeps the barrel and turret
  from sitting directly over the forward sightline without changing aim math.
- Local predicted turret response remains `instant`.
- Server input cadence and snapshot rates were not changed.
- Chassis yaw is applied exactly once.
- The reticle remains based on predicted muzzle pose and the shared projectile integration, not a cosmetic screen-center marker.
- Exact vertical lock changes the reticle centre to a compact green diamond.
- Exact downward fire continues through `resolveTerrainSafeMuzzle()`: the muzzle is backed above terrain without altering its vertical shot direction, preserving the rocket-jump ground detonation case.

## Diagnostics added

Camera state/test hooks now expose:

- accumulated and last raw pointer delta;
- rejected non-finite event count;
- pointer-lock transition age and lock state;
- camera yaw/pitch before and after accepted input;
- pole-conditioned horizontal yaw input scale;
- camera position and per-rig RAF update count;
- look pitch, physical boom pitch, collision state, horizontal/vertical lag, and ground-clearance adjustment;
- world target distance and hit kind;
- terrain march/refinement counts;
- target horizontal distance/ratio, camera horizontal ratio, effective conditioning ratio, pole state, blend weight, and resolved yaw/pitch;
- live camera and aim query timings.

## Verification results

### Focused and deterministic

- `npx tsc --noEmit`: passed.
- Focused camera/input/aim/rig/reticle suite: 5 files, 70 tests passed.
- Netcode suite: 6 files, 33 tests passed.
- Demo regression: passed; `tests/fixtures/demo-golden.json` matched unchanged.
- Client and server production builds: passed.

New automated coverage includes 0.1° pitch sweeps into/out of both poles, 720° yaw traversal near both poles, direct-pivot singularity, safe-boom-offset terrain target, continuous hysteresis boundaries, terrain/collider ordering, exact vertical look/boom separation, large flicks, non-finite input, pointer-lock reacquisition, missing presentation frames, exact vertical turret/reticle integration, and timing bounds.

### Browser

- Relevant matrix: 20/20 passed across TPS controls, real Driver input, multiplayer Gunner input/actions, recentering, shared prediction, collision, pause/pointer capture, and trajectory reticle.
- Added performance/missing-frame cases: 2/2 passed.
- Dedicated 60-second real-pointer-lock driving/aim qualification: passed. It exercised ordinary aiming, cornering, rapid horizontal flicks, slow and fast sweeps into both poles, yaw motion while vertical, and return to ordinary aim.
- In-app browser on live `http://localhost:5050/?test=1`: real pointer lock acquired and the running game reported no console errors. Existing monster animation fallback warnings were unrelated.

Measured over 120 live gameplay RAFs at 1280×720 in the Playwright Chrome environment:

| Work | p95 | Max |
| --- | ---: | ---: |
| Camera collision/update query | 0.10 ms | 0.20 ms |
| Terrain-aware world aim query | 0.20 ms | 0.20–0.30 ms |

### Full repository suite

The broad run completed with 149/153 files and 1,166/1,170 tests passing. All four failures are outside this task's files:

- Three stable pre-existing Driver predictor pending-queue assertions in `jumpDash.test.ts`, `predictor.test.ts`, and `predictorNetwork.test.ts`.
- One `chargeStateMachine.test.ts` full-charge assertion failed in the broad parallel run but passed immediately in isolated rerun.

The camera specification explicitly excludes rewriting unrelated vehicle prediction or weapon balance, so those were recorded rather than changed.

## Principal files

- `src/client/aim/tpsWeaponAimResolver.ts`
- `src/client/tpsCamera.ts`
- `src/client/app/cameraManager.ts`
- `src/client/app/gameClient.ts`
- `src/client/app/networkStatePresenter.ts`
- `src/client/input.ts`
- `src/client/main.ts`
- `tests/tpsWeaponAimResolver.test.ts`
- `tests/tpsCamera.test.ts`
- `tests/input.test.ts`
- `e2e/tps.spec.ts`
- `e2e/aim-camera-stability.spec.ts`

## Known limitations

- The 64-step heightfield march assumes the authoritative `groundHeightAt` callback describes the first relevant vertical surface; collider AABBs remain the authority for walls/overhang sides.
- Thresholds are deliberately exposed constants and are validated for current rig/camera geometry. Future radically different rigs should capture the same diagnostics before retuning.
- The current dirty worktree includes unrelated monster pipeline work; camera files must be staged selectively if committed.
- No video artifact was produced. Retained evidence is the deterministic unit/E2E coverage, Playwright timing output, live 5050 pointer-lock check, and this report.
