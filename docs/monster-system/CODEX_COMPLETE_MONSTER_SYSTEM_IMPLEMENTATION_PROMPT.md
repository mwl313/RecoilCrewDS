# Codex Prompt — Implement the Complete Recoil Crew Monster System

Repository:

```text
https://github.com/mwl313/RecoilCrewDS
```

Required base commit:

```text
6c26676e9911a3cf8f04e96b5baa8653918ffb71
```

Create and work on:

```text
monster-system
```

Required binding design supplied alongside this prompt:

```text
RECOIL_CREW_MONSTER_SYSTEM_DESIGN.md
```

Copy it to:

```text
docs/monster-system/RECOIL_CREW_MONSTER_SYSTEM_DESIGN.md
```

The complete design document is the primary authority. Where this prompt's examples differ from the actual repository schema, preserve the binding design intent while adapting to the repository's established architecture.

Do not stop after auditing or writing plans. Continue through implementation, migration, tests, qualification, and reporting.

---

## 1. Mission

Implement the full launch monster system, including:

- Explicit 180-second farming phase followed by boss intro and boss combat
- Time-driven monster leveling from Lv1 to Lv13
- Spawn-time level locking
- HP and damage curves
- Boss damage exception
- Level-scaled XP
- Identical Single Player and multiplayer enemy difficulty, with Single Player XP ×2 only
- Full 45-monster roster: 39 ordinary, 4 elites, 2 bosses
- Fodder, specialist, elite, and boss categories
- One melee or one ranged attack for every ordinary enemy and elite
- Contact-DPS melee normalization
- Deterministic melee engagement reservations
- One slow authoritative projectile for every ordinary ranged attack
- Boss-only multi-pattern attacks
- Gameplay-authoritative attack timing
- Idle/Walk/Attack/Death semantic animation policy
- Near, far, aggregate, and hero model usage
- Model-size normalization before tier scaling
- Data-driven content, validation, telemetry, networking, and qualification

Core rule:

```text
many visual identities
+
few reusable gameplay rules
```

Do not create 45 separate AI implementations.

---

## 2. Branch safety

The failed environment-object experiment is outside this task.

Before editing:

```bash
git fetch origin
git status --short
git branch --show-current
git rev-parse HEAD
git rev-parse origin/map-movement-polish
git show --no-patch --oneline 6c26676e9911a3cf8f04e96b5baa8653918ffb71
```

Preserve any local work in another branch or stash, then create:

```bash
git switch -c monster-system 6c26676e9911a3cf8f04e96b5baa8653918ffb71
```

Confirm the new branch begins at that exact commit.

Preserve:

- Natural terrain crest launching
- Render-safe rolling terrain
- Sparse Grass material
- Current multiplayer and Single Player architecture
- Current horde/progression systems
- Existing Monster Pack 10 import

Do not add:

- Environment props
- Roads
- Buildings
- Map-overhaul code

Do not merge into `main`.

---

## 3. Required documents

Create before coding:

```text
docs/monster-system/MONSTER_SYSTEM_CODE_AUDIT.md
docs/monster-system/MONSTER_SYSTEM_SCHEMA_MAPPING.md
docs/monster-system/MONSTER_SYSTEM_IMPLEMENTATION_PLAN.md
docs/monster-system/MONSTER_SYSTEM_BASELINE_REPORT.md
```

Create during completion:

```text
docs/monster-system/MONSTER_SYSTEM_CONTENT_REPORT.md
docs/monster-system/MONSTER_SYSTEM_NORMALIZATION_REPORT.md
docs/monster-system/MONSTER_SYSTEM_QUALIFICATION_REPORT.md
docs/monster-system/MONSTER_SYSTEM_IMPLEMENTATION_REPORT.md
docs/monster-system/MONSTER_SYSTEM_AUTHORING_GUIDE.md
```

These documents do not replace implementation.

---

## 4. Existing systems to reuse

The repository already contains:

```text
90 Quaternius runtime GLBs
45 hero
15 common-near
15 common-far
15 aggregate

content/assets/project.json
content/enemy-animation-profiles/quaternius/
content/enemy-presentation-profiles/quaternius/
content/enemy-art-rosters/quaternius.integrationPreview.json

AssetService
AssetService.preloadModels()
LoadedModelAsset
safe skinned cloning
EnemyAnimationController
enemy presentation resolution
rigid far instancing
AggregateSectorRenderer
animation preview and validators
monster-pack benchmark and telemetry
```

Reuse them. Do not reimport, duplicate, rename, or build competing asset/animation/presentation systems.

Preserve the integration-preview roster and add a production roster.

---

## 5. Compatibility-safe enemy migration

The current enemy schema is centered on legacy types such as:

```text
scrapBug
rammer
gunTower
lootTruck
```

Introduce a generalized monster definition without abruptly breaking legacy content.

Use a strangler migration:

```text
legacy definitions
→ compatibility adapter
→ generalized runtime
→ parity tests
→ production roster activation
→ remove obsolete duplicate paths only when safe
```

Every temporary adapter must have a documented purpose, removal condition, and tests. Do not create permanent dual balance sources.

---

## 6. Audit and baseline

Inspect the actual tree, including:

```text
package.json
content/manifest.json
content/assets/project.json
content/enemies/
content/projectiles/
content/modes/
content/spawn-directors/
content/horde/
content/level-curves/
content/progression-mode-policies/
content/enemy-art-rosters/
content/enemy-animation-profiles/
content/enemy-presentation-profiles/
content/animation-lod-policies/
content/animation-shadow-policies/

src/shared/content/
src/shared/content/schemas/enemy.ts
src/shared/content/schemas/projectile.ts
src/shared/sim/
src/shared/horde/
src/shared/projectiles/
src/shared/damage/
src/shared/progression/
src/shared/net/

src/client/assets/
src/client/animation/
src/client/enemies/
src/client/app/
src/server/
scripts/
tools/enemy-animation-preview/
tests/
e2e/
```

Record:

- Authoritative enemy state and spawn path
- Individual versus aggregate horde behavior
- Population limits and wave content
- Projectile and damage authority
- XP award path
- Mode multiplier path
- Timer/result transitions
- Animation action replication
- LOD thresholds
- Cleanup/rematch behavior
- Content-generation and validation paths
- Available commands

Run the actual available equivalents of:

```bash
npx tsc --noEmit
npm run generate:presentation-content
npm run generate:content-pack
npm run generate:map-profiles
npm test
npm run build
npm run test:demo
npm run test:coreloop
npm run test:horde
npm run test:horde:benchmark
npm run test:netcode
npm run test:progression
npm run validate:enemy-animations
npm run test:monsterpack-import
npm run test:monsterpack-rendering
```

Record exact results. Do not regenerate golden files to conceal failures.

---

## 7. Match flow

Implement:

```ts
type MonsterMatchPhase =
  | 'FARMING'
  | 'BOSS_INTRO'
  | 'BOSS_ACTIVE'
  | 'RESULTS';
```

Required flow:

```text
FARMING: 0–180 seconds
180 seconds: FARMING → BOSS_INTRO
after configured intro: BOSS_INTRO → BOSS_ACTIVE
boss defeated: RESULTS victory
team defeated: RESULTS defeat
```

At 180 seconds, farming ends, not the match.

Boss-phase monsters and escorts spawn at Lv13. The HUD changes from farming timer to boss state.

Target successful duration:

```text
3:00 farming
+
about 0:30 boss
```

---

## 8. Monster level curve

Add validated content, preferably:

```text
content/enemy-level-curves/main_stage.json
```

Required values:

```json
{
  "id": "enemyLevelCurve.mainStage",
  "levelIntervalSeconds": 15,
  "minimumLevel": 1,
  "maximumLevel": 13,
  "healthMultiplierPerLevel": 1.2,
  "damageMultiplierPerLevel": 1.18,
  "bossPhaseLevel": 13
}
```

Formula:

```text
monsterLevel =
clamp(1 + floor(elapsedFarmingSeconds / 15), 1, 13)
```

Health:

```text
healthMultiplier = 1.20 ^ (level - 1)
```

Ordinary and elite damage:

```text
damageMultiplier = 1.18 ^ (level - 1)
```

Boss:

```text
bossHealth = baseBossHealth × healthMultiplier
bossDamage = authoredPatternDamage
```

Never multiply boss damage by monster level.

---

## 9. Spawn-time locking

Each enemy stores at authoritative spawn:

```ts
spawnLevel: number;
healthMultiplierAtSpawn: number;
damageMultiplierAtSpawn: number;
maxHpAtSpawn: number;
resolvedRewardXp: number;
```

Melee enemies may also store resolved contact DPS.

Never recalculate an existing enemy's level when time advances. Bosses and boss escorts lock Lv13.

---

## 10. XP rewards and mode rules

Add validated content:

```text
content/enemy-xp-rewards/main_stage.json
```

Required values:

```json
{
  "id": "enemyXpRewards.mainStage",
  "classes": {
    "ambient": { "base": 1, "perLevel": 1 },
    "wave":    { "base": 2, "perLevel": 2 },
    "elite":   { "base": 40, "perLevel": 8 },
    "boss":    { "base": 150, "perLevel": 0 }
  }
}
```

Formula:

```text
reward = base + perLevel × spawnLevel
```

Apply afterward:

```text
Single Player ×2
Multiplayer ×1
```

Single Player and multiplayer must otherwise use identical enemy:

- Level
- HP
- Damage
- Population
- Wave composition
- Spawn cadence
- Technical cap

Preserve the intended player progression target:

```text
Lv1 → Lv10
9 upgrades
approximately 90 seconds
```

Current thresholds remain:

```json
[20, 45, 75, 110, 150, 195, 245, 300]
```

unless integration reveals an actual defect.

---

## 11. General monster schema

Add generalized categories:

```ts
type EnemyTier = 'fodder' | 'specialist' | 'elite' | 'boss';
type EnemySizeClass = 'small' | 'medium' | 'large';
type EnemyRewardClass = 'ambient' | 'wave' | 'elite' | 'boss';
```

General definition must contain:

```ts
interface GeneralEnemyDefinition {
  id: string;
  label: string;

  tier: EnemyTier;
  sizeClass: EnemySizeClass;
  tierScale: number;
  optionalVariantScale?: number;

  presentationProfileId: string;
  animationProfileId: string;

  stats: {
    hp: number;
    speed: number;
    threat: number;
  };

  rewardClass: EnemyRewardClass;

  levelScaling: {
    health: boolean;
    damage: boolean;
  };

  attack: EnemyAttackDefinition;
  behaviors: EnemyBehaviorDefinition[];
  spawnTags?: string[];
}
```

Defaults:

```text
fodder/specialist: scale 1, HP and damage scale
elite: scale 3, HP and damage scale
boss: scale 5, HP scales, damage does not
```

Reject boss definitions with damage scaling enabled.

---

## 12. Attack schema

Use a discriminated union.

Ordinary melee:

```ts
{
  type: 'melee';
  damageModel: 'contactDps';
  contactDps: number;
  rate: number;
  range: number;
  engagementProfileId: string;
  attackCueNormalized?: number;
}
```

Ordinary ranged:

```ts
{
  type: 'ranged';
  damage: number;
  rate: number;
  range: number;
  preferredRange?: number;
  projectileId: string;
  telegraphTime: number;
  shotCount: 1;
  attackCueNormalized?: number;
}
```

Boss:

```ts
{
  type: 'mixed';
  selection: { mode: 'orderedCycle' };
  patterns: BossAttackPattern[];
}
```

Rules:

- Every ordinary enemy and elite has exactly one melee or ranged attack
- Ordinary and elite `mixed` attacks are invalid
- Ordinary ranged always fires one projectile
- Bosses have at least 2 patterns and at least 1 ranged pattern
- Boss pattern damage is fixed
- Boss pattern selection is a deterministic ordered cycle

---

## 13. Ordinary behavior

Every ordinary enemy and elite uses basic tank tracking plus reusable components such as:

```text
movement.trackTank
movement.densitySteering
movement.meleeEngagement
movement.integrate
attack.meleeCue
attack.projectileCue
```

Ordinary enemies must not use:

- Bespoke charge movement
- Shotgun or burst attacks
- Homing attacks
- Spore attacks
- Ground zones
- Multi-stage attack state machines
- Monster-name-specific logic

Variation comes from content values:

- HP
- Speed
- Threat
- Contact DPS or projectile damage
- Attack rate
- Range
- Preferred range
- Projectile speed
- Model
- Size
- Tier

---

## 14. Contact-DPS melee

Ordinary melee authors sustained pressure:

```json
{
  "type": "melee",
  "damageModel": "contactDps",
  "contactDps": 4,
  "rate": 2.2
}
```

At spawn:

```text
scaledContactDps =
contactDps × damageMultiplierAtSpawn

damagePerHit =
scaledContactDps / attackRate
```

Higher cadence means smaller frequent hits. Lower cadence means larger slow hits. Cadence must not accidentally multiply sustained DPS.

Use this for melee fodder, specialists, and elites. Do not use it for projectiles, bosses, or environmental damage.

---

## 15. Melee engagement reservations

Add:

```text
content/melee-engagement-profiles/default.json
```

Required values:

```json
{
  "id": "meleeEngagement.default",
  "spacingMultiplier": 1.25,
  "minimumSlots": 3,
  "maximumSlots": 6,
  "reservationGraceSeconds": 0.35,
  "releaseDistanceMultiplier": 1.35
}
```

Only a reservation owner may enter attack-ready state, start Attack, or fire a melee damage cue.

Enemies without a reservation must continue tracking, steer, circle, wait, or seek another arc. They may not deal melee damage.

Reservation width:

```text
enemyCollisionDiameter × spacingMultiplier
```

Large enemies occupy wider arcs. Elites therefore consume more space. Bosses use a dedicated boss engagement radius and do not compete for ordinary slots.

Release on:

- Death
- Displacement
- Leaving release radius
- Target loss
- Grace expiry
- Phase reset
- Match cleanup

Deterministic tie-break:

1. Eligible distance
2. Existing ownership
3. Tier/threat priority
4. Stable enemy ID or spawn sequence

No random arbitration and no invisible global DPS cap.

---

## 16. Attack timing and cues

Cycle:

```text
attackCycleSeconds = 1 / attacksPerSecond
```

Gameplay cooldown is authoritative.

Store sequence and cue state so network replay, frame drops, LOD swaps, or animation restarts cannot duplicate attacks:

```ts
interface EnemyAttackRuntime {
  sequence: number;
  cycleStartTime: number;
  cycleDuration: number;
  cueNormalized: number;
  cueFired: boolean;
  patternId?: string;
}
```

Default cue:

```text
0.55
```

Event time:

```text
attackCycleSeconds × attackCueNormalized
```

The event fires exactly once and may be:

- Melee damage
- Projectile spawn
- Boss pattern event

Animation callbacks never decide authoritative damage.

---

## 17. Animation policy

Every monster uses only these semantic gameplay states:

```text
Idle
Walk
Attack
Death
```

Mapping:

```ts
interface EnemyAnimationRoles {
  idle: string;
  walk: string;
  attackPrimary: string;
  death: string;
}
```

Raw clips such as Bite, Headbutt, Punch, Weapon, or Cast may map to `attackPrimary`.

Run, secondary attacks, stagger, and other clips may remain in assets but are unused by launch gameplay.

Playback fitting:

```text
playbackSpeed =
sourceAttackClipDuration / attackCycleSeconds
```

Visual clamp:

```text
0.6–2.5
```

The clamp must not change gameplay timing.

Allow model-specific `attackCueNormalized` overrides in animation content only.

Death lock:

- Blocks new attacks
- Cancels pending cues
- Stops movement resumption
- Releases reservations
- Prevents return to Idle/Walk
- Persists until cleanup

---

## 18. Action replication

The server owns attack acceptance, sequence, cue, damage, projectile spawning, death, and boss pattern index.

Clients receive compact semantic cues such as:

```ts
{
  enemyId: number;
  sequence: number;
  action: 'Idle' | 'Walk' | 'Attack' | 'Death';
  startTime: number;
  duration?: number;
  patternId?: string;
  presentationProfileId?: string;
}
```

Clients reconstruct visuals but never decide damage. Do not replicate raw animation time every frame.

---

## 19. Model usage

Reuse imported variants.

`common-near`:

- Nearby common fodder
- Skinned
- Idle/Walk/Attack/Death mixer
- Individual cues

`common-far`:

- Distant common fodder
- Rigid
- No mixer
- Translation/facing for Walk
- Projectile/VFX/flash for Attack
- Cheap hide/shrink/dissolve/swap for Death

`aggregate`:

- Existing instanced horde sectors
- No mixer
- Minimal presentation state

`hero`:

- Specialists
- Elites
- Bosses
- Monsters without common variants

Preserve stage-selective preloading through `AssetService.preloadModels()`. Do not preload all optional monsters at generic startup.

---

## 20. LOD state preservation

Near/far/aggregate forms of one family must preserve:

- Height
- Ground contact
- Silhouette/color identity
- Physical envelope
- Enemy ID
- HP
- Spawn level
- Cooldown
- Attack sequence
- Cue-fired state
- Death state

LOD changes must not restart attacks, duplicate projectiles, revive enemies, move colliders, or change gameplay scale.

---

## 21. Model normalization

Raw GLB dimensions are not gameplay dimensions.

Target base heights:

```text
small = 1.02 m
medium = 1.53 m
large = 1.70 m
```

At import validation or generated-content time:

1. Use a neutral pose
2. Measure visible meshes
3. Ignore helpers, lights, cameras, and hidden meshes
4. Record source width/height/depth and ground offset
5. Record sockets

Formula:

```text
normalizationScale =
targetHeight / sourceNeutralPoseHeight

finalScale =
normalizationScale × tierScale × optionalVariantScale
```

Tier scales:

```text
fodder/specialist = 1
elite = 3
boss = 5
```

Do not scan GLB bounds on every spawn.

---

## 22. Generated dimensions

Generate/cache:

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

  projectileSocket?: { x: number; y: number; z: number };
}
```

Initial defaults:

```text
collisionRadius =
0.45 × max(normalizedWidth, normalizedDepth)

collisionHeight =
0.90 × normalizedHeight
```

Tier scale propagates to render, collision, spawn clearance, density steering, reservation width, stopping distance, socket, shadow, and debug bounds.

Near/far/aggregate variants share one normalized envelope. Validate family mismatch.

---

## 23. Ranged projectiles

Every ordinary ranged attack fires exactly one authoritative slow projectile.

Speed band:

```text
5–12 m/s
```

Required:

- Server spawn and stable ID
- Normalized socket origin
- Positive lifetime/radius
- Terrain collision
- Obstacle collision
- Tank collision
- Telegraph before cue
- Spawn-level damage
- Presentation replication
- Deterministic collision ordering
- Cleanup

Create all needed validated projectile definitions under `content/projectiles/` using exact values from the binding roster table.

No ordinary hitscan. Far or aggregate visuals may simplify rendering but do not simplify authoritative projectile simulation into hitscan.

---

## 24. Bosses

Binding bosses:

```text
demon-high-detail
yeti-high-detail
```

Both:

```text
tier = boss
tierScale = 5
spawn level = 13
HP scales
damage fixed
ordered pattern cycle
at least one ranged pattern
```

Demon launch patterns:

```text
Punch:
melee
damage 30
rate 0.8/s
range 4

Fireball:
ranged
damage 22
rate 0.4/s
range 40
projectile speed 12 m/s
telegraph 1.0 s
```

Yeti launch patterns:

```text
Heavy strike:
melee
damage 34
rate 0.6/s
range derived/authored for normalized size

Ice projectile:
ranged
damage 26
rate 0.3/s
projectile speed 10 m/s
telegraph 1.2 s
```

Initial cycle:

```text
melee → ranged → repeat
```

Support future third patterns through data, but do not build a complex planner.

---

## 25. Elites

Binding elites:

```text
alien-high-detail
cactoro-high-detail
fish-high-detail
ninja-high-detail
```

Each:

```text
tier = elite
tierScale = 3
HP and damage scale
rewardClass = elite
exactly one melee or ranged attack
no boss pattern set
```

Use exact stats and assignments from the binding design. Do not invent elite-only mechanics.

---

## 26. Full roster

Create:

```text
39 ordinary
4 elites
2 bosses
45 total
```

Migrate exact ordinary names, tier, HP, speed, threat, attack assignment, rate, range, projectile, and damage/contact-DPS values from the binding design's roster tables.

Add:

```text
content/enemy-art-rosters/quaternius.mainStage.json
```

Preserve:

```text
enemyArtRoster.quaternius.integrationPreview
```

The production roster supports:

- Ordinary/fodder/specialist pools
- Elite pool
- Boss pool
- Phase and wave eligibility
- Stable deterministic selection
- Complete preload resolution

Do not hardcode the 45 IDs in simulation.

---

## 27. Phase composition

Integrate with current horde/wave infrastructure:

```text
0–30 s / Lv1–2:
basic fodder

30–60 s / Lv3–4:
first ranged fodder

~60 s / Lv5:
elite leader and cohort

60–120 s / Lv5–8:
more ranged and specialists

~120 s / Lv9:
stronger wave, elite 1–2

120–180 s / Lv9–12:
maximum ordinary pressure

180 s onward / Lv13:
boss 1 + escorts 4–6
```

Preserve current population and spawn infrastructure. Do not reduce pressure to simplify implementation.

---

## 28. Content architecture

Add/extend validated content:

```text
content/enemies/
content/enemy-level-curves/
content/enemy-xp-rewards/
content/melee-engagement-profiles/
content/enemy-art-rosters/
content/projectiles/
content/enemy-animation-profiles/
content/enemy-presentation-profiles/
content/horde/
```

Update:

- Schemas
- Manifest
- ContentPack registries
- Referential validation
- Content hashing
- Generators
- Generated modules
- Tests

Do not add ad hoc runtime JSON loaders or hand-edit generated files.

---

## 29. Authoritative runtime order

Spawn:

1. Select definition from resolved roster
2. Read current monster level
3. Lock spawn level
4. Resolve HP multiplier
5. Resolve ordinary damage multiplier
6. Resolve XP
7. Resolve normalized dimensions
8. Apply tier scale
9. Create collision/engagement dimensions
10. Assign stable enemy ID and sequence
11. Enter Idle or Walk

Update:

```text
death lock
→ timers
→ target resolution
→ movement intent
→ density steering
→ engagement reservation
→ attack eligibility
→ attack/cue progression
→ authoritative cue event
→ movement integration
→ collision
→ presentation cues
```

Melee event:

```text
validate target
→ validate reservation
→ validate range
→ derive damage per hit
→ apply damage
```

Ranged event:

```text
validate target
→ validate range
→ resolve socket
→ spawn projectile
```

Death:

```text
mark dead
→ release reservation
→ cancel cue
→ award XP
→ emit Death
→ cleanup
```

---

## 30. Networking and determinism

Server owns:

- Phase and level
- Spawn level
- HP and cooldown
- Reservation ownership
- Attack/cue acceptance
- Damage
- Projectile spawn/collision
- Death and XP
- Boss pattern and transitions

Single Player uses the same shared authority locally.

Use stable ordering for spawn selection, reservation arbitration, simultaneous cues, projectile collision, boss patterns, cleanup, and rewards.

Never use `Math.random()` in authoritative monster simulation.

---

## 31. Aggregate integration

Preserve the current horde-sector architecture.

Aggregate representation is an optimization, not a separate balance system.

Do not let aggregate enemies apply unbounded invisible melee damage. If sectors are presentation-only, keep them presentation-only. If they summarize authoritative enemies, audit and document exactly how combat state is preserved before modifying them.

---

## 32. Validation

Reject:

- Missing presentation or animation profile
- Invalid tier/size/scale
- Non-positive HP/speed/rate/range
- Negative threat
- Missing reward class
- Ordinary melee without contact DPS
- Ordinary ranged with shotCount other than 1
- Ordinary or elite mixed attack
- Unknown projectile
- Boss without ranged pattern
- Boss with damage scaling
- Invalid cue or engagement profile
- Invalid curve/reward data

Validate all 45 semantic animations:

```text
Idle
Walk
Attack
Death
```

Validate actual clips against GLBs, normalization bounds, ground offsets, sockets, family envelopes, colliders, projectiles, and roster references.

---

## 33. Telemetry and debug

Track:

Difficulty:

- Level and multipliers
- Population/threat
- Tier composition
- Spawn-level distribution

Combat:

- Damage source
- Melee/ranged split
- Reservation occupancy
- Simultaneous attackers
- Applied contact DPS
- Projectile hit/avoidance
- TTK by tier/level
- Boss TTK

Progression:

- XP by reward class
- Level-up timestamps
- Time to Lv10
- SP/MP comparison

Performance:

- Near/far/aggregate counts
- Mixers
- Draw calls
- Animation cost
- LOD swaps
- Cleanup after rematches

Add development-only overlays for engagement reservations, normalized colliders, projectiles, level/phase, and active roster.

---

## 34. Milestones

Implement in order without stopping:

```text
M0 audit
M1 schemas
M2 difficulty and XP
M3 attack timing
M4 model normalization
M5 melee reservations
M6 ranged projectiles
M7 boss phase
M8 presentation LOD
M9 all 45 definitions and waves
M10 validation/tools
M11 qualification
```

Each milestone requires tests before completion.

---

## 35. Required tests

Level boundaries:

```text
0 → Lv1
14.999 → Lv1
15 → Lv2
60 → Lv5
120 → Lv9
179.999 → Lv12
180 and later → Lv13
```

Test:

- Spawn level never changes
- HP/damage formulas
- Boss damage fixed
- XP classes at Lv1/5/9/13
- SP reward = MP ×2
- Ordinary attack schema restrictions
- Contact-DPS cadence equivalence
- Reservation ownership/release/determinism
- One cue per cycle
- Frame skip across cue
- Duplicate snapshot and LOD swap do not refire
- Death cancels cue
- One slow projectile
- Terrain/obstacle/tank collision
- No hitscan
- Boss transition and result flow
- All 45 semantic mappings
- No mixers for far/aggregate
- Normalization and tier scaling
- Deterministic networking
- Rematch cleanup
- Existing regressions

Performance qualification must include near, far 100/300/500, aggregate stress, a complete mixed 180-second phase, boss phase, and repeated rematches.

---

## 36. Manual qualification

Run Single Player and two-client multiplayer with a fixed seed.

Verify:

- Early fodder readability
- First ranged enemies and avoidable projectiles
- Lv5 elite wave
- Lv9 mixed pressure
- 180-second boss transition
- Lv13 boss and escorts
- Boss scale/patterns/fixed damage
- Victory only after boss defeat
- Reservation readability
- No canopy/invisible damage behavior
- Correct animation states
- No placeholder models
- Stable performance
- Clean rematch/reset

Record exact seed, counts, boss TTK, screenshots/logs, and observed issues.

---

## 37. Acceptance checklist

Complete only when:

```text
[ ] branch starts from 6c26676
[ ] environment-object experiment absent
[ ] binding design copied into repo
[ ] explicit farming/boss phases
[ ] level every 15 seconds, max 13
[ ] spawn level locked
[ ] HP ×1.20
[ ] ordinary/elite damage ×1.18
[ ] boss damage fixed
[ ] XP classes and SP ×2
[ ] identical enemy difficulty across modes
[ ] 39 ordinary + 4 elite + 2 boss
[ ] production roster and preview roster preserved
[ ] one melee or ranged attack for ordinary/elite
[ ] no ordinary special patterns or hitscan
[ ] contact-DPS melee
[ ] deterministic reservations
[ ] one slow projectile for ranged
[ ] authoritative cooldown and one normalized cue
[ ] death lock
[ ] Idle/Walk/Attack/Death for all 45
[ ] common-near skeletal
[ ] common-far rigid
[ ] aggregate instanced
[ ] hero specialists/elites/bosses
[ ] state-preserving LOD
[ ] size normalization: 1.02/1.53/1.70 m
[ ] tier scales 1/3/5
[ ] dimensions propagate
[ ] demon and yeti boss patterns
[ ] validated JSON architecture
[ ] server/shared determinism
[ ] telemetry/debug tools
[ ] full round and boss tested
[ ] two-client test
[ ] benchmark and rematch cleanup
[ ] typecheck/generation/tests/build pass
[ ] branch remains unmerged
```

---

## 38. Prohibited shortcuts

Do not:

- Make animation callbacks authoritative
- Create one AI per monster
- Add ordinary shotgun, homing, spore, charge, ground-zone, or burst patterns
- Give elites boss pattern arrays
- Scale boss damage
- Reduce Single Player difficulty/population
- Use raw GLB scale
- Recompute bounds per spawn
- Add mixers to rigid far/aggregate models
- Let all overlapping melee enemies attack
- Add hidden global DPS caps
- Use ordinary hitscan
- end the match at 180 seconds
- Hardcode monster IDs in simulation
- Duplicate the import/presentation/animation pipeline
- Preload all optional monsters at generic startup
- Replace aggregate rendering unnecessarily
- Carry environment-object work into this branch
- Hand-edit generated files
- Hide failures through golden updates
- Claim unrun tests passed
- Merge into `main`

---

## 39. Commit strategy

Use focused commits such as:

```text
monster-system: add generalized enemy schemas
monster-system: add level scaling xp and spawn locks
monster-system: add attack timing and melee reservations
monster-system: add slow enemy projectiles
monster-system: add normalization and presentation wiring
monster-system: add boss phase and production roster
monster-system: add validation telemetry and qualification
```

---

## 40. Final report

Write:

```text
docs/monster-system/MONSTER_SYSTEM_IMPLEMENTATION_REPORT.md
```

Report:

1. Starting/final SHA
2. Branch
3. Files changed
4. Compatibility migration
5. Schemas/content
6. Roster counts
7. Curves and XP
8. Spawn locking
9. Attack timing
10. Contact DPS
11. Reservations
12. Projectiles
13. Boss phase/patterns
14. Animation policy
15. Normalization
16. Near/far/aggregate behavior
17. Networking/determinism
18. Telemetry/debug
19. Commands actually run
20. SP and two-client results
21. Full-round seed/result
22. Boss TTK
23. Performance
24. Rematch cleanup
25. Known limitations
26. Remaining tuning-only work
27. Confirmation environment props were excluded
28. Confirmation branch remains unmerged

---

## Final binding summary

```text
Lv1–13, +1 every 15 seconds
HP ×1.20 per level
ordinary/elite damage ×1.18
boss damage fixed
XP by spawn level
Single Player XP ×2 only

39 ordinary
4 elites
2 bosses

ordinary:
track tank
one melee or one ranged attack

melee:
contactDps
damagePerHit = scaledContactDps / rate
reservation required

ranged:
one slow 5–12 m/s projectile
telegraphed
terrain/obstacle collision
no hitscan

animation:
Idle / Walk / Attack / Death
cooldown authoritative
playback fitted
cue 0.55 by default
one cue
death lock

models:
normalize first
small 1.02 m
medium 1.53 m
large 1.70 m
tier scales 1 / 3 / 5

presentation:
common-near skeletal
common-far rigid
aggregate instanced
hero for specialist/elite/boss

boss:
180-second transition
Lv13
multiple ordered patterns
at least one ranged
scaled HP
fixed damage
victory/defeat ends match

architecture:
validated JSON
shared deterministic authority
existing Quaternius pipeline reused
no monster-specific simulation branches
```
