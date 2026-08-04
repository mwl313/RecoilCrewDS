# Codex Prompt — Implement the Power-Up, Level-Up, and Relic Progression System
## Data-driven progression integrated with Coreloop 06 and Combat 05

Repository:

```text
https://github.com/mwl313/RecoilCrewDS
```

Canonical working branch:

```text
combat-rework
```

Binding documents:

```text
docs/progression08/POWERUP_AND_RELIC_PROGRESSION_SYSTEM_DESIGN.md
docs/progression08/reference/03-업그레이드-시스템.md
docs/progression08/reference/05-유물-테이블.md
```

Prompt location:

```text
docs/progression08/CODEX_PROMPT_IMPLEMENT_POWERUP_AND_RELIC_PROGRESSION_SYSTEM.md
```

---

# 0. Source-of-truth rule

This task begins from the current `combat-rework` checkout after all previously completed work, including any finished Animation 07 changes already present in the checkout.

Treat the actual current checkout as the implementation source of truth.

Before editing:

```bash
git fetch origin
git switch combat-rework
git pull --ff-only origin combat-rework
git status --short
git branch --show-current
git log --oneline -20
```

Requirements:

- The branch must be `combat-rework`.
- The working tree must be clean before implementation.
- Do not merge, rebase, or cherry-pick another branch.
- Do not reset or discard user work.
- Do not remove or rewrite Animation 07 systems.
- Do not restore pre-Combat-05 behavior.
- Do not bypass current Coreloop 06 architecture.
- Do not silently change source design values.
- Do not treat provisional XP values as final balance.
- Do not stop after documentation or a partial scaffold.
- Implement in reviewable milestones and run the actual repository gates.

When the design documents conflict, use this precedence:

```text
1. POWERUP_AND_RELIC_PROGRESSION_SYSTEM_DESIGN.md
2. The explicit settled rules in this prompt
3. 03-업그레이드-시스템.md
4. 05-유물-테이블.md
```

The integrated design document already resolves the known conflicts.

---

# 1. Mission

Implement the full foundational progression system described by the binding documents.

The result must provide:

- Team-shared experience
- Physical XP shard pickups
- Magnet attraction
- Proximity acceleration
- Data-driven XP values
- Data-driven level curve
- Queued level-ups
- Deterministic three-card level-up offers
- First-level-up rarity hardcoding
- Driver/Gunner role-separated Multiplayer offers
- Unified Single Player offer pool
- Authoritative gameplay pause during selection
- Ten-second selection timeout
- Deterministic authority auto-pick
- Treasure chests
- First-chest Epic/Legendary rule
- Normal chest rarity table
- Relic inventory and stacks
- All 28 relics from the reference table
- Unique-relic duplicate conversion to 250 XP
- Capability-granting relics
- Triggered relic effects
- Level-up and relic stat-layer interaction
- ROADKILL-gated high-speed contact damage
- Coreloop wave-clear chest rewards
- No reward from wave cohort purge
- Multiplayer replication and reconnect recovery
- Single Player parity
- Data-driven content authoring
- Debugging and balance telemetry
- Unit, integration, E2E, and manual verification

The architecture must make it easy to add:

```text
new upgrade categories
new rarity tables
new level curves
new relics
new triggers
new triggered-effect handlers
new capability-granting effects
new chest sources
new progression modes
```

without creating a giant central switch.

---

# 2. Settled gameplay contracts

These rules are non-negotiable.

## 2.1 Combat 05 contact rules

Without ROADKILL:

```text
slow normal contact damage = 0
high-speed normal contact damage = 0
accepted Dash damage window contact = Dash damage
```

With ROADKILL:

```text
not currently in Dash damage window
+ capability tank.roadkillContact
+ resolved speed threshold met
+ enemy contact
= Roadkill contact damage
```

Priority:

```text
Dash active
→ apply Dash contact rule only

otherwise ROADKILL active and valid
→ apply Roadkill rule only

otherwise
→ no enemy contact damage
```

Never apply Dash and ROADKILL damage from the same contact.

ROADKILL is not:

```text
a restoration of legacy contactRam
a default speed-based ram rule
a Dash kill
a Dash hit
```

It must have distinct attribution and telemetry.

## 2.2 First treasure chest

The first chest opened in the match uses:

```text
Epic       70%
Legendary  30%
```

Every later chest uses:

```text
Common     55%
Rare       30%
Epic       13%
Legendary   2%
```

The first-chest rule is source-independent.

It applies to the first chest opened whether that chest came from:

```text
map placement
enemy drop
wave-clear guaranteed drop
```

The old phrase “first wave Rare guaranteed” is obsolete and must not be implemented.

## 2.3 Stat stacking

Level-up upgrades:

```text
each card is an independent multiply modifier
duplicate category cards multiply
```

Example:

```text
+15%, then +15%
→ 1.15 × 1.15
```

Relic percentage stacks:

```text
same relic percentage bonuses add internally
```

Example:

```text
HE PAYLOAD ×2
→ +30% +30%
→ one effective relic multiplier of 1.60
```

Level-up and relic layers multiply each other.

Final conceptual formula:

```text
(base + normal flat additions + relic flat additions)
× product(level-up multipliers)
× (1 + sum(relic percentage bonuses))
× product(active conditional multipliers)
→ final clamp
```

Do not rewrite the generic `StatResolver` unnecessarily.

The current resolver already evaluates:

```text
base + all adds
then all multipliers
then override
then clamp
```

Use that architecture correctly:

- Level-up cards become individual `multiply` modifiers with `stack`.
- Relic percentage stacks are aggregated into one effective `multiply` modifier per relic/stat effect.
- Relic flat stacks become `add` modifiers.
- Conditional bonuses become timed or condition-owned modifiers.
- Add tags/source metadata for debug breakdown if needed.
- Preserve legacy modifier behavior.

## 2.4 Leveling speed

All current XP values and thresholds are prototype tuning.

Implement them as content.

Do not claim they are final.

Do not bake final assumptions about:

```text
levels per stage
XP per minute
Single Player multiplier
monster XP values
```

Final leveling speed will be tuned after enemy design and population density are finished.

---

# 3. Existing architecture to preserve

The current checkout already contains major foundations.

At minimum, preserve:

- `StatResolver`
- `StatModifier`
- `CapabilitySystem`
- `ItemSystem`
- `StatusEffectSystem`
- `TankContactCombat`
- `EnemySpatialIndex`
- `DamageSystem`
- `GameplayEventBus`
- `MatchRuntime`
- `SystemContext`
- `StageDirector`
- `WaveController`
- `HordeDirector`
- Coreloop 06 ownership and purge rules
- Combat 05 Dash-only contact behavior
- Charge Shot
- Instant turret and action-time aim
- No fall damage
- No Jackpot
- Current content generation
- Current network protocol and op/ack system
- Single Player and Multiplayer mode construction
- Current HUD/presentation architecture
- Animation 07 systems if present

Do not create a disconnected progression simulation.

Progression must be authoritative and integrated with shared match state.

---

# 4. Required first deliverables

Before gameplay changes, create:

```text
docs/progression08/PROGRESSION08_CODE_AUDIT.md
docs/progression08/PROGRESSION08_IMPLEMENTATION_PLAN.md
docs/progression08/PROGRESSION08_BASELINE_REPORT.md
docs/progression08/PROGRESSION08_CONTENT_CONTRACT.md
docs/progression08/PROGRESSION08_EVENT_CONTRACT.md
```

Then continue implementation.

Do not stop after the documents.

---

# 5. Code audit requirements

Inspect the actual checkout.

At minimum inspect:

```text
package.json

content/manifest.json
content/modes/
content/enemies/
content/items/
content/drop-tables/
content/horde-directors/
content/waves/
content/hud/
content/presentation/

src/shared/types.ts
src/shared/config.ts
src/shared/content/
src/shared/content/contentPack.ts
src/shared/content/schemas/

src/shared/stats/statResolver.ts
src/shared/stats/statModifier.ts
src/shared/stats/statIds.ts
src/shared/stats/statBlock.ts

src/shared/items/capabilitySystem.ts
src/shared/items/itemSystem.ts

src/shared/combat/tankContactCombat.ts
src/shared/damage/
src/shared/drops/
src/shared/pickups/

src/shared/core/gameplayEventBus.ts
src/shared/sim/match.ts
src/shared/sim/matchRuntime.ts
src/shared/sim/systems/systemContext.ts
src/shared/sim/roundSystem.ts

src/shared/stage/
src/shared/horde/
src/shared/enemies/
src/shared/weapons/
src/shared/projectiles/
src/shared/effects/

src/shared/net/
src/server/room.ts

src/client/app/
src/client/hud/
src/client/presentation/
src/client/progression/ if already present

scripts/generate-content-pack.ts
scripts/generate-presentation-content.ts

tests/
e2e/
```

Record:

- Current match-state shape
- Current pickup types and replication
- Current drop-table behavior
- Current kill and purge events
- Current wave-clear event path
- Current match pause/countdown behavior
- Current server room command validation
- Current Single Player authority path
- Current stat-modifier semantics
- Current capability grant/revoke semantics
- Current item/relic terminology
- Existing trigger/event systems
- Existing content schema conventions
- Generated-content process
- Current network protocol version
- Reconnect state reconstruction
- HUD view-model and overlay patterns
- Current test scripts
- Any incomplete or failing Coreloop/Horde gates
- Animation 07 changes that progression must not break

---

# 6. Baseline gate

Run all applicable existing commands before implementation.

At minimum inspect `package.json`, then run existing equivalents of:

```bash
npx tsc --noEmit

npm run generate:presentation-content
npm run generate:content-pack
npm run generate:map-profiles

npm run build
npm test

npm run test:demo
npm run test:coreloop
npm run test:horde
npm run test:horde:benchmark
npm run test:presentation
npm run test:netcode
npm run test:maplab
```

If Animation 07 added commands, run its non-destructive unit/build gates too.

Run E2E suites when the environment supports them.

Record exact command output.

When a failure already exists:

- Record it.
- Identify whether it is unrelated.
- Do not regenerate golden data merely to hide it.
- Continue only when safe.

---

# 7. Recommended module architecture

Use focused modules.

Recommended:

```text
src/shared/progression/
├── progressionTypes.ts
├── progressionState.ts
├── progressionDefinition.ts
├── progressionSchemas.ts
├── progressionContentRegistry.ts
├── progressionRng.ts
├── progressionTelemetry.ts
│
├── teamExperienceSystem.ts
├── levelCurve.ts
├── levelUpController.ts
├── upgradeOfferGenerator.ts
├── upgradeSelectionController.ts
├── upgradeEffectApplier.ts
│
├── treasureChestSystem.ts
├── relicOfferGenerator.ts
├── relicInventory.ts
├── relicEffectRegistry.ts
├── relicStatProjector.ts
├── rewardSelectionController.ts
│
├── rewardEventTypes.ts
├── rewardEventRouter.ts
└── progressionDebugState.ts

src/shared/pickups/
├── xpShardSystem.ts
├── pickupMagnetSystem.ts
└── existing pickup modules

src/shared/combat/
├── roadkillContactRule.ts
└── existing tankContactCombat.ts

src/shared/net/progression/
├── progressionProtocol.ts
├── progressionMessages.ts
└── progressionValidation.ts

src/client/progression/
├── progressionPresenter.ts
├── levelUpRouletteView.ts
├── relicRouletteView.ts
├── progressionViewModel.ts
├── progressionAudioVfx.ts
└── progressionDebugOverlay.ts
```

Adapt paths to current conventions.

Avoid making:

```text
src/shared/types.ts
src/shared/sim/matchRuntime.ts
src/server/room.ts
```

the owners of all progression logic.

They may coordinate, but focused modules should own behavior.

---

# 8. Content architecture

Add validated content categories.

Recommended:

```text
content/progression-definitions/
content/level-curves/
content/xp-pickup-definitions/
content/upgrade-rarity-tables/
content/upgrade-categories/
content/upgrade-first-experience/
content/treasure-rarity-tables/
content/relics/
content/relic-effect-templates/
content/progression-mode-policies/
```

Integrate them into the existing content pack and generation pipeline.

Do not add a second ad hoc runtime JSON loader.

Recommended root definition:

```ts
interface ProgressionDefinition {
  id: string;
  levelCurveId: string;
  xpPickupDefinitionId: string;

  upgradeRarityTableId: string;
  upgradeFirstExperienceRuleId: string;

  treasureRarityTableId: string;
  firstTreasureRuleId: string;

  relicPoolId: string;

  multiplayerPolicyId: string;
  singlePlayerPolicyId: string;
}
```

Both gameplay modes should reference the same gameplay progression definition.

Only execution policy differs.

---

# 9. Match-state integration

Add focused progression state to `MatchState`.

Recommended:

```ts
interface TeamProgressionState {
  level: number;
  currentXp: number;
  xpForNextLevel: number;
  totalXpCollected: number;
  pendingLevelUps: number;

  levelUpOffersCompleted: number;
  treasureChestsOpened: number;

  relicStacks: Record<string, number>;

  activeSelection: ProgressionSelectionState | null;
}
```

Do not replicate large static definitions in every state snapshot.

Replicate:

- Current team progression
- Active offer contents
- Per-role selection status
- Timer deadline or remaining duration
- Relic stacks/capabilities
- Necessary chest/pickup entities

Static content remains client-generated/bundled and validated.

---

# 10. Match-flow pause architecture

Add a match-level flow owner separate from StageDirector.

```ts
type MatchFlowState =
  | "playing"
  | "upgradeSelection"
  | "relicSelection"
  | "clear"
  | "gameOver";
```

Stage phase answers:

```text
which farming/wave/boss phase is active?
```

Match flow answers:

```text
is authoritative gameplay stepping?
```

Example:

```text
StagePhase = farming2
MatchFlowState = upgradeSelection
```

## Pause behavior

While selecting:

Pause:

```text
StageDirector farming clock
HordeDirector
wave reinforcement
enemy simulation
enemy attacks
tank kinematics
weapon updates
projectiles
barrels
gameplay pickups
contact damage
timed gameplay status effects
gameplay timers
```

Continue:

```text
server room networking
heartbeat/ping
selection command validation
wall-clock selection timeout
READY status
UI animation
client audio/VFX
reconnect processing
```

Do not continue authoritative game simulation with input merely set to zero.

Use one explicit flow gate before gameplay systems step.

Selection timeout must use wall-clock or a separate flow clock, not paused gameplay time.

---

# 11. Milestone 1 — Progression content schemas

Implement strict Zod schemas and generated types for:

```text
ProgressionDefinition
LevelCurveDefinition
XpPickupDefinition
UpgradeRarityTableDefinition
UpgradeCategoryDefinition
UpgradeFirstExperienceDefinition
TreasureRarityTableDefinition
FirstTreasureRuleDefinition
RelicDefinition
RelicPoolDefinition
RelicEffectTemplateDefinition
ProgressionModePolicyDefinition
```

Validation:

- IDs use consistent prefixes.
- Rarity probabilities are non-negative.
- Probability sums are validated or normalized only when explicitly designed.
- Min/max ranges are valid.
- Every stat ID exists.
- Every capability ID is a non-empty semantic ID.
- Referenced definitions exist.
- Relic IDs are unique.
- Upgrade category IDs are unique.
- Role is valid.
- Duplicate-replacement XP is valid.
- Unique relics specify replacement behavior.
- Trigger/effect handlers resolve.
- No unknown operation silently passes.
- No final balance claim is embedded in schema comments.

Commit:

```text
progression08: add progression content schemas
```

---

# 12. Milestone 2 — Add the source content

Create the content defined by the binding documents.

## Upgrade rarity table

```text
Common     50%
Rare       30%
Epic       15%
Legendary   5%
```

## First level-up rule

```text
Card 1 = Epic
Card 2 = normal rarity
Card 3 = 50% Legendary, otherwise normal rarity
```

## Driver upgrade categories

Add the 10 categories and exact rarity ranges from the reference document:

```text
tank.forwardSpeed
tank.accel
tank.jumpHeight
tank.dashImpulse
tank.dashCooldown
tank.dashDamage
tank.steerHigh + tank.normalGrip
tank.airControl
tank.gravity
tank.maxIntegrity
```

## Gunner upgrade categories

Add the 8 categories and exact rarity ranges:

```text
weapon.mgDamage
weapon.mgSpread
weapon.mgRange
weapon.cannonDamage
weapon.cannonCooldown
weapon.cannonRadius
weapon.cannonKnockback
weapon.cannonRecoilImpulse
```

Preserve the reference values exactly unless a stat ID has been renamed in the actual checkout.

When a current stat ID differs:

- Map it deliberately.
- Document the mapping.
- Do not invent a replacement without audit.

## Treasure rarity

First chest:

```text
Epic       70%
Legendary  30%
```

Later chests:

```text
Common     55%
Rare       30%
Epic       13%
Legendary   2%
```

## Relics

Add all 28 relics exactly as the reference table specifies:

```text
relic.magnet_core
relic.heat_sink
relic.covering_fire
relic.double_jump
relic.vampire_rounds
relic.friendly_shield
relic.hearty_tank

relic.dash_refund
relic.air_master
relic.he_payload
relic.roadkill
relic.aerial_master
relic.ground_pound
relic.momentum_shield
relic.armor_shred
relic.bullet_time

relic.twin_shell
relic.death_mark
relic.glass_cannon
relic.safe_haven
relic.rapid_reload
relic.iron_will
relic.last_resort

relic.phase_dash
relic.xp_surge
relic.phoenix_core
relic.unstoppable
relic.apex_predator
```

Preserve:

- Rarity
- Role
- Trigger
- Effect
- Numeric value
- Stack policy
- Unique status
- Duplicate conversion

Do not reintroduce:

```text
Jackpot
truck-dependent relics
Crew Link
score relics
purchase currency
synergy system
```

Commit:

```text
progression08: add upgrade and relic content
```

---

# 13. Milestone 3 — Team experience

Implement:

```text
TeamExperienceSystem
LevelCurve
pending level-up queue
```

Requirements:

- XP is team-shared.
- Collection increments current and total XP.
- Thresholds come from content.
- Multiple thresholds may be crossed from one collection.
- Each crossed threshold increments `pendingLevelUps`.
- Level and next threshold update deterministically.
- Overflow rule comes from content.
- Progression cannot start new selection after clear/gameOver.
- Pending selections resolve sequentially.
- XP gained from unique-relic duplicate conversion uses the same authoritative path.

Prototype level curve may use:

```text
20 → 45 → 75 → 110 → 150 → 195 → 245 → 300
```

Mark it as prototype tuning.

Commit:

```text
progression08: add team XP and queued level ups
```

---

# 14. Milestone 4 — XP shard pickups

Add an XP shard pickup type.

Requirements:

- Normal rewarded kills create XP shards.
- Wave-cohort purge creates none.
- XP shard value comes from reward content.
- Pickups are authoritative.
- Pickups replicate.
- Pickups have stable IDs.
- Collection is server/local-authoritative.
- Duplicate collection is impossible.
- Pickup movement is deterministic enough for shared authority.
- Existing scrap/pickup behavior remains intact unless deliberately migrated.

## Magnet

Add stat:

```text
progression.magnetRadius
```

or use the actual agreed namespace from the current stat registry.

`MAGNET CORE` modifies this value.

## Proximity acceleration

Use content values:

```text
base radius
minimum pull speed
maximum pull speed
acceleration exponent
collect radius
```

Behavior:

```text
outside magnet radius
→ normal resting/pickup behavior

inside magnet radius
→ move toward tank

closer to tank
→ faster attraction

inside collect radius
→ collect once
```

Do not use per-frame unbounded allocations.

Add spatial/pickup query optimization if needed.

Commit:

```text
progression08: add XP shards and magnet collection
```

---

# 15. Milestone 5 — Reward event routing

Create explicit reward events.

Recommended:

```ts
interface EnemyKilledRewardEvent {
  enemyId: number;
  enemyDefinitionId: string;
  populationClass: string;
  waveId?: number;
  rewardProfileId: string;
  damageSource: string;
}

interface WaveLeaderKilledRewardEvent {
  waveId: number;
  leaderEnemyId: number;
  rewardProfileId: string;
}

interface BossKilledRewardEvent {
  bossEnemyId: number;
  rewardProfileId: string;
}

interface EnemyPurgedEvent {
  enemyId: number;
  waveId: number;
  reason: "leaderDeath";
}
```

Rules:

```text
EnemyKilledRewardEvent
→ XP
→ possible chest drop
→ allowed kill triggers

WaveLeaderKilledRewardEvent
→ concentrated XP/reward
→ guaranteed treasure chest
→ onWaveClear trigger

BossKilledRewardEvent
→ boss reward/stat event
→ stage-clear integration

EnemyPurgedEvent
→ no XP
→ no chest
→ no kill trigger
→ no Dash/Roadkill/cannon credit
```

Avoid bolting progression directly into `MatchRuntime.onEntityKilled` with type-specific branches.

Route through a focused reward system.

Keep legacy score/demo behavior working during migration.

Commit:

```text
progression08: add reward event routing
```

---

# 16. Milestone 6 — Deterministic upgrade offers

Implement an authority-owned `UpgradeOfferGenerator`.

Requirements:

- Three cards.
- Each card has category, rarity, and rolled value.
- Normal rarity rolls are independent.
- Values are authority RNG integer rolls within rarity range.
- Card result is stored before presentation.
- Client never rerolls.
- Offer has stable ID.
- Offer survives reconnect.
- Same seed and event sequence produce same result.
- Duplicate category cards may appear unless content forbids them.
- Role pools are respected.

Use separate RNG streams:

```text
progression.upgradeOffer
progression.upgradeRarity
progression.upgradeValue
progression.timeoutAutopick
```

Do not consume map/spawn/combat RNG.

Commit:

```text
progression08: add deterministic upgrade offers
```

---

# 17. Milestone 7 — Upgrade selection

Implement `UpgradeSelectionController`.

## Multiplayer

One team level-up creates:

```text
Driver offer: 3 Driver cards
Gunner offer: 3 Gunner cards
```

Resume only when:

```text
Driver selected
AND
Gunner selected
```

## Single Player

One offer:

```text
3 cards from unified Driver + Gunner pool
```

One selection resumes.

## Timeout

Ten seconds.

Unselected role:

```text
authority RNG picks one valid card
```

Requirements:

- Duplicate submissions ignored.
- Wrong role rejected.
- Wrong offer ID rejected.
- Invalid index rejected.
- Late selection after authority auto-pick rejected.
- Effect applies exactly once.
- READY status replicates.
- Selection state survives reconnect.
- Disconnect policy is documented.
- Input edges are cleared on entering selection.
- Held weapon state is safely cancelled or paused according to current weapon architecture.
- No projectile or enemy simulation progresses while selecting.

Commit:

```text
progression08: add authoritative upgrade selection
```

---

# 18. Milestone 8 — Upgrade effect projection

Each selected card creates immutable match-scoped stat modifier records.

Example:

```ts
interface LevelUpgradeModifierRecord {
  sourceId: string;
  offerId: string;
  cardId: string;
  categoryId: string;
  statId: string;
  rolledPercent: number;
  factor: number;
}
```

Projection:

```text
+15%
→ operation multiply
→ value 1.15
→ stacking stack
```

For multi-stat categories such as drift:

```text
one card
→ multiple stat modifiers
→ same source/card ID
```

Requirements:

- Every duplicate card remains a separate multiplier.
- Modifiers survive replication/reconnect through authoritative progression state or reproducible projection.
- Restart/rematch resets them.
- Debug output lists each card’s contribution.
- Do not change existing item/status modifier semantics.

Commit:

```text
progression08: apply level-up stat modifiers
```

---

# 19. Milestone 9 — Treasure chests

Implement authoritative chest entities.

Sources:

```text
map
enemyDrop
waveClear
```

Requirements:

- Stable IDs.
- Position and opened state replicate.
- One open only.
- First-open rule uses `treasureChestsOpened === 0`.
- Increment count only when chest result is authoritatively consumed/started.
- Wave leader creates a guaranteed chest exactly once.
- Purge creates none.
- Enemy drop probability is content-driven.
- Map chest placement count/policy is content-driven.
- Do not finalize balance values that the source marks unresolved.
- Use prototype defaults only and document them.
- Chests cannot open during terminal clear/gameOver unless explicitly allowed.

Commit:

```text
progression08: add treasure chest lifecycle
```

---

# 20. Milestone 10 — Relic roll and inventory

Implement:

```text
RelicOfferGenerator
RelicInventory
Relic acquisition result
```

Current chest behavior:

```text
one chest
→ one relic result
→ roulette presentation
→ acquire
```

The authority decides rarity and relic before presentation.

Requirements:

- First chest uses E70/L30.
- Later chests use C55/R30/E13/L2.
- Relic selected from matching rarity pool.
- Role metadata remains content.
- Team owns the relic inventory because the vehicle is shared.
- Stack count is replicated.
- Unique relic duplicate converts to +250 XP.
- Duplicate conversion cannot recursively create inconsistent selections.
- Capability-granting relic source IDs are stable.
- Relic acquisition emits one typed event.
- Roulette is presentation only.
- Future configurable 3-choice relic offers are possible without rewriting inventory.

Commit:

```text
progression08: add relic rolls and inventory
```

---

# 21. Milestone 11 — Relic stat projection

Create `RelicStatProjector`.

## Additive percentage relics

Do not add one multiply modifier per stack.

That would incorrectly multiply relic stacks internally.

Instead aggregate same-relic percentage stacks.

Example:

```text
HE PAYLOAD stack 1
→ +30%
→ one modifier value 1.30

HE PAYLOAD stack 2
→ +60%
→ replace aggregate modifier with value 1.60
```

Recommended modifier identity:

```text
relic.aggregate.<relicId>.<statId>
```

Use `replace` for the aggregate projection.

## Additive flat relics

Aggregate or stack adds, but debug output must remain clear.

Example:

```text
HEARTY TANK ×2
→ add +40
```

## Capability + number

First acquisition grants capability by a stable relic source.

Further stacks update only numeric aggregate.

## Conditional bonuses

The owning trigger/condition system applies and removes temporary modifiers.

Examples:

```text
AIRBORNE
LOW INTEGRITY
RECENT CANNON FIRE
MG-hit debuff
```

Requirements:

- Current `StatResolver` formula produces:
  `(base + flat) × level multipliers × relic multiplier × conditionals`.
- Existing modifier behavior stays intact.
- Debug breakdown distinguishes source layers using source/tags.
- Final clamps remain effective.

Commit:

```text
progression08: project relic stat layers
```

---

# 22. Milestone 12 — Triggered relic effect registry

Do not use one giant relic switch.

Create a registry keyed by effect type.

Triggers:

```text
passive
onCannonFire
onHit
onKill
onDash
onDashHit
onLand
onAir
onWaveClear
onWipeout
```

Recommended effect-handler interface:

```ts
interface RelicTriggeredEffectHandler<TEvent> {
  readonly effectType: string;
  readonly trigger: RelicTrigger;

  handle(
    event: TEvent,
    context: RelicEffectContext,
    definition: RelicDefinition,
    stackCount: number,
  ): void;
}
```

Use composable generic effects where possible:

```text
applyTimedStatModifier
applyTargetDebuff
healTank
reduceCooldown
grantCapability
spawnAreaDamage
spawnDeathExplosion
reviveOnce
modifySelfDamage
modifyEliteBossDamage
modifyXpGain
```

A relic may compose multiple effects.

Only add a new custom handler when generic effects cannot express the rule safely.

Requirements:

- Event ordering is deterministic.
- Purge never fires kill triggers.
- Effects do not mutate client-only state.
- Timed effects pause during selection.
- Reconnect state is reconstructable.
- Once-per-life and once-per-match state is authoritative.

Commit:

```text
progression08: add relic trigger registry
```

---

# 23. Milestone 13 — Implement the 28 relics

Implement every relic from the reference table.

## Common

```text
MAGNET CORE
HEAT SINK
COVERING FIRE
DOUBLE JUMP
VAMPIRE ROUNDS
FRIENDLY SHIELD
HEARTY TANK
```

## Rare

```text
DASH REFUND
AIR MASTER
HE PAYLOAD
ROADKILL
AERIAL MASTER
GROUND POUND
MOMENTUM SHIELD
ARMOR SHRED
BULLET TIME
```

## Epic

```text
TWIN SHELL
DEATH MARK
GLASS CANNON
SAFE HAVEN
RAPID RELOAD
IRON WILL
LAST RESORT
```

## Legendary

```text
PHASE DASH
XP SURGE
PHOENIX CORE
UNSTOPPABLE
APEX PREDATOR
```

For each relic, add tests covering:

- Acquisition
- Stack behavior
- Trigger condition
- Numeric effect
- Capability behavior
- Duplicate behavior
- Reset behavior
- Interaction with at least one relevant level-up modifier where applicable

Do not silently omit difficult relics.

When a relic depends on a missing gameplay hook:

- Add the minimal generic hook.
- Keep it reusable.
- Document the hook.
- Do not hardcode the relic ID in unrelated systems.

Commit in logical groups, for example:

```text
progression08: implement common relics
progression08: implement rare relics
progression08: implement epic relics
progression08: implement legendary relics
```

---

# 24. Milestone 14 — ROADKILL

Implement a focused Roadkill contact rule.

Recommended:

```text
TankContactCombat
├── DashContactRule
├── RoadkillContactRule
└── no-damage fallback
```

Use the existing spatial query.

Data:

```ts
interface RoadkillEffectDefinition {
  minimumSpeedRatio: number;
  baseDamageCoefficient: number;
  coefficientPerAdditionalStack: number;
  perTargetCooldownSeconds: number;
  knockbackCoefficient: number;
}
```

Threshold:

```text
current horizontal speed
>= resolved forward speed × minimumSpeedRatio
```

Damage concept:

```text
base roadkill damage
× speed ratio
× (1 + 0.25 × additional stacks)
```

Use the exact final coefficient from content.

Requirements:

- Capability: `tank.roadkillContact`.
- ROADKILL missing: high-speed contact is zero.
- Low speed: zero.
- Dash active: Dash rule only.
- Roadkill has per-target cooldown.
- Immovable target policy is explicit.
- Roadkill can kill.
- Attribution is distinct, preferably `roadkill`.
- It does not increment `dashKills`.
- It does not trigger `onDashHit`.
- It can trigger normal kill effects if a normal rewarded kill.
- It emits dedicated presentation/telemetry event.
- It cannot restore legacy damage 999.

Commit:

```text
progression08: add relic-gated roadkill contact
```

---

# 25. Milestone 15 — Movement and survival capabilities

Implement reusable capability hooks required by relics.

Likely capabilities:

```text
tank.extraJump
tank.airDashRefresh
tank.roadkillContact
tank.phaseDashInvulnerability
tank.phoenixRevive
tank.zeroDashCooldown
weapon.twinShell
```

Do not make capability names depend on a specific relic when a generic gameplay capability is more appropriate.

Examples:

```text
DOUBLE JUMP
→ stack-based additional jump count

AIR MASTER
→ air-control stat + air-dash reuse capability

PHASE DASH
→ invulnerability during accepted Dash window

PHOENIX CORE
→ one authoritative revive charge per match

UNSTOPPABLE
→ zero Dash cooldown capability + additive Dash damage
```

Requirements:

- Capability state replicates through existing `CapabilitySystem`.
- Stack counts remain in relic inventory.
- One source cannot revoke another source.
- New match resets capabilities and charges.
- Revive is once, deterministic, and documented.
- Zero cooldown does not create negative cooldown bugs.

Commit:

```text
progression08: add progression capabilities
```

---

# 26. Milestone 16 — Damage and weapon integration

Add generic hooks needed by relics without breaking Combat 05.

Examples:

```text
FRIENDLY SHIELD
→ cannon self-damage reduction

GLASS CANNON
→ outgoing and incoming damage modifiers

APEX PREDATOR
→ elite/boss outgoing damage modifier

AERIAL MASTER
→ Gunner damage while airborne

MOMENTUM SHIELD
→ incoming damage reduction above speed threshold

IRON WILL
→ incoming reduction below 50% integrity

LAST RESORT
→ outgoing increase below 30% integrity

HE PAYLOAD
→ cannon radius and knockback relic aggregate

TWIN SHELL
→ existing cannon burst path/capability integration

RAPID RELOAD
→ cannon hit changes next cooldown

DEATH MARK
→ cannon kill explosion
```

Use generic damage context:

```ts
interface DamageContext {
  source: DamageSource;
  attacker?: string;
  targetKind: string;
  enemyTags?: string[];
  airborne?: boolean;
  speedRatio?: number;
}
```

Adapt to current code rather than introducing duplicate damage systems.

Do not break:

- Charge Shot as cannon
- Cannon modifier inheritance
- Double Barrel/Twin Shell existing behavior if present
- Dash-only default contact
- No fall damage
- No Jackpot

---

# 27. Milestone 17 — Progression networking

Add typed progression protocol messages.

Logical messages:

```text
progressionState
upgradeOfferStarted
upgradeSelectionSubmitted
upgradeRoleReady
upgradeOfferResolved
relicOfferStarted
relicOfferResolved
xpCollected
levelGained
relicAcquired
progressionCapabilityChanged
```

Client request:

```ts
{
  type: "selectUpgrade";
  offerId: string;
  cardIndex: number;
}
```

Relic roulette may require no client choice when one result is predetermined, but it must acknowledge/display safely according to flow design.

Requirements:

- Increment protocol version deliberately.
- Existing action-time aim messages remain valid.
- Server validates role and room membership.
- Selection command is idempotent.
- Reconnect receives current active offer.
- Snapshot contains progression state needed to rebuild HUD.
- Static content is not resent verbosely.
- Selection deadline is represented consistently.
- Critical progression events are ordered.
- Two clients cannot apply the same choice twice.
- Driver cannot choose Gunner offer and vice versa.
- Single Player uses the same shared progression code without network transport.

Commit:

```text
progression08: add progression network protocol
```

---

# 28. Milestone 18 — UI and presentation

Implement through the current content-driven HUD/scene architecture where practical.

## Level-up roulette

Required:

```text
central pause overlay
three vertical casino-style cards
decelerating spin
click to snap immediately
actual result pre-decided
rarity frame
icon
name
one-line effect
rolled value
role tag
10-second timer
teammate READY indicator
```

Multiplayer:

```text
Driver sees/selects Driver offer
Gunner sees/selects Gunner offer
both can see teammate completion state
```

Single Player:

```text
one unified offer
```

## Relic roulette

Required:

```text
relic icon
name
rarity
effect
stack count/result
legendary special treatment
click-to-skip presentation
```

The authority must not wait for an unbounded visual animation.

Client skip only speeds presentation; it cannot change result.

Add semantic audio/VFX IDs.

Do not rebuild the entire DOM every frame.

Commit:

```text
progression08: add progression roulette UI
```

---

# 29. Milestone 19 — Debugging and telemetry

Add a debug overlay or section.

Display:

```text
MatchFlowState
StagePhase

team level
current XP
next threshold
pending level ups
XP multiplier
magnet radius
active XP shards

active offer ID
offer cards
offer RNG seed/sequence
Driver ready
Gunner ready
timeout

treasureChestsOpened
first chest consumed
last chest source
last rarity roll

relic stacks
capabilities
once-per-match charges

per-stat breakdown:
base
flat additions
level multipliers
relic percent aggregate
conditional multipliers
final clamp
resolved value

ROADKILL:
capability
speed
resolved max speed
speed ratio
threshold
last damage
last target
```

Telemetry:

```text
kills per minute
XP per farming second
XP collected per minute
XP missed/uncollected
level-up timestamps
levels per stage
upgrade pick rates
rarity distribution
chests per stage
relic distribution
Roadkill hits/kills
trigger activations
selection timeout frequency
```

The purpose is to tune leveling after enemy design.

Commit:

```text
progression08: add progression debug and telemetry
```

---

# 30. Milestone 20 — Lifecycle and reset

Handle:

```text
new match
Single Player restart
Multiplayer rematch
disconnect
reconnect
clear
gameOver
```

Requirements:

- New match resets XP, level, offers, relics, capabilities, and charges.
- Restart does not duplicate modifiers.
- Rematch does not retain relics.
- Reconnect restores active selection and READY state.
- Terminal state prevents new offers.
- Pending level-up queue cannot deadlock after game over.
- Selection timeout handles disconnected role according to documented policy.
- All temporary relic modifiers clean up.
- Chest state resets.
- RNG streams reset deterministically.

Commit:

```text
progression08: harden progression lifecycle
```

---

# 31. Required tests

Create suites:

```text
tests/progression08/contentSchemas.test.ts
tests/progression08/teamExperience.test.ts
tests/progression08/xpShard.test.ts
tests/progression08/upgradeOffer.test.ts
tests/progression08/upgradeSelection.test.ts
tests/progression08/statStacking.test.ts
tests/progression08/treasureChest.test.ts
tests/progression08/relicInventory.test.ts
tests/progression08/relicTriggers.test.ts
tests/progression08/roadkill.test.ts
tests/progression08/pauseFlow.test.ts
tests/progression08/networkProtocol.test.ts
tests/progression08/lifecycle.test.ts
tests/progression08/modeParity.test.ts
```

Add focused files per relic group as needed.

---

# 32. Exact test contracts

## XP

- Normal rewarded kill creates expected XP.
- Wave rewarded kill creates configured XP.
- Elite reward works.
- Boss reward works.
- Purge creates no XP.
- XP shard collects once.
- Magnet radius applies.
- MAGNET CORE stacks additively.
- Proximity acceleration increases near tank.
- XP SURGE stacks additively.
- Duplicate unique relic XP enters team experience path.

## Level curve

- Prototype thresholds load from content.
- One threshold increments level.
- Large XP queues multiple levels.
- Pending offers resolve sequentially.
- Overflow rule works.
- Terminal states suppress new offers.

## Upgrade offer

- Three cards.
- First card first level is Epic.
- Second card first level is normal table.
- Third card first level has 50% Legendary branch.
- Later offers use normal table.
- Independent card rarity.
- Rolled values remain within range.
- Same seed gives same offer.
- Driver pool excludes Gunner.
- Gunner pool excludes Driver.
- Single pool contains both.
- Invalid content reference fails generation.

## Selection

- Gameplay pauses.
- Driver selection applies once.
- Gunner selection applies once.
- Resume only after both.
- Single resumes after one.
- Ten-second auto-pick.
- Auto-pick deterministic.
- Invalid role/index/offer rejected.
- Reconnect reconstructs state.
- Inputs do not leak across pause.

## Stat stacking

- Level card `1.15 × 1.15`.
- Relic `+30% +30% = 1.60`, not `1.69`.
- Level `1.56 × relic 1.60`.
- HEARTY TANK flat added before level multiplier.
- Conditional multiplier applies.
- Clamp applies last.
- Existing item/status test behavior unchanged.
- Debug breakdown equals resolved output.

## Chest

- First map chest uses E/L only.
- First enemy chest uses E/L only.
- First wave chest uses E/L only.
- Second chest uses normal table.
- Chest opens once.
- Wave leader creates one chest.
- Purge creates none.
- Same seed produces same relic result.

## Relics

For all 28:

- Schema/content definition exists.
- Correct rarity/role/trigger.
- Stack policy.
- Effect.
- Reset.
- Duplicate policy.

## ROADKILL

- No relic + high speed = zero.
- Relic + low speed = zero.
- Relic + high speed = damage.
- Dash + relic = Dash only.
- No double hit.
- Additional stacks add coefficient.
- Per-target cooldown.
- Dedicated attribution.
- No `dashKills` increment.
- No `onDashHit` trigger.
- Normal rewarded Roadkill kill can trigger appropriate onKill effects.

## Pause

- Stage countdown frozen.
- Horde frozen.
- Enemy movement frozen.
- Attack/projectile frozen.
- Tank frozen.
- Timed status effects frozen.
- Network heartbeat continues.
- Wall-clock selection timeout continues.
- UI state updates.

## Mode parity

- Same progression content definition.
- Same rarity tables.
- Same relic content.
- Same stack math.
- Only selection policy differs.
- XP multiplier remains content-driven and provisional.

---

# 33. E2E scenarios

Add:

```text
e2e/progression-levelup.spec.ts
e2e/progression-relic.spec.ts
e2e/progression-multiplayer-selection.spec.ts
e2e/progression-reconnect.spec.ts
```

Scenarios:

```text
Single Player collect XP → level up → choose card → resume
Multiplayer level up → Driver picks → waits → Gunner picks → resume
Multiplayer timeout auto-pick
First chest gives Epic/Legendary
Second chest uses normal rarity
Wave leader creates chest
Purge creates no rewards
ROADKILL unavailable before relic
ROADKILL active after relic
Reconnect during selection
Rematch reset
```

Use deterministic seeds or test fixtures.

---

# 34. Required package scripts

Add scripts that point to real files:

```json
{
  "scripts": {
    "test:progression": "vitest run tests/progression08",
    "test:progression:e2e": "playwright test e2e/progression-levelup.spec.ts e2e/progression-relic.spec.ts e2e/progression-multiplayer-selection.spec.ts e2e/progression-reconnect.spec.ts",
    "validate:progression-content": "...",
    "test:progression:simulation": "..."
  }
}
```

Use repository conventions.

Do not add scripts for files that do not exist.

---

# 35. Required documentation

Create:

```text
docs/progression08/PROGRESSION08_IMPLEMENTATION_REPORT.md
docs/progression08/PROGRESSION08_CONTENT_AUTHORING_GUIDE.md
docs/progression08/PROGRESSION08_STAT_STACKING_GUIDE.md
docs/progression08/PROGRESSION08_RELIC_TRIGGER_GUIDE.md
docs/progression08/PROGRESSION08_NETWORK_AND_PAUSE_GUIDE.md
docs/progression08/PROGRESSION08_BALANCE_TELEMETRY_GUIDE.md
docs/progression08/PROGRESSION08_MANUAL_TEST_GUIDE.md
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

Update the reference design docs in the repository copy:

```text
03-업그레이드-시스템.md
→ document ROADKILL capability exception
→ document cross-layer multiplication
→ state leveling speed is deferred until enemy design

05-유물-테이블.md
→ remove obsolete “first wave Rare guaranteed”
→ state first opened chest E70/L30
```

Do not alter the relic list or values beyond these settled clarifications.

---

# 36. Required command gates

Inspect current `package.json` and run all applicable commands.

At minimum:

```bash
npx tsc --noEmit

npm run generate:presentation-content
npm run generate:content-pack
npm run generate:map-profiles

npm run validate:progression-content

npm run build
npm test
npm run test:progression
npm run test:progression:simulation

npm run test:demo
npm run test:coreloop
npm run test:horde
npm run test:presentation
npm run test:netcode
npm run test:maplab

npm run test:progression:e2e
npm run test:e2e
```

Also run applicable Animation 07 tests/builds if they exist.

Report actual outputs.

Do not hide failures.

Do not update golden files merely to make an unexplained regression pass.

---

# 37. Manual verification

Verify manually:

```text
Single Player:
- collect XP shards
- magnet pickup
- first level-up offer
- choose Driver card
- choose Gunner card from unified pool on another run
- multiple queued level-ups
- chest
- first relic
- second relic
- unique duplicate XP
- restart reset

Multiplayer:
- Driver/Gunner separate offers
- Driver picks first and waits
- Gunner picks and resumes
- Gunner picks first and waits
- timeout
- disconnect during selection
- reconnect during selection
- rematch reset

Core loop:
- farming XP
- wave leader chest
- ambient enemies survive clear
- wave cohort purge has no XP/drop/trigger
- boss clear

Combat:
- normal high-speed contact zero before ROADKILL
- ROADKILL high-speed hit after acquisition
- Dash remains Dash
- Charge Shot modifiers still work
- no fall damage
- no Jackpot

Latency:
- 100 ms RTT
- 150 ms RTT
```

---

# 38. Performance and correctness rules

Required:

- XP shards use bounded data structures.
- Pickup attraction does not create excessive allocations.
- Offer generation occurs only when needed.
- Static content is not copied into every snapshot.
- Relic trigger lookup is O(1) or bounded by owned relic count.
- Stat resolver dirty caching remains effective.
- Relic aggregate projection updates only when stack count changes.
- Pause does not spin gameplay systems with zero dt unnecessarily.
- Selection timers are not tied to paused simulation time.
- No trigger runs from purge.
- No client-authoritative result generation.
- No duplicate modifier projection after reconnect/rematch.
- No unbounded once-per-target maps.
- ROADKILL uses current spatial index.
- Existing rigid/animated presentation is unaffected.

---

# 39. Recommended commit sequence

```text
progression08: add audit and baseline
progression08: add progression content schemas
progression08: add upgrade and relic content
progression08: add team XP and queued level ups
progression08: add XP shards and magnet collection
progression08: add reward event routing
progression08: add deterministic upgrade offers
progression08: add authoritative upgrade selection
progression08: apply level-up stat modifiers
progression08: add treasure chest lifecycle
progression08: add relic rolls and inventory
progression08: project relic stat layers
progression08: add relic trigger registry
progression08: implement common relics
progression08: implement rare relics
progression08: implement epic relics
progression08: implement legendary relics
progression08: add relic-gated roadkill contact
progression08: add progression capabilities
progression08: integrate damage and weapons
progression08: add progression network protocol
progression08: add progression roulette UI
progression08: add progression debug and telemetry
progression08: harden progression lifecycle
progression08: finalize tests and reports
```

Do not combine all implementation into one commit.

---

# 40. Completion gate

Complete only when all are true:

1. Current `combat-rework` checkout remains the base.
2. Progression source documents are present under `docs/progression08`.
3. Progression content is validated and generated.
4. Team XP is authoritative.
5. XP shards exist and replicate.
6. Magnet attraction works.
7. Proximity acceleration works.
8. Purge creates no XP.
9. Level curve is data-driven.
10. Prototype values are documented as provisional.
11. Multiple pending level-ups queue safely.
12. Offers have three cards.
13. First-level-up hardcoding works.
14. Later rarity table works.
15. Rolled values are deterministic.
16. Multiplayer role pools are separated.
17. Single Player uses unified pool.
18. Gameplay pauses during selection.
19. Wall-clock timeout works.
20. Both Multiplayer roles must complete.
21. Auto-pick is deterministic.
22. Level cards create individual multiply modifiers.
23. Duplicate level cards multiply.
24. Relic percent stacks add internally.
25. Relic percentage projection uses one aggregate multiplier.
26. Relic flat stacks add before multipliers.
27. Level-up and relic layers multiply each other.
28. Conditional multipliers work.
29. Final clamps work.
30. Existing stat behavior is preserved.
31. Chests support map, enemy, and wave sources.
32. Wave leader guarantees one chest.
33. First opened chest uses E70/L30.
34. Later chests use C55/R30/E13/L2.
35. All 28 relics exist in content.
36. All 28 relics have implemented effects.
37. Unique duplicate converts to 250 XP.
38. Capabilities are source-safe.
39. Trigger registry is expandable.
40. Purge fires no relic kill triggers.
41. ROADKILL is unavailable before acquisition.
42. ROADKILL activates high-speed contact only after acquisition.
43. Dash and ROADKILL never double-apply.
44. ROADKILL has distinct attribution.
45. Combat 05 remains intact.
46. Charge Shot remains cannon and inherits modifiers.
47. No fall damage returns.
48. No Jackpot returns.
49. Single Player and Multiplayer share gameplay content.
50. Reconnect restores active selection.
51. Restart/rematch resets progression.
52. Debug stat breakdown matches resolved values.
53. Telemetry supports later leveling balance.
54. Required tests pass.
55. Manual core-loop verification passes.
56. Documentation explains how to add new upgrades and relics without editing central switches.
57. Existing Animation 07 and presentation systems remain functional.
58. No source design values were silently changed.
59. Known limitations are documented honestly.
60. The implementation report contains actual command outputs.

Final invariant:

> Recoil Crew uses one authoritative, data-driven progression system in Single Player and Multiplayer. Normal kills create collectible XP, level-ups offer role-aware stat growth, treasure chests grant stackable relic abilities, and both growth layers combine through explicit stat math without violating Coreloop purge rules or Combat 05 contact behavior.
