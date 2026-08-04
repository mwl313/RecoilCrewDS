# Recoil Crew — Arcade Upright Aerial Movement Design
## MegaBonk-inspired mobility with Rocket League-style vehicle momentum, without inversion

**Repository:** `mwl313/RecoilCrewDS`  
**Implementation branch:** latest branch containing the current `map-lab` systems  
**Target repository path:** `docs/game-feel/ARCADE_UPRIGHT_AERIAL_MOVEMENT_DESIGN.md`  
**Source design:** `04-조작감.md`

---

# 1. Goal

Shift Recoil Crew’s tank handling toward a more expressive arcade movement identity:

```text
sharp high-speed steering
+ controlled sliding
+ stronger dash
+ longer airtime
+ yaw steering in the air
+ jump-and-cannon recoil traversal
+ MG micro-thrust
+ ramp launches
+ enemy explosion knockback
+ dramatic vertical terrain
```

The movement should evoke parts of MegaBonk and Rocket League while remaining appropriate for a cooperative tank game.

---

# 2. Key design constraint

The tank must never become physically inverted.

## Authoritative orientation

```text
Yaw only
```

The authoritative collision footprint remains an upright three-circle chassis rotated around the world Y axis.

## Visual orientation

```text
Yaw
+ limited visual pitch
+ limited visual roll
```

Visual pitch and roll are clamped presentation values. They never become unrestricted rigid-body orientation.

## Explicitly excluded

- Full 3-axis rigid-body vehicle rotation
- Barrel rolls
- Manual aerial pitch control
- Manual aerial roll control
- Flips
- Roof collision
- Upside-down state
- Self-righting mechanic
- Upside-down respawn rule

This preserves the current deterministic movement and collision architecture.

---

# 3. Current implementation patterns to preserve

The current repository already has the correct modular seams:

```text
validated JSON content
→ ContentPack
→ MatchRules + StatResolver
→ immutable GameConfig/MatchConfig projections
→ MovementRulesBlock replicated to clients
→ shared stepTankKinematics()
→ authoritative server + DriverPredictor + Practice
```

Weapons use:

```text
WeaponSystem
→ WeaponBehaviorRegistry
→ RecoilEffect / ProjectileSystem
```

Enemies use:

```text
EnemySystem
→ EnemyBehaviorRegistry
→ data-driven enemy definitions
```

The new implementation must extend those patterns.

Do not introduce a second movement configuration service.

---

# 4. Scope

## Included

### Variable changes

```text
steerHigh                  0.65 → 0.90
normalGrip                 2.60 → 2.10

turret minPitch           -0.12 → -0.40

dashImpulse                9.00 → 13.00
dashCooldown               1.00 → 0.80
dashAirMultiplier          0.65 → 0.80
dashMaxHorizontalSpeed    28.00 → 33.00

cannon recoil              7.20 → 10.50
MG recoil                  0.07 → 0.15

air yaw control            0.35 → 0.55
gravity                   16.00 → 13.50
jumpHeight                 2.20 → 3.00
rampLaunchSpeed            4.50 → 6.50
```

### New behavior

- Pitch-aware three-dimensional cannon/MG recoil
- Ground-to-air launch from upward recoil
- Upright aerial yaw steering
- Separate ground and aerial yaw damping
- Limited aerial visual pitch/roll
- Unified tank impulse application
- Immediate/reconcilable tank-impulse prediction
- Enemy radial splash knockback
- Enemy cliff falls and landings
- Shared speed safety for dash/recoil/MG stacking
- Landing momentum preservation

## Deferred

- CTRL handbrake slide
- Tank self-splash knockback
- Full vehicle flips
- Aerial pitch/roll input
- General rigid-body physics
- Replacing the current collision footprint
- New general navmesh

The slide remains a separate future milestone because the source design marks it undecided.

---

# 5. Target movement values

## 5.1 Tank content defaults

```json
{
  "steerHigh": 0.9,
  "normalGrip": 2.1,

  "airControl": 0.55,
  "airGripMultiplier": 0.35,

  "groundYawDamping": 3.2,
  "airYawDamping": 2.2,

  "gravity": 13.5,
  "jumpHeight": 3.0,
  "rampLaunchSpeed": 6.5,

  "dashImpulse": 13.0,
  "dashCooldown": 0.8,
  "dashAirMultiplier": 0.8,
  "dashMaxHorizontalSpeed": 33.0,

  "hardHorizontalSpeedCap": 35.0,

  "maxVisualAirPitch": 0.22,
  "maxVisualAirRoll": 0.28,
  "visualAirLevelRate": 4.0,

  "landingGripSeconds": 0.12,
  "landingGripMultiplier": 0.35
}
```

The exact new field names may follow repository naming conventions, but each value must be data-driven.

## 5.2 Loadout defaults

```json
{
  "turret": {
    "minPitch": -0.4
  }
}
```

Replicate both turret minimum and maximum pitch in the movement/prediction rules block.

## 5.3 Weapon defaults

Main cannon:

```json
{
  "weapon.cannonRecoilImpulse": 10.5,
  "weapon.recoilVerticalScale": 1.0,
  "weapon.recoilGroundLaunchThreshold": 0.25,

  "weapon.splashKnockbackRadiusMultiplier": 1.0,
  "weapon.splashKnockbackMax": 8.0,
  "weapon.splashKnockbackMin": 1.5,
  "weapon.splashKnockbackVertical": 2.5,
  "weapon.splashKnockbackFalloffExponent": 1.25,
  "weapon.splashTankKnockbackMultiplier": 0.0
}
```

Machine gun:

```json
{
  "weapon.mgRecoilImpulse": 0.15,
  "weapon.recoilVerticalScale": 1.0
}
```

JACKPOT should use the same impulse mechanism but retain its own content values.

---

# 6. Upright aerial control

## 6.1 Actual movement

While airborne, A/D changes yaw using:

```text
ground steering rate
× airControl
```

No input changes pitch or roll.

The tank remains collision-upright.

## 6.2 Separate yaw damping

Current yaw-velocity damping is shared between ground and air.

Replace it with:

```ts
const yawDamping = t.grounded
  ? tankCfg.groundYawDamping
  : tankCfg.airYawDamping;

t.yawVel *= Math.exp(-yawDamping * dt);
```

This allows recoil spin to persist longer in the air without destabilizing ground handling.

## 6.3 Separate aerial grip

Current lateral grip uses the same match grip while grounded and airborne.

Use:

```ts
const effectiveGrip = t.grounded
  ? mcfg.grip
  : mcfg.grip * tankCfg.airGripMultiplier;
```

This preserves aerial momentum while retaining controlled yaw.

## 6.4 Limited visual pitch and roll

While airborne:

```text
visual roll ← steering + yaw velocity
visual pitch ← vertical velocity and recoil presentation
```

Clamp:

```text
pitch: ±0.22 rad
roll:  ±0.28 rad
```

These values are presentation state only.

On landing:

```text
pitch → terrain-normal pitch
roll  → ground steering roll
```

Blend smoothly.

No code path may allow pitch or roll to affect the collision footprint or turn the tank upside down.

---

# 7. Three-dimensional recoil

# 7.1 Current limitation

The current recoil API receives only horizontal direction:

```text
dirX
dirZ
```

and adds a fixed lift only if the tank is already airborne.

Downward cannon aim therefore cannot create a proper pitch-aware recoil launch.

## 7.2 New impulse contract

Refactor recoil through a reusable tank impulse service.

Recommended:

```ts
export interface TankImpulseSpec {
  sourceId: string;
  kind: "cannon" | "mg" | "jackpot" | "collision" | "other";

  direction: {
    x: number;
    y: number;
    z: number;
  };

  magnitude: number;
  yawImpulse: number;
  rollImpulse: number;

  verticalScale: number;
  horizontalSpeedCap?: number;
  launchThreshold?: number;
}
```

SystemContext:

```ts
tankImpulses: TankImpulseSystem;
recoil: RecoilEffect;
```

`RecoilEffect` becomes a weapon-facing adapter that delegates to `TankImpulseSystem`.

## 7.3 Weapon behavior integration

`muzzleWorld()` already returns:

```text
dx
dy
dz
```

Use the full opposite vector:

```ts
direction = {
  x: -muzzle.dx,
  y: -muzzle.dy,
  z: -muzzle.dz,
}
```

When aiming down, `muzzle.dy` is negative, producing positive vertical recoil.

## 7.4 Ground launch

After applying an upward recoil impulse:

```ts
if (
  t.grounded &&
  appliedDeltaVy >= launchThreshold
) {
  t.grounded = false;
}
```

The intended advanced traversal is:

```text
jump
+ downward cannon shot
→ 4–6 m combined traversal potential
```

A grounded cannon shot may produce a smaller hop. The basic jump remains the normal tool.

## 7.5 Remove legacy fixed air lift

Do not keep both:

```text
pitch-aware vertical recoil
+
fixed airborne lift
```

unless the fixed bonus is explicitly retained as a separate data-driven stat.

The default should use physical shot-direction recoil only.

## 7.6 Muzzle safety

When aiming downward:

- Ensure the muzzle starts above terrain.
- Avoid spawning a shell inside the chassis.
- Avoid immediate owner collision if owner collision is introduced later.
- Test steep terrain and ramps.
- Preserve authoritative projectile impact behavior.

---

# 8. Tank impulse synchronization and prediction

# 8.1 Problem

Driver prediction currently simulates Driver inputs but does not predict gunner-created recoil.

At `0.15 × 11 shots/s`, MG recoil becomes visible enough that snapshot-only correction may feel jittery.

## 8.2 Authoritative impulse sequence

Add a monotonic tank impulse sequence.

Recommended state:

```ts
TankState.lastImpulseSeq: number;
```

Recommended event:

```ts
interface TankImpulseEvent {
  type: "tankImpulse";
  impulseSeq: number;

  sourceId: string;
  kind: string;

  deltaVx: number;
  deltaVy: number;
  deltaVz: number;
  deltaYawVel: number;
  deltaRoll: number;
}
```

The event contains the exact applied deltas, including any authoritative random spin.

## 8.3 Driver predictor

Add:

```ts
DriverPredictor.applyExternalImpulse(event)
```

Behavior:

1. Ignore duplicate/old sequence numbers.
2. Apply exact deltas to predicted and display state.
3. Queue impulses newer than the latest authoritative snapshot.
4. On reconcile:
   - Start from authoritative tank state.
   - Discard acknowledged impulse events.
   - Replay unacknowledged impulses.
   - Replay unacknowledged Driver input.
5. Smooth only residual error.

## 8.4 Practice

Practice uses the same authoritative `TankImpulseSystem` directly and does not need a network event round trip.

## 8.5 Gunner client

The Gunner does not run Driver movement prediction, but it should consume the immediate impulse event for camera/presentation feedback if useful.

Do not create a separate physics simulation for the Gunner.

---

# 9. Unified speed safety

The current dash cap is applied only when Dash occurs.

Cannon and MG recoil may stack after that.

Add one shared hard horizontal speed cap applied by `TankImpulseSystem` and Dash.

Default:

```text
hardHorizontalSpeedCap: 35 m/s
```

Rules:

- Preserve velocity direction.
- Do not cap vertical velocity with the horizontal cap.
- Apply after external horizontal impulses.
- Keep displacement substeps.
- Do not silently cap ordinary forward acceleration below normal speed.

A future soft-cap drag can be added later; this milestone only requires a clear hard safety limit.

---

# 10. Landing momentum

The current system largely preserves horizontal velocity, but ground grip applies immediately.

Add a short landing state:

```ts
landingGripT: number;
```

On an airborne-to-ground transition:

```text
landingGripT = landingGripSeconds
```

During the grace window:

```text
effective ground grip
× landingGripMultiplier
```

Default:

```text
0.12 seconds
× 0.35 grip
```

This gives a Rocket League-like carry-through without introducing suspension or rigid-body wheels.

Because this affects movement, it must be part of shared state/prediction.

---

# 11. Enemy splash knockback

# 11.1 Behavior goal

Cannon splash should push enemies:

- Into barrels
- Off ledges
- Away from objectives
- Into other hazards

Tank self-splash knockback remains disabled.

## 11.2 Data-driven enemy response

Extend enemy definitions with a shared response block:

```ts
knockback: {
  immovable: boolean;
  horizontalResistance: number;
  verticalResistance: number;
  groundDrag: number;
  airDrag: number;
  gravityScale: number;
  fallDamageSpeed: number;
  fallDamage: number;
}
```

Suggested defaults:

| Enemy | Response |
|---|---|
| Scrap Bug | Strong knockback |
| Rammer | Medium knockback |
| Loot Truck | Low knockback |
| Gun Tower | Immovable |

Do not use a per-enemy-type switch in `ProjectileSystem`.

## 11.3 Enemy motion state

Add authoritative motion fields or a complete match-scoped runtime state.

Preferred complete state:

```ts
EnemyState:
  impulseVx
  impulseVy
  impulseVz
  impulseGrounded
  lastImpulseSource
  lastImpulseT
```

This makes snapshot/replay/reconnect behavior explicit.

## 11.4 Enemy impulse controller

Create a focused module:

```text
src/shared/effects/radialImpulseEffect.ts
src/shared/enemies/enemyImpulseController.ts
```

Responsibilities:

- Apply radial falloff
- Apply resistance
- Integrate impulse motion
- Preserve normal enemy behavior composition
- Suppress normal ground movement while strongly airborne
- Use terrain-transition guards for upward cliffs
- Allow downward cliff falls
- Resolve landing
- Apply fall damage
- Preserve kill/source attribution
- Avoid a full navmesh

## 11.5 Projectile integration

`ProjectileSystem.explode()` should delegate:

```ts
ctx.radialImpulses.apply({
  x,
  y,
  z,
  radius,
  maxImpulse,
  minImpulse,
  verticalImpulse,
  source,
  affectsTank: false,
  affectsEnemies: true
});
```

Damage and knockback remain separate effects.

## 11.6 Tower behavior

Gun Towers are immovable and receive damage only.

No fake velocity should be added.

---

# 12. Cliff and map integration

The current generated world already exposes:

```text
queryTerrainTransition
terrain flags
cliff-wall checks
maxStepUp
```

The new movement must preserve these rules.

## Tank

- Upward cliff snapping remains blocked.
- Downward cliff movement remains legal.
- Dash and recoil continue to use shared substeps.
- Cannon recoil must not bypass the cliff guard while grounded.
- Once launched airborne, normal projectile-like movement can cross gaps.

## Enemies

- Enemy impulse movement cannot snap upward.
- Enemies may fall downward.
- Landing uses the lower terrain height.
- Required enemy routes remain unchanged.
- Knockback does not require a new navmesh.

---

# 13. Data plumbing

Every new movement field must be added through the full current pipeline:

```text
content/tanks/default.json
src/shared/content/schemas/tank.ts
src/shared/config.ts
src/shared/rules/contentConfig.ts
src/shared/stats/statIds.ts
src/shared/stats/statBlock.ts if required
MatchRules projection
MovementRulesBlock
DriverPredictor
tests
```

Weapon stats:

```text
content/weapons/*.json
src/shared/stats/statIds.ts
weapon behavior lookup
```

Enemy response:

```text
content/enemies/*.json
src/shared/content/schemas/enemy.ts
EnemySystem / EnemyImpulseController
```

Maintain content-versus-legacy parity.

Do not update only `BASE_CONFIG`.

---

# 14. Presentation updates

Update data-driven presentation content rather than adding hardcoded DOM.

Required:

- How To scene copy
- Driver controls copy
- Gunner cannon-recoil explanation
- Optional HUD airborne indicator only if playtesting proves useful

No new HUD element is required for the first implementation.

Suggested control copy:

```text
DRIVER
WASD drive and steer
Shift dash
Space jump
Steer in the air to face your landing

GUNNER
Aim downward and fire the cannon to boost the tank
MG fire provides smaller continuous recoil
```

Do not promise full aerial flips.

---

# 15. Tests

## Shared kinematics

- High-speed steering uses new value.
- Ground grip uses new value.
- Air grip is separated.
- Air yaw uses `airControl`.
- Air yaw damping differs from ground damping.
- Pitch/roll remain clamped.
- Collision footprint remains yaw-only.
- Tank cannot invert.
- Landing grip grace preserves momentum.
- Dash uses new values.
- Hard horizontal cap applies.

## Recoil

- Horizontal shot gives horizontal recoil.
- Downward shot gives positive vertical recoil.
- Upward shot gives downward recoil.
- Grounded upward recoil launches when threshold passes.
- Jump + downward cannon produces higher ascent.
- MG applies small repeated impulses.
- JACKPOT uses same reusable system.
- No legacy double-lift.
- No tank self-splash knockback.
- Cliff step guard still blocks grounded upward crossing.

## Prediction

- Exact impulse event applied once.
- Duplicate event ignored.
- Snapshot acknowledges impulse sequence.
- Unacknowledged impulse replayed.
- Driver input and impulse replay ordering stable.
- Server/predictor converge.
- Practice parity.

## Enemy knockback

- Scrap Bug moves strongly.
- Rammer moves moderately.
- Truck moves slightly.
- Tower remains fixed.
- Radial falloff.
- Resistance.
- Cliff fall.
- Landing.
- Fall damage/source credit.
- No upward cliff snap.
- No map-boundary escape.

## Content

- New tank fields validated.
- New weapon stats known.
- New enemy response validated.
- Legacy/content projections remain equal.
- Movement revision advances for every movement-critical field.
- Movement block includes turret pitch limits.

## E2E

- Two-client recoil synchronization.
- Sustained MG does not produce visible correction spikes.
- Downward cannon jump.
- Air yaw landing direction.
- Ramp launch.
- Dramatic highland traversal.
- Cliff fall.
- Rematch/reconnect.
- Practice.

---

# 16. Performance and safety gates

- No unbounded external-impulse queue.
- No per-shot object allocation retained after acknowledgement.
- MG at full fire rate does not grow memory.
- Prediction correction remains bounded.
- Existing movement substep cap remains sufficient at 35 m/s.
- Projectile and enemy knockback loops remain bounded by current entity budgets.
- No new normal-game dependency.

---

# 17. Completion criteria

The change is complete only when:

1. The target values are sourced from validated content and legacy parity remains intact.
2. The tank can yaw in the air without ever becoming inverted.
3. Pitch and roll remain limited visual values.
4. Downward cannon aim produces pitch-aware upward recoil.
5. Jump plus cannon recoil supports advanced vertical traversal.
6. MG recoil is materially noticeable but prediction remains stable.
7. Dash, recoil, and MG share a horizontal safety cap.
8. Landing preserves momentum briefly.
9. Cannon splash knocks enemies back.
10. Tank self-splash knockback remains zero.
11. Enemies can be pushed off cliffs and land correctly.
12. Gun Towers remain immovable.
13. Server, Driver predictor, Practice, reconnect, and rematch remain synchronized.
14. Current cliff upward-step protection remains intact.
15. Data-driven How To content reflects the controls.
16. No full-flip or self-righting mechanic is introduced.

Final movement invariant:

> Recoil Crew’s tank is an upright arcade vehicle with expressive momentum and weapon-driven traversal, not a fully rotating rigid body.
