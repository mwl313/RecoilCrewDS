# Dash and Camera Tuning Report

## Scope and baseline

- Branch: `quality-improvement`
- Milestone starting SHA: `f0f4fc1824da5bf4b08f2cfae24e787ba17902ae`
- Ending implementation SHA at final qualification: `a28da4a`
- Phase: A — vehicle and camera feel
- Simulation cadence: 30 Hz
- Protocol: bumped from 12 to 13 because snapshots now carry authoritative dash phase and temporary-velocity state.

## Dash root cause

The former dash added a one-frame impulse to the tank's combined horizontal velocity. On the following simulation step, ordinary drive decomposition treated that combined value as base driving velocity and clamped it to the normal forward-speed limit. The dash therefore had no independent lifetime and normal driving erased it.

The replacement explicitly separates:

```text
clamped base driving velocity
+ captured-direction temporary dash velocity
= final horizontal velocity
```

Each tick removes the previous temporary contribution before ordinary drive processing, advances the authoritative dash curve, then adds the temporary contribution back. Recoil and other external impulses remain part of base velocity and are not misclassified as dash velocity.

## Dash state and tuning

| Parameter | Value | Purpose |
| --- | ---: | --- |
| State | `inactive`, `burst`, `recovery` | Authoritative movement and ram gate |
| Peak multiplier | 2.05× | Target peak relative to 18 m/s normal maximum |
| Burst | 0.38 s | Acceleration, peak, curved decay |
| Time to peak | 0.08 s | Fast but visible acceleration |
| Full direction lock | 0.12 s | No input steering at burst start |
| Late burst steering | 0.20 | Maximum input-steering influence before recovery |
| Recovery | 0.20 s | Curved return to ordinary driving |
| Recovery entry ratio | 0.28 | Remaining peak contribution at recovery start |
| Cooldown | 0.80 s | Existing value preserved |
| Dash safety cap | 42 m/s | Above tuned peak; collision/substep protection |

Direction is the chassis forward vector captured on the accepted activation edge. Camera yaw, turret yaw, and current velocity direction are not read. Wall contact opposing that vector terminates the damage window and transfers the burst to recovery; tangent sliding remains available.

At 30 Hz from rest with full throttle, the deterministic trace measured:

| Time | State | Final speed | Dash component | Steering multiplier |
| ---: | --- | ---: | ---: | ---: |
| 33 ms | burst | 14.17 m/s | 13.70 m/s | 0.000 |
| 67 ms | burst | 34.67 m/s | 33.73 m/s | 0.000 |
| 100 ms | burst | 37.50 m/s | 36.10 m/s | 0.000 |
| 200 ms | burst | 30.00 m/s | 27.20 m/s | 0.045 |
| 367 ms | burst | 15.49 m/s | 10.35 m/s | 0.198 |
| 400 ms | recovery | 15.52 m/s | 9.92 m/s | 0.222 |
| 533 ms | recovery | 8.87 m/s | 1.41 m/s | 0.890 |
| 600 ms | inactive | 8.40 m/s | 0.00 m/s | 1.000 |

Peak speed was 37.50 m/s, or 2.083× the 18 m/s normal maximum. The burst-to-recovery boundary changed final speed by only 0.03 m/s in this trace; no hard cutoff occurs.

The frozen Phase-0 Demo uses an explicit `legacyImpulse` compatibility option so its deterministic golden remains byte-identical. Validated content matches, production multiplayer authority, and the shared client predictor use `stateful`.

## Camera root cause and tuning

The former controller copied the tank position directly into one follow position and coupled follow placement to the same update that shortened the collision boom. It had no separately observable target/smoothed anchor relationship and no vertical leash.

The replacement keeps three concerns separate:

1. Tank-relative target pivot.
2. Rigid ground-plane follow plus a separately smoothed vertical pivot.
3. Wall/terrain boom collision and release.

| Parameter | Value |
| --- | ---: |
| Horizontal follow | Rigid (0 s) |
| Upward vertical follow | 0.14 s |
| Downward vertical follow | 0.10 s |
| Hard vertical leash | 2.0 m |
| Discontinuity reset distance | 12.0 m |
| Collision pull-in | 0.02 s |
| Collision release | 0.10 s |
| Maximum processed frame delta | 0.10 s |

The rendered tank is already presentation-smoothed, so applying a second horizontal filter made the vehicle slide and jitter relative to the camera. Ground-plane follow is therefore rigid again. The downward vertical time constant remains deliberately faster than the upward value. The hard leash clamps only the smoothed pivot relative to the live tank target; collision is still allowed to shorten the camera boom but cannot leave a stale world-space height behind. A move greater than 12 m in one rendered update is treated as a respawn/teleport and resets the follow state instead of flying the camera through world collision toward the new position.

In the deterministic 9 m / 1.5 s valley descent test, maximum observed vertical lag was 0.551 m and settled lag after one second was effectively 0.000 m, both inside the 2.0 m leash. Horizontal lag remained exactly 0 m.

## Diagnostics

- `tankDashDiagnostics` exposes phase, elapsed time, derived base speed, temporary dash speed, final speed, captured direction, steering multiplier, and cooldown.
- `PredictionController.dashDiagnostics()` exposes the predictor's authoritative/replayed view.
- `TpsCameraController.getFollowDiagnostics()` exposes target and smoothed anchor height, vertical and horizontal lag, boom distance, and collision state.
- `CameraManager.getCameraState()` includes the active rig's follow diagnostics.

## Verification

- Dash/camera/netcode focused suite: 101 tests passed.
- Additional Phase A and legacy-contact suite: 67 tests passed.
- TypeScript: `npx tsc --noEmit` passed.
- Client production build passed.
- Demo golden passed unchanged.
- Final full repository suite passed: 150 files, 1,144 tests.
- Final browser coverage passed the real one-press dash state check, two-client shared prediction, wall/high-speed collision, complete multiplayer round/rematch, and production boss reconnect.
- Browser play evidence: [phase-a-stateful-dash.png](evidence/phase-a-stateful-dash.png) shows an accepted production dash at 125 km/h (34.72 m/s), well above the ordinary 64.8 km/h maximum.

Required automated scenarios cover chassis-forward capture, normal-cap separation, steering lock, curve decay, terminal smoothness, authoritative contact gate, server/predictor replay agreement, valley descent, hill crest, ridge jump, cliff fall, rolling terrain, airborne rotation, wall collision/release, and frame spikes.

Browser/device: Chrome 151, Windows, 1280×720, NVIDIA GeForce RTX 4060 Ti through ANGLE D3D11. Video clips were not produced by this environment; the committed screenshot, deterministic camera traces, and Playwright movement/reconnect checks are the retained evidence. Further feel tuning should be based on human play, not a change to the authority/prediction architecture.
