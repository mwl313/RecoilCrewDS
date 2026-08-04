# Codex Prompt — Implement Recoil Crew Combat 05
## Dash-Only Contact Damage, Instant Turret, No Fall Damage, and Relic-Gated Cannon Charge

Repository:

```text
mwl313/RecoilCrewDS
```

Branch:

```text
main
```

Read first:

```text
docs/combat05/COMBAT05_DASH_CHARGE_AND_TURRET_RESPONSIVENESS_DESIGN.md
```

Treat that design document and this prompt as the binding contract.

---

# Mission

Implement four changes on the current `main` branch:

1. Normal tank contact damage becomes zero; only an accepted Dash damage window can damage enemies by contact.
2. The locally controlled turret model follows mouse aim immediately, without sticky rate-limited visual tracking or snapshot pullback.
3. Remove fall damage completely for both tank and enemies.
4. Remove the Jackpot subsystem and convert its powerful shell concept into a relic-gated, partial-charge version of the normal cannon.

The charged cannon must:

- Be unavailable by default
- Be unlocked by a generic item/relic capability
- Fire a normal shell on tap
- Charge while RMB is held
- Fire on release
- Allow any partial charge
- Scale linearly
- Clamp at 100%
- Allow indefinite full-charge hold
- Never auto-fire
- Remain a cannon
- Inherit every cannon modifier and future cannon upgrade

---

# Required first step

Inspect the current repository and create:

```text
docs/combat05/COMBAT05_CODE_AUDIT.md
```

The audit must list exact files, symbols, and current behavior for:

```text
tank contact damage
attack.contactRam
dash state
damage attribution
fall damage
enemy fall damage
turret local prediction
turret server validation
turret reconciliation
Gunner action protocol
click-time aim
Jackpot state
JackpotSystem
Jackpot config/stats
Jackpot pickups/drop tables
Jackpot result/title rules
ability loadout slot
charge weapon behavior
projectile Jackpot branch
HUD Jackpot and charge nodes
VFX/audio IDs
item/relic schema and ItemSystem
```

Record every `jackpot`, `ram`, and `fallDamage` occurrence that requires migration.

Then implement.

Do not stop after the audit.

---

# Current source findings to verify

The reviewed `main` branch currently has these important behaviors:

## Contact ram

`attack.contactRam` kills an enemy when tank horizontal speed exceeds a threshold.

It does not check Dash state.

## Turret

Client `PredictionController.updateTurretTarget()` rate-limits yaw and pitch.

Server `WeaponSystem.update()` rate-limits yaw and smooths pitch.

Client `reconcileTurret()` blends predicted turret toward authority.

Gunner action messages do not include aim yaw/pitch.

## Fall damage

Tank:

```text
stepTankKinematics
→ onHardFall
→ MatchRuntime damage
```

Enemy:

```text
EnemyImpulseController landing
→ fall damage
```

## Jackpot

Current state includes:

```text
jackpotMeter
jackpotFired
jackpotReady
jackpotCooldown
chargeT
```

Current default loadout uses `weapon.jackpotShell` in the ability slot.

`WeaponSystem.updateAbility()` auto-fires at full charge and decays charge on release, which is the opposite of the requested release-to-fire behavior.

Confirm all of these against the actual current commit before editing.

---

# Non-negotiable constraints

Preserve:

- Authoritative multiplayer server
- Shared tank prediction
- Immediate Gunner actions
- Exact tank impulse events
- ContentPack and MatchRules
- StatResolver
- Behavior registries
- SystemContext modular services
- Single Player combined controls
- Generated maps and checksums
- Current shared tank-rig geometry
- Current trajectory crosshair
- Refractor 02 HUD/content architecture
- Reconnect/rematch
- Current performance targets

Do not:

- Make Dash damage depend on `dashPresentationT`
- Keep speed-only ram kills
- Use magic `999` as final Dash damage
- Remove enemy contact attacks
- Keep fall damage fields set to zero as dead configuration
- Keep local turret rate limiting in instant mode
- Trust client charge percentage
- Auto-fire at 100%
- Put Charge Shot in the ability slot
- Treat Charge Shot as Jackpot damage
- Create a separate charged-cannon upgrade path
- Bypass cannon modifiers
- Hardcode a relic ID in WeaponSystem
- Rebuild HUD DOM every frame
- Rewrite unrelated netcode or map systems
- Leave hidden Jackpot state after removing the HUD
- Claim completion while Jackpot terms remain in active production code

---

# Required milestone order

```text
Milestone 0 — Audit and golden tests
Milestone 1 — Dash-only contact combat
Milestone 2 — Remove all fall damage
Milestone 3 — Instant turret and click-time aim
Milestone 4 — Generic capability/item support
Milestone 5 — Secondary-button charge state machine
Milestone 6 — Cannon charge profile and projectile payload
Milestone 7 — Remove Jackpot subsystem
Milestone 8 — Reticle charge HUD and presentation
Milestone 9 — Regression, manual testing, documentation
```

Run focused tests after every milestone.

---

# Milestone 0 — Audit and golden tests

Create deterministic fixtures for:

- Fast normal tank contact
- Dash contact
- Extreme tank fall
- Extreme enemy fall
- 180-degree mouse aim
- Snapshot turret reconciliation
- Normal cannon
- Jackpot full shot
- Jackpot HUD/result fields

Record current expected behavior.

Use these fixtures to distinguish intentional changes from regressions.

---

# Milestone 1 — Dash-only contact combat

## Data

Add tank content/schema/stat fields:

```text
contactDamage
dashContactDamage
dashDamageWindowSeconds
dashContactKnockback
dashContactPerTargetCooldown
```

Set:

```text
contactDamage = 0
```

Choose a real default Dash damage that preserves intended one-Dash Scrap Bug kills.

Do not use `999`.

## State

Add:

```text
TankState.dashDamageT
TankKinematicState.dashDamageT
```

On accepted Dash:

```text
dashDamageT = dashDamageWindowSeconds
```

Decrement in shared kinematics.

Reset on:

- initialization
- death
- respawn
- predictor reset
- reconnect
- rematch
- Single Player restart

## System

Create a focused contact combat service, following `SystemContext` patterns.

Suggested:

```text
src/shared/combat/tankContactCombat.ts
```

Responsibilities:

- Tank/enemy overlap
- Dash-active check
- Normal damage 0
- Dash damage
- Knockback
- Per-target cooldown
- Damage source
- Score/stat event

Make `attack.contactRam` delegate.

Keep enemy-to-tank contact damage separate.

## Attribution

Use:

```text
source = dash
```

Migrate:

```text
ramKills → dashKills
ramScore → dashScore
```

where the source is tank Dash contact.

Do not rename the Rammer enemy’s attack source.

Remove Jackpot gain calls from contact/dash contribution.

---

# Milestone 2 — Remove all fall damage

## Tank

Remove:

```text
fallDamageSpeed
fallDamage
onHardFall damage callback
fall-only crash damage event
```

Landing physics and landing grip remain.

## Enemies

Remove fall damage fields from enemy knockback schema/content.

Remove landing damage from `EnemyImpulseController`.

Enemy cliff fall and landing remain.

## Damage source

Remove:

```text
fall
```

from `DamageSource`.

## Pipeline

Update:

```text
GameConfig
BASE_CONFIG
tank schema
tank content
enemy schema
enemy content
stat IDs
stat blocks
content projections
legacy fixtures
tests
docs
```

Do not leave zeroed dead values.

---

# Milestone 3 — Instant turret

## Loadout schema

Add:

```text
responseMode: instant | rateLimited
```

Default loadout:

```text
responseMode = instant
```

Retain rate fields for optional rate-limited variants.

## Client

For instant mode:

```text
predicted yaw = desired yaw
predicted pitch = desired clamped pitch
```

in the same rendered frame.

Do not clamp by `turnRate × dt`.

Ensure frame order:

```text
consume mouse
→ solve aim
→ update predicted turret
→ write rig transform
→ compute muzzle/reticle
→ render
```

## Server

For instant mode:

```text
turret yaw = validated accepted aim yaw
turret pitch = clamped accepted aim pitch
```

No rate limit or pitch lerp.

## Reconcile

Do not blend the local Gunner turret backward on every snapshot.

Use Gunner input acknowledgement to discard pending frames.

Keep the newest local desired aim as visual truth.

Hard-correct only invalid/extreme states.

Remote Driver turret remains authoritative/interpolated.

## Click-time aim

Change action messages:

```ts
{
  actionSeq,
  action,
  aimYaw,
  aimPitch
}
```

The server validates/applies action aim before processing the action.

Increment protocol version.

Add tests under 100 and 150 ms simulated RTT.

---

# Milestone 4 — Capability support

## Capability system

Create a generic capability owner.

Suggested:

```text
src/shared/items/capabilitySystem.ts
```

Expose:

```text
has
grant
revokeSource
```

Use source tracking.

Add serialized match build state:

```text
build.capabilities
```

Expose through `SystemContext`.

## Item schema

Add:

```text
grantsCapabilities?: string[]
```

Update `ItemSystem.apply/remove`.

Add:

```text
item.relicCannonCharge
grants capability cannon.charge
```

The default run does not grant it.

Add a test/debug grant path.

Do not check relic ID in weapon code.

---

# Milestone 5 — Cannon hold/release state machine

## Protocol actions

Replace:

```text
cannonPressed
abilityStart
abilityRelease
```

with:

```text
secondaryPressed
secondaryReleased
```

Keep:

```text
mgStart
mgStop
```

Every secondary action includes current aim.

## Capability off

`secondaryPressed`:

- Validate cooldown
- Apply aim
- Fire normal cannon immediately
- Start cooldown

## Capability on

`secondaryPressed`:

- Validate cooldown
- Apply aim
- Reserve cannon hold
- Set hold time zero
- Do not fire

Update:

```text
heldSeconds = min(heldSeconds + dt, fullChargeSeconds)
```

or allow the raw timer to grow while ratio remains clamped.

Never auto-fire.

`secondaryReleased`:

- Apply release aim
- If hold <= tap threshold: normal cannon
- Otherwise: charge ratio
- Fire once
- Start cooldown
- Clear hold

## Cancel

Cancel without firing on:

```text
death
disconnect
leave
match end
role invalidation
forced input clear
session destruction
```

Ensure pause/pointer-lock behavior cannot accidentally fire.

## Single Player

Use the same `WeaponSystem` state machine.

Do not create a local-only charge implementation.

---

# Milestone 6 — Cannon charge profile

## Weapon content/schema

Add charge profile to `weapon.mainCannon`.

Use defaults from the design document.

Put combat/timing values into resolvable stat IDs where future items/upgrades need to modify them.

## Behavior request

Extend weapon behavior fire API with:

```text
actionSeq
chargeRatio
```

Do not use global mutable pending charge state.

Store charge ratio for burst follow-up shells.

## Pure resolver

Create:

```text
src/shared/weapons/cannonShotProfile.ts
```

Resolve:

```text
damage
radius
recoil
knockback
speed
gravity
life
visual scale
```

Apply current resolved cannon stats first, then linear charge multipliers.

## Projectile state

Store firing-time effective combat payload.

Keep:

```text
shell kind = cannon
weapon ID = weapon.mainCannon
damage source = cannon
```

Remove player `jackpot` shell kind.

## Impact

Remove `isJackpot` branching.

Read the shell payload for:

```text
damage
splash radius
knockback max/min/vertical
```

Use charge ratio only for presentation metadata.

## Recoil

Use the effective profile and existing exact impulse system.

## Modifiers

Test:

- damage
- radius
- cooldown
- burst
- recoil
- knockback
- projectile stats

Every cannon modifier must affect charged shots.

---

# Milestone 7 — Remove Jackpot

Delete or migrate all active references.

## Remove

```text
JackpotSystem
SystemContext.jackpot
jackpotMeter
jackpotReady
jackpotCooldown
jackpotGainMult
weapon.jackpotShell
ability default slot
jackpot damage source
player jackpot shell kind
jackpot charge/fire/impact events
Jackpot HUD
Jackpot results field
Jackpot gain calls
```

## Migrate non-meter mechanics

If still required:

```text
final chaos multiplier → scoring/mode content
combo contribution → ComboSystem
rare pickup score → pickup/scoring content
```

Do not leave them under `GameConfig.jackpot`.

Replace Jackpot-specific drop references with a chosen valid pickup.

Remove Jackpot text from active UI/content.

Replace result stats with:

```text
chargedCannonShots
fullChargeShots
```

only where useful.

Increment generated fixture versions/hashes as required.

---

# Milestone 8 — HUD and presentation

## HUD content

Remove:

```text
jackpot-row
old bottom charge-row
Jackpot bindings
Jackpot preview values
```

Add compact reticle-adjacent meter.

Required view-model fields:

```text
chargeUnlocked
chargeHeld
chargeRatio
chargeFull
```

Show only when:

```text
local crosshair visible
AND capability owned
```

Idle state remains visible but subtle.

Charging fills immediately from local prediction.

Full state pulses subtly.

Keep the cannon cooldown arc separate.

## Local predictor

Add a client charge interaction predictor for:

- hold start time
- ratio
- full state
- predicted release presentation
- authoritative confirmation

The server remains authoritative for ratio.

## Presentation

Add/rename semantic IDs:

```text
audio.cannonChargeStart
audio.cannonChargeLoop
audio.cannonChargeFull
audio.cannonChargeRelease

vfx.cannonCharge
vfx.cannonMuzzleCharged
vfx.cannonImpactCharged
```

Scale presentation by charge ratio.

Full charge may reuse the old Jackpot aesthetic after semantic renaming.

---

# Milestone 9 — Verification and docs

Create:

```text
docs/combat05/COMBAT05_IMPLEMENTATION_REPORT.md
docs/guides/CANNON_CHARGE_AUTHORING_GUIDE.md
docs/guides/COMBAT_CONTACT_RULES.md
```

Update architecture/content/network/smoke/build-status documentation.

The implementation report must include:

- Audit
- Exact migration list
- Before/after contact behavior
- Turret diagnosis and fix
- Fall paths removed
- Jackpot paths removed/migrated
- Capability architecture
- Charge state machine
- Scaling formula
- Modifier inheritance tests
- HUD screenshots or manual description
- Network latency test results
- Performance results
- Commands run
- Remaining limitations
- Completion checklist

---

# Required automated tests

Add focused test groups for:

```text
dash contact
fall removal
instant turret
click-time aim
capabilities
charge state machine
charge scaling
cannon modifier inheritance
projectile payload
Jackpot removal
charge HUD
network action dedupe
Single Player parity
```

Use the exact cases in the design document.

---

# Required manual checks

Test:

```text
normal low-speed contact
normal high-speed contact
dash contact
large tank fall
large enemy fall
fast mouse sweep
precision mouse aim
100 ms RTT
150 ms RTT
tap RMB
20% charge
50% charge
100% charge
hold full charge for 10 seconds
release full charge
death while charging
pause while charging
disconnect while charging
Double Barrel charged shot
Single Player charge
multiplayer Gunner charge
```

Verify no duplicate shot/recoil/presentation.

---

# Required commands

Run existing commands from `package.json` and report actual output:

```bash
npm run generate:presentation-content
npm run generate:content-pack
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
npm run test:netcode
npm run test:netcode:e2e
```

Do not omit failing commands from the report.

Do not update golden fixtures until the intentional behavior changes are independently asserted.

---

# Performance gates

- Same-frame local turret
- No new hot-loop allocation
- Charge HUD does not rebuild DOM
- Capability lookup O(1)
- Pending action queues bounded
- Full-charge indefinite hold has no memory growth
- No frame-time regression
- Snapshot size increase measured
- 15-minute charge/dash test remains stable

---

# Completion gate

Complete only when:

1. Normal tank contact damage is zero.
2. High-speed non-Dash contact damage is zero.
3. Dash uses a dedicated authoritative damage window.
4. Dash damage is tunable and not `999`.
5. Enemy contact damage remains.
6. Local turret equals mouse target in the same frame.
7. Server instant aim is direct and validated.
8. Local reconcile no longer creates stickiness.
9. Cannon action includes action-time aim.
10. Tank fall damage is deleted.
11. Enemy fall damage is deleted.
12. Fall damage configuration/source is deleted.
13. Charge capability is generic and relic-grantable.
14. Charge is off by default.
15. Normal cannon still fires immediately without the capability.
16. With capability, tap release fires normal cannon.
17. Partial charge fires on release.
18. Full charge clamps at 100%.
19. Full charge can be held indefinitely.
20. Full charge never auto-fires.
21. Charge scales damage, recoil, knockback, and radius linearly.
22. Charge remains a cannon.
23. All cannon modifiers affect charge.
24. Burst shells inherit charge.
25. Full-charge defaults resemble old Jackpot impact.
26. Jackpot meter/system/state/config is removed.
27. Default loadout has no Jackpot ability.
28. No player Jackpot shell kind/source remains.
29. Bottom Jackpot HUD is removed.
30. Compact reticle charge meter works.
31. Charge HUD is locally responsive.
32. Single Player and multiplayer share implementation.
33. Existing netcode/maps/presentation/lifecycle do not regress.
34. All tests and manual checks pass.
35. The report truthfully documents results.

Final invariant:

> The cannon has one upgradeable identity: ordinary taps and relic-enabled charge releases are both cannon shots, resolved through the same stats, modifiers, projectile logic, recoil system, and authoritative server.
