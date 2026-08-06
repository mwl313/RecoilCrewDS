# Codex Master Prompt — Connect the Monster System Into the Production Core Loop

Repository:

```text
https://github.com/mwl313/RecoilCrewDS
```

Target branch:

```text
monster-system
```

Reviewed implementation-report head:

```text
1f62372
```

Binding documents:

```text
docs/monster-system/RECOIL_CREW_MONSTER_SYSTEM_DESIGN.md
docs/monster-system/MONSTER_CORE_LOOP_INTEGRATION_DESIGN.md
```

The integration design contains the latest resolved decisions. Follow it exactly.

The branch already has most subsystem pieces. This task connects them into the actual playable production game.

Do not rebuild the Monster Pack import, animation profiles, presentation profiles, level formulas, spawn-lock math, contact-DPS math, reservation manager, enemy-projectile foundation, or aggregate renderer.

---

# 1. Execution strategy

Implement sequentially:

```text
Phase A — Production content and deterministic run selection
Phase B — Production horde and live match flow
Phase C — Combat, XP, death, projectile and RNG wiring
Phase D — Presentation, normalization, preload and HUD
Phase E — End-to-end qualification
```

Requirements:

- Keep the repository buildable at every phase boundary.
- Add focused tests before moving to the next phase.
- Commit each phase separately.
- If context is running low, stop only after a complete tested phase.
- Write `docs/monster-system/CORE_LOOP_PHASE_HANDOFF.md` with exact status and next steps.
- Do not mark live integration complete merely because helper modules exist.

---

# 2. Safety and audit

Run:

```bash
git fetch origin
git status --short
git branch --show-current
git rev-parse HEAD
git log --oneline --decorate -12
```

Work on `monster-system`. Preserve newer valid work. Do not merge into `main`.

Do not import the failed environment-object experiment.

Read:

```text
docs/monster-system/RECOIL_CREW_MONSTER_SYSTEM_DESIGN.md
docs/monster-system/MONSTER_CORE_LOOP_INTEGRATION_DESIGN.md
docs/monster-system/MONSTER_SYSTEM_IMPLEMENTATION_REPORT.md
docs/monster-system/MONSTER_SYSTEM_QUALIFICATION_REPORT.md

content/modes/
content/objectives/
content/horde/
content/enemies/
content/enemy-art-rosters/
content/projectiles/
content/manifest.json

src/shared/content/
src/shared/types.ts
src/shared/sim/matchRuntime.ts
src/shared/sim/systems/systemContext.ts
src/shared/enemies/enemySystem.ts
src/shared/enemies/enemyBehaviors.ts
src/shared/enemies/enemyRuntimeState.ts
src/shared/monsters/
src/shared/projectiles/projectileSystem.ts
src/shared/drops/dropTableResolver.ts
src/shared/horde/
src/shared/stage/
src/shared/progression/
src/client/
src/server/
scripts/generate-monster-roster.ts
tests/
```

Confirm current gaps in code.

Do not modify the permanent Demo fixture into production content:

```text
mode.demoScoreAttack
objective.highScore
spawn.director.demoScoreAttack
```


# PHASE A — Production content and deterministic run selection

## A1. Production modes and objective

Create:

```text
mode.mainStage
mode.singlePlayerMainStage
objective.mainStage
results.mainStage
```

Both production modes:

- use `map.rocketJumpHighlands`
- enable progression
- use production horde content
- use production gameplay roster
- use tank-destruction defeat
- use boss-death victory

Multiplayer keeps assigned roles/network/rematch vote.

Single Player keeps combined controls/local restart and XP ×2.

Enemy difficulty is identical.

The production objective must not auto-complete at 90 or 180 seconds. Stage/boss flow owns results.

## A2. Gameplay-roster content category

Add:

```text
enemyGameplayRosters
src/shared/content/schemas/enemyGameplayRoster.ts
content/enemy-gameplay-rosters/quaternius.mainStage.json
```

Recommended ID:

```text
enemyGameplayRoster.quaternius.mainStage
```

Register it in:

- content manifest
- ContentPack
- loader
- reference validator
- generated pack
- tests

Required data:

```ts
type OrdinaryRosterSlot =
  | 'closeFodder'
  | 'rangedFodder'
  | 'specialist';

interface OrdinaryRosterCandidate {
  enemyId: string;
  slot: OrdinaryRosterSlot;
  phaseWeights: [number, number, number];
}

interface FeaturedMonsterIdentity {
  identityId: string;
  label: string;
  eliteEnemyId: string;
  bossEnemyId: string;
  selectionWeight: number;
}
```

Roster also includes:

```text
phaseDurationSeconds = 60

ordinary mix:
close 0.50
ranged 0.30
specialist 0.20

wave 1 eliteCount = 1
wave 2 eliteCount = 1
maximum supported elite count = 2

boss escorts = 4–6
```

## A3. Ordinary candidate validation

Validate:

- close fodder = fodder + melee
- ranged fodder = fodder + ranged
- specialist = specialist tier
- enemy references exist
- weights are finite/non-negative
- at least one weight is positive
- every phase/slot has candidates
- no duplicate candidate IDs
- consecutive-repeat avoidance is feasible

Later-phase strength uses only `phaseWeights`.

Do not add another difficulty formula.

## A4. Shared featured pool

Initial identities:

```text
alien-high-detail
cactoro-high-detail
fish-high-detail
ninja-high-detail
demon-high-detail
yeti-high-detail
```

Any identity may be an elite or boss.

Use current role definitions where they exist. Add:

```text
Alien boss
Cactoro boss
Fish boss
Ninja boss
Demon elite
Yeti elite
```

Do not implement identity-name runtime switches.

Elite role:

```text
tier elite
tierScale 3
one melee or ranged attack
HP/damage level-scaled
elite reward
```

Boss role:

```text
tier boss
tierScale 5
ordered multi-pattern attack
at least one ranged pattern
HP level-scaled
damage fixed
boss reward
```

Use provisional values based on existing role definitions and reusable archetypes. Keep them centralized in the generator/data table.

## A5. Featured selection validation

Required unique identities:

```text
sum(configured eliteCount values) + 1 boss
```

Reject insufficient pools.

No identity may repeat in one match.

The boss excludes all elite identities.

Changing elite count from one to two must require JSON only.

## A6. Deterministic selection

Create a module such as:

```text
src/shared/monsters/monsterRunSelection.ts
```

It returns:

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

Algorithm:

1. Stable-sort candidates.
2. Weighted select each Phase 1 slot.
3. Select Phase 2 slots excluding identities used in Phase 1.
4. Select Phase 3 slots excluding identities used in Phase 2.
5. Phase 1 identities may return in Phase 3.
6. Select all elite identities without replacement.
7. Select boss from remaining featured identities.

Use named deterministic PRNG streams, never `Math.random()`.

Store selection in authoritative match-start state/config and replicate it.

## A7. Phase A tests

Test:

- same seed = same run
- different seed variation
- exact three slots
- no within-phase duplicate
- no consecutive repeat
- Phase 1 repeat allowed in Phase 3
- zero weights exclude candidates
- elite uniqueness
- boss exclusion
- one-elite default
- two-elite JSON configuration
- insufficient pool validation
- all IDs resolve

## A8. Phase A completion

Run typecheck, content generation, focused tests, full tests, and build.

Commit:

```text
monster-core-loop: add production roster selection and featured identities
```

Write handoff.


# PHASE B — Production horde and live match flow

## B1. Production horde director

Create:

```text
horde.mainStage.production
```

It must use:

- `enforceStage: true`
- production stage sequence
- gameplay-roster reference
- production spawn packs
- production waves
- production boss wave

Do not turn the Demo director into production.

## B2. Stage timing

Required timeline:

```text
0–60     Phase 1
60        Wave 1
60–120   Phase 2
120       Wave 2
120–180  Phase 3
180       Boss intro
after     Boss active
```

Set:

```text
pauseCountdownDuringWave = false
```

Progression selection pauses simulation, therefore it pauses the timer.

## B3. Selected-slot horde resolution

Production spawn content must not hardcode ordinary monster IDs.

Support symbolic slots:

```text
selected.phase.closeFodder
selected.phase.rangedFodder
selected.phase.specialist
selected.wave.elite
selected.boss
```

Resolve them into a match-scoped horde plan at setup.

The wave after each phase reuses the same ordinary phase roster.

Boss escorts use Phase 3.

Do not mutate JSON at runtime.

## B4. Production packs

Add data-driven packs for:

```text
farming clusters
mixed farming groups
wave cohort
boss escort cohort
```

Initial mix:

```text
50% close
30% ranged
20% specialist
```

Use current horde population/threat systems.

Do not reduce the design population for convenience.

## B5. Authoritative run state

Add:

```ts
interface MonsterRunState {
  phase: 'FARMING' | 'BOSS_INTRO' | 'BOSS_ACTIVE' | 'RESULTS';
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

Replicate required state.

## B6. Live transitions

At 60 and 120 simulation seconds:

- emit wave warning
- spawn configured elite count
- use the phase roster that just completed
- advance ordinary farming roster
- reset time until next wave

At 180:

- stop farming spawns
- enter boss intro
- emit boss incoming
- spawn selected boss and 4–6 Phase 3 escorts
- enter boss active

## B7. Results

Production mode:

```text
tank integrity reaches zero
→ defeat
→ no respawn
```

Keep Demo respawn.

Boss death:

```text
victory
```

Elite death never ends the match.

## B8. Timer source

Use paused simulation time, not wall time.

Upgrade and relic selection pause:

- movement
- spawning
- attacks
- projectiles
- horde timer
- time until next wave

## B9. Reset

Reset all run selection, phase, waves, boss, elite, horde and PRNG state on rematch.

## B10. Phase B tests

Test:

- production modes use production horde
- Demo unchanged
- 60/120 waves
- 180 enters boss intro, not results
- wave does not pause countdown
- progression selection pauses countdown
- wave roster matching
- boss escorts use Phase 3
- tank death defeat/no respawn
- boss death victory
- elite death not victory
- clean rematch

## B11. Phase B completion

Commit:

```text
monster-core-loop: activate production horde and boss match flow
```

Run regression and simulation gates. Write handoff.


# PHASE C — Combat, XP, death, projectile and RNG wiring

## C1. Melee reservations

Add the existing `MeleeReservationManager` to match-scoped runtime.

Before monster attack behaviors:

1. collect living melee candidates
2. use normalized collision diameter
3. update manager deterministically
4. write reservation ownership to runtime
5. execute behaviors

Only owners attack.

Release on death, range, displacement, boss intro, results, and reset.

Bosses do not consume ordinary slots.

## C2. XP award

On generalized-monster death:

```text
read spawn-locked resolvedRewardXp
award once
spawn value-bearing visual shard bundle
```

Add an award-once guard.

Do not recalculate XP at death.

Use existing `XpShardSystem`.

Single Player multiplier is already part of the spawn-locked value.

## C3. Visual XP bundles

Add validated policy or equivalent centralized data:

```text
ambient ordinary  1 visible shard
wave ordinary     1–2
elite             3–5
boss              6–10
```

Split total XP deterministically.

Visual count and XP value are separate.

## C4. Telegraph lifecycle

For ranged ordinary and ranged boss patterns:

```text
accepted
→ telegraph begins
→ semantic Attack begins
→ normalized cue
→ exactly one projectile
→ cooldown completion
```

Use authored `telegraphTime`.

Replicate visible telegraph state/event.

## C5. Death cleanup

On death:

- cancel pending attack runtime
- block future cues
- release reservation
- clear telegraph
- emit Death once
- award XP once
- remove featured HUD binding
- trigger boss victory if active boss
- clean runtime after death presentation

Expose clean public APIs where necessary.

## C6. Projectile allegiance

Add:

```ts
team: 'player' | 'enemy';
ownerEnemyId?: number;
```

Rules:

```text
player projectile → enemies
enemy projectile  → tank
enemy projectile  → ignores enemies
```

Enemy melee targets only the tank.

No friendly fire.

## C7. Deterministic randomness

Replace authoritative `Math.random()` in:

- monster spawn placement
- drop scatter
- roster selection
- featured selection
- touched monster paths

Use named match-scoped streams and stable draw order.

## C8. Phase C tests

Test:

- reservation ownership reaches runtime
- owner attacks
- non-owner cannot damage
- death releases
- XP once
- shard values sum correctly
- SP reward stays doubled
- telegraph precedes shot
- cue fires once
- death cancels pending shot
- enemy projectile ignores enemies
- tank/terrain/obstacle collision still works
- same seed = same spawn/drop scatter
- no authoritative `Math.random()` remains in scoped paths

## C9. Phase C completion

Commit:

```text
monster-core-loop: wire combat progression and deterministic authority
```

Run monster, progression and netcode suites. Write handoff.


# PHASE D — Presentation, normalization, preload and HUD

## D1. Semantic action controller

Connect:

```text
Idle
Walk
Attack
Death
```

Use stable sequence numbers.

Rules:

- moving and not attacking → Walk
- stationary and not attacking → Idle
- accepted attack → Attack
- death → Death lock

LOD transitions preserve action, sequence, attack progress, cue-fired state, HP, level and Death lock.

Animation callbacks never decide damage.

## D2. Normalization cache

Generate/cache per-family:

- target height
- normalization scale
- ground offset
- collision radius/height
- spawn clearance
- engagement radius
- shadow radius
- projectile socket
- near/far/aggregate envelope

Targets:

```text
small 1.02 m
medium 1.53 m
large 1.70 m

ordinary/specialist ×1
elite ×3
boss ×5
```

No per-spawn bounds scan.

Replace hardcoded projectile Y offsets with normalized sockets.

Use normalized dimensions for collision/reservations.

## D3. Selected asset preload

At selected-run creation:

1. resolve selected enemy definitions
2. resolve presentation profiles
3. collect near/far/aggregate/hero asset IDs
4. dedupe
5. preload before countdown

Single Player waits locally.

Multiplayer:

```text
server run config
→ client preload
→ asset-ready
→ countdown
```

Add explicit timeout/error behavior.

Do not preload all optional monsters at startup.

## D4. Wave HUD

Exact label:

```text
TIME UNTIL NEW WAVE
```

Count down using simulation time to 60, 120 and 180.

At 180:

```text
BOSS INCOMING
```

During boss active, hide or replace wave timer.

Do not label it farming time.

## D5. Encounter bars

Do not add ordinary/fodder overhead bars.

Add large screen-space bars for:

```text
active elite
active boss
```

Default:

```text
one elite bar
```

Two-elite JSON config:

```text
two stacked independent bars
```

Boss:

```text
one primary boss bar
```

Display name and authoritative HP/max HP.

Clear on death/results/rematch.

Keep component modular for later HUD redesign.

## D6. Other interim HUD

Expose:

- current monster level
- existing XP/player-level UI
- wave warning
- boss intro
- victory/defeat

Do not broadly reorganize the HUD.

## D7. Phase D tests

Test:

- action sequences
- Death lock
- no attack duplication on LOD swap
- finite normalization for used assets
- correct 1/3/5 tier scale
- plausible sockets
- only selected assets preload
- countdown waits for readiness
- exact wave label
- elite HP bar tracking
- two stacked bars from JSON
- boss bar tracking
- rematch clearing

## D8. Phase D completion

Commit:

```text
monster-core-loop: connect presentation normalization preload and encounter HUD
```

Run animation, rendering, browser and build gates. Write handoff.


# PHASE E — Qualification

## E1. Content checks

Verify:

- original 45 definitions remain valid
- six featured identities each have elite and boss role definitions
- gameplay roster valid
- art roster preserved
- production modes valid
- production horde has no legacy boss

Record all provisional cross-role stats.

## E2. Selection matrix

Use fixed seeds to prove:

- no consecutive ordinary repeat
- Phase 1 identities may return in Phase 3
- phase weights control later pools
- elite identities never repeat
- boss never matches an elite
- one-elite default
- two-elite data option
- SP and server choose same run for same seed

## E3. Full Single Player qualification

Run:

```text
Phase 1
Wave 1
Phase 2
Wave 2
Phase 3
Boss intro
Boss active
Victory
```

Also test tank-destruction defeat.

Record:

- seed
- selected rosters
- elites
- boss
- level timings
- player progression timings
- boss TTK
- HUD behavior
- performance

## E4. Full multiplayer qualification

Use two clients.

Verify:

- same selected run
- preload readiness
- progression enabled
- timer pauses during selections
- action/telegraph/projectile agreement
- encounter-bar agreement
- boss result agreement
- rematch reset

## E5. Featured role qualification

All six identities must validate as:

```text
elite
boss
```

Automate all 12 role-definition checks.

Manually inspect representative cross-role cases.

## E6. Performance

Run existing near/far/aggregate benchmarks plus a full mixed production run.

Track:

- draw calls
- mixers
- loaded bytes
- enemy/projectile count
- reservation cost
- frame percentiles
- rematch cleanup

Do not reduce population without documenting a balance decision.

## E7. Reports

Create/update:

```text
docs/monster-system/MONSTER_CORE_LOOP_IMPLEMENTATION_REPORT.md
docs/monster-system/MONSTER_CORE_LOOP_QUALIFICATION_REPORT.md
docs/monster-system/MONSTER_CORE_LOOP_AUTHORING_GUIDE.md
```

Authoring guide explains:

- phase weights
- adding ordinary candidates
- wave ratios
- setting elite count to 2
- adding a featured identity
- elite/boss role definitions
- XP visual policy
- encounter bars
- future config-lab compatibility

## E8. Phase E completion

Commit:

```text
monster-core-loop: qualify production loop and document tuning
```

Leave branch unmerged.


# Required commands

Inspect `package.json` and use exact available scripts.

Run current equivalents of:

```bash
npx tsc --noEmit
npm run generate:content-pack
npm run generate:presentation-content
npm run generate:map-profiles
npm test
npm run build
npm run test:demo
npm run test:horde
npm run test:horde:benchmark
npm run test:netcode
npm run test:progression
npm run validate:enemy-animations
npm run test:monsterpack-import
npm run test:monsterpack-rendering
```

Add focused tests/scripts for:

```text
gameplay roster
run selection
production flow
melee integration
XP award
projectile allegiance
action cues
normalization
asset readiness
encounter HUD
full production run
```

Do not claim browser or multiplayer verification unless actually run.

---

# Forbidden shortcuts

Do not:

- turn Demo mode into production mode
- hardcode selected monster IDs in simulation
- use the art roster for gameplay selection
- allow consecutive ordinary repeats
- allow featured identity repeats
- allow boss identity to match an elite
- require code changes for two elites
- pause countdown during elite waves
- continue countdown during progression selection
- respawn tank in production
- end match at 180 seconds
- use legacy rammer boss
- leave reservations disconnected
- recalculate XP at death
- spawn one shard per XP point
- fire ranged attacks without telegraph
- leave attack cues after death
- let enemy projectiles collide with enemies
- use authoritative `Math.random()`
- scan GLB bounds per spawn
- keep hardcoded projectile Y offsets after normalization
- preload all optional monsters at startup
- add fodder overhead health bars
- redesign the entire HUD
- hide failures with golden updates
- merge into main

---

# Final acceptance checklist

```text
[ ] Production MP/SP modes work
[ ] Demo unchanged
[ ] Multiplayer progression enabled

[ ] Three-slot phase rosters
[ ] Following waves reuse roster
[ ] No consecutive ordinary repeat
[ ] Phase weights control later difficulty
[ ] Phase 1 repeat allowed in Phase 3

[ ] Shared featured pool
[ ] Six identities support elite and boss roles
[ ] One elite per wave default
[ ] Two elites configurable in JSON
[ ] No featured repeats
[ ] Boss excludes elites

[ ] Selection deterministic and replicated
[ ] Selected assets preload before countdown
[ ] Production horde uses generalized monsters
[ ] Timer does not pause for waves
[ ] Timer pauses for progression selection

[ ] Tank destruction defeat
[ ] Boss death victory
[ ] No production respawn

[ ] Reservations active
[ ] XP awarded once
[ ] XP bundles preserve value
[ ] Telegraphs active
[ ] Death cleanup complete
[ ] Enemy projectiles ignore enemies
[ ] Authoritative randomness removed

[ ] Actions connected
[ ] Normalization cache used
[ ] Sockets normalized
[ ] TIME UNTIL NEW WAVE shown
[ ] Elite bars
[ ] Two-elite stacked bars
[ ] Boss bar
[ ] No fodder overhead bars

[ ] Rematch clean
[ ] Provisional stats centralized
[ ] Full SP test
[ ] Full two-client test
[ ] Performance test
[ ] Reports complete
[ ] Branch unmerged
```

---

# Final report

Report:

1. Starting/final SHA
2. Commits by phase
3. Production modes/content
4. Gameplay roster schema
5. Phase weights
6. Featured identity architecture
7. Cross-role definitions
8. Deterministic selection
9. Replication/preload
10. Horde/match flow
11. Defeat/victory
12. Reservation integration
13. XP/bundles
14. Telegraph/death lifecycle
15. Projectile allegiance
16. RNG migration
17. Animation/normalization
18. HUD
19. Tests actually run
20. SP/multiplayer seeds and outcomes
21. Boss TTK
22. Performance
23. Provisional balance notes
24. Remaining tuning-only work
25. Demo unchanged confirmation
26. Branch-unmerged confirmation
