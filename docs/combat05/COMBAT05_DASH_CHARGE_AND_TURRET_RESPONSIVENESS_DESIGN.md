# Recoil Crew — Combat 05 Design
## Dash-Only Contact Damage, Instant Turret Tracking, No Fall Damage, and Relic-Gated Cannon Charge

**Repository:** `mwl313/RecoilCrewDS`  
**Source branch reviewed:** `main`  
**Target repository path:** `docs/combat05/COMBAT05_DASH_CHARGE_AND_TURRET_RESPONSIVENESS_DESIGN.md`

---

# 1. Executive summary

This milestone makes four related combat-feel changes:

1. Normal tank contact no longer damages enemies; only an active Dash can deal tank-contact damage.
2. The locally controlled turret model follows mouse aim immediately instead of rate-limiting and being pulled backward by reconciliation.
3. Fall damage is removed completely for both the tank and enemies.
4. The Jackpot meter/ability system is removed. Its powerful shell concept is converted into a relic-gated charged version of the normal cannon.

The charged cannon works as follows:

```text
Charge capability not owned:
RMB press
→ normal cannon fires immediately

Charge capability owned:
RMB press
→ begin hold

release before tap threshold
→ normal cannon shell

hold past tap threshold
→ charge begins

release at any charge amount
→ charged cannon shell

hold to 100%
→ full-charge shell

continue holding after 100%
→ remains at 100%, never auto-fires

release
→ fires
```

The charge shot is not a separate ability or damage category.

It is always:

```text
secondary-slot cannon
damage source: cannon
shell family: cannon
weapon ID: weapon.mainCannon
```

All current and future cannon modifiers affect charged shots automatically.

---

# 2. Confirmed current-main findings

## 2.1 Normal driving currently causes ram kills

`attack.contactRam` currently checks only horizontal tank speed.

When tank speed exceeds the configured threshold, it kills the contacted enemy with:

```text
damage = 999
source = ram
```

There is no requirement that Dash is active.

Therefore ordinary fast driving currently functions as a damaging ram attack.

## 2.2 Dash has presentation state but no dedicated combat window

The tank currently has:

```text
dashCooldown
dashPresentationT
```

`dashPresentationT` is cosmetic.

It must not become the hidden gameplay authority for dash damage.

A separate authoritative dash-contact state is required.

## 2.3 Fall damage exists in two systems

Tank fall damage:

```text
stepTankKinematics()
→ onHardFall callback
→ MatchRuntime.damageTank(fallDamage, "fall")
```

Enemy fall damage:

```text
EnemyImpulseController landing
→ compare impact speed
→ applyEnemy(fallDamage)
```

Both schemas and content also contain fall-damage values.

## 2.4 Turret tracking is intentionally rate-limited

Client prediction currently performs:

```text
predicted yaw
→ clamp toward desired yaw by turretTurnRate × dt

predicted pitch
→ clamp toward desired pitch by pitchFollowRate × dt
```

The authoritative server performs the same kind of yaw limit and pitch smoothing.

Snapshot reconciliation additionally blends the local predicted turret halfway back toward reconstructed authority.

Even with high configured rates, this stack can feel sticky:

```text
mouse target
→ local rate limit
→ server rate limit
→ 30 Hz aim transport
→ snapshot correction blend
```

Discrete Gunner action messages also do not currently include click-time aim yaw/pitch. A cannon action can therefore be processed using the previous periodic aim frame.

## 2.5 Jackpot is a complete subsystem, not only a HUD bar

Current Jackpot references include:

```text
GameConfig.jackpot
MatchConfig.jackpotGainMult

MatchState.stats.jackpotMeter
MatchState.stats.jackpotFired

TurretState.jackpotReady
TurretState.jackpotCooldown
TurretState.chargeT

JackpotSystem
SystemContext.jackpot

weapon.jackpotShell
weapon.chargeProjectile
default loadout ability slot

abilityStart / abilityRelease protocol actions

jackpot shell kind
jackpot damage source
jackpot events
jackpot VFX/audio
jackpot pickup/gain paths
results and title rules
bottom-left Jackpot HUD
```

Removing the meter while leaving these paths would create hidden and dead gameplay state.

## 2.6 The existing item system is a suitable relic integration seam

The current `ItemSystem` applies data-driven stat modifiers and already owns item application/removal.

It does not yet support capability grants.

The charge mechanic should be unlocked through a generic capability, not by checking a hardcoded relic ID inside `WeaponSystem`.

---

# 3. Product decisions and assumptions

The following decisions resolve details not numerically specified in the request.

## 3.1 Fall damage scope

“Remove fall damage completely” means:

- No tank damage from landing velocity
- No enemy damage from landing velocity
- Remove fall-damage configuration and damage-source paths

Falling and landing physics remain.

Out-of-bounds cleanup or map recovery is a separate mechanic and is not considered fall damage.

## 3.2 Charge unlock default

The charge capability is disabled by default.

```text
capability.cannonCharge = not owned
```

A future relic grants it.

This milestone adds:

- Generic capability support
- A charge-shot relic content definition or test fixture
- Test/debug means to grant it

It does not need to implement the complete relic-selection UI.

## 3.3 Tap threshold

Use a data-driven default:

```text
tapMaxSeconds = 0.16
fullChargeSeconds = 1.00
```

A release at or below `tapMaxSeconds` fires an ordinary shell.

Charge ratio:

```ts
chargeRatio = clamp(
  (heldSeconds - tapMaxSeconds) /
  (fullChargeSeconds - tapMaxSeconds),
  0,
  1
);
```

This means:

```text
0.16 s or less → normal shell
0.58 s total hold → approximately 50% charge
1.00 s total hold → 100% charge
over 1.00 s → still 100%
```

Both values must be content-driven and easy to tune.

## 3.4 No-charge cannon response

Without the relic, the cannon preserves current responsiveness:

```text
RMB press → fire immediately
```

Only the unlocked charge version waits until release.

## 3.5 Full-charge targets

A full charge should reproduce the current Jackpot-like impact while remaining a cannon.

Using the current main-branch values, full-charge multipliers relative to the normal cannon are approximately:

```text
damage:
60 / 12 = 5.0×

splash radius:
9 / 3.4 = 2.647×

tank recoil:
17 / 10.5 = 1.619×

max enemy knockback:
12 / 8 = 1.5×

min enemy knockback:
2.5 / 1.5 = 1.667×

vertical enemy knockback:
4 / 2.5 = 1.6×
```

These are defaults, not hardcoded formulas.

## 3.6 Linear partial-charge scaling

The request says power is proportional to charge percentage.

Use linear interpolation:

```ts
effective = lerp(baseResolvedValue, fullChargeValue, chargeRatio);
```

Do not add a hidden easing curve.

## 3.7 Cannon modifiers apply first

Correct order:

```text
base cannon content
→ difficulty/modifier/item/upgrade resolution
→ resolved cannon value
→ charge multiplier interpolation
→ effective shot value
```

Incorrect order:

```text
base cannon
→ charge
→ later modifier applies only to normal portion
```

This guarantees all present and future cannon modifiers affect charge shots.

---

# 4. Feature A — Dash-only tank contact damage

# 4.1 Required behavior

## Normal movement contact

```text
tank not in active dash-contact window
+ tank overlaps enemy
→ tank deals 0 enemy damage
```

The enemy may still apply its own contact damage to the tank according to its behavior.

This request changes the tank’s offensive ram damage, not enemy attack damage.

## Dash contact

```text
accepted dash
→ short authoritative dash-damage window
→ overlapping damageable enemy receives dash damage
```

The dash must be accepted by shared kinematics.

A visual Dash animation alone must not grant damage.

---

# 4.2 Data-driven tank fields

Add validated tank stats:

```ts
contactDamage: number;
dashContactDamage: number;
dashDamageWindowSeconds: number;
dashContactKnockback: number;
dashContactPerTargetCooldown: number;
```

Recommended initial defaults:

```text
contactDamage = 0

dashContactDamage:
preserve the current intended one-dash kill against Scrap Bugs;
represent it as a real tunable value, not magic 999

dashDamageWindowSeconds = 0.20
dashContactKnockback = current intended contact response
dashContactPerTargetCooldown = 0.25
```

The exact damage number should be chosen from current enemy HP:

```text
Scrap Bug: one dash hit should kill
Rammer: designer decision may require more than one hit
Gun Tower: no contact damage if immovable/non-contactable
Loot Truck: uses normal damage rules if dash contact is allowed
```

Do not retain unconditional `999`.

---

# 4.3 Authoritative dash state

Add to tank state:

```ts
dashDamageT: number;
```

On accepted Dash:

```ts
dashDamageT = tankCfg.dashDamageWindowSeconds;
```

Every shared kinematic step:

```ts
dashDamageT = max(0, dashDamageT - dt);
```

Add it through:

- `TankState`
- `TankKinematicState`
- initial state
- respawn
- shared predictor copy
- snapshot reconciliation
- render/debug state only if needed
- content/config/stat pipeline

Do not reuse `dashPresentationT`.

---

# 4.4 Contact combat owner

The current `attack.contactRam` behavior mixes:

- Enemy contact attack
- Tank speed-based enemy kill
- score
- knockback
- Jackpot gain

Split responsibilities.

Recommended module:

```text
src/shared/combat/tankContactCombat.ts
```

Responsibilities:

- Determine tank/enemy overlap
- Determine whether dash damage is active
- Apply normal contact damage, default 0
- Apply dash contact damage
- Apply dash knockback
- Enforce per-target cooldown
- Emit semantic event
- Attribute source as `dash`
- Add dash-specific score/contribution

Enemy behavior remains responsible for enemy-to-tank contact damage.

`attack.contactRam` may delegate tank-offense resolution to this service.

Do not create per-enemy Dash switches in central code.

Use enemy content traits for:

```text
contactable
dashDamageMultiplier
dashKnockbackResistance
immovable
```

when needed.

---

# 4.5 Damage and statistics terminology

Replace offensive source:

```text
ram
→ dash
```

where it refers to tank-caused contact damage.

Potential migrations:

```text
ramKills → dashKills
ramScore → dashScore
RAMPAGE label → DASH / DASHED / ROADKILL, selected from content
```

Do not rename enemy Rammer attacks; `rammer` remains a valid enemy damage source.

Remove Jackpot gains from dash/contact contributions.

---

# 4.6 Prediction

Dash contact damage is authoritative.

Local Driver prediction may show immediate cosmetic contact impact, but must not decide:

- Enemy HP
- Kill
- Score
- Drop
- Knockback authority

Enemy reaction comes from authoritative state/event.

---

# 5. Feature B — Instant mouse-matched turret tracking

# 5.1 Required local feel

For the local Gunner and Single Player:

```text
mouse delta this rendered frame
→ desired yaw/pitch
→ turret model uses that yaw/pitch this rendered frame
```

No rate-limited visual chase.

No repeated snapshot pullback.

---

# 5.2 Data-driven response mode

Extend turret/loadout definition:

```ts
responseMode: "instant" | "rateLimited";
```

Retain optional rate fields for future tank variants:

```ts
turnRate?: number;
pitchFollowRate?: number;
```

Default loadout:

```json
{
  "responseMode": "instant",
  "turnRate": 60,
  "pitchFollowRate": 40
}
```

When `responseMode` is `instant`, rate values are not used for the player-controlled local turret.

This preserves future support for slow/heavy turrets without compromising the default.

---

# 5.3 Client prediction

Current `updateTurretTarget()` rate-limits predicted yaw and pitch.

Change default-instant behavior to:

```ts
desiredYawLocal = wrapAngle(worldYaw - chassisYaw);
desiredPitch = clamp(pitch, minPitch, maxPitch);

predictedYawLocal = desiredYawLocal;
predictedPitch = desiredPitch;
```

For `rateLimited`, preserve the existing rate path.

---

# 5.4 Server authority

The server must still validate:

- finite values
- normalized yaw
- pitch limits
- role ownership
- input sequence
- action sequence

For `instant` response:

```ts
turret.yaw = wrapAngle(input.aimYaw);
turret.pitch = clamp(input.aimPitch, minPitch, maxPitch);
```

Do not rate-limit the authoritative state.

For `rateLimited`, preserve the old authoritative clamp/lerp.

---

# 5.5 Reconciliation

For the locally controlled instant turret:

- Use acknowledgements to discard processed aim frames
- Keep the visual turret at the newest local desired target
- Do not blend it backward by 50% on every snapshot
- Record correction metrics separately
- Hard-correct only when:
  - values are invalid
  - pitch is outside authority
  - role/session changes
  - loadout response mode changes
  - extreme protocol divergence occurs

For the Driver observing the Gunner turret:

- Continue rendering authoritative/interpolated turret motion
- The Driver does not locally predict the Gunner mouse

---

# 5.6 Click-time aim in action messages

Extend discrete cannon actions with the current desired aim:

```ts
interface GunnerActionMessage {
  actionSeq: number;
  action: GunnerActionType;
  aimYaw: number;
  aimPitch: number;
}
```

The server:

1. Validates and applies the action aim.
2. Processes the action.
3. Fires using that exact accepted aim.

This prevents:

```text
mouse moved
→ release cannon
→ action arrives before latest periodic aim
→ shell fires along old aim
```

For charge release, the release-time aim is authoritative for the shot.

MG continues to use periodic aim plus immediate start/stop.

Increment protocol version.

---

# 5.7 Visual rig update

Ensure the tank rig is updated after the latest predicted turret target is calculated and before render.

Avoid this order:

```text
write old predicted turret to model
→ calculate new target
→ render old transform
```

Required order:

```text
consume mouse
→ update desired/predicted turret
→ write turret/barrel transforms
→ compute reticle/muzzle
→ render
```

Add a frame-order regression test or instrumentation hook.

---

# 6. Feature C — Remove fall damage completely

# 6.1 Tank

Remove:

```text
tank.fallDamageSpeed
tank.fallDamage
onHardFall damage callback
fall crash event generated only for damage
```

Kinematics may still detect landing for:

- landing grip
- landing VFX
- sound
- telemetry

It must not calculate or apply damage.

Prefer removing the callback entirely if it has no remaining non-damage purpose.

---

# 6.2 Enemies

Remove from enemy knockback definitions:

```text
fallDamageSpeed
fallDamage
```

Remove default constants and landing damage from `EnemyImpulseController`.

Enemies still:

- Fly from knockback
- Fall down cliffs
- Land
- Resume behavior
- Retain source attribution for ordinary damage

A cliff fall alone causes no HP loss.

---

# 6.3 Damage source

Remove:

```text
DamageSource = "fall"
```

Update tests and fixtures.

Do not leave unreachable fall-damage branches.

---

# 6.4 Content and stat cleanup

Remove fall stats from:

- tank schema
- tank content
- enemy schema
- enemy content
- legacy/config projection
- stat IDs
- stat blocks
- content-generation fixtures
- docs
- tests

Do not set the values to zero and keep the dead system.

---

# 7. Feature D — Replace Jackpot with a relic-gated cannon charge

# 7.1 Core identity

Charge Shot is a modifier of `weapon.mainCannon`.

It is not:

- A separate ability
- A separate loadout slot
- A separate damage source
- A separate shell family
- A meter-earned ultimate
- An auto-fire charge

---

# 7.2 Generic capability system

Add a generic capability ID:

```ts
export type CapabilityId =
  | "cannon.charge";
```

Prefer a scalable string registry/schema over a permanently closed union if future relics will add many capabilities.

Add authoritative capability state:

```ts
interface BuildState {
  capabilities: string[];
}
```

Add to `MatchState`:

```ts
build: BuildState;
```

Recommended system:

```text
src/shared/items/capabilitySystem.ts
```

API:

```ts
has(id: string): boolean;
grant(id: string, sourceId: string): void;
revokeSource(sourceId: string): void;
```

Use source tracking/reference counts so removing one item does not remove a capability still granted by another source.

Expose through `SystemContext`:

```ts
capabilities: CapabilitySystem;
```

---

# 7.3 Item/relic schema

Extend item definition:

```ts
grantsCapabilities?: string[];
```

`ItemSystem.apply()`:

```text
apply numeric modifiers
+ grant capabilities
```

`ItemSystem.remove()`:

```text
remove modifier source
+ revoke capability source
```

Add a content definition:

```text
item.relicCannonCharge
kind: relic
grantsCapabilities:
  - cannon.charge
```

Do not make `WeaponSystem` check:

```text
item.id === "item.relicCannonCharge"
```

It checks only:

```text
ctx.capabilities.has("cannon.charge")
```

Default modes do not start with the capability unless a test fixture explicitly enables it.

---

# 7.4 Remove the ability-slot dependency

The charge shot belongs to the secondary cannon slot.

Change loadout schema so `ability` can be optional or null:

```ts
ability?: string | null;
```

Default loadout:

```json
{
  "primary": "weapon.machineGun",
  "secondary": "weapon.mainCannon",
  "ability": null
}
```

Update `LoadoutRuntime` to handle an absent ability safely.

Remove `weapon.jackpotShell` from the default loadout.

After migration, delete the obsolete Jackpot weapon definition unless retained only as a documented temporary content migration fixture.

---

# 7.5 Main cannon charge profile

Extend weapon schema with a charge profile.

Recommended shape:

```ts
charge?: {
  capabilityId: string;

  tapMaxSeconds: number;
  fullChargeSeconds: number;

  fullDamageMultiplier: number;
  fullSplashRadiusMultiplier: number;
  fullRecoilMultiplier: number;

  fullKnockbackMaxMultiplier: number;
  fullKnockbackMinMultiplier: number;
  fullKnockbackVerticalMultiplier: number;

  fullShellVisualScale?: number;
};
```

Add to `weapon.mainCannon`.

Recommended defaults derived from current cannon and Jackpot values:

```json
{
  "charge": {
    "capabilityId": "cannon.charge",
    "tapMaxSeconds": 0.16,
    "fullChargeSeconds": 1.0,

    "fullDamageMultiplier": 5.0,
    "fullSplashRadiusMultiplier": 2.6470588235,
    "fullRecoilMultiplier": 1.619047619,

    "fullKnockbackMaxMultiplier": 1.5,
    "fullKnockbackMinMultiplier": 1.6666666667,
    "fullKnockbackVerticalMultiplier": 1.6,

    "fullShellVisualScale": 1.8
  }
}
```

Keep:

- Cannon speed
- Cannon gravity
- Cannon life

at resolved normal-cannon values unless later explicitly made charge-scalable.

---

# 7.6 Charge interaction state

Replace Jackpot turret fields with cannon hold state.

Recommended:

```ts
interface CannonChargeState {
  held: boolean;
  heldSeconds: number;
  ratio: number;
  full: boolean;
  pressActionSeq?: number;
}
```

Flatten into `TurretState` if that matches repository style:

```ts
cannonHeld: boolean;
cannonHoldT: number;
cannonChargeRatio: number;
cannonChargeFull: boolean;
```

Remove:

```text
jackpotReady
jackpotCooldown
old Jackpot charge semantics
```

The server computes charge duration.

Do not trust a client-sent charge percentage.

---

# 7.7 Input and action protocol

Replace:

```text
cannonPressed
abilityStart
abilityRelease
```

with clear secondary actions:

```text
secondaryPressed
secondaryReleased
```

Optionally include:

```text
secondaryCancelled
```

as an internal server/client lifecycle action, not a normal player input.

Action message includes:

```text
actionSeq
action
aimYaw
aimPitch
```

## Capability not owned

On `secondaryPressed`:

```text
validate cannon ready
apply click-time aim
fire normal cannon immediately
start cooldown
```

`secondaryReleased` has no shot effect.

## Capability owned

On `secondaryPressed`:

```text
validate cannon ready
reserve cannon interaction
set held = true
set heldSeconds = 0
do not fire
```

During update:

```text
heldSeconds += dt
ratio = clamp((heldSeconds - tapMax) / (fullCharge - tapMax), 0, 1)
never auto-fire
```

On `secondaryReleased`:

```text
apply release-time aim

if heldSeconds <= tapMax:
  fire normal cannon
else:
  fire cannon with ratio

begin cannon cooldown
clear held state
```

---

# 7.8 Cancellation rules

Cancel without firing when:

- Tank dies
- Player leaves
- Reconnect resets match ownership
- Match ends
- Input is forcibly cleared
- Server invalidates role
- Single Player session is destroyed

On pointer-lock loss or pause:

- Send release only if it represents a real user release
- Otherwise cancel safely
- Do not generate an accidental full shot from a UI transition

Document and test the chosen input-manager behavior.

---

# 7.9 Full-charge hold

At 100%:

```text
ratio = 1
heldSeconds may continue or clamp
shot does not fire
meter remains full
release fires
```

No additional power above 100%.

No forced release timer.

---

# 7.10 Shared cannon shot request

Change weapon behavior invocation to accept a typed request:

```ts
interface WeaponFireRequest {
  actionSeq?: number;
  chargeRatio: number;
}
```

Recommended registry API:

```ts
fire(
  ctx: SystemContext,
  weapon: WeaponDefinition,
  state: WeaponRuntimeState,
  request: WeaponFireRequest
): void;
```

MG passes:

```text
chargeRatio = 0
```

Normal cannon passes:

```text
chargeRatio = 0
```

Charged cannon passes:

```text
0 < chargeRatio <= 1
```

Do not use a mutable global `pendingChargeRatio` on `SystemContext`.

For burst modifiers, store the triggering charge ratio in secondary `WeaponRuntimeState` so every shell in the burst inherits the same ratio.

---

# 7.11 Effective cannon shot profile

Create a pure resolver:

```text
src/shared/weapons/cannonShotProfile.ts
```

API:

```ts
resolveCannonShotProfile(
  rules,
  weapon,
  chargeRatio
): CannonShotProfile;
```

Example output:

```ts
interface CannonShotProfile {
  chargeRatio: number;

  damage: number;
  splashRadius: number;

  recoilImpulse: number;
  recoilSpin: number;

  knockbackMax: number;
  knockbackMin: number;
  knockbackVertical: number;
  knockbackRadiusMultiplier: number;
  knockbackFalloffExponent: number;

  speed: number;
  gravity: number;
  life: number;

  visualScale: number;
}
```

Order:

```text
resolved cannon stats
→ linear charge scaling
→ immutable per-shot profile
```

---

# 7.12 Projectile payload

A fired shell should retain its effective profile at spawn.

Recommended:

```ts
interface ShellCombatPayload {
  damage: number;
  splashRadius: number;
  knockbackMax: number;
  knockbackMin: number;
  knockbackVertical: number;
  knockbackRadiusMultiplier: number;
  knockbackFalloffExponent: number;
}
```

Add to `ShellState`:

```ts
chargeRatio?: number;
combat?: ShellCombatPayload;
visualScale?: number;
```

Reason:

- Future upgrades can change after a shot is fired
- The shell must not mutate in flight
- Impact must reproduce the firing-time values
- Remote clients need charge ratio/visual scale

Keep shell kind:

```text
cannon
```

Remove:

```text
jackpot
```

from player projectile kinds.

Tower remains separate.

---

# 7.13 Damage attribution

Charged cannon applies:

```text
DamageSource = cannon
weaponId = weapon.mainCannon
tags.charged = true
tags.chargeRatio = not possible in boolean tag map; use event/payload metadata
```

Do not use:

```text
DamageSource = jackpot
```

All cannon kill, scoring, relic, and future upgrade hooks should see it as a cannon shot.

---

# 7.14 Recoil scaling

Use the effective shot profile:

```ts
recoil = lerp(
  resolvedNormalCannonRecoil,
  resolvedNormalCannonRecoil * fullRecoilMultiplier,
  chargeRatio
);
```

The exact authoritative impulse event remains the existing shared netcode path.

Driver and Gunner receive it immediately.

---

# 7.15 Splash and enemy knockback scaling

At impact, use the shell’s stored combat payload.

Scale:

- Enemy damage
- Splash radius
- Knockback max
- Knockback min
- Knockback vertical

Do not treat charge as a separate projectile branch.

Avoid:

```ts
if (shell.kind === "jackpot")
```

The only charge branch should be profile data.

---

# 7.16 Cannon modifiers and upgrades

All of these must affect charged shots:

```text
cannon damage
cannon cooldown
cannon burst count
burst spacing
cannon splash radius
cannon recoil
cannon knockback
cannon projectile speed, if modified
cannon gravity, if modified
cannon life, if modified
future cannon-specific item/relic modifiers
```

If Double Barrel causes two cannon shells:

```text
one release
→ resolved cannon burst
→ every burst shell uses the same charge ratio
```

Do not allow charge to bypass modifier resolution.

---

# 7.17 Remove Jackpot subsystem

Remove or migrate every Jackpot-specific path.

## State

Remove:

```text
StatsState.jackpotMeter
StatsState.jackpotFired
TurretState.jackpotReady
TurretState.jackpotCooldown
MatchConfig.jackpotGainMult
```

Add if desired for results:

```text
StatsState.chargedCannonShots
StatsState.fullChargeShots
```

## Systems

Remove:

```text
JackpotSystem
SystemContext.jackpot
```

## Config

Remove:

```text
GameConfig.jackpot
weapon jackpot fields in GameConfig
Jackpot stat IDs
Jackpot gain modifiers
Jackpot assistance floors
```

If a non-meter mechanic is still desired, move it to the correct owner:

```text
final chaos scoring multiplier
→ scoring or mode rules

contribution behavior
→ combo system

rare scrap score
→ pickup/scoring content
```

Do not leave them in a hidden object named Jackpot.

## Content

Remove or migrate:

```text
weapon.jackpotShell
projectile.jackpotShell
Jackpot pickup/gain entries
Jackpot-only drop table references
Jackpot results/title conditions
Jackpot presentation strings
```

Replace obsolete Jackpot scrap drops with a clearly chosen existing pickup, such as Heavy Scrap, unless product content specifies a new rare-scrap type.

Do not preserve an invisible meter.

## Events and protocol

Remove/rename:

```text
jackpotCharge
jackpotFire
jackpotImpact
tank impulse source jackpot
abilityStart
abilityRelease
```

Use cannon/charge semantic events:

```text
cannonChargeStarted
cannonChargeFull
cannonChargeReleased
chargedCannonImpact
```

or generic shot/impact events carrying:

```text
kind = cannon
chargeRatio
```

Prefer fewer generic events with typed metadata.

Increment protocol version.

## Results

Replace:

```text
jackpotFired
```

with:

```text
chargedCannonShots
fullChargeShots
```

Update result scene bindings and title rules.

---

# 8. HUD design

# 8.1 Remove bottom Jackpot meter

Delete:

```text
jackpot-row
jackpot-label
jackpot-bar
jackpot fill
jackpot ready state
```

Do not merely hide it.

Remove related bindings, preview values, CSS, and view-model fields.

---

# 8.2 Remove old bottom charge row

The current large bottom charge row is not the requested location.

Delete or repurpose it.

The charge indicator belongs next to the crosshair.

---

# 8.3 New compact reticle charge meter

When the local player:

```text
can aim
AND owns cannon.charge
```

show a compact charge indicator adjacent to the crosshair.

Recommended layout:

```text
crosshair center

small vertical bar or compact arc
positioned 18–26 px to the right
approximately 6–8 px wide
approximately 36–48 px high
```

States:

```text
unlocked, idle:
visible at low opacity, empty

holding under tap threshold:
subtle warm-up state

charging:
fill follows local predicted ratio

full:
100% fill + restrained pulse/glow

cooldown:
may dim, but does not become the cannon cooldown meter
```

The existing crosshair cooldown arc remains responsible for cannon cooldown.

Do not combine cooldown and charge into one ambiguous ring.

---

# 8.4 Immediate local HUD prediction

For the local Gunner and Single Player, charge UI must not wait for snapshots.

Add local predicted charge state to HUD projection context:

```ts
interface LocalCannonChargeView {
  unlocked: boolean;
  held: boolean;
  heldSeconds: number;
  ratio: number;
  full: boolean;
}
```

Source:

- Multiplayer Gunner: local action predictor
- Single Player: local/shared weapon state
- Multiplayer Driver: no charge reticle because no local crosshair

The server snapshot remains authoritative for correction.

---

# 8.5 HUD view model

Remove:

```text
gunner.jackpot
gunner.jackpotMax
gunner.jackpotReady
old chargeVisible semantics
```

Add:

```ts
gunner: {
  cannonCooldown: number;
  cooldownRatio: number;

  chargeUnlocked: boolean;
  chargeHeld: boolean;
  chargeRatio: number;
  chargeFull: boolean;
}
```

Add binding paths.

Suggested nodes:

```text
crosshair
crosshair-charge
crosshair-charge-fill
```

Use content-driven HUD definitions.

Do not create hardcoded DOM in `GameClient`.

---

# 8.6 Prompts and language

Remove player-facing:

```text
JACKPOT
JACKPOT READY
JACKPOT SCRAP
```

When the relic is obtained, a temporary popup may say:

```text
CHARGE SHOT UNLOCKED
HOLD RMB · RELEASE TO FIRE
```

Normal HUD does not need persistent tutorial text after the charge meter communicates the mechanic.

---

# 9. Local action prediction

# 9.1 Charge capability not owned

Preserve current immediate predicted cannon presentation on RMB press.

The action includes click-time aim.

---

# 9.2 Charge capability owned

On press:

- Send `secondaryPressed` immediately
- Begin local hold timer after server/client readiness check
- Play subtle charge-start audio/VFX
- Do not play cannon fire
- Do not create shell
- Show meter

On release:

- Send `secondaryReleased` immediately with release-time aim
- Compute local predicted ratio
- Play predicted regular or charged cannon presentation
- Track action sequence
- Suppress duplicate authoritative event
- Correct presentation if server ratio differs materially

The server does not trust the local ratio.

---

# 9.3 Authoritative result metadata

Action result or shot event should include:

```text
accepted
actionSeq
fired
chargeRatio
shellId
reason
```

The local predictor uses it to:

- Confirm predicted shot
- Merge predicted shell if used
- Correct meter
- Remove rejected presentation
- Record hold/release latency

---

# 9.4 Charge audio/VFX

Repurpose Jackpot visual intensity into charge presentation, but use new semantic IDs:

```text
audio.cannonChargeStart
audio.cannonChargeLoop
audio.cannonChargeFull
audio.cannonChargeRelease

vfx.cannonCharge
vfx.cannonMuzzleCharged
vfx.cannonImpactCharged
```

Intensity scales with `chargeRatio`.

A full charge may visually resemble the old Jackpot shot.

Do not preserve Jackpot terminology in IDs after migration unless temporary aliases are documented.

---

# 10. Data and stat design

# 10.1 Known stat IDs

Add charge profile stat IDs if charge values need runtime modifiers:

```text
weapon.chargeTapMaxSeconds
weapon.chargeFullSeconds
weapon.chargeFullDamageMultiplier
weapon.chargeFullSplashRadiusMultiplier
weapon.chargeFullRecoilMultiplier
weapon.chargeFullKnockbackMaxMultiplier
weapon.chargeFullKnockbackMinMultiplier
weapon.chargeFullKnockbackVerticalMultiplier
```

Alternatively, immutable shape values can live in `weapon.charge`.

For future upgrades, combat-relevant values should be resolvable stats.

Recommended:

- Capability ID and presentation settings in `weapon.charge`
- Numeric combat/timing values in `statBlock`

This lets relics/upgrades modify them through the existing StatResolver.

---

# 10.2 Movement/rules replication

Replicate predictor/HUD-critical values:

```text
turret response mode
turret pitch limits
cannon cooldown
charge capability state
tap threshold
full charge seconds
```

Do not include all impact damage values in the movement block unless the client needs them for prediction.

Use a focused weapon presentation/rules block if needed.

---

# 11. Migration phases

## Phase 0 — Audit and golden tests

Inventory:

- Contact/ram damage paths
- Dash state paths
- Fall damage paths
- Turret response and reconciliation paths
- Every Jackpot reference
- Ability-slot references
- HUD Jackpot/charge references
- Results and title references
- Pickup/drop references
- VFX/audio references

Record current regression values.

## Phase 1 — Dash-only contact damage

- Add tank contact stats
- Add `dashDamageT`
- Add contact combat owner
- Remove speed-based ram kill
- Preserve enemy contact attacks
- Rename damage/stat attribution
- Add tests

## Phase 2 — Remove fall damage

- Remove tank callback/damage
- Remove enemy landing damage
- Remove schemas/content/stats/source
- Add cliff/landing regression tests

## Phase 3 — Instant turret

- Add response mode
- Direct local predicted transforms
- Direct authoritative instant aim
- Fix reconcile behavior
- Add click-time aim to actions
- Increment protocol
- Add latency tests

## Phase 4 — Capability system

- Add capability state/system
- Extend items
- Add relic definition
- Add test/debug grant
- Replicate capability state

## Phase 5 — Charge input state machine

- Replace actions
- Add hold/release
- Tap vs charge
- No auto-fire
- Cancellation
- Single Player parity
- Network action result metadata

## Phase 6 — Charged cannon profile

- Extend main cannon content
- Add pure profile resolver
- Extend behavior fire request
- Store per-shell impact payload
- Scale damage/recoil/knockback/radius
- Preserve cannon attribution and modifiers
- Handle bursts

## Phase 7 — Remove Jackpot

- Delete system/state/config/content
- Migrate scoring references
- Migrate results/events
- Delete ability weapon
- Remove dead aliases

## Phase 8 — HUD and presentation

- Remove bottom meter
- Add reticle charge meter
- Local charge prediction
- New VFX/audio semantics
- Update previews and documentation

## Phase 9 — Full regression and report

- Unit/integration/E2E
- Manual feel tests
- Network latency tests
- Long-run hold/release tests
- Implementation report

---

# 12. Tests

# 12.1 Dash contact

- Normal slow contact deals 0 enemy damage
- Normal high-speed contact deals 0 enemy damage
- Airborne non-dash contact deals 0 enemy damage
- Active Dash contact deals configured damage
- Dash window expires
- Presentation timer cannot grant damage
- Same enemy cannot be damaged repeatedly every substep
- Scrap Bug dies from intended Dash
- Enemy contact damage to tank remains
- Source is `dash`
- Score/stat attribution is Dash
- Driver predictor never authoritatively kills enemy

# 12.2 Fall damage

- Tank falls from extreme height and takes 0 fall damage
- Enemy falls from extreme height and takes 0 fall damage
- Landing grip still works
- Enemy landing/recovery still works
- Cliff falling still works
- No `fall` damage source remains
- No fall stats remain in generated content

# 12.3 Turret

- Instant mode predicted yaw equals desired yaw in same frame
- Instant mode predicted pitch equals desired clamped pitch
- Instant server yaw equals accepted input yaw
- Instant server pitch equals accepted clamped input pitch
- No per-snapshot backward blend for local Gunner
- Driver remote view receives authoritative turret
- Rate-limited mode still works in a fixture
- Action uses click/release-time aim
- 100/150 ms simulated RTT does not make local turret sticky
- Invalid aim is rejected/clamped

# 12.4 Capability

- Default mode does not own charge capability
- Applying charge relic grants capability
- Removing source revokes capability
- Multiple sources reference-count correctly
- Capability replicates
- Capability survives snapshots/reconciliation
- Reconnect reconstructs capability
- Rematch resets according to mode/run rules

# 12.5 Charge interaction

- No capability: press fires normal cannon
- Capability: press does not fire
- Tap release fires normal cannon
- Hold past threshold releases partial charge
- 50% hold produces 50% linear interpolation
- Full charge reaches 1
- Holding after full does not exceed 1
- Holding after full does not auto-fire
- Release after indefinite hold fires once
- Death cancels
- Disconnect cancels
- Match end cancels
- Duplicate release does not fire twice
- Release without valid press is rejected safely
- Cooldown begins on fire/release
- Cannot start hold during cooldown
- Single Player and multiplayer use same WeaponSystem

# 12.6 Cannon modifier inheritance

- Damage modifier affects normal and charged cannon
- Radius modifier affects normal and charged cannon
- Recoil modifier affects normal and charged cannon
- Knockback modifier affects normal and charged cannon
- Cooldown modifier applies
- Burst modifier applies
- Every burst shell inherits charge ratio
- Full charge defaults match old Jackpot-like targets
- Charge damage source remains cannon
- Cannon kill hooks receive charged kills
- No Jackpot source/kind remains

# 12.7 Projectile payload

- Firing-time profile remains stable in flight
- Impact uses stored damage
- Impact uses stored radius
- Impact uses stored knockback
- Remote shell receives charge visual scale
- Normal cannon has ratio 0
- Full charge has ratio 1
- Tower projectiles unaffected

# 12.8 HUD

- Bottom Jackpot row absent
- Old bottom charge row absent
- Charge meter absent without capability
- Charge meter visible with capability and local crosshair
- Idle meter low opacity
- Meter fills immediately from local prediction
- Meter clamps at 100%
- Full state visible
- Cooldown ring remains separate
- Driver HUD does not show local charge reticle
- Single Player shows charge meter when unlocked
- No JACKPOT text remains

# 12.9 Regression

- Driver prediction
- Gunner shared tank prediction
- Exact recoil impulses
- Cannon trajectory crosshair
- Single Player
- Multiplayer room lifecycle
- Reconnect
- Rematch
- Map checksum
- Map Lab
- Content generation
- Presentation generation
- Pause/resume
- Results
- Demo regression or intentional fixture update

---

# 13. Manual feel tests

Run with:

```text
default mouse sensitivity
fast 180-degree mouse sweep
small precision corrections
moving chassis
jumping
dash
100 ms simulated RTT
150 ms simulated RTT
```

Confirm:

- Local turret visually matches mouse immediately
- Crosshair and muzzle remain aligned
- Cannon fires along release-time aim
- Charge meter feels readable but unobtrusive
- Tap shot is reliable
- Partial release feels predictable
- Full charge never auto-fires
- Full-charge recoil resembles old Jackpot power
- Normal driving through enemies does not deal damage
- Dash contact does
- Large falls never damage tank or enemies

---

# 14. Performance requirements

- Instant turret update adds no allocation-heavy path
- Charge meter updates existing DOM style only
- No HUD node reconstruction per frame
- Charge state queue is bounded
- No per-frame content lookup by string scan
- Shell payload size remains reasonable
- Full-charge indefinite hold causes no queue/memory growth
- Item capability lookup is O(1)
- No frame-time regression

Measure:

```text
turret update time
HUD projection time
weapon update time
projectile impact time
snapshot size
frame p95
```

---

# 15. Documentation

Create:

```text
docs/combat05/COMBAT05_IMPLEMENTATION_REPORT.md
docs/guides/CANNON_CHARGE_AUTHORING_GUIDE.md
docs/guides/COMBAT_CONTACT_RULES.md
```

Update:

```text
README.md
docs/README.md
docs/guides/ARCHITECTURE.md
docs/guides/CONTENT_AUTHORING_GUIDE.md
docs/guides/NETWORK_RULES.md
docs/guides/SMOKE_TEST.md
docs/planning/BUILD_STATUS.md
```

The cannon charge guide must explain:

- Capability ID
- Relic grant
- Tap threshold
- Full charge time
- Linear scaling
- Charge multipliers
- Cannon modifier inheritance
- VFX/audio IDs
- HUD preview
- Testing partial charge
- Burst behavior

---

# 16. Completion criteria

The milestone is complete only when:

1. Normal tank contact deals 0 enemy damage.
2. Normal high-speed driving deals 0 enemy damage.
3. Only the authoritative Dash damage window deals tank-contact damage.
4. Dash damage is data-driven and not magic `999`.
5. Enemy contact attacks still work.
6. Local turret yaw and pitch match mouse target in the same frame.
7. Server instant response uses the accepted aim directly.
8. Snapshot reconciliation no longer pulls the local turret backward.
9. Cannon actions use click/release-time aim.
10. Tank fall damage is removed.
11. Enemy fall damage is removed.
12. Fall-damage stats and source are deleted.
13. Jackpot meter is deleted.
14. Jackpot system/state/config/gain paths are deleted or migrated.
15. Default loadout has no Jackpot ability.
16. Charge Shot is gated by `cannon.charge`.
17. A relic/item can grant the capability generically.
18. Without capability, cannon fires normally on press.
19. With capability, tap release fires normal cannon.
20. With capability, hold/release fires partial charge.
21. Full charge clamps at 100%.
22. Full charge can be held indefinitely.
23. Full charge never auto-fires.
24. Damage, recoil, enemy knockback, and splash radius scale linearly.
25. Full-charge defaults resemble current Jackpot power.
26. Charge Shot remains a cannon for all hooks and modifiers.
27. Future cannon upgrades automatically affect it.
28. Every burst shell inherits charge.
29. The bottom Jackpot meter is gone.
30. A compact charge meter appears next to the crosshair only when unlocked.
31. Local charge HUD feedback is immediate.
32. No Jackpot player-facing terminology remains.
33. Single Player and multiplayer share the same weapon implementation.
34. Existing netcode, maps, presentation, and lifecycle behavior do not regress.
35. Required tests and manual feel checks pass.

Final invariant:

> Ordinary movement is non-damaging, Dash is the tank’s contact attack, the turret is mouse-synchronous, falls are harmless, and Charge Shot is a scalable cannon upgrade rather than a separate ultimate system.
