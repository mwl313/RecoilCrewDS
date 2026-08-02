# Recoil Crew DS — Final Foundational Bugfix Contract
## Correct TPS Controls, Smooth Networked Movement, Robust Collision, and Reliable Room-Code Copy

**Project:** Recoil Crew DS  
**Stack:** TypeScript, Vite, Three.js, authoritative Node.js + `ws` server  
**Document type:** Final corrective implementation contract  
**Priority:** Blocking gameplay-quality fix  
**Reference behavior:**  
- `MILESTONE_2_1_GUNNER_TPS_FIX.md`
- `MILESTONE_2_1_1_MODERN_TPS_CAMERA(2).md`
- `MILESTONE_2_1_2_DRIVER_TPS_CAMERA(2).md`
- `MODERN_TPS_CAMERA_FEEL_CHECKLIST(1).md`

---

# 1. Final Answer

This patch must fully address both requested areas:

## 1.1 Correct modern TPS behavior

For both Driver and Gunner:

- Mouse right looks right.
- Mouse left looks left.
- Mouse up looks up.
- Mouse down looks down.
- Horizontal yaw supports unlimited repeated rotation.
- Pitch clamps smoothly.
- Camera rotation responds immediately to pointer-locked mouse delta.
- Mouse delta is not multiplied by frame delta time.
- Camera orientation is local and never network-corrected.
- The camera uses shoulder composition, a vertical arm, collision-safe distance, and final-camera orientation rather than a tank-centered orbit `lookAt`.
- Recenter uses the shortest angular path.
- Looking upward cannot move the camera through the tank or floor.
- Driver and Gunner camera state remains independent.

For the Driver:

- A turns the chassis left.
- D turns the chassis right.
- This semantic direction remains intuitive while reversing.
- Mouse free-look never alters steering.
- Looking backward while pressing W still drives chassis-forward.
- R recenters the local camera behind the chassis without rotating the tank.
- Driver mouse never controls the turret.
- No Driver crosshair is shown.

For the Gunner:

- The final physical camera center ray defines a world aim point.
- World aim converts to chassis-relative turret yaw.
- The turret child receives local yaw only.
- Chassis yaw is added exactly once when calculating world muzzle direction.
- Desired, predicted, and authoritative turret states remain separate.
- Prediction turns at a finite configured rate.
- Authoritative correction affects only the turret, never the camera.
- The crosshair remains exactly centered.
- Aiming remains correct while the Driver rotates the chassis.

## 1.2 Smooth movement and correct collision

The patch must:

- Correct snapshot bracketing.
- Actually apply interpolation alpha.
- Interpolate continuous entity state between snapshots.
- Add Driver local prediction and server reconciliation.
- Stop direct 20 Hz visual stepping.
- Correct the circle-versus-box penetration formula.
- Return contact normals and penetration depth.
- Preserve exact obstacle width and depth.
- Replace the single tank circle with a capsule or multi-circle footprint.
- Add movement substeps for boost, cannon recoil, JACKPOT recoil, and high-speed impacts.
- Recompute movement basis after steering.
- Remove inward normal velocity while preserving wall sliding.
- Use camera-radius collision rather than a zero-width ray.
- Prevent floor, tank, corner, and wall clipping.
- Keep camera collision local and independent from gameplay aim.

The room-code copy defect must also be fixed with fallback and visible feedback.

---

# 2. Source-Derived TPS Principles

The reference camera documents establish these non-negotiable principles.

## 2.1 Camera owns the view

```text
Mouse delta
→ local camera yaw and pitch
→ final camera pose
```

The camera does not wait for:

- Turret motion
- Server snapshots
- Network acknowledgement
- Authoritative correction

## 2.2 Gunner turret follows camera aim

```text
Final camera center ray
→ world aim point
→ chassis-relative desired turret angles
→ predicted turret
→ server validation
```

The turret never drives the Gunner camera.

## 2.3 Driver camera remains observational

```text
Driver mouse
→ Driver camera only

Driver WASD
→ chassis movement only
```

The Driver camera does not create movement input and does not control weapons.

## 2.4 Camera composition is a shooter rig, not a model orbit

The final Three.js camera must model:

```text
follow anchor
→ yaw/pitch view basis
→ shoulder offset
→ vertical arm
→ camera distance
→ collision-safe final position
→ forward-facing camera orientation
```

It must not:

```text
move camera around tank
→ call lookAt(tank-centered point)
```

That old orbit pattern is specifically forbidden.

---

# 3. Current Defects That Must Be Confirmed

Before implementation, inspect the current repository and confirm exact locations for each defect.

## 3.1 Controls and camera

- Horizontal mouse look uses the wrong sign or an inconsistent convention.
- Driver and Gunner share an orbit-style camera implementation.
- Camera orientation is based on a tank-centered `lookAt`.
- Recenter uses the wrong yaw offset.
- Recenter snaps.
- Driver A/D semantics reverse while backing up.
- Gunner world yaw and chassis-local yaw are mixed.
- Turret child rotation applies chassis yaw twice.
- Local Gunner prediction is overwritten each render frame.
- Final center-screen aim is not resolved from the final collision-adjusted camera pose.
- Camera collision uses a thin ray.
- Camera collision dimensions do not match visible obstacles.

## 3.2 Jitter and networking

- Interpolation alpha is calculated but ignored.
- Snapshot selection does not reliably return the pair surrounding render time.
- Continuous entity state renders directly from low-rate server snapshots.
- Driver has no local prediction.
- No processed-input acknowledgement supports reconciliation.
- Camera follows a stepping authoritative tank pose.
- Angle interpolation does not consistently use shortest wrap.

## 3.3 Physics collision

- Outside circle-box resolution uses an incorrect formula.
- Collision does not return a reliable contact normal and penetration.
- The tank footprint is a single crude circle.
- Long tank geometry may enter walls.
- High-speed displacement has no sufficient substeps.
- Forward basis is computed before steering and reused after yaw changes.
- Render camera colliders inflate rectangular obstacles into squares.

## 3.4 UI and copy

- Clipboard copy silently fails.
- No secure-context check exists.
- No fallback exists.
- No feedback exists.
- Copy may be enabled before a real room code is available.
- Duplicate menu handlers may invoke one action twice.
- Render-composer passes may accumulate during role changes.

---

# 4. Coordinate and Direction Conventions

Codex must document and preserve one consistent convention.

Recommended existing-world convention:

```text
+Y: world up
+Z: chassis forward at yaw 0
+X: chassis right at yaw 0
positive yaw: clockwise when viewed from above, turning +Z toward +X
```

Under this convention:

```text
Mouse right:
camera yaw increases

Mouse left:
camera yaw decreases

Mouse up:
camera pitch increases

Mouse down:
camera pitch decreases

D:
steer input is positive
turns chassis toward +X when moving forward

A:
steer input is negative
turns chassis toward -X when moving forward
```

Add explicit configuration:

```ts
invertMouseX: false
invertMouseY: false
```

Default behavior must not be inverted.

Any existing code using another convention may remain only if the entire project is converted consistently and the acceptance tests still prove the user-facing directions above.

---

# 5. Final Driver Control Contract

## 5.1 Driver input

```text
W / Up: accelerate forward
S / Down: reverse or brake
A / Left: chassis left
D / Right: chassis right
Shift: boost/drift
Space: brace
Mouse: independent local TPS free-look
R: smooth camera recenter
Escape: release pointer/open local overlay
```

## 5.2 Steering

Default arcade behavior:

```text
A remains chassis-left while reversing.
D remains chassis-right while reversing.
```

Reverse steering strength may be reduced, but direction must not flip.

Remove any implicit reverse sign inversion unless exposed as a disabled optional realism setting.

## 5.3 Chassis-relative movement

Camera yaw must never enter Driver movement calculation.

Required proof:

```text
Camera forward
Camera sideways
Camera backward
```

In all three states, pressing W drives along chassis forward.

## 5.4 Driver camera state

Driver camera owns:

```ts
yaw
pitch
currentDistance
collisionDistance
position
velocity/damping state
recenter target
```

It is local only.

Do not send any Driver camera field over WebSocket.

---

# 6. Final Gunner Control Contract

## 6.1 Separate states

Maintain:

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

Do not reuse one field for multiple spaces or responsibilities.

## 6.2 Final frame order

```text
1. Consume pointer-locked mouse delta.
2. Update local camera yaw and pitch immediately.
3. Compute camera shoulder rig and desired camera position.
4. Resolve camera-radius collision.
5. Apply final camera position and orientation.
6. Cast from screen center through final camera.
7. Resolve world aim point.
8. Convert world aim to local turret yaw/pitch.
9. Move predicted turret toward desired angles at finite rate.
10. Reconcile predicted turret toward authoritative state.
11. Render turret child using predicted local yaw/pitch.
12. Send latest desired local angles at network interval.
```

A network frame may use the previous render frame’s final aim.

The camera itself may not be one frame late.

## 6.3 World/local conversion

Required invariant:

```ts
tankYawWorld = tank.yaw;
desiredYawWorld = atan2(worldDirection.x, worldDirection.z);
desiredYawLocal = wrapAngle(desiredYawWorld - tankYawWorld);
```

Rendering:

```ts
turretRoot.rotation.y = predictedYawLocal;
```

Authoritative muzzle direction:

```ts
muzzleYawWorld = tankYawWorld + authoritativeTurretYawLocal;
```

Chassis yaw must not be added anywhere else.

## 6.4 Angular wrap

Use shortest-angle operations for:

- Desired-to-predicted motion
- Predicted-to-authoritative correction
- Snapshot turret interpolation
- Camera recenter

Test:

```text
+179° → -179° = +2° shortest movement
-179° → +179° = -2° shortest movement
```

---

# 7. Final Three.js TPS Camera Architecture

Create or refactor a reusable camera class such as:

```text
src/client/tpsCamera.ts
```

Possible interface:

```ts
export interface TpsCameraTuning {
  fov: number;
  shoulderOffset: number;
  shoulderHeight: number;
  verticalArm: number;
  distance: number;
  minimumDistance: number;
  cameraRadius: number;
  minPitch: number;
  maxPitch: number;
  sensitivityX: number;
  sensitivityY: number;
  followSmoothX: number;
  followSmoothY: number;
  followSmoothZ: number;
  collisionPullInSeconds: number;
  collisionReleaseSeconds: number;
  recenterSeconds: number;
}

export class TpsCameraController {
  readonly yaw: number;
  readonly pitch: number;

  setFollowPose(position: Vector3, chassisYaw: number): void;
  applyMouseDelta(dx: number, dy: number): void;
  requestRecenter(chassisYaw: number): void;
  update(dt: number, colliders: readonly CameraCollider[]): CameraPose;
}
```

Driver and Gunner use separate instances.

They may share code and tuning defaults, but never mutable state.

## 7.1 Starting tuning

```yaml
fov: 70
distance: 5.2
minimumDistance: 1.25
shoulderOffset: 0.65
shoulderHeight: 0.35
verticalArm: 0.65
anchorHeight: 1.35
cameraRadius: 0.30

minPitchDegrees: -35
maxPitchDegrees: 55

sensitivityX: 0.0024
sensitivityY: 0.0022

collisionPullInSeconds: 0.00-0.03
collisionReleaseSeconds: 0.08-0.14
recenterSeconds: 0.12-0.20
```

Tune separately later if needed.

## 7.2 View orientation

Compute forward from yaw and pitch.

Example semantics:

```ts
forward.x = Math.sin(yaw) * Math.cos(pitch);
forward.y = Math.sin(pitch);
forward.z = Math.cos(yaw) * Math.cos(pitch);
```

The camera looks along `forward`.

Do not use a tank-centered look target.

## 7.3 Shoulder position

Compute a horizontal right vector:

```ts
right = normalize(cross(forwardHorizontal, worldUp));
```

Construct:

```text
anchor
+ world-up shoulder height
+ right × shoulder offset
+ world-up vertical arm
- forward × camera distance
```

The exact decomposition may vary, but upward pitch must not swing the whole camera boom below the floor as the old long-pivot rig did.

## 7.4 Collision

Use a swept-sphere approximation.

Acceptable implementation:

- Expand each world AABB by `cameraRadius`.
- Raycast the camera center against expanded AABBs.
- Solve desired boom distance.
- Apply minimum distance.
- Apply ground clearance.
- Pull inward immediately or nearly immediately.
- Release outward with short damping.

Camera collision must exclude:

- Tank visual
- Pickups
- Effects
- Trigger-only objects
- UI
- PIP objects

Camera collision must not alter camera yaw/pitch or move the crosshair.

---

# 8. Final Network Rendering Contract

## 8.1 Snapshot fields

Snapshots should contain:

```ts
snapshotSeq
serverTick
serverTimeMs
lastProcessedDriverInputSeq
lastProcessedGunnerInputSeq
authoritativeState
```

## 8.2 Correct bracketing

Choose:

```text
A.serverTime <= renderTime <= B.serverTime
```

Then:

```ts
alpha = clamp(
  (renderTime - A.serverTime) /
  (B.serverTime - A.serverTime),
  0,
  1
);
```

If no B exists, use a bounded fallback rather than selecting two snapshots both before the target and pretending they bracket it.

## 8.3 Interpolated values

Interpolate:

- Tank position
- Tank yaw using shortest angle
- Tank pitch/roll
- Authoritative turret yaw/pitch
- Enemy positions/yaws
- Loot Truck position/yaw
- Projectile positions where snapshot-rendered

Do not interpolate discrete state:

- Score
- Integrity
- Pickup collected
- Enemy death
- Phase
- Timer transitions
- Results
- Cooldown acceptance
- Events

## 8.4 Driver prediction

Use shared deterministic movement and collision code.

Driver client:

```text
sample input
→ assign sequence
→ simulate predicted tank
→ send input
→ render predicted tank
```

On authoritative snapshot:

```text
reset predicted state to authoritative state
→ remove acknowledged inputs
→ replay unacknowledged inputs
→ calculate visual error
→ smoothly remove small error
→ snap only for respawn or invalid large divergence
```

The camera follows the predicted visual tank without waiting for snapshots.

## 8.5 Gunner shared-tank presentation

The Gunner interpolates authoritative tank state.

The Gunner camera remains local and render-rate.

The Gunner predicted turret remains separate from shared-tank interpolation.

---

# 9. Final Physics and Collision Contract

## 9.1 Correct outside penetration

For circle center `(x, z)`, closest box point `(closestX, closestZ)`, radius `r`:

```ts
const dx = x - closestX;
const dz = z - closestZ;
const distance = Math.hypot(dx, dz);

const normalX = dx / distance;
const normalZ = dz / distance;
const penetration = r - distance;

resolvedX = x + normalX * penetration;
resolvedZ = z + normalZ * penetration;
```

Equivalent closest-point-plus-radius math is valid.

The old truncated-offset formula is forbidden.

## 9.2 Contact result

Return:

```ts
interface CollisionContact {
  hit: boolean;
  x: number;
  z: number;
  normalX: number;
  normalZ: number;
  penetration: number;
  obstacleId?: string;
}
```

## 9.3 Velocity response

Remove only inward velocity:

```ts
const vn = vx * normalX + vz * normalZ;
if (vn < 0) {
  vx -= vn * normalX;
  vz -= vn * normalZ;
}
```

Preserve tangent velocity for wall sliding.

## 9.4 Tank footprint

Preferred:

```text
rear circle
center circle
front circle
```

Transform offsets by chassis yaw.

Resolve all against exact obstacle rectangles over multiple iterations.

A true oriented capsule is also acceptable.

A single small circle is not acceptable.

## 9.5 Substeps

Use displacement-based substeps:

```ts
substeps = ceil(horizontalDisplacement / maximumSafeStep);
```

Apply for:

- Boost
- Cannon recoil
- JACKPOT recoil
- Rammer collision
- High-speed movement
- Large correction impulses

Clamp to a safe maximum.

## 9.6 Steering update order

Correct order:

```text
1. Read input.
2. Update yaw.
3. Recompute forward and right basis.
4. Decompose or rebuild velocity using updated basis.
5. Preserve lateral drift intentionally.
6. Integrate position.
7. Resolve collision.
```

Do not reuse a pre-turn forward basis after yaw changes.

## 9.7 Exact obstacle data

Render and physics colliders must preserve:

```text
width
depth
height
position
rotation where supported
```

Do not convert:

```text
8 × 2
```

into:

```text
8 × 8
```

by using the maximum dimension for both axes.

Camera and authoritative physics should derive from the same arena obstacle source where practical.

---

# 10. Clipboard and UI Contract

Create:

```text
src/client/clipboard.ts
```

Required behavior:

1. Validate a real six-character room code.
2. On secure context, try `navigator.clipboard.writeText`.
3. Await result.
4. On rejection or unavailable API, create a temporary textarea.
5. Select the text.
6. Attempt `document.execCommand('copy')`.
7. Restore focus/selection and remove temporary element.
8. Show `COPIED` when successful.
9. Show `COPY FAILED — SELECT CODE` when unsuccessful.
10. Keep displayed code selectable.
11. Disable Copy before a valid code exists.

Remove duplicate menu action bindings.

Each click must trigger exactly one action.

Ensure role/camera swaps do not accumulate composer passes.

---

# 11. Input Lifecycle

Add explicit gameplay-input enable state.

On:

- Pointer loss
- Window blur
- Visibility hidden
- Pause/menu open
- Scene teardown
- Disconnect

clear:

- Keyboard set
- Mouse button set
- Accumulated mouse delta
- One-shot action flags

Online overlays send neutral gameplay input while open.

Practice overlays pause the local simulation.

The click used to capture the pointer must never fire a weapon.

---

# 12. Required Tests

## 12.1 Direction tests

- Mouse right increases camera rightward view.
- Mouse left decreases camera yaw.
- Mouse up increases upward view.
- Mouse down lowers view.
- Default invert flags are false.
- A turns chassis left.
- D turns chassis right.
- A remains left while reversing.
- D remains right while reversing.
- Looking backward does not alter W behavior.

## 12.2 Camera tests

For both Driver and Gunner:

- Three full rotations in either direction.
- Smooth pitch clamp.
- No tank-centered `lookAt` dependency.
- R recenters through shortest angle.
- Maximum upward pitch does not enter tank.
- Maximum upward pitch does not move below floor.
- Walls and corners pull camera inward.
- Camera releases promptly.
- Camera radius prevents corner clipping.
- Driver and Gunner instances do not share mutable state.
- Camera state does not appear in network messages.

## 12.3 Gunner aim tests

- Center ray follows final camera pose.
- Forward world target gives expected local yaw.
- Right world target gives expected positive-right local yaw.
- Chassis rotation preserves the same world target.
- Turret child receives local yaw.
- Muzzle receives chassis yaw once.
- Prediction is not overwritten each render frame.
- Reconciliation never changes camera.
- ±π crossings use shortest path.

## 12.4 Interpolation tests

- Alpha changes rendered position.
- Pair surrounds render time.
- Shortest-angle interpolation works.
- Out-of-order snapshots are rejected.
- Repeated snapshots do not create NaN.
- Render path is smooth between low-rate snapshots.
- Driver prediction converges after acknowledgement.
- Unacknowledged inputs replay in order.
- Respawn snaps safely.

## 12.5 Collision tests

- Circle-box correction reaches exact separation.
- Resolution never pushes deeper.
- Inside-box normal is valid.
- Exact obstacle dimensions are retained.
- Multi-circle tank nose cannot enter a wall.
- High-speed boost cannot tunnel through a thin barrier.
- Cannon recoil cannot tunnel through a wall.
- Inward normal velocity is removed.
- Tangent sliding remains.
- No repeated penetration oscillation at rest.

## 12.6 Clipboard/UI tests

- Clipboard success.
- Clipboard rejection fallback.
- Missing Clipboard API fallback.
- Placeholder code disabled.
- Visible success message.
- Visible failure message.
- One click equals one copy attempt.
- Practice starts once.
- How To Play opens once.
- Repeated camera swaps do not add composer passes.
- Capture click does not fire.

---

# 13. Manual Acceptance

Use Chrome and Edge.

## 13.1 Driver

- Mouse-right looks right.
- Mouse-up looks up.
- A/D match expected directions.
- Reverse A/D remains intuitive.
- W remains chassis-forward while camera looks backward.
- Three rotations each way.
- R recenters smoothly.
- No floor/tank/wall clipping.
- Drive motion feels continuous rather than 20 Hz stepping.

## 13.2 Gunner

- Mouse-right looks right.
- Mouse-up looks up.
- Crosshair stays centered.
- Turret follows world aim while chassis turns.
- No camera correction from network.
- No ±180° snap.
- No tank/floor/wall clipping.
- Cannon direction matches authoritative turret.

## 13.3 Jitter and collision

- Observe Driver tank at 30, 60, and high refresh.
- No obvious snapshot stepping.
- No repeated wall oscillation.
- No visible tank nose penetration.
- Boost into a barrier.
- Fire cannon near a wall.
- Trigger large recoil.
- Verify both clients converge to the same authoritative state.

## 13.4 Copy

- Copy on localhost.
- Copy on deployed HTTPS.
- Test fallback on an environment without Clipboard API if possible.
- Verify visible feedback.
- Verify selectable room code.

---

# 14. Required Commands

Run:

```bash
npm run build
npm test
npm run test:e2e
npm run test:loop
```

All must complete successfully.

Update:

```text
README.md
BUILD_STATUS.md
DECISIONS.md
SMOKE_TEST.md
BUGFIX_REPORT_FINAL.md
```

---

# 15. Forbidden Shortcuts

Do not:

- Fix camera direction by rotating the whole tank.
- Fix Gunner aim by sending camera transforms.
- Make Driver movement camera-relative.
- Add camera rotation damping to hide wrong geometry.
- Smooth raw snapshots without correcting interpolation bracketing.
- Add visual smoothing instead of fixing collision penetration.
- Increase collider size to hide tunneling.
- Snap predicted turret to camera or authority every frame.
- Keep world yaw in a local turret field.
- Use a thin camera ray as final collision.
- Mark success from unit tests without browser testing.
- Remove complete gameplay features to simplify the patch.

---

# 16. Completion Gate

The final bugfix passes only when:

> Both Driver and Gunner have standard, non-inverted, independent modern TPS controls; the Gunner retains accurate world-space aim while the chassis moves and turns; the Driver tank renders continuously through prediction and interpolation; authoritative collision no longer penetrates, oscillates, or uses oversized obstacle shapes; and the room-code Copy button reliably succeeds or presents a usable fallback.
