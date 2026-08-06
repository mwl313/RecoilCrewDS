# Recoil Crew — Production Monster Core-Loop Integration Design

## Status

- **Target branch:** `monster-system`
- **Reviewed implementation-report head:** `1f62372`
- **Base ancestor:** `map-movement-polish` at `6c26676`
- **Purpose:** connect the already-built monster systems into the real production game loop.

The earlier `RECOIL_CREW_MONSTER_SYSTEM_DESIGN.md` remains authoritative for level scaling, spawn locks, attack rules, animation policy, model normalization, and the 45-monster roster. This document resolves the missing live-integration decisions.

---

# 1. Final production loop

```text
0–60 s       Farming Phase 1 — Phase 1 ordinary roster
60 s         Wave 1 — same Phase 1 roster + featured elite encounter

60–120 s     Farming Phase 2 — Phase 2 ordinary roster
120 s        Wave 2 — same Phase 2 roster + featured elite encounter

120–180 s    Farming Phase 3 — Phase 3 ordinary roster
180 s        Boss intro
after intro  Boss + 4–6 escorts from Phase 3 roster

Boss dies    Victory
Tank dies    Defeat
```

The farming clock does **not** pause for waves. It **does** pause while progression is in `upgradeSelection` or `relicSelection`, because those selections pause the authoritative simulation.

Production mode has no respawn. Legacy Demo mode keeps its current respawn behavior.

---

# 2. Production modes

Create explicit production content:

```text
mode.mainStage
mode.singlePlayerMainStage
objective.mainStage
results.mainStage
horde.mainStage.production
```

Both production modes use:

- `map.rocketJumpHighlands`
- progression enabled
- production horde director
- production gameplay roster
- 180-second farming sequence
- boss-controlled victory
- tank-destruction defeat

Multiplayer keeps assigned roles, networking, and rematch voting. Single Player keeps combined controls and local restart. Enemy HP, damage, level, population, waves, elites, bosses, and technical limits are identical. Only Single Player XP remains ×2.

Do not repurpose:

```text
mode.demoScoreAttack
mode.singlePlayerScoreAttack
objective.highScore
spawn.director.demoScoreAttack
```

The Demo golden remains a permanent compatibility fixture.


# 3. Gameplay roster versus art roster

Keep `enemyArtRoster.quaternius.mainStage` as presentation/preload metadata.

Add:

```text
content/enemy-gameplay-rosters/quaternius.mainStage.json
```

Recommended ID:

```text
enemyGameplayRoster.quaternius.mainStage
```

The gameplay roster owns:

- ordinary candidates
- slot/category assignment
- phase selection weights
- wave composition
- shared featured identity pool
- elite counts
- boss selection
- repeat-prevention rules
- boss escort count

No gameplay selection logic belongs in the art roster.

---

# 4. Ordinary phase-roster selection

Every phase selects exactly:

```text
1 close-range fodder
1 ranged fodder
1 specialist
```

The following wave reuses the exact same three ordinary identities.

Use a central candidate format:

```ts
type OrdinaryRosterSlot =
  | 'closeFodder'
  | 'rangedFodder'
  | 'specialist';

interface OrdinaryRosterCandidate {
  enemyId: string;
  slot: OrdinaryRosterSlot;

  // Phase 1, Phase 2, Phase 3.
  // 0 = unavailable; positive = weighted chance.
  phaseWeights: [number, number, number];
}
```

Example early enemy:

```json
{
  "enemyId": "enemy.quaternius.ninja",
  "slot": "closeFodder",
  "phaseWeights": [5, 2, 0]
}
```

Example late enemy:

```json
{
  "enemyId": "enemy.quaternius.orc",
  "slot": "closeFodder",
  "phaseWeights": [0, 2, 5]
}
```

This is the complete later-phase difficulty-pool mechanism. Do not create a complex unlock formula.

## Binding repeat rules

- No duplicate identity within one phase roster.
- No ordinary identity may appear in consecutive phase rosters.
- A Phase 1 identity may return in Phase 3.
- If these constraints cannot be satisfied, content validation fails. Do not silently violate them.

Later-phase difficulty comes from `phaseWeights`; numeric escalation still comes from the existing monster-level curve.


# 5. Wave composition

Initial ordinary mix:

```text
close-range fodder  50%
ranged fodder       30%
specialist          20%
```

Store these ratios in content.

Default featured counts:

```text
Wave 1: 1 elite
Wave 2: 1 elite
```

The system must support two simultaneous elites by changing JSON only:

```ts
interface FeaturedWaveRule {
  waveIndex: 1 | 2;
  eliteCount: number; // valid 0..2
}
```

Recommended content:

```json
{
  "featuredWaves": [
    { "waveIndex": 1, "eliteCount": 1 },
    { "waveIndex": 2, "eliteCount": 1 }
  ],
  "maximumSupportedEliteCountPerWave": 2
}
```

When `eliteCount` becomes `2`, both elites must be unique and the HUD must display two stacked encounter bars.

---

# 6. Shared featured-monster pool

Elites and bosses share one identity pool:

```text
Alien High Detail
Cactoro High Detail
Fish High Detail
Ninja High Detail
Demon High Detail
Yeti High Detail
```

Any identity may appear as an elite or as the final boss.

Represent identity separately from role:

```ts
interface FeaturedMonsterIdentity {
  identityId: string;
  label: string;
  eliteEnemyId: string;
  bossEnemyId: string;
  selectionWeight: number;
}
```

Example:

```json
{
  "identityId": "featuredMonster.demonHighDetail",
  "label": "Demon",
  "eliteEnemyId": "enemy.quaternius.demon-high-detail.elite",
  "bossEnemyId": "enemy.quaternius.demon-high-detail",
  "selectionWeight": 1
}
```

Use existing role definitions where they already exist. Add missing cross-role definitions:

```text
Alien boss
Cactoro boss
Fish boss
Ninja boss
Demon elite
Yeti elite
```

Elite role:

- tier `elite`
- scale ×3
- one melee or one ranged attack
- HP and damage level-scaled
- elite reward

Boss role:

- tier `boss`
- scale ×5
- ordered multi-pattern attack
- at least one ranged pattern
- HP level-scaled
- fixed pattern damage
- boss reward

All cross-role values are provisional and centralized in the roster generator/data table for later tuning.

## Binding featured-repeat rules

- No featured identity repeats anywhere in one match.
- Wave elites are all unique.
- The boss cannot match any elite selected earlier.
- With two elites in one wave, both must be unique.
- Validation requires pool size ≥ total configured elite selections + 1 boss.

All elites and the boss are selected at match creation, not when their encounter begins.


# 7. Authoritative selected-run data

At match creation:

1. Resolve match seed.
2. Select Phase 1, 2, and 3 ordinary rosters.
3. Select all elite identities.
4. Select boss identity from remaining featured identities.
5. Resolve role-specific enemy IDs.
6. Resolve required presentation assets.
7. Replicate the full run selection.
8. Preload selected assets.
9. Begin countdown after readiness.

Recommended replicated structure:

```ts
interface SelectedPhaseRoster {
  closeFodderEnemyId: string;
  rangedFodderEnemyId: string;
  specialistEnemyId: string;
}

interface SelectedFeaturedEncounter {
  identityId: string;
  enemyId: string;
}

interface SelectedMonsterRun {
  gameplayRosterId: string;
  seed: number;
  phases: [SelectedPhaseRoster, SelectedPhaseRoster, SelectedPhaseRoster];
  eliteWaves: SelectedFeaturedEncounter[][];
  boss: SelectedFeaturedEncounter;
}
```

Clients never roll their own selections. Reconnect restores the same data.

Use named deterministic streams:

```text
monsterRoster.phase1
monsterRoster.phase2
monsterRoster.phase3
monsterRoster.eliteWave1
monsterRoster.eliteWave2
monsterRoster.boss
monsterSpawn
monsterDrops
```

Remove authoritative `Math.random()` from monster spawning and drop scatter.

---

# 8. Production horde integration

Create `horde.mainStage.production` with:

- `enforceStage: true`
- production stage sequence
- production gameplay-roster reference
- selected-slot spawn resolution
- production waves and boss wave
- no legacy rammer boss

Production timing:

```text
Phase 1  0–60
Wave 1   at 60
Phase 2  60–120
Wave 2   at 120
Phase 3  120–180
Boss     at 180
```

Set:

```text
pauseCountdownDuringWave = false
```

Progression selection pauses simulation, so it pauses the countdown automatically.

Spawn packs should resolve symbolic selected slots rather than hardcoded monster IDs:

```text
selected.phase.closeFodder
selected.phase.rangedFodder
selected.phase.specialist
selected.wave.elite
selected.boss
```

Resolve these into a match-scoped horde plan. Do not rewrite JSON at runtime.

Boss phase:

```text
1 selected boss
4–6 escorts from Phase 3 ordinary roster
```

Escort count is data-driven.


# 9. Live match state and results

Add authoritative production state:

```ts
type MonsterMatchPhase =
  | 'FARMING'
  | 'BOSS_INTRO'
  | 'BOSS_ACTIVE'
  | 'RESULTS';

interface MonsterRunState {
  phase: MonsterMatchPhase;
  farmingPhaseIndex: 0 | 1 | 2;
  currentMonsterLevel: number;
  nextWaveAt: number;
  bossIntroRemaining: number;
  activeEliteEnemyIds: number[];
  activeBossEnemyId?: number;
  selectedRun: SelectedMonsterRun;
  resultReason?: 'bossDefeated' | 'tankDestroyed';
}
```

At 60 and 120 simulation seconds:

- emit wave warning
- spawn the elite encounter for the phase that just ended
- keep that phase's ordinary roster for the wave
- advance the farming roster
- reset time until next wave to 60

At 180 seconds:

- stop farming spawns
- enter `BOSS_INTRO`
- emit `BOSS INCOMING`
- spawn boss and Phase 3 escorts after intro
- enter `BOSS_ACTIVE`

Production defeat:

```text
tank integrity reaches zero
→ RESULTS defeat
→ no respawn
```

Production victory:

```text
active boss dies
→ RESULTS victory
```

Elite death never ends the stage.


# 10. Combat, progression, and cleanup wiring

## Melee reservations

Make the existing reservation manager match-scoped. Before melee attack behaviors:

1. collect living eligible melee monsters
2. resolve normalized collision diameter
3. update reservations deterministically
4. write ownership into runtime
5. execute attack behaviors

Only reservation owners may apply melee damage.

Release on death, distance, displacement, phase transition, results, and rematch.

## XP

On generalized-monster death:

1. read spawn-locked `resolvedRewardXp`
2. award exactly once
3. spawn value-bearing visual XP bundles
4. preserve Single Player ×2 resolved at spawn
5. emit telemetry

Recommended visible bundles:

```text
ordinary ambient  1 shard
wave ordinary     1–2 shards
elite             3–5 shards
boss              6–10 shards
```

Visual count is separate from XP value. Split value deterministically.

## Telegraphs

Ranged ordinary and ranged boss attacks follow:

```text
attack accepted
→ telegraph
→ semantic Attack action
→ normalized cue
→ one projectile
→ cooldown completion
```

Do not fire immediately without telegraphing.

## Death cleanup

On death:

- cancel pending attack cycle
- prevent future cues
- release reservation
- clear telegraph
- emit Death once
- award XP once
- remove encounter-bar binding
- trigger boss victory when applicable
- clean runtime after presentation delay

Death cannot return to Idle or Walk.

## Projectile allegiance

Enemies cannot damage enemies.

Add:

```ts
team: 'player' | 'enemy';
ownerEnemyId?: number;
```

Rules:

```text
player projectile → enemies
enemy projectile  → tank
enemy projectile  → ignores all enemies
```


# 11. Animation and model normalization

Connect authoritative semantic actions:

```text
Idle
Walk
Attack
Death
```

Use stable sequences. LOD changes preserve action, attack progress, cue-fired state, HP, spawn level, and Death lock.

Generate a model-family dimension cache:

```text
small  1.02 m
medium 1.53 m
large  1.70 m

ordinary/specialist ×1
elite ×3
boss ×5
```

Cache:

- normalization scale
- ground offset
- collision radius/height
- spawn clearance
- engagement radius
- shadow radius
- projectile socket
- near/far/aggregate envelope validation

Do not scan bounds per spawn.

Replace hardcoded projectile origins with normalized sockets.

---

# 12. Asset preloading and networking

Only preload assets selected for the current run.

Selected assets include:

- three ordinary phase rosters
- all selected elite identities
- selected boss identity
- needed near/far/aggregate/hero variants

Multiplayer:

```text
server selects run
→ reliable run-config message
→ clients preload
→ clients send asset-ready
→ countdown starts after readiness or explicit timeout
```

Single Player:

```text
select run
→ await preload
→ start match
```

Do not preload all Quaternius assets at generic startup.


# 13. Interim HUD policy

This task adds only the minimum production HUD. A full HUD redesign comes later.

## Wave timer

Use the exact label:

```text
TIME UNTIL NEW WAVE
```

Display simulation-time countdown to 60, 120, and 180 seconds.

At boss transition:

```text
BOSS INCOMING
```

During boss combat, hide or replace the wave timer.

Do not call it “Farming Time Remaining.”

## Encounter bars

Do not add fodder/ordinary overhead health bars in this task.

Add large screen-space encounter bars for:

- active elites
- active boss

Default one elite means one large bar.

When JSON enables two elites, show two stacked bars bound to distinct enemy IDs.

Boss uses one primary boss bar.

Bars display monster name and authoritative current/max HP, then clear on death, results, and rematch.

Also expose:

- current monster level
- existing XP/player-level UI
- wave warning
- boss intro
- victory/defeat

Keep components modular for the later HUD reorganization.


# 14. Reset and future tuning

Rematch resets:

- selected phase rosters
- selected elites and boss
- phase/timers/level
- reservation ownership
- attack sequences
- telegraphs
- projectiles
- action cues
- encounter bars
- progression
- RNG streams
- horde cohorts
- aggregate sectors
- asset readiness

The current 39 ordinary stat sets are accepted as provisional.

Requirements:

- one generator/data table remains the source of truth
- no balance values move into runtime switches
- telemetry supports later tuning
- schemas remain compatible with a future game-config laboratory
- the config laboratory itself is out of scope

---

# 15. Phased implementation plan

## Phase A — Production content and selection

- production modes/objective/results
- gameplay-roster schema/content
- weighted phase selection
- shared featured identity pool
- missing cross-role definitions
- deterministic selected-run state
- validation/tests

## Phase B — Horde and match flow

- production horde director
- selected-slot spawn plan
- wave/phase/boss transitions
- tank-destruction defeat
- boss-death victory
- timer pause behavior
- replication/reset

## Phase C — Combat and progression

- reservation manager integration
- XP award and bundles
- telegraphs
- death cleanup
- projectile allegiance
- deterministic spawn/drop RNG

## Phase D — Presentation and HUD

- semantic action cues
- normalization cache
- normalized collision/sockets
- selected-asset preloading
- wave timer
- elite/boss encounter bars

## Phase E — Qualification

- full Single Player run
- two-client run
- one-elite default
- two-elite data configuration
- all six identities as elite and boss
- rematch cleanup
- performance and telemetry reports

Each phase must end buildable and tested. At a model-context boundary, stop only at a phase boundary and write a handoff.

---

# 16. Acceptance criteria

```text
[ ] Production multiplayer and Single Player modes exist
[ ] Demo modes remain unchanged
[ ] Multiplayer progression enabled

[ ] Gameplay roster separate from art roster
[ ] Every phase selects close fodder, ranged fodder, specialist
[ ] Following wave reuses that phase roster
[ ] No duplicate within phase
[ ] No consecutive ordinary repeat
[ ] Phase 1 repeat allowed in Phase 3
[ ] Later difficulty controlled through phaseWeights

[ ] Shared featured identity pool
[ ] All six identities support elite and boss roles
[ ] One elite per wave by default
[ ] Two elites configurable through JSON
[ ] No featured identity repeats in one match
[ ] Boss excludes all selected elites

[ ] Run selection deterministic and replicated
[ ] Selected assets preload before countdown
[ ] Production horde spawns generalized monsters
[ ] 180-second countdown does not pause for waves
[ ] Countdown pauses during progression selection
[ ] Boss escorts use Phase 3 roster

[ ] Tank destruction causes defeat
[ ] Boss death causes victory
[ ] No production respawn

[ ] Melee reservations active
[ ] XP awarded exactly once
[ ] Visual XP bundles preserve total value
[ ] Telegraphs active
[ ] Death cleanup complete
[ ] Enemy projectiles ignore enemies
[ ] Authoritative Math.random removed

[ ] Animation actions connected
[ ] Normalization cache used
[ ] Projectile sockets normalized
[ ] TIME UNTIL NEW WAVE shown
[ ] Elite encounter bars work
[ ] Two stacked elite bars work
[ ] Boss encounter bar works
[ ] Fodder overhead bars remain out of scope

[ ] Rematch fully resets
[ ] Provisional stats remain centralized
[ ] Full SP and multiplayer qualification passes
[ ] Branch remains unmerged
```
