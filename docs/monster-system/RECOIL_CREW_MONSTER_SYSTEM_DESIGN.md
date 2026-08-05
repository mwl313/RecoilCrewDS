# Recoil Crew — Monster System Design

> **Status:** Binding design specification  
> **Scope:** Monster progression, difficulty ramp, roster categories, attacks, animation, model normalization, crowd pressure, projectiles, bosses, match flow, data architecture, validation, and implementation requirements  
> **Primary sources:** `08-몬스터-레벨링-성장곡선.md`, `09-몬스터-카테고리.md`  
> **Supersession:** Where the category document conflicts with the earlier leveling document, the category document and the resolutions in this specification take precedence.

---

## 1. Purpose

This document defines the launch monster system for Recoil Crew.

The system must support:

- A three-minute escalating survival and wave phase
- A boss phase that continues after the timer expires
- Forty-five Quaternius monster models
- High enemy counts without forty-five unique AI implementations
- Deterministic multiplayer and Single Player behavior
- Readable late-game danger without invisible overlapping burst damage
- Efficient near, far, and aggregate presentation
- Data-driven balancing, roster assignment, projectiles, animation, and model scale

The core principle is:

> **Many visual identities, few reusable gameplay rules.**

The roster supplies variety. The simulation stays compact and deterministic.

---

## 2. Design pillars

### 2.1 Time-driven difficulty

Monster strength rises continuously with elapsed match time, not only at wave boundaries.

### 2.2 Simple ordinary enemies

Every non-boss enemy uses:

- Tracking movement
- Exactly one melee or ranged attack
- One attack cadence
- Idle, Walk, Attack, and Death semantic states

### 2.3 Boss-only pattern complexity

Bosses may use multiple attack patterns. Ordinary enemies and elites remain simple.

### 2.4 Gameplay authority over animation

Attack cooldowns and combat events are authoritative. Animation is fitted to gameplay timing.

### 2.5 Model-independent balance

Raw GLB dimensions never directly define gameplay size. Every model is normalized first, then tier scale is applied.

### 2.6 Spatially readable melee pressure

Only enemies with a valid engagement reservation may apply melee damage.

### 2.7 Shared deterministic runtime

The same rules must operate on the server, in Single Player, in tests, and in presentation reconstruction.

---

## 3. Match flow

Use explicit match-flow states:

```text
FARMING
→ BOSS_INTRO
→ BOSS_ACTIVE
→ RESULTS
```

### FARMING

Duration:

```text
0–180 seconds
```

During this phase:

- Monster level rises every 15 seconds
- Ambient hordes spawn
- Wave leaders appear at scheduled moments
- Player XP and upgrades accumulate
- Enemy composition and density escalate

### BOSS_INTRO

At 180 seconds:

- The farming timer reaches zero
- Monster progression locks at Lv13
- Boss presentation begins
- Boss and escort roster spawn
- The UI switches from farming timer to boss state

### BOSS_ACTIVE

The phase continues until:

```text
boss defeated
OR
team defeated
```

All monsters spawned during this phase use Lv13.

### RESULTS

Results begin only after victory or defeat.

Target successful session length:

```text
approximately 3:00 farming
+ approximately 0:30 boss
= approximately 3:30
```

---

## 4. Monster level and difficulty curve

### 4.1 Level formula

```text
monsterLevel = 1 + floor(elapsedSeconds / 15)
```

The farming phase spans Lv1–13.

### 4.2 Spawn-time locking

A monster stores the level that existed when it spawned. It never recalculates its level afterward.

This prevents:

- Mid-combat health changes
- Desynchronization
- Non-reproducible tests
- Ambiguous XP and damage outcomes

### 4.3 Timeline

| Phase | Time | Level | Composition intent |
|---|---:|---:|---|
| Onboarding | 0–30s | Lv1–2 | Basic fodder |
| Early | 30–60s | Lv3–4 | First ranged fodder |
| Wave 1 | ~60s | Lv5 | Elite leader and cohort |
| Midgame | 60–120s | Lv5–8 | More ranged and specialists |
| Wave 2 | ~120s | Lv9 | Stronger leader and cohort |
| Endgame | 120–180s | Lv9–12 | Maximum ordinary pressure |
| Boss | 180s onward | Lv13 | Boss and escorts |

### 4.4 Health scaling

```text
healthMultiplier = 1.20 ^ (monsterLevel - 1)
```

### 4.5 Damage scaling

For ordinary enemies and elites:

```text
damageMultiplier = 1.18 ^ (monsterLevel - 1)
```

### 4.6 Boss exception

```text
bossHealth = baseBossHealth × healthMultiplier
bossDamage = authoredPatternDamage
```

Boss damage never receives the level multiplier.

A base boss HP of 250 becomes roughly 2,230 HP at Lv13.

---

## 5. Player progression relationship

### 5.1 Target pace

The player progression target remains:

```text
9 level-ups
Lv1 → Lv10
approximately 90 seconds to cap
```

Current thresholds:

```json
[20, 45, 75, 110, 150, 195, 245, 300]
```

After the player reaches Lv10, monsters continue scaling to Lv13. This creates the deliberate late-game squeeze.

### 5.2 Single Player versus multiplayer

Enemy difficulty remains identical.

| System | Single Player | Multiplayer |
|---|---|---|
| Monster level | Same | Same |
| HP and damage | Same | Same |
| Population | Same | Same |
| Wave composition | Same | Same |
| Technical cap | Same | Same |
| XP multiplier | ×2 | ×1 |

Do not reduce enemy counts or stats specifically for Single Player.

---

## 6. XP rewards

XP scales with monster level.

Recommended data:

```json
{
  "enemyXpRewards": {
    "ambient": { "base": 1, "perLevel": 1 },
    "wave":    { "base": 2, "perLevel": 2 },
    "elite":   { "base": 40, "perLevel": 8 },
    "boss":    { "base": 150, "perLevel": 0 }
  }
}
```

Formula:

```text
xpReward = base + perLevel × monsterLevel
```

Apply the Single Player ×2 multiplier afterward.

---

## 7. Roster architecture

### 7.1 Runtime model sets

| Variant | Count | Use |
|---|---:|---|
| `hero/` | 45 | Specialists, elites, bosses |
| `common-near/` | 15 | Nearby animated fodder |
| `common-far/` | 15 | Distant rigid fodder |
| `aggregate/` | 15 | Instanced horde representation |

### 7.2 Roster totals

```text
39 ordinary monsters
4 elites
2 bosses
45 total
```

### 7.3 Tiers

```ts
type EnemyTier =
  | 'fodder'
  | 'specialist'
  | 'elite'
  | 'boss';
```

#### Fodder

Population mass, XP supply, basic pressure.

#### Specialist

Stronger ordinary enemy using the same behavior vocabulary but more threatening stats.

#### Elite

Wave leader, scale ×3, high HP and damage, one ordinary melee or ranged attack.

#### Boss

Final encounter, scale ×5, multiple data-defined patterns, at least one ranged pattern.

---

## 8. Ordinary enemy behavior

### 8.1 Movement

All ordinary enemies use the same fundamental movement:

```text
track the tank
```

Reusable components may include:

- Target tracking
- Density steering
- Wall and terrain traversal
- Separation
- Engagement-ring positioning
- Movement integration

Ordinary enemies do not use bespoke charge movement.

### 8.2 Attack categories

Every ordinary enemy has exactly one attack type:

```ts
type OrdinaryAttackType =
  | 'melee'
  | 'ranged';
```

### 8.3 Removed ordinary patterns

The launch design excludes ordinary:

- Shotgun bursts
- Homing projectiles
- Spore barrages
- Ground zones
- Charge attacks
- Multi-stage attacks
- Monster-specific attack state machines

Variation comes from:

- HP
- Movement speed
- Damage budget
- Attack rate
- Range
- Projectile speed
- Threat
- Model
- Scale

---

## 9. Attack timing and animation

### 9.1 Authoritative cycle

```text
attackCycleSeconds = 1 / attacksPerSecond
```

Gameplay cooldown controls when another attack may begin.

### 9.2 Playback speed

Fit the Attack clip to the attack cycle:

```text
playbackSpeed =
sourceAttackClipDuration
/
attackCycleSeconds
```

Recommended visual clamp:

```json
{
  "attackPlayback": {
    "minSpeed": 0.6,
    "maxSpeed": 2.5
  }
}
```

Gameplay timing remains authoritative even when playback speed is clamped.

### 9.3 Normalized cue

Default:

```json
{
  "attackCueNormalized": 0.55
}
```

The authoritative event occurs once when Attack progress crosses the cue.

```text
eventTime =
attackCycleSeconds × attackCueNormalized
```

The event may be:

- Melee damage
- Projectile spawn
- Boss pattern event

Model-specific cue overrides belong in animation content, never monster-specific simulation code.

### 9.4 Death lock

Once Death begins:

- New attacks are blocked
- Pending attack cues are canceled
- Movement does not resume
- Engagement reservations are released

---

## 10. Semantic animation system

Every monster uses four semantic states:

```text
Idle
Walk
Attack
Death
```

Animation profiles map raw clips to:

```ts
interface EnemyAnimationRoles {
  idle: string;
  walk: string;
  attackPrimary: string;
  death: string;
}
```

Raw clips such as Bite, Headbutt, Punch, Weapon, or Cast may all resolve to `attackPrimary`.

Run, secondary attacks, stagger, and other clips may remain in assets but are not required for launch gameplay.

---

## 11. Near, far, and aggregate presentation

### Near fodder

Use `common-near`.

- Skeletal Idle/Walk/Attack/Death
- Individual cues
- Standard hit feedback

### Hero enemies

Use `hero`.

- Specialists
- Elites
- Bosses
- Monsters without common variants

### Far fodder

Use `common-far`.

The model is rigid:

- Walk = world translation and facing
- Idle = stationary
- Attack = projectile/VFX timing and optional cheap flash
- Death = existing cheapest hide, shrink, dissolve, or swap path

Do not allocate skeletal mixers to rigid far models.

### Aggregate hordes

Use `aggregate`.

- Instanced rigid rendering
- No individual skeletal animation
- Minimal state
- No new expensive procedural motion requirement

### LOD identity

Near, far, and aggregate representations of one family must preserve:

- Approximate height
- Ground contact
- Silhouette
- Color identity
- Physical envelope

---

## 12. Model dimension normalization

### 12.1 Size classes

Target base heights:

```text
small  = 1.02 m
medium = 1.53 m
large  = 1.70 m
```

Content example:

```json
{
  "sizeClass": "medium"
}
```

### 12.2 Import-time measurement

At import or asset validation:

1. Apply a neutral reference pose.
2. Compute visible mesh bounds.
3. Ignore helpers, lights, cameras, and hidden meshes.
4. Record source width, height, depth, and ground offset.

### 12.3 Normalization

```text
normalizationScale =
targetHeight
/
sourceNeutralPoseHeight
```

Final scale:

```text
finalScale =
normalizationScale
× tierScale
× optionalVariantScale
```

Tier scales:

```text
fodder/specialist = 1
elite             = 3
boss              = 5
```

### 12.4 Generated dimensions

```ts
interface NormalizedEnemyDimensions {
  targetHeight: number;
  normalizedWidth: number;
  normalizedHeight: number;
  normalizedDepth: number;

  collisionRadius: number;
  collisionHeight: number;
  groundOffset: number;

  spawnClearanceRadius: number;
  engagementRadius: number;
  shadowRadius: number;
}
```

Initial derivation:

```text
collisionRadius =
0.45 × max(normalizedWidth, normalizedDepth)

collisionHeight =
0.90 × normalizedHeight
```

These are data-driven tuning defaults.

### 12.5 Propagation

Tier scale affects:

- Render model
- Collision radius and height
- Spawn clearance
- Density steering
- Engagement reservation width
- Melee stopping distance
- Projectile socket
- Shadow size
- Debug bounds

### 12.6 LOD family matching

`common-near`, `common-far`, and `aggregate` variants of one family must share one target envelope.

Store normalized results in generated presentation content. Do not recompute GLB bounds every spawn.

---

## 13. Ordinary melee damage

### 13.1 Contact-DPS model

Ordinary melee enemies author sustained pressure rather than independent per-hit damage and attack cadence:

```json
{
  "attack": {
    "type": "melee",
    "damageModel": "contactDps",
    "contactDps": 4,
    "rate": 2.2
  }
}
```

### 13.2 Derivation

```text
scaledContactDps =
contactDps × damageMultiplier

damagePerHit =
scaledContactDps / attackRate
```

### 13.3 Result

High rate:

- More frequent
- Smaller hits
- Fast presentation

Low rate:

- Less frequent
- Larger hits
- Heavy presentation

Cadence no longer accidentally multiplies the whole damage budget.

### 13.4 Scope

Use contact-DPS normalization for:

- Ordinary melee fodder
- Melee specialists
- Melee elites unless explicitly overridden

Do not use it for:

- Ranged projectiles
- Boss patterns
- Environmental damage

---

## 14. Melee engagement reservations

### 14.1 Purpose

Contact-DPS normalization controls one attacker. Reservations control how many attackers may deal melee damage at once.

### 14.2 Attack ring

An enemy must reserve an angular arc around the tank before entering attack-ready state.

### 14.3 Reservation width

```text
reservedArcWidth =
enemyCollisionDiameter
× spacingMultiplier
```

Initial content:

```json
{
  "meleeEngagement": {
    "spacingMultiplier": 1.25,
    "minimumSlots": 3,
    "maximumSlots": 6,
    "reservationGraceSeconds": 0.35,
    "releaseDistanceMultiplier": 1.35
  }
}
```

### 14.4 Enemy with reservation

May:

- Approach assigned angle
- Enter attack range
- Start Attack
- Fire melee cue

### 14.5 Enemy without reservation

Must:

- Continue tracking
- Use density steering
- Circle or wait
- Search for a free angle
- Never fire melee damage

### 14.6 Release rules

Release when:

- Enemy dies
- Enemy is displaced
- Enemy leaves release radius
- Target is lost
- Grace expires
- Match phase resets

### 14.7 Large enemies

Elites reserve wider arcs because their normalized colliders are larger.

Bosses use a dedicated boss engagement radius and do not compete for ordinary slots.

### 14.8 Determinism

Tie-break in stable order:

1. Eligible distance
2. Existing ownership
3. Tier or threat priority
4. Stable enemy ID or spawn sequence

Do not use random arbitration.

---

## 15. Ranged enemies

### 15.1 Launch rule

Every ordinary ranged enemy fires one projectile per accepted attack.

No ordinary hitscan is allowed.

### 15.2 Data

```json
{
  "attack": {
    "type": "ranged",
    "damage": 6,
    "rate": 0.5,
    "range": 36,
    "preferredRange": 14,
    "projectileId": "projectile.wizardShot",
    "telegraphTime": 0.8
  }
}
```

### 15.3 Projectile requirements

Enemy projectiles must be:

- Visible
- Slow enough to evade
- Server authoritative
- Terrain-aware
- Obstacle-aware
- Limited by lifetime
- Fired from an authored projectile socket

### 15.4 Speed band

```text
5–12 m/s
```

The upper end is primarily for bosses.

Projectile speed, turn rate, and fire rate do not level-scale.

Ordinary projectile damage may level-scale.

### 15.5 Telegraph

The enemy enters Attack before release. The projectile spawns at the normalized attack cue.

---

## 16. Boss system

### 16.1 Requirements

A boss:

- Uses a high-detail hero model
- Uses tier scale ×5 after normalization
- Has level-scaled HP
- Has fixed authored pattern damage
- Has two or three data-defined patterns
- Has at least one ranged pattern
- Uses normalized cues
- Remains active until victory or defeat

### 16.2 Pattern example

```json
{
  "attack": {
    "type": "mixed",
    "selection": {
      "mode": "orderedCycle"
    },
    "patterns": [
      {
        "id": "meleePrimary",
        "type": "melee",
        "damage": 30,
        "rate": 0.8,
        "range": 4
      },
      {
        "id": "rangedPrimary",
        "type": "ranged",
        "damage": 22,
        "rate": 0.4,
        "range": 40,
        "projectileId": "projectile.demonFireball",
        "telegraphTime": 1
      }
    ]
  }
}
```

### 16.3 Sequence

Launch behavior may use a simple ordered cycle:

```text
melee
→ ranged
→ optional special
→ repeat
```

Do not build a complex planner unless later design requires it.

---

## 17. Current elite and boss roster

### Elites

- `alien-high-detail`
- `cactoro-high-detail`
- `fish-high-detail`
- `ninja-high-detail`

### Bosses

- `demon-high-detail`
- `yeti-high-detail`

The individual ordinary roster stats remain sourced from the current monster-category table and should be migrated into content definitions without monster-specific code.

---

## 18. Suggested content structure

### Monster definitions

```text
content/enemies/
```

Contains:

- ID and label
- Tier
- Presentation profile
- Animation profile
- Size class
- Tier scale
- Base stats
- Attack data
- Reward class
- Behavior list
- Spawn tags

### Presentation profiles

```text
content/enemy-presentation-profiles/
```

Contains:

- Near/far/aggregate models
- Normalized dimensions
- Materials
- Shadows
- Sockets
- Death presentation

### Animation profiles

```text
content/enemy-animation-profiles/
```

Contains:

- Semantic clip mapping
- Fallbacks
- Attack cue
- Playback clamps
- Death duration

### Art rosters

```text
content/enemy-art-rosters/
```

Controls:

- Stage availability
- Common families
- Elite roster
- Boss roster
- Wave availability

### Projectiles

```text
content/projectiles/
```

Contains:

- Speed
- Lifetime
- Radius
- Collision
- VFX
- Damage behavior

### Curves and rewards

Recommended:

```text
content/enemy-level-curves/
content/enemy-xp-rewards/
content/melee-engagement-profiles/
```

---

## 19. Example ordinary melee definition

```json
{
  "id": "enemy.quaternius.ninja",
  "label": "Ninja",
  "tier": "fodder",
  "presentationProfileId": "enemyPresentation.quaternius.ninja.common",
  "animationProfileId": "enemyAnimation.quaternius.ninja.common",
  "sizeClass": "small",
  "tierScale": 1,
  "stats": {
    "hp": 4,
    "speed": 4.5,
    "threat": 1
  },
  "rewardClass": "ambient",
  "attack": {
    "type": "melee",
    "damageModel": "contactDps",
    "contactDps": 4,
    "rate": 2.2,
    "range": 2
  },
  "behaviors": [
    { "id": "movement.trackTank", "parameters": {} },
    { "id": "movement.densitySteering", "parameters": {} },
    {
      "id": "movement.meleeEngagement",
      "parameters": {
        "profileId": "meleeEngagement.default"
      }
    },
    { "id": "movement.integrate", "parameters": {} },
    { "id": "attack.meleeCue", "parameters": {} }
  ]
}
```

---

## 20. Example ordinary ranged definition

```json
{
  "id": "enemy.quaternius.wizard",
  "label": "Wizard",
  "tier": "fodder",
  "presentationProfileId": "enemyPresentation.quaternius.wizard.common",
  "animationProfileId": "enemyAnimation.quaternius.wizard.common",
  "sizeClass": "medium",
  "tierScale": 1,
  "stats": {
    "hp": 3,
    "speed": 2.6,
    "threat": 2
  },
  "rewardClass": "ambient",
  "attack": {
    "type": "ranged",
    "damage": 6,
    "rate": 0.5,
    "range": 36,
    "preferredRange": 14,
    "projectileId": "projectile.wizardShot",
    "telegraphTime": 0.8
  },
  "behaviors": [
    {
      "id": "movement.trackTank",
      "parameters": {
        "preferredRange": 14
      }
    },
    { "id": "movement.densitySteering", "parameters": {} },
    {
      "id": "attack.projectileCue",
      "parameters": {
        "shotCount": 1
      }
    }
  ]
}
```

---

## 21. Example boss definition

```json
{
  "id": "enemy.quaternius.demonHighDetail",
  "label": "Demon Boss",
  "tier": "boss",
  "presentationProfileId": "enemyPresentation.quaternius.demonHighDetail.hero",
  "animationProfileId": "enemyAnimation.quaternius.demonHighDetail.hero",
  "sizeClass": "large",
  "tierScale": 5,
  "stats": {
    "hp": 250,
    "speed": 3.2,
    "threat": 50
  },
  "rewardClass": "boss",
  "levelScaling": {
    "health": true,
    "damage": false
  },
  "attack": {
    "type": "mixed",
    "selection": {
      "mode": "orderedCycle"
    },
    "patterns": [
      {
        "id": "punch",
        "type": "melee",
        "damage": 30,
        "rate": 0.8,
        "range": 4
      },
      {
        "id": "fireball",
        "type": "ranged",
        "damage": 22,
        "rate": 0.4,
        "range": 40,
        "projectileId": "projectile.demonFireball",
        "telegraphTime": 1
      }
    ]
  }
}
```

---

## 22. Runtime order

### Spawn

1. Select definition from roster.
2. Read current monster level.
3. Lock spawn level.
4. Resolve scaled HP.
5. Resolve ordinary damage multiplier.
6. Resolve normalized presentation dimensions.
7. Apply tier scale.
8. Create collision and engagement dimensions.
9. Assign stable enemy ID and spawn sequence.
10. Enter Idle or Walk.

### Update

```text
death lock
→ timers
→ target resolution
→ movement intent
→ density steering
→ engagement reservation
→ attack eligibility
→ animation and cue progression
→ authoritative event
→ movement integration
→ collision
→ presentation cues
```

### Melee event

```text
validate target
→ validate reservation
→ validate range
→ derive per-hit damage
→ apply damage
```

### Ranged event

```text
validate target
→ validate range
→ resolve projectile socket
→ spawn authoritative projectile
```

### Death

```text
mark dead
→ release reservation
→ cancel attack cue
→ award XP
→ play death presentation
→ clean up representation
```

---

## 23. Networking and determinism

The server owns:

- Spawn level
- HP
- Cooldowns
- Reservation ownership
- Attack acceptance
- Damage
- Projectile spawning
- Projectile collision
- Death
- XP
- Boss transitions

Clients receive compact presentation cues:

- Enemy ID
- Sequence
- Semantic action
- Start time
- Optional pattern ID
- Optional presentation profile

Clients never decide whether damage occurs.

Stable ordering is required for:

- Reservation arbitration
- Simultaneous attacks
- Spawn selection
- Boss pattern progression
- Cleanup
- XP events

Do not use `Math.random()` in authoritative monster simulation.

---

## 24. Validation

### Enemy content

Reject:

- Missing presentation or animation profile
- Unknown projectile
- Invalid tier
- Non-positive HP or attack rate
- Invalid range
- Ordinary melee without `contactDps`
- Ordinary mixed attack
- Boss without a ranged pattern
- Boss configured for level-scaled damage
- Invalid size class
- Missing reward class

### Animation

Validate:

- Idle/Walk/Attack/Death semantic resolution
- Clip existence
- Attack cue within `[0, 1]`
- Playback limits
- Death fallback
- Duplicate role ambiguity

### Model normalization

Validate:

- Finite source bounds
- Non-zero source height
- Correct ground offset
- LOD family size agreement
- Collider safety
- Projectile socket location

### Projectiles

Validate:

- Positive speed and lifetime
- Ordinary attack is not hitscan
- Range consistency
- Collision radius
- Valid damage data

### Rosters

Validate:

- Every referenced enemy exists
- Elite slots contain elites
- Boss slots contain bosses
- Used assets exist

---

## 25. Telemetry

Track:

### Difficulty

- Monster level over time
- HP and damage multipliers
- Population and threat
- Tier composition

### Combat

- Damage by source
- Melee versus ranged damage
- Reservation occupancy
- Simultaneous melee attackers
- Applied contact DPS
- Projectile hit and avoidance rates
- TTK by tier and level
- Boss TTK

### Progression

- XP by reward class
- Level-up timestamps
- Time to Lv10
- Single Player versus multiplayer progression

### Performance

- Near skeletal count
- Far rigid count
- Aggregate count
- Active mixers
- Draw calls
- Animation update cost
- Model swaps
- Cleanup and memory after repeated rounds

---

## 26. Implementation milestones

### M0 — Audit

Compare this design with existing progression, horde, projectile, presentation, animation, and content systems.

### M1 — Content schemas

Add or extend:

- Tier
- Size class
- Attack union
- Contact-DPS model
- Boss patterns
- Reward class
- Scaling flags
- Normalization metadata
- Engagement profiles

### M2 — Difficulty and XP

Implement:

- Spawn-time level
- HP and damage curves
- Boss damage exception
- XP reward curves
- Single Player multiplier
- Boss-phase level lock

### M3 — Attack timing

Implement:

- Cooldown authority
- Playback fitting
- Normalized cues
- Cue deduplication
- Death cancellation

### M4 — Model normalization

Implement:

- Neutral-pose bounds
- Size-class normalization
- Generated dimensions
- Tier-scale propagation
- LOD family matching
- Validation reports

### M5 — Melee engagement

Implement:

- Deterministic attack-ring reservations
- Collider-derived arc width
- Release rules
- Density-steering integration
- Contact-DPS damage

### M6 — Ranged projectiles

Implement:

- One-projectile ordinary ranged attacks
- Slow projectile profiles
- Terrain and obstacle collision
- Telegraphs
- Server authority

### M7 — Boss phase

Implement:

- Match-flow states
- Boss intro
- Pattern cycle
- Fixed damage
- Lv13 lock
- Victory/defeat transition

### M8 — Presentation LOD

Implement:

- Near skeletal
- Far rigid
- Aggregate instancing
- State-preserving swaps
- Cheap far attack/death feedback

### M9 — Roster and wave integration

Migrate all 45 definitions and integrate ambient, waves, elites, boss, and escorts.

### M10 — Validation and tools

Add:

- Content validation
- Normalization reports
- Animation preview
- Engagement debug overlay
- Projectile debug
- Difficulty telemetry
- Performance benchmark

### M11 — Qualification

Run:

- Unit and content tests
- Determinism tests
- Single Player
- Two-client multiplayer
- Full three-minute round
- Boss phase
- Horde benchmark
- Repeated restart/rematch cleanup
- Full roster visual review

---

## 27. Acceptance criteria

The system is complete only when:

- Monster level rises every 15 seconds
- Spawn level remains fixed
- Ordinary HP and damage scale correctly
- Boss HP scales and boss damage does not
- XP scales with level
- Single Player uses identical enemy difficulty and ×2 XP
- Every ordinary enemy has exactly one melee or ranged attack
- Ordinary melee uses contact-DPS normalization
- Melee damage requires a reservation
- Reservation arbitration is deterministic
- Ordinary ranged attacks fire one slow projectile
- No ordinary hitscan exists
- Cooldown controls gameplay
- Attack playback follows the cycle
- One normalized cue fires one event
- Idle/Walk/Attack/Death resolve for every enemy
- Far and aggregate fodder do not require skeletal mixers
- Models normalize before tier scale
- LOD family dimensions match
- Elites are ×3 and bosses ×5 after normalization
- Bosses have multiple patterns and at least one ranged pattern
- The 180-second timer enters boss phase
- Boss phase ends only through victory or defeat
- Definitions are data-driven
- No monster-specific simulation branch is required
- Server/client determinism passes
- Full-round and performance tests pass

---

## 28. Prohibited shortcuts

Do not:

- Make animation callbacks authoritative for damage
- Give every ordinary monster custom AI
- Reintroduce ordinary shotgun, homing, charge, or ground-zone patterns
- Scale boss damage by level
- Reduce enemy difficulty specifically for Single Player
- Use raw GLB scale as gameplay scale
- Recompute model bounds every spawn
- Give rigid far enemies skeletal mixers
- Let overlapping melee enemies all attack without reservations
- Hide melee pressure behind an invisible global DPS cap
- Use ordinary hitscan
- End the match immediately at 180 seconds
- Hardcode monster-specific behavior in simulation
- Claim unrun tests passed

---

## 29. Final binding summary

```text
Difficulty:
Lv1–13
+1 level every 15 seconds
HP ×1.20 per level
ordinary damage ×1.18 per level
boss damage fixed
XP scales by level

Ordinary enemies:
track tank
one melee or one ranged attack
variation through data
Idle / Walk / Attack / Death

Melee:
contactDps defines pressure
rate defines cadence
per-hit damage is derived
reservation required

Ranged:
one slow projectile
no hitscan
telegraphed and avoidable

Animation:
cooldown authoritative
playback fits cycle
normalized cue fires one event

Models:
normalize to small/medium/large
then apply tier scale
ordinary ×1
elite ×3
boss ×5
LOD variants share one envelope

Presentation:
near skeletal
far rigid
aggregate instanced

Boss:
multiple patterns
at least one ranged
scaled HP
fixed damage
boss phase continues after 180 seconds

Architecture:
fully data-driven
shared deterministic simulation
no monster-specific hardcoded branches
```
