# Recoil Crew — TPS Aim Camera Stability Fix Specification

## Document status

```text
Status: Binding implementation specification
Project: Recoil Crew
Repository: https://github.com/mwl313/RecoilCrewDS
Target branch: quality-improvement
Scope: TPS camera/aim stability, full vertical aiming, terrain-aware aim solving, pointer-lock/input ownership
Out of scope: camera lag, cinematic smoothing, weapon rebalance, general vehicle tuning, UI redesign, map redesign
```

This document fixes a specific class of aim-camera failures without degrading the responsive TPS feel that already works.

Observed problems:

```text
1. Camera/aim occasionally snaps to apparently random directions.
2. Aiming downward can suddenly jump unnaturally toward exact straight-down.
3. Full ±90° rocket-jump articulation is required and must remain available.
4. The camera must not lag behind the tank.
5. The camera should behave like a polished modern third-person shooter camera.
```

The implementation must correct the underlying discontinuous geometry and input ownership. It must not hide the bug by slowing the camera, damping the mouse, rate-limiting the turret, or introducing follow lag.

---

# 1. Current architecture and confirmed findings

## 1.1 Correct existing properties

Preserve these current behaviors:

```text
raw pointer-lock mouse delta
no dt multiplication on mouse input
unbounded yaw
clamped pitch
horizontal camera follow rigid by default
camera collision modifying position only
separate Driver/Gunner camera instances
instant local turret response
full vertical weapon articulation
truthful trajectory reticle
```

The production default horizontal follow is effectively rigid:

```text
horizontalFollowSeconds = 0
```

This is desirable and must remain.

## 1.2 Full vertical limits are exactly ±90°

The current shared vertical limits are:

```ts
VERTICAL_AIM_MIN_PITCH = -Math.PI / 2;
VERTICAL_AIM_MAX_PITCH =  Math.PI / 2;
```

The default turret/loadout uses the same exact range.

This is necessary for true upward/downward cannon articulation, especially rocket jumping.

The problem is not that ±90° exists. The problem is that several parts of the current world-point aim solution still assume horizontal yaw remains numerically meaningful as pitch approaches the poles.

---

# 2. Root causes

## 2.1 Pole singularity in world-point turret aiming

Current turret aiming conceptually solves:

```ts
dx = target.x - pivot.x;
dy = target.y - pivot.y;
dz = target.z - pivot.z;

flat = hypot(dx, dz);
worldYaw = atan2(dx, dz);
pitch = atan2(dy, flat);
```

At straight up/down:

```text
flat → 0
```

Horizontal yaw becomes undefined. Tiny target-position changes can therefore produce very large yaw changes.

### Required principle

At or near vertical aim:

```text
do not reconstruct yaw from a nearly-zero horizontal target vector
```

Instead:

```text
retain the player's stored camera yaw
```

The camera yaw remains valid user intent even when the view direction becomes vertical.

## 2.2 Current near-pole blend is only a workaround

The current production path performs:

```text
camera center ray
→ world target
→ solve turret toward world target
```

then blends toward camera angular direction near vertical view.

This is not robust because:

```text
- it detects the pole indirectly
- it blends Euler yaw values
- unstable world-point yaw still participates
- the threshold can make the system visibly change aim models
```

Replace it with a dedicated pole-safe TPS aim resolver.

## 2.3 Camera boom reaches a singular configuration

The physical camera eye derives from the same forward vector used for look direction:

```text
eye = anchor + shoulder - forward * distance
```

At exact +90°, the boom wants to move the camera below the tank. At exact -90°, it wants to move above the tank. Collision and ground-clearance corrections then fight that geometry.

### Required principle

Separate:

```text
camera look pitch
from
camera physical boom pitch
```

The player must retain full ±90° aim. The physical TPS boom should transition smoothly into a pole-safe arrangement rather than crossing directly through the tank.

This is a geometric remap, not temporal smoothing.

It must introduce:

```text
zero intentional input latency
zero horizontal follow lag
```

## 2.4 Terrain aim fallback is wrong on non-flat worlds

Production aiming should not use tank Y as an infinite horizontal ground plane.

The real world already provides:

```ts
groundHeightAt(x, z)
```

Use actual terrain/surface height and choose the nearest valid hit between terrain and colliders.

## 2.5 Mouse delta ownership can create real snaps

Pointer-lock deltas accumulate in the input manager and are currently consumed through presentation/world sync.

If world sync skips frames while pointer input continues, several frames of mouse movement can be applied together later.

### Required principle

Local camera input must run every requestAnimationFrame and must not wait for:

```text
network snapshot
remote interpolation result
new world-sync frame
```

When fresh tank presentation is temporarily unavailable, use the most recent valid rendered tank pose as the camera anchor.

---

# 3. Target architecture

```text
RAW POINTER-LOCK INPUT
        │
        ▼
Local Camera Aim Intent
(yaw + pitch)
        │
        ├───────────────► Camera orientation
        │                   immediate
        │                   no smoothing
        │
        ├───────────────► Pole-safe boom geometry
        │                   position only
        │
        ▼
Final camera center ray
        │
        ▼
Actual world-surface query
        │
        ├── collider hit
        └── terrain hit
        │
        ▼
Pole-safe TPS weapon aim resolver
        │
        ├── normal region: parallax-correct world target
        │
        └── pole region: stable camera-direction intent
        │
        ▼
Instant local predicted turret
        │
        ▼
Authoritative Gunner input
```

Keep these independent:

```text
camera aim intent
camera physical boom
camera collision
tank follow
turret prediction
network replication
trajectory-reticle simulation
```

---

# 4. Phase A — Camera aim intent ownership

## 4.1 Explicit local intent

The TPS controller should own explicit local:

```ts
lookYaw
lookPitch
```

Existing public yaw/pitch may remain if they already serve this purpose.

Rules:

```text
lookYaw is continuous/unbounded
lookPitch is clamped to allowed intent range
raw mouse input updates immediately
```

Do not add:

```text
mouse acceleration
mouse inertia
temporal low-pass filtering
spring smoothing
rate limiting
```

## 4.2 Preserve yaw at the poles

Any direction-to-yaw conversion must explicitly handle:

```ts
flat = hypot(x, z)
```

below an epsilon.

Concept:

```ts
if (flat > epsilon) {
    yaw = atan2(x, z);
} else {
    yaw = fallbackStoredYaw;
}
```

Add regression coverage.

---

# 5. Phase B — Pole-safe camera boom

## 5.1 Separate look pitch and boom pitch

Use:

```ts
boomPitch = mapLookPitchToBoomPitch(lookPitch)
```

Requirements:

```text
monotonic
continuous
no hard threshold snap
no time-based damping
no added latency
```

## 5.2 Preserve normal TPS geometry

In normal play range:

```text
boomPitch ≈ lookPitch
```

Only the extreme pole region should differ materially.

## 5.3 Extreme behavior

Near straight up/down:

```text
camera orientation may continue to ±90°
camera boom must avoid crossing directly through/below the tank
camera eye stays in a stable shoulder-safe envelope
```

Do not clamp weapon aim to boom pitch.

## 5.4 No tank lag

Preserve:

```text
horizontalFollowSeconds = 0
```

or equivalent rigid horizontal follow.

---

# 6. Phase C — Real terrain-aware aim ray

## 6.1 Replace scalar groundY

Do not use:

```ts
groundY: number
```

for production terrain aiming.

Use:

```ts
groundHeightAt(x, z)
```

or an equivalent world-surface ray query.

## 6.2 Terrain ray intersection

An acceptable bounded solution:

```text
1. March along the camera ray.
2. Find the first interval where ray height crosses below terrain.
3. Refine with binary search.
4. Return first terrain hit.
```

Requirements:

```text
bounded iteration count
deterministic
no uncontrolled per-frame allocation
works on slopes/valleys
works on urban ramps/roofs
```

## 6.3 Closest-hit rule

Final target is the closest positive hit between:

```text
terrain
collider/world obstacle
```

Remove fake tank-height plane aiming.

---

# 7. Phase D — Pole-safe TPS weapon aim resolver

Create one dedicated helper such as:

```ts
resolveTpsWeaponAim(...)
```

Do not leave pole handling embedded ad hoc inside the presenter.

Inputs should include enough information for:

```text
rendered tank pose
tank rig
camera aim intent
camera direction
world target
turret pitch limits
stored yaw fallback
```

## 7.1 Normal solution

When well-conditioned:

```text
camera center ray world hit
→ aim pivot
→ parallax-correct turret yaw/pitch
```

## 7.2 Conditioning metric

Recommended:

```ts
dx = target.x - pivot.x;
dy = target.y - pivot.y;
dz = target.z - pivot.z;

flatDistance = hypot(dx, dz);
totalDistance = hypot(dx, dy, dz);

horizontalRatio =
    flatDistance / max(totalDistance, EPSILON);
```

Use this direct stability metric rather than only abs(cameraDirection.y).

## 7.3 Pole fallback

Near the pole:

```text
camera angular intent becomes stable authority
```

Construct camera intent direction from stored lookYaw/lookPitch.

## 7.4 Blend directions, not Euler yaw

Concept:

```ts
blended = normalize(
    worldDir * (1 - weight)
    + cameraDir * weight
);
```

Then:

```ts
pitch = asin(clamp(blended.y, -1, 1));
flat = hypot(blended.x, blended.z);

if (flat > epsilon) {
    yaw = atan2(blended.x, blended.z);
} else {
    yaw = storedCameraYaw;
}
```

## 7.5 Smooth transition + hysteresis

Use:

```text
smoothstep-like weight
small hysteresis band
```

Choose thresholds from captured diagnostics and playtest continuity, not guesswork.

---

# 8. Phase E — Camera input every RAF

## 8.1 Decouple camera update from world sync

Conceptual frame order:

```text
frame starts
→ obtain latest render tank pose
→ fall back to last valid pose if necessary
→ consume pointer delta
→ update local camera immediately
→ solve local aim when gameplay state permits
→ sync remaining presentation
→ render
```

Invariant:

```text
mouse input is consumed every active gameplay RAF
```

## 8.2 Last valid anchor

Maintain:

```text
lastValidRenderTankPose
```

Do not extrapolate indefinitely.

## 8.3 Reset/preserve explicitly on transitions

Handle:

```text
respawn
rematch
arena rebuild
mid-round reconnect
results
pause
leave game
```

No stored multi-frame mouse delta may apply after a transition.

---

# 9. Phase F — Pointer-lock hardening

## 9.1 Finite filtering

Ignore event deltas when:

```ts
!Number.isFinite(movementX)
|| !Number.isFinite(movementY)
```

## 9.2 Clear delta on lock transitions

Clear accumulated dx/dy when pointer lock:

```text
is acquired
is lost
```

Preserve current behavior that the acquisition click does not fire a weapon.

## 9.3 Add diagnostics before arbitrary clamps

Expose:

```text
raw movementX/Y
accumulated frame delta
pointer-lock state
time since lock
camera yaw/pitch before and after input
camera update executed this RAF
world target distance
horizontal target distance
horizontal ratio
pole blend weight
collision state
ground-clearance adjustment
boom pitch
look pitch
```

Do not add a hard mouse-delta cap unless captured data proves a browser/device spike problem.

---

# 10. Turret prediction requirements

Preserve instant local turret response.

Do not switch to rate-limited turret behavior to mask snapping.

Requirements:

```text
corrected target drives local predicted turret same frame
server remains authoritative
networked Gunner sends corrected yaw/pitch
server validates limits
turret reconciliation never drives camera orientation
```

---

# 11. Trajectory reticle requirements

Preserve:

```text
camera center = player intent
TPS resolver = desired turret aim
predicted turret = actual current muzzle direction
reticle = predicted projectile trajectory
```

At exact downward aim:

```text
terrain-safe muzzle still starts above terrain
shot direction remains vertical
rocket-jump ground detonation remains possible
```

Reticle movement must remain continuous approaching the pole.

---

# 12. Required tests

## 12.1 Fine pitch sweeps

Sweep:

```text
-60° → -90°
-90° → -60°
+60° → +90°
+90° → +60°
```

Track:

```text
look yaw/pitch
boom pitch
camera position
camera direction
world target
desired turret yaw/pitch
predicted turret yaw/pitch
reticle position
```

Assert:

```text
all finite
no unexplained 180° yaw jump
no camera teleport
no discontinuous pitch jump
```

## 12.2 Yaw continuity while vertical

```text
aim near straight down
rotate yaw continuously 360°+
return toward horizontal
```

Expected:

```text
same stored yaw
no flip
no random reorientation
```

Repeat upward.

## 12.3 Direct pivot singularity

Move desired target X/Z toward aim-pivot X/Z.

Assert:

```text
horizontal ratio approaches zero
pole-safe path engages
yaw remains stable
pitch approaches vertical continuously
```

## 12.4 Terrain cases

Test:

```text
flat ground
slope
valley
ridge
ramp
rooftop
building edge
urban street
urban roof ramp
```

## 12.5 Terrain/collider transition

Verify closest-hit ordering and camera orientation continuity.

## 12.6 Missing-frame accumulation

Simulate pointer movement while presentation/world sync is skipped.

Expected:

```text
input consumed per RAF
no accumulated burst
```

## 12.7 Pointer-lock reacquire

Verify accumulator zeroes on loss/acquisition and acquisition click does not fire.

## 12.8 Fast flick

Large legitimate finite deltas should remain immediate and unsmoothed.

## 12.9 Single Player / multiplayer parity

Validate:

```text
Single Player
Multiplayer Gunner
Multiplayer Driver observing Gunner turret
```

## 12.10 Shell/reticle parity

Validate normal, steep, near-vertical and exact vertical shots.

---

# 13. Browser qualification

Use real pointer lock.

Run:

```text
60 seconds ordinary aiming
rapid horizontal flicks
slow downward sweep
fast downward sweep
slow upward sweep
fast upward sweep
continuous yaw near vertical
straight-down rocket-jump shot
jump + downward aim while airborne
camera collision near wall while vertical
valley/ramp/roof transitions
pause/resume
pointer-lock loss/reacquire
Single Player
two-client multiplayer Gunner
two-client Driver observing Gunner turret
```

Capture diagnostics and video/trace when possible.

Static screenshots alone are not proof of continuity.

---

# 14. Performance requirements

Do not materially degrade render performance.

Requirements:

```text
bounded terrain ray steps
bounded binary refinement
no new per-frame network messages
no snapshot frequency increase
no camera interpolation buffer
avoid hot-path allocations where practical
```

Record camera/aim query timing.

---

# 15. Forbidden fixes

Do not:

```text
add camera lag behind the tank
enable horizontal follow smoothing as the fix
smooth normal mouse input
add mouse acceleration
rate-limit camera yaw/pitch
rate-limit turret to conceal snapping
remove exact vertical weapon aim
reduce pitch range
snap yaw to chassis yaw
snap yaw to zero
treat atan2(0,0) as meaningful yaw
keep current pole blend unchanged as final solution
retain tank-Y flat-plane aiming
increase server tick/snapshot rate to hide issue
rewrite unrelated dash or vehicle movement
change map generation
change monster presentation
change sound/UI
merge into main
```

---

# 16. Likely files/systems

Inspect current paths before editing. Likely relevant:

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

Do not assume these are the only files.

---

# 17. Documentation deliverables

Create:

```text
docs/quality/AIM_CAMERA_STABILITY_FIX_REPORT.md
docs/quality/AIM_CAMERA_STABILITY_PHASE_HANDOFF.md
```

Report must include:

```text
starting SHA
ending SHA
confirmed root causes
old aim path
new aim path
pole-conditioning metric
thresholds/hysteresis and why
boom-pitch mapping
terrain-ray algorithm
input ownership changes
pointer-lock safeguards
tests added
browser scenarios run
performance timings
known limitations
evidence paths
confirmation horizontal follow remains zero-lag
confirmation full ±90° weapon articulation remains
confirmation main not merged
```

---

# 18. Acceptance criteria

## Camera response

```text
[ ] Raw mouse response remains immediate
[ ] Camera does not lag behind tank horizontally
[ ] Camera collision never changes yaw/pitch
[ ] Camera update does not wait for network snapshots
[ ] No accumulated mouse burst after skipped presentation frames
[ ] Pointer-lock reacquire starts with zero accumulated delta
```

## Vertical aim

```text
[ ] Full straight-down cannon aim remains possible
[ ] Full straight-up cannon aim remains possible
[ ] Slow approach to vertical is continuous
[ ] Fast approach to vertical is continuous
[ ] Yaw remains stable at poles
[ ] Returning from pole preserves player's yaw
[ ] No arbitrary 180° flip
[ ] No unnatural snap into exact vertical
```

## TPS parallax

```text
[ ] Normal over-the-shoulder aiming still uses world-target parallax correction
[ ] Pole transition uses stable angular intent
[ ] Transition is smooth and hysteretic
[ ] No visible aim-model switch
```

## World targeting

```text
[ ] Real terrain height is used
[ ] Slopes/valleys aim correctly
[ ] Ramps/rooftops aim correctly
[ ] Collider-vs-terrain closest hit is correct
[ ] Fake tank-height plane removed
```

## Weapon/reticle

```text
[ ] Predicted turret remains instant locally
[ ] Authoritative server aim remains correct
[ ] Trajectory reticle remains truthful
[ ] Straight-down terrain-safe muzzle works
[ ] Rocket-jump use case preserved
[ ] Single Player and multiplayer Gunner match
```

## Regression/performance

```text
[ ] TypeScript passes
[ ] camera/input/aim tests pass
[ ] netcode tests pass
[ ] full repository tests pass
[ ] client/server build passes
[ ] Demo golden unchanged
[ ] relevant Playwright tests pass
[ ] real pointer-lock browser qualification completed
[ ] camera/aim timings acceptable
[ ] branch remains quality-improvement
[ ] main remains unmerged
```

---

# 19. Final design principle

The final system should feel:

```text
direct
predictable
stable
fast
modern
deliberate
```

The player must be able to flick aggressively, aim directly beneath the tank, rotate while looking almost straight down, and return to ordinary TPS aiming without ever feeling that the camera changed modes or selected a random direction.

Fix:

```text
discontinuous geometry
input ownership
world-surface solving
```

Do not fix by:

```text
slowing the camera until the snap is less visible
```
