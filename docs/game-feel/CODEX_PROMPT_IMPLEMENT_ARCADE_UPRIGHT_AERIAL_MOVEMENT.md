# Codex Prompt — Implement Arcade Upright Aerial Movement
## MegaBonk-inspired mobility and Rocket League-style momentum without vehicle inversion

Repository:

```text
mwl313/RecoilCrewDS
```

Use the latest active branch containing the current `map-lab`, dramatic terrain, cliff traversal, and Refractor 02 systems.

Target documents:

```text
docs/refractor02/REFRACTOR02_VERIFICATION_AUDIT.md
docs/game-feel/ARCADE_UPRIGHT_AERIAL_MOVEMENT_DESIGN.md
```

Read both documents before editing.

Treat:

```text
docs/game-feel/ARCADE_UPRIGHT_AERIAL_MOVEMENT_DESIGN.md
```

as the binding movement contract.

---

# Mission

Implement the new Recoil Crew movement direction:

- Sharper high-speed steering
- More intentional sliding
- Stronger ground and air dash
- Higher jump and ramp launch
- Lower gravity
- Upright aerial yaw control
- Limited visual aerial pitch/roll
- Pitch-aware three-dimensional recoil
- Jump-and-cannon advanced traversal
- Noticeable MG micro-thrust
- Enemy splash knockback
- Stable server/client prediction
- No vehicle inversion or self-righting mechanic

This is a combination of content value changes and new shared gameplay systems.

---

# Important Refractor 02 finding

The presentation refactor exists but has unresolved defects documented in:

```text
docs/refractor02/REFRACTOR02_VERIFICATION_AUDIT.md
```

Do not rewrite or expand the presentation refactor during this movement milestone.

Only modify presentation content required to explain controls.

Do not rely on broken bindings or add new presentation components unnecessarily.

---

# Inspect first

Inspect the actual current tree, especially:

```text
content/tanks/default.json
content/loadouts/default.json
content/weapons/machineGun.json
content/weapons/mainCannon.json
content/weapons/jackpotShell.json
content/enemies/
content/scenes/howTo.json

src/shared/config.ts
src/shared/types.ts
src/shared/content/schemas/tank.ts
src/shared/content/schemas/weapon.ts
src/shared/content/schemas/enemy.ts

src/shared/rules/contentConfig.ts
src/shared/rules/matchRules.ts
src/shared/stats/statIds.ts
src/shared/stats/statBlock.ts
src/shared/stats/rulesRevision.ts

src/shared/sim/tankKinematics.ts
src/shared/sim/groundQuery.ts
src/shared/mapgen/terrainTraversal.ts
src/shared/sim/matchRuntime.ts
src/shared/sim/systems/systemContext.ts

src/shared/effects/recoilEffect.ts
src/shared/weapons/weaponSystem.ts
src/shared/weapons/weaponBehaviors.ts
src/shared/projectiles/projectileSystem.ts
src/shared/enemies/enemySystem.ts
src/shared/enemies/enemyRuntimeState.ts
src/shared/enemies/enemyBehaviors.ts

src/client/input.ts
src/client/predictor.ts
src/client/app/predictionController.ts
src/client/app/gameClient.ts
src/client/app/networkStatePresenter.ts

src/server/
tests/
e2e/
```

Create first:

```text
docs/game-feel/ARCADE_UPRIGHT_AERIAL_MOVEMENT_IMPLEMENTATION_PLAN.md
```

Record:

- Current movement data flow
- Current recoil call graph
- Current input/prediction path
- Current tank state reconciliation
- Current enemy movement integration
- Current projectile splash behavior
- Current cliff transition handling
- Exact files to change
- Test migration strategy

Then implement. Do not stop after planning.

---

# Non-negotiable constraints

Preserve:

- Authoritative server
- Shared server/predictor kinematics
- Practice parity
- Current three-circle tank footprint
- Yaw-only authoritative chassis orientation
- Existing map/cliff upward-step guard
- Current content/MatchRules/stat architecture
- Current behavior registries
- Movement-rules revision synchronization
- Online room/rematch/reconnect behavior
- Existing Refractor 02 content-driven UI
- Existing fallback maps
- Demo regression unless intentionally updated and documented

Do not:

- Add a general rigid-body engine
- Add full pitch/roll vehicle physics
- Let the tank become upside down
- Add a self-righting mechanic
- Add tank self-splash knockback
- Add CTRL slide in this milestone
- Add a new movement config service
- Change only `BASE_CONFIG`
- Bypass `MatchRules`
- Put weapon-specific branches inside generic impulse code
- Add per-enemy-type knockback switches to `ProjectileSystem`
- Trust client-reported recoil
- Hide prediction mismatch with excessive smoothing
- Remove cliff traversal protection
- Rewrite unrelated presentation code

---

# Milestones

```text
Milestone 0 — Audit, fixtures, and data contracts
Milestone 1 — Content values and movement-stat plumbing
Milestone 2 — Upright aerial handling and landing momentum
Milestone 3 — Shared three-dimensional tank impulse system
Milestone 4 — Recoil event prediction and reconciliation
Milestone 5 — Enemy radial knockback and cliff falls
Milestone 6 — Presentation, tuning tests, E2E, and documentation
```

Complete focused tests after each milestone.

---

# Milestone 0 — Audit and baseline

## 0.1 Baseline fixtures

Before changing values, record tests for:

- Ground acceleration
- High-speed steering
- Grip decay
- Jump apex
- Jump airtime
- Dash velocity
- Ramp launch
- Cannon recoil
- MG sustained recoil
- Air yaw
- Landing momentum
- Predictor reconciliation

Do not overwrite old expected values without documenting the intentional change.

## 0.2 Current call graph

Document:

```text
GunnerInput
→ WeaponSystem
→ WeaponBehavior
→ RecoilEffect
→ TankState
```

and:

```text
DriverInput
→ stepTankKinematics
→ server + DriverPredictor + Practice
```

Document that gunner-created recoil currently bypasses Driver input prediction.

## 0.3 Define impulse ordering

Specify the authoritative per-tick ordering for:

```text
Driver movement
Weapon recoil
Enemy collision
Projectile impact
Snapshot/event emission
```

Preserve current gameplay ordering unless a change is required and tested.

---

# Milestone 1 — Data and value changes

## 1.1 Tank schema fields

Add data-driven fields following repository conventions:

```text
airGripMultiplier
groundYawDamping
airYawDamping
hardHorizontalSpeedCap
maxVisualAirPitch
maxVisualAirRoll
visualAirLevelRate
landingGripSeconds
landingGripMultiplier
```

Add only fields used by the implementation.

Update:

```text
tank schema
TankDefinition
GameConfig
BASE_CONFIG
content tank JSON
content-to-config projection
stat IDs
stat blocks/projections
MovementRulesBlock
tests
```

## 1.2 Target tank values

Set:

```text
steerHigh                 = 0.90
normalGrip                = 2.10
airControl                = 0.55
airGripMultiplier         = 0.35
groundYawDamping          = 3.20
airYawDamping             = 2.20
gravity                   = 13.50
jumpHeight                = 3.00
rampLaunchSpeed           = 6.50
dashImpulse               = 13.00
dashCooldown              = 0.80
dashAirMultiplier         = 0.80
dashMaxHorizontalSpeed    = 33.00
hardHorizontalSpeedCap    = 35.00
maxVisualAirPitch         = 0.22
maxVisualAirRoll          = 0.28
visualAirLevelRate        = 4.00
landingGripSeconds        = 0.12
landingGripMultiplier     = 0.35
```

## 1.3 Turret pitch

Set:

```text
loadout.default turret.minPitch = -0.40
```

Replicate resolved:

```text
minPitch
maxPitch
turnRate
pitchFollowRate
```

through `MovementRulesBlock`.

Remove hardcoded local predictor pitch clamps where they conflict with resolved loadout values.

## 1.4 Weapon values

Set:

```text
weapon.mainCannon:
  cannonRecoilImpulse = 10.50

weapon.machineGun:
  mgRecoilImpulse = 0.15
```

Add known stat IDs for every new recoil/knockback parameter.

## 1.5 Content/legacy parity

The server content path and client-safe legacy path must remain numerically aligned.

Update both through the existing projection pattern and run equality tests.

---

# Milestone 2 — Upright aerial handling

## 2.1 Preserve yaw-only physics

Do not add authoritative pitch/roll orientation.

Collision offsets remain:

```ts
sin(yaw)
cos(yaw)
```

Add tests proving pitch/roll never affect footprint collision.

## 2.2 Air yaw

Continue using existing A/D steer input in the air.

Use resolved `airControl`.

No new input contract is required.

## 2.3 Ground/air damping

Replace hardcoded:

```ts
yawVel *= exp(-3.2 * dt)
```

with the data-driven ground/air values.

## 2.4 Air grip

Use:

```ts
effectiveGrip = grounded
  ? matchGrip
  : matchGrip * airGripMultiplier
```

Preserve lateral momentum.

## 2.5 Limited visual orientation

While airborne:

- Calculate target visual roll from steering/yaw velocity.
- Calculate target visual pitch from vertical velocity and presentation impulse.
- Clamp to content limits.
- Blend toward targets.
- Never use visual pitch/roll in collision or movement basis.
- Never allow inversion.

On landing, blend to terrain-normal pitch and ground steering roll.

## 2.6 Landing momentum grace

Add `landingGripT` to shared/predicted tank state because it affects movement.

On landing:

```text
landingGripT = landingGripSeconds
```

During the window, multiply ground grip by `landingGripMultiplier`.

Update:

- TankState
- TankKinematicState
- initial state
- respawn
- predictor conversion
- render merge
- snapshot/reconciliation tests

---

# Milestone 3 — Shared TankImpulseSystem

## 3.1 Add module

Recommended:

```text
src/shared/effects/tankImpulseSystem.ts
```

Expose through `SystemContext`.

It must be the sole reusable entry point for externally applied tank velocity deltas.

## 3.2 Contract

Implement an explicit spec containing:

```text
source ID
kind
3D direction
magnitude
vertical scale
yaw impulse
roll impulse
launch threshold
horizontal cap
```

Normalize direction safely.

## 3.3 Recoil adapter

Refactor `RecoilEffect` to delegate to `TankImpulseSystem`.

Do not duplicate impulse math in weapon behaviors.

## 3.4 Pitch-aware weapon recoil

Update hitscan, cannon, and JACKPOT behaviors to pass the full inverse muzzle vector:

```text
-x
-y
-z
```

Remove the old fixed airborne lift unless reintroduced as an explicit data stat.

## 3.5 Ground launch

If applied upward velocity exceeds the configured threshold:

```text
grounded = false
```

Do not immediately snap the tank back to terrain.

## 3.6 Shared cap

Apply `hardHorizontalSpeedCap` after external horizontal impulses.

Dash also respects the same hard limit.

Do not cap vertical velocity with the horizontal cap.

## 3.7 Muzzle safety

Add tests and any minimal correction needed for downward shots on:

- Flat ground
- Slopes
- Ramps
- Plateau edges

Do not change projectile collision semantics unnecessarily.

---

# Milestone 4 — Impulse prediction

## 4.1 Structured authoritative event

Add a dedicated impulse event or strongly typed recoil event containing exact deltas:

```text
impulse sequence
delta vx/vy/vz
delta yaw velocity
delta roll
source
kind
```

Do not ask clients to recalculate random spin.

## 4.2 State acknowledgement

Add the last authoritative impulse sequence to tank/snapshot state.

## 4.3 DriverPredictor queue

Implement:

```ts
applyExternalImpulse(event)
```

Track unacknowledged impulses.

Reconciliation order:

```text
authoritative snapshot
→ unacknowledged external impulses
→ unacknowledged Driver inputs
```

Use exact sequence acknowledgement.

Bound queue size and discard stale events.

## 4.4 Event routing

Route the new event through:

```text
server event emission
network client
GameClient
PredictionController
DriverPredictor
presentation feedback
```

Prevent duplicate recoil presentation.

## 4.5 Practice

Practice must use the same shared authoritative impulse code.

No Practice-only physics branch.

---

# Milestone 5 — Enemy splash knockback

## 5.1 Data contract

Add a shared enemy knockback response block to the enemy schema.

No per-type knockback switch in `ProjectileSystem`.

Configure:

```text
Scrap Bug: strong
Rammer: medium
Loot Truck: low
Gun Tower: immovable
```

## 5.2 Radial impulse module

Add:

```text
src/shared/effects/radialImpulseEffect.ts
```

Inputs:

```text
origin
radius
max/min horizontal impulse
vertical impulse
falloff exponent
source
affectsTank
affectsEnemies
```

Main cannon:

```text
affectsTank = false
affectsEnemies = true
```

## 5.3 Enemy impulse controller

Add a generic module responsible for:

- Impulse velocity
- Ground drag
- Air drag
- Gravity
- Airborne state
- Upward cliff guard
- Downward cliff fall
- Landing
- Fall damage
- Source attribution
- Arena bounds

Integrate it with `EnemySystem` without adding a new general navmesh.

## 5.4 Behavior interaction

While a movable enemy is strongly airborne:

- Do not allow normal ground-seek movement to snap it back.
- Keep attack timers bounded.
- Resume normal behavior after landing/recovery.

Gun Towers ignore impulses.

## 5.5 ProjectileSystem

Damage and knockback are separate calls.

`ProjectileSystem.explode()` delegates knockback to the radial module.

Tank splash damage may remain, but tank splash knockback stays zero.

---

# Milestone 6 — Presentation and validation

## 6.1 How To content

Update the data-driven How To scene.

Do not add hardcoded HTML.

Explain:

```text
steer while airborne
jump + downward cannon recoil
MG micro-thrust
```

Do not mention flips.

## 6.2 Optional HUD

Do not add an airborne HUD element by default.

Add one only if playtesting demonstrates a clear usability need, and use existing Refractor 02 content/binding patterns.

## 6.3 Documentation

Create:

```text
docs/game-feel/ARCADE_UPRIGHT_AERIAL_MOVEMENT_IMPLEMENTATION_REPORT.md
docs/game-feel/ARCADE_MOVEMENT_TUNING_GUIDE.md
```

Update:

```text
docs/guides/ARCHITECTURE.md
docs/guides/CONTENT_AUTHORING_GUIDE.md
docs/guides/NETWORK_RULES.md
docs/guides/SMOKE_TEST.md
docs/planning/BUILD_STATUS.md
```

---

# Required tests

## Unit

- Data projection parity
- Stat recognition
- Movement revision
- Movement-block fields
- Air grip
- Ground/air yaw damping
- Visual clamp
- No inversion
- Landing grace
- Dash values and cap
- 3D recoil vectors
- Ground recoil launch
- MG accumulation
- Impulse sequence deduplication
- Reconciliation
- Enemy resistance/falloff
- Tower immovability
- Cliff fall
- Enemy landing/fall damage

## Regression

- Existing cliff upward-step guard
- Existing obstacle collision
- Existing jump/dash edge semantics
- Existing ramp detection
- Existing fall damage
- Existing cannon damage
- Existing self splash damage policy
- Existing barrel chains
- Existing modifier behavior
- Existing reconnect/rematch

## E2E

Two-browser scenarios:

1. Driver jumps.
2. Gunner aims downward.
3. Cannon launches the tank upward.
4. Both clients show the same tank trajectory.
5. Air steer changes landing yaw.
6. Sustained MG recoil remains smooth.
7. Enemy is pushed into a barrel.
8. Enemy is pushed off a cliff.
9. Tank does not receive splash knockback.
10. Rematch and reconnect preserve rules.

Practice must reproduce the same movement.

---

# Required commands

Run and report actual output:

```bash
npm run generate:presentation-content
npm run generate:map-profiles
npm run build
npm test
npm run test:demo
npm run test:e2e
npm run test:loop
npm run test:maps
npm run test:maps:sweep
npm run build:maplab
npm run test:maplab
npm run build:presentation-preview
npm run test:presentation
```

Add focused movement/impulse tests to the default unit suite.

Do not update golden fixtures merely to hide unintended differences.

---

# Completion gate

Complete only when:

1. All new values are content-driven.
2. Content and legacy paths remain equal.
3. Movement rules replicate every predictor-critical field.
4. Tank aerial control is yaw-only.
5. Tank cannot invert.
6. Visual pitch/roll remain clamped.
7. Downward aim creates upward recoil.
8. Jump + cannon enables advanced vertical traversal.
9. MG recoil is noticeable and prediction-stable.
10. External impulse events reconcile exactly once.
11. Dash/recoil/MG respect the horizontal safety cap.
12. Landing momentum grace works.
13. Cannon splash knocks enemies back.
14. Tank splash knockback remains disabled.
15. Enemies can fall from cliffs without upward snapping.
16. Gun Towers remain immovable.
17. Server, predictor, Practice, reconnect, and rematch agree.
18. Existing maps and cliff traversal remain valid.
19. Controls documentation is data-driven.
20. All required tests pass.

Final invariant:

> The tank may fly, turn, boost, and recoil through dramatic terrain, but it always remains an upright arcade vehicle.
