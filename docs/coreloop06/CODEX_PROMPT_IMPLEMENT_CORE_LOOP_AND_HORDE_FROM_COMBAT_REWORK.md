# Codex Prompt — Implement Core Loop and Horde Spawn System
## Canonical base: completed `combat-rework` branch

Repository:

```text
https://github.com/mwl313/RecoilCrewDS
```

Canonical implementation branch:

```text
combat-rework
```

Binding design document:

```text
docs/coreloop06/CORE_LOOP_AND_HORDE_SPAWN_SYSTEM_DESIGN.md
```

Completed combat foundation:

```text
docs/combat05/COMBAT05_IMPLEMENTATION_REPORT.md
docs/combat05/COMBAT05_DASH_CHARGE_AND_TURRET_RESPONSIVENESS_DESIGN.md
```

---

# Branch and source-of-truth rule

This task starts from the completed `combat-rework` branch.

Treat `combat-rework` as the sole source of truth.

Do not:

```text
merge another branch
rebase onto another branch
cherry-pick older implementations
restore code from main
create compatibility with the pre-Combat-05 architecture
```

Work directly on the current `combat-rework` checkout.

Before editing:

```bash
git fetch origin
git switch combat-rework
git pull --ff-only origin combat-rework
git status --short
git branch --show-current
git log --oneline -12
```

Required branch result:

```text
combat-rework
```

The working tree must be clean before implementation.

Do not reset or discard user work.

---

# Design-document setup

Locate:

```text
CORE_LOOP_AND_HORDE_SPAWN_SYSTEM_DESIGN.md
```

The file may already be at:

```text
docs/coreloop06/CORE_LOOP_AND_HORDE_SPAWN_SYSTEM_DESIGN.md
```

or may have been supplied in the repository root.

When it is in the root, create:

```text
docs/coreloop06/
```

and move/copy the design document there without changing its meaning.

Read the entire design before implementing.

Treat it and this prompt as the binding contract.

When a small implementation detail is not specified:

1. Preserve current architecture.
2. Use the most data-driven and modular option.
3. Record the decision in the implementation report.
4. Do not invent final monster balance values without benchmarking.

---

# Mission

Implement the complete foundational core-loop and horde architecture described by the design document.

The system must provide:

- A three-minute farming countdown
- Wave 1 at 2:00 remaining
- Wave 2 at 1:00 remaining
- Boss Wave at 0:00 remaining
- Countdown paused during every active wave
- Elite death as Wave 1 and Wave 2 clear condition
- Boss death as stage-clear condition
- Immediate game over when tank integrity reaches zero
- Continuously replenished ambient farming monsters
- Ambient monsters that survive wave clear
- Temporarily tagged wave cohorts
- Only the matching cohort purged when its leader dies
- Finite wave reinforcement budgets
- Leader rewards concentrated at the leader
- No XP, drops, or kill-trigger effects from purge deletion
- Data-driven spawn packs
- Terrain-aware deterministic spawn planning
- Shared flow-field horde navigation
- Spatial enemy queries
- Removal of O(n²) pairwise separation
- Scalable enemy simulation LOD
- Instanced and pooled fodder rendering
- Tiered Multiplayer replication
- Optional far-horde sector aggregation
- Identical gameplay difficulty in Single Player and Multiplayer
- Expandable schemas and runtime contracts
- Measured rather than assumed enemy-cap targets

The current enemy types are technical placeholders.

Do not treat these as final content:

```text
Scrap Bug
Rammer
Gun Tower
Loot Truck
legacy demo score-attack composition
```

The architecture must support replacing them later through content.

---

# Current Combat 05 foundation that must remain intact

The completed branch already establishes the following contracts.

## Contact combat

```text
normal slow contact damage = 0
normal high-speed contact damage = 0
only accepted Dash opens an offensive contact window
TankState.dashDamageT is authoritative
TankContactCombat owns Dash contact damage
damage source is dash
```

Do not restore speed-based `999` ram kills.

The horde spatial index must integrate with the existing Dash contact service.

## Turret and action-time aim

```text
default turret response mode = instant
local turret follows mouse in the same frame
server validates and applies instant accepted aim
snapshot reconciliation does not make local aim sticky
Gunner actions carry click/release-time aim
```

Current protocol foundation:

```text
PROTOCOL_VERSION = 3
```

Any horde protocol changes must deliberately increment from the actual current version.

## Fall damage

```text
tank fall damage removed
enemy fall damage removed
fall damage source removed
landing and knockback physics remain
```

Do not restore any fall-damage fields or callbacks.

## Charge Shot

```text
cannon.charge capability
generic CapabilitySystem
relicCannonCharge grants capability
RMB tap = normal cannon
RMB hold/release = partial or full charge
full charge clamps at 100%
full charge never auto-fires
Charge Shot remains weapon.mainCannon
damage source remains cannon
all cannon modifiers affect charge
```

The horde damage and area-query systems must consume the final cannon projectile payload.

Do not create a separate charged-cannon damage category.

## Jackpot removal

The completed branch removed:

```text
JackpotSystem
Jackpot meter
Jackpot weapon
Jackpot projectile
Jackpot pickup
Jackpot damage source
Jackpot loadout ability
Jackpot result fields
```

Do not restore Jackpot terminology or mechanics.

The optional deprecated `GunnerInput.ability` fixture field is not a production gameplay path.

---

# Existing architecture to preserve

The current branch already includes:

- Server-authoritative Multiplayer
- Local-authoritative Single Player
- Shared Driver/Gunner vehicle prediction
- Immediate Gunner action messages
- Exact tank impulse events
- Data-driven ContentPack and MatchRules
- Separate Single Player and Multiplayer session policies
- Shared tank-rig and muzzle geometry
- Truthful trajectory crosshair
- Generated terrain maps
- Mega Bonk Highlands
- Content-driven HUD and scenes
- Semantic asset service
- Capability and StatResolver systems
- Fixed authoritative simulation
- Snapshot/interpolation network foundation

Do not rewrite these unrelated foundations.

Integrate the horde architecture around them.

---

# Identical-difficulty invariant

Single Player and Multiplayer must resolve the same gameplay definitions for:

```text
stage sequence
farming countdown
ambient target curves
spawn income
spawn packs
wave opening composition
wave reinforcement budget
elite stats
boss stats
enemy HP
enemy damage
enemy speed
XP values
reward tables
population soft caps
technical hard cap
navigation rules
simulation outcome
```

Allowed differences:

```text
local versus server authority
combined versus assigned controls
network transport
connection UI
results flow
render settings
```

Forbidden implicit differences:

```text
lower Single Player counts
lower Single Player threat
fewer Single Player attack directions
lower Single Player enemy stats
different Single Player wave packs
different Single Player rewards
```

Add tests proving both mode definitions resolve the same stage/horde gameplay definition.

---

# Required first deliverables

Before changing gameplay, create:

```text
docs/coreloop06/CORELOOP06_CODE_AUDIT.md
docs/coreloop06/CORELOOP06_BASELINE_REPORT.md
docs/coreloop06/CORELOOP06_BENCHMARK_PLAN.md
```

Then continue implementation.

Do not stop after documentation.

---

# Code audit requirements

Inspect the actual `combat-rework` code.

At minimum inspect:

```text
package.json

content/modes/
content/objectives/
content/spawn-directors/
content/enemies/
content/scoring/
content/results/
content/hud/
content/maps/
content/terrain-profiles/
content/validation-profiles/
content/tanks/
content/weapons/
content/items/

src/shared/types.ts
src/shared/config.ts
src/shared/content/
src/shared/rules/

src/shared/sim/match.ts
src/shared/sim/matchRuntime.ts
src/shared/sim/systems/
src/shared/sim/arenaWorld.ts

src/shared/spawning/spawnDirectorRuntime.ts
src/shared/enemies/enemySystem.ts
src/shared/enemies/enemyBehaviors.ts
src/shared/enemies/enemyRuntimeState.ts
src/shared/enemies/enemyImpulseController.ts

src/shared/combat/tankContactCombat.ts
src/shared/projectiles/projectileSystem.ts
src/shared/weapons/cannonShotProfile.ts
src/shared/items/capabilitySystem.ts

src/shared/mapgen/
src/shared/net/
src/server/room.ts

src/client/app/entityViewFactory.ts
src/client/app/entityViewRegistry.ts
src/client/app/gameClient.ts
src/client/app/renderWorld.ts
src/client/presentation/
src/client/assets/

tests/
e2e/
scripts/
tools/
```

Record:

- Current phase and timer ownership
- Current round-end behavior
- Current Single Player match construction
- Current Multiplayer match construction
- Current spawn-director schema and runtime
- Current enemy spawn ownership
- Current enemy removal behavior
- Every full-population scan
- Current separation complexity
- Current explosion and splash query complexity
- Current Dash-contact query path
- Current enemy update frequency
- Current terrain traversal behavior
- Current rendering object allocation
- Current client entity reconciliation
- Current full snapshot structure
- Current serialized enemy fields
- Current network rate
- Current Combat 05 contracts
- Current generated-content process
- Current test and E2E commands

---

# Baseline gate

Before implementation, run:

```bash
npx tsc --noEmit
npm run generate:presentation-content
npm run generate:content-pack
npm run generate:map-profiles
npm run build
npm test
```

Run additional existing focused suites when practical.

Record actual results.

Do not assume that every gate mentioned in the Combat 05 report has already been run successfully on the current checkout.

When a baseline failure already exists:

- Record it clearly.
- Determine whether it is unrelated.
- Do not silently rewrite golden outputs.
- Continue only when the task can be performed safely.

---

# Recommended module architecture

Use focused modules rather than expanding central files indefinitely.

Recommended structure:

```text
src/shared/stage/
├── stageDirector.ts
├── farmingClock.ts
├── stageTypes.ts
└── stageEvents.ts

src/shared/horde/
├── hordeDirector.ts
├── waveController.ts
├── populationManager.ts
├── spawnPlanner.ts
├── spawnOwnership.ts
├── hordeTypes.ts
└── hordeTelemetry.ts

src/shared/navigation/
├── hordeFlowField.ts
├── navigationRegions.ts
└── navigationTypes.ts

src/shared/spatial/
└── enemySpatialIndex.ts

src/shared/net/horde/
├── hordeProtocol.ts
├── enemyDeltaEncoder.ts
├── enemyDeltaDecoder.ts
└── replicationPolicy.ts

src/client/enemies/
├── instancedEnemyRenderer.ts
├── enemyLodPresentation.ts
└── farHordeRenderer.ts
```

Adapt names to repository conventions.

Avoid placing every new interface in:

```text
src/shared/types.ts
```

Use composition and focused types.

---

# Commit discipline

Use one reviewable commit per completed milestone.

Recommended commits:

```text
coreloop06: add audit and enemy benchmark harness
coreloop06: add stage director and paused farming clock
coreloop06: add population ownership and wave lifecycle
coreloop06: add data-driven packs and finite reinforcements
coreloop06: add deterministic terrain-aware spawn planning
coreloop06: add enemy spatial index and remove pairwise separation
coreloop06: add instanced and pooled fodder rendering
coreloop06: add shared horde flow-field navigation
coreloop06: add deterministic enemy simulation LOD
coreloop06: add tiered horde replication
coreloop06: add far-horde sector aggregation
coreloop06: finalize horde integration and reports
```

Do not mix unrelated formatting changes into these commits.

Do not perform broad automated rewrites of untouched files.

---

# Milestone 0 — Benchmark harness

Create deterministic enemy benchmarks.

Recommended:

```text
scripts/benchmark-enemies.ts
tests/performance/
```

Population ladder:

```text
25
50
75
100
150
200
250
300
400
500
```

Scenarios:

```text
stationary tank
moving tank
dense cluster
spread population
spawn burst
large cannon splash
full Charge Shot splash
Dash through dense crowd
leader cohort purge
two-client replication
```

Measure:

```text
authority simulation p50/p95/p99
EnemySystem time
behavior time
navigation time
spatial-query time
spawn time
purge time

client frame p50/p95/p99
enemy sync time
render time
draw calls
object/instance count
memory
GC spikes

snapshot bytes
enemy bytes
serialization time
parse time
interpolation time
WebSocket buffered amount
```

The harness must create controlled populations without depending on live random spawning.

Write:

```text
docs/coreloop06/CORELOOP06_BASELINE_REPORT.md
```

Do not claim a supported enemy cap from source inspection alone.

---

# Milestone 1 — StageDirector and farming clock

Implement explicit phases:

```ts
type StagePhase =
  | "farming1"
  | "wave1"
  | "farming2"
  | "wave2"
  | "farming3"
  | "bossWave"
  | "clear"
  | "gameOver";
```

Stage state:

```text
phase
farmingTimeRemaining
totalElapsedTime
activeWaveId
activeLeaderId
phaseStartedAt
phaseSequence
```

Rules:

```text
start at 180 farming seconds
Wave 1 at 120 remaining
pause countdown
leader death resumes at 120

Wave 2 at 60 remaining
pause countdown
leader death resumes at 60

Boss Wave at 0
countdown remains paused

boss death = clear
tank death = immediate gameOver
```

Do not trigger waves from total elapsed match time.

Preserve total elapsed time separately for telemetry/results.

Add typed stage events:

```text
stageStarted
phaseChanged
waveRequested
waveStarted
waveLeaderKilled
waveCleared
bossStarted
stageCleared
gameOver
```

Use existing event-bus conventions.

Temporary adapter:

- Existing spawn director may continue feeding placeholder enemies while the new systems are introduced.
- Remove the adapter after the new HordeDirector becomes authoritative.

Tests:

- Exact threshold crossing
- Countdown pause
- Resume
- One-shot transitions
- Death during farming
- Death during wave
- Boss clear
- Single Player and Multiplayer parity

---

# Milestone 2 — Spawn ownership and wave lifecycle

Add population classes:

```ts
type PopulationClass =
  | "ambient"
  | "wave"
  | "boss"
  | "special";
```

Add ownership metadata:

```text
populationClass
waveId
leaderId
packInstanceId
spawnAnchorId
purgeOnLeaderDeath
```

Prefer a focused ownership block rather than unrelated flat fields.

Implement `WaveController`:

- Allocate wave ID
- Spawn/assign leader
- Register opening cohort
- Track reinforcement reserve
- Listen for leader death
- Stop spawning
- Start purge
- Remove only matching cohort
- Notify StageDirector
- Trigger leader reward
- Clear boss stage

Purge rules:

```text
no XP
no drops
no kill-trigger capabilities
no cannon kill hooks
no combo
no Dash kill credit
no death-chain reward
```

Purge may still emit presentation events.

Ambient monsters remain alive.

Tests must include multiple wave IDs to prove ownership isolation.

---

# Milestone 3 — Data-driven horde content

Add validated schemas and content categories for:

```text
StageSequenceDefinition
FarmingPhaseDefinition
HordeDirectorDefinition
PopulationLimits
SpawnPackDefinition
WaveDefinition
BossWaveDefinition
SpawnAnchorPolicyDefinition
HordeNavigationPolicyDefinition
EnemyLodPolicyDefinition
HordeReplicationPolicyDefinition
```

Use separate content files and registries consistent with the current ContentPack pipeline.

Both current gameplay modes reference one shared definition:

```text
horde.mainStage
```

Do not duplicate the definition between modes.

## Farming phase

Define:

```text
duration
entity target start/end
threat target start/end
spawn income start/end
eligible pack tags
```

## Threat

Add threat cost to enemy or spawn-pack content.

The director tracks both:

```text
entity count
weighted threat
```

## Spawn budget

```ts
spawnBudget += spawnIncomePerSecond * dt;
spawnBudget = min(spawnBudget, maximumStoredBudget);
```

Spawn only when:

```text
pack fits budget
pack fits entity capacity
pack fits threat capacity
valid anchor exists
```

## Wave definition

Define:

```text
leader enemy
opening packs
reinforcement packs
opening threat
finite reinforcement threat
reinforcement income/rate
active wave entity cap
active wave threat cap
approach policy
reward table
purge policy
```

## Boss wave

Reuse the wave controller.

Allow future:

```text
HP threshold reinforcement events
phase-specific pack tables
clear-stage completion
```

Use placeholder enemies only for technical verification.

---

# Milestone 4 — SpawnPlanner and map anchors

Do not rely only on perimeter `bugSpawns`.

Extend generated arena metadata with anchor types:

```text
perimeter
regional
accessRoad
valley
cliffTop
cliffBottom
eliteFormation
boss
specialist
```

Anchor data:

```text
ID
position
region ID
terrain class
tags
capacity
reachable regions
minimum tank distance
maximum tank distance
camera exposure
cooldown
last-used state
```

Spawn plan validation:

```text
outside visible near field
reachable from active tank region
correct terrain
correct pack tags
capacity available
not in safe/recovery area
not too close
not recently used
not trapped behind invalid cliff
```

Use authoritative match RNG.

The same seed and authoritative state must produce the same plan.

Add debug visualization:

```text
anchors
tags
capacity
rejection reasons
selected formation
route region
```

Test:

- Primary map
- Dramatic Highlands
- Mega Bonk Highlands
- Cliff plateau
- Valley
- Access corridor

---

# Milestone 5 — Enemy spatial index

Create:

```text
src/shared/spatial/enemySpatialIndex.ts
```

Recommended uniform spatial hash.

Operations:

```ts
insert
remove
move
rebuild
queryCircle
queryAabb
queryNeighbourCells
queryRayCells
```

Use bounded reusable output arrays in hot paths.

Integrate with:

```text
crowd density steering
enemy contact
TankContactCombat
Dash contact
normal cannon splash
Charge Shot splash
explosions
target selection
future replication interest
```

Remove O(n²) `movement.separation`.

Replacement options:

```text
nearby-cell neighbour steering
or cell-density gradient steering
```

Tier 2 and aggregate enemies should not run precise separation.

Do not change Combat 05’s damage semantics while replacing query mechanics.

Re-run benchmark ladder.

---

# Milestone 6 — Instanced fodder rendering

The current per-enemy cloned object hierarchy does not scale.

Implement instanced rendering for ordinary fodder.

Required:

```text
one instance batch per archetype / LOD / material
stable instance-slot pool
spawn allocation
despawn release
position
yaw
scale
flash
animation phase
death phase
purge phase
variant flags
```

Do not rebuild instance buffers from scratch unnecessarily.

Keep unique rigs for bounded special entities:

```text
elite
boss
complex specialist
```

Rendering tiers:

```text
combat
approach
far
aggregate visual
```

Shadows:

```text
elite/boss selected shadows
ordinary near fodder limited/no cast shadow
mid/far no cast shadow
```

Add tests for:

- Stable slot reuse
- No leaks after wave purge
- Correct instance count
- Correct LOD migration
- No duplicate visual after snapshot correction

Measure draw calls and frame time.

---

# Milestone 7 — Shared flow-field navigation

Ordinary enemies must not run individual A*.

Build one low-resolution reverse terrain field from the tank.

Map scale:

```text
approximately 400 × 400 m
approximately 4 m cells
approximately 100 × 100 traversal cells
```

Flow data:

```text
cost to tank
best neighbour
flow direction
terrain flags
region
```

Refresh when:

```text
tank enters a new meaningful cell
tank crosses region
maximum refresh interval reached
```

Initial maximum:

```text
2–4 Hz
```

Near movement:

```text
flow direction
+ direct target bias
+ density steering
+ attack-state steering
+ obstacle correction
```

Mid/far:

```text
primarily flow direction
```

Leader movement:

```text
flow toward tank
+ approach-route bias
+ formation speed limit
```

Escort movement:

```text
formation anchor around/ahead of leader
+ flow
+ density steering
```

Add stuck detection:

```text
minimum route progress
time threshold
alternate neighbour
recovery steering
far aggregation fallback
last-resort despawn/refund only when invisible and safe
```

Do not allow trapped enemies to consume the cap indefinitely.

---

# Milestone 8 — Simulation LOD

Implement four authoritative tiers:

```text
Tier 0: combat
Tier 1: approach
Tier 2: far active
Tier 3: aggregate
```

Suggested initial frequencies:

```text
Tier 0 = 30 Hz
Tier 1 = 10–15 Hz
Tier 2 = 2–5 Hz
Tier 3 = 1–2 Hz sector simulation
```

Use hysteresis.

Example starting thresholds:

```text
Tier 0 enter 42 m
Tier 0 leave 52 m

Tier 1 enter 90 m
Tier 1 leave 105 m

Tier 2 enter 145 m
Tier 2 leave 165 m
```

These are tunable, not final.

Tier 0:

- Full attacks
- Contact
- Precise collision
- Knockback
- Telegraphs
- Projectile interaction

Tier 1:

- Flow movement
- Reduced local steering
- Coarse terrain
- Reduced attack decisions
- HP/death

Tier 2:

- Coarse movement
- No attack
- No precise separation
- No precise contact
- Low-rate terrain projection

Tier 3:

- Sector population only

Promotion overrides:

```text
elite
boss
attacking enemy
telegraphing enemy
recently hit enemy
enemy under knockback
leader escort
projectile-relevant enemy
```

Difficulty invariance:

LOD may change only:

```text
update rate
representation
animation
replication
```

It must not change:

```text
HP
damage
distance moved over real time
reward
spawn count
wave ownership
leader outcome
```

Use elapsed time since each enemy’s last update.

Use deterministic update groups.

---

# Milestone 9 — Tiered Multiplayer replication

The current full verbose enemy array in every snapshot is not the final scalable architecture.

Implement typed horde replication.

Logical messages:

```text
enemyPackSpawn
enemyMaterialize
enemyDespawn
enemyDeath
enemyPurge

nearEnemyDelta
midEnemyDelta
farEnemyState
hordeSectorState

waveState
leaderState
```

Critical ordered events:

```text
leader death
wave transition
tank damage
enemy attack
telegraph
enemy death
spawn/materialization
```

Suggested rates:

```text
Tier 0: 10–20 Hz delta
Tier 1: 5–10 Hz
Tier 2: 1–2 Hz
Tier 3: change-driven or 1–2 Hz
```

Do not resend unchanged complete enemy records.

Use compact typed arrays/records in JSON first.

Example record:

```text
[id, typeId, qx, qy, qz, qyaw, hp, flags]
```

Quantize:

```text
X/Z within map range
Y within terrain range
yaw
HP
flags
bounded timers
```

Use binary `ArrayBuffer` only when benchmark evidence shows compact JSON is insufficient.

Because both players share the same tank:

```text
one authoritative gameplay interest origin per room
```

Driver and Gunner camera frustum rendering remains client-specific.

Track:

```text
snapshot bytes
enemy bytes
sector bytes
serialization time
parse time
bufferedAmount
delta queue length
```

Backpressure strategy:

1. Preserve critical events.
2. Coalesce obsolete far transforms.
3. Reduce far update frequency.
4. Never delay leader death or tank damage.

Increment protocol version from the actual current version.

Update action-time aim and Combat 05 protocol tests rather than replacing them.

---

# Milestone 10 — Far-horde sector aggregation

Implement aggregate distant populations.

State:

```text
sector ID
enemy definition ID
count
center
route cell
flow direction
population class
wave ID
threat
presentation seed
```

Aggregate enemies have no:

```text
individual HP
individual collision
individual attack
individual JS object
individual Three.js object
individual transform replication
```

Materialization:

```text
aggregate count decreases
→ active pack is created
→ enemies enter Tier 2
```

Demotion requirements:

```text
outside interaction range
outside visible near field
not elite/boss
not attacking
not telegraphing
not recently damaged
not under knockback
no unique important state
```

Preserve:

```text
count
threat
population ownership
wave ID
```

Far visuals:

```text
GPU instances
billboards
or low-poly crowd clusters
```

Far silhouettes are not individually damageable.

They must materialize before entering normal weapon interaction range.

On leader death:

```text
wave-owned sectors collapse
wave-owned active cohort purges
ambient sectors remain
```

---

# Milestone 11 — HUD, presentation, and stage flow

Extend the content-driven HUD and scenes.

Required information:

```text
farming countdown
current phase
wave incoming
wave active
elite marker and HP
boss marker and HP
wave cleared
game over
stage clear
```

The timer must communicate:

```text
time until next wave
```

It is not a match time limit.

During waves:

```text
timer visibly paused
leader objective becomes primary
```

Preserve the Combat 05 reticle and reticle-adjacent Charge Shot meter.

Do not rebuild HUD DOM per frame.

Use existing bindings/view-model architecture.

Add presentation hooks for:

```text
wave start
leader entrance
reinforcement arrival
leader death
cohort purge
boss start
stage clear
```

Purge visuals do not imply reward kills.

---

# Milestone 12 — Capacity selection and tuning

Do not finalize enemy counts before measured results.

Provisional engineering targets from the design:

```text
first horde milestone:
200–300 fully active enemies

release goal:
300–400 fully active enemies

stretch:
400–500 fully active enemies

with far visuals:
600–1,000+ perceived population
```

These are targets, not guaranteed results.

Select final content caps from:

```text
simulation p95/p99
client frame p95/p99
network bytes
parse time
buffered amount
memory stability
two-client soak test
```

Use multiple limits:

```text
hard entity cap
ambient soft entity cap
ambient threat cap
wave soft entity cap
wave threat cap
elite/boss reserve
technical emergency reserve
aggregate visual cap
```

Never let ambient spawning consume the leader/boss reserve.

---

# Required tests

Add focused suites for:

```text
StageDirector
FarmingClock
WaveController
PopulationOwnership
PurgeRewardSuppression
HordeDirector
SpawnBudget
ThreatBudget
SpawnPackSchema
WaveSchema
SpawnPlanner
SpawnAnchorGeneration
EnemySpatialIndex
DensitySteering
FlowField
StuckRecovery
SimulationLod
InstancedEnemyRenderer
EnemyDeltaProtocol
HordeSectorAggregation
Materialization
SameDifficultyAcrossModes
CapacityBenchmarks
```

---

# Core-loop tests

- Starts at 180 farming seconds
- Wave 1 at 120
- Timer pauses
- Wave 1 leader death resumes
- Wave 2 at 60
- Timer pauses
- Wave 2 leader death resumes
- Boss at 0
- Boss death clears
- Tank death game-overs immediately
- Phase transition occurs once
- Total elapsed time remains independent

---

# Ownership and reward tests

- Ambient survives every clear
- Wave 1 purge cannot remove Wave 2 or ambient
- Boss purge cannot remove ambient
- Purge yields no XP
- Purge yields no drops
- Purge triggers no kill capability
- Purge gives no Dash kill
- Purge gives no cannon kill
- Normally killed wave monsters follow configured reward rules
- Leader reward occurs once

---

# Spawn tests

- Pack cost and count validated
- Budget bounded
- Finite reinforcement reserve
- No reinforcement after leader death
- Hard cap respected
- Leader reserve respected
- Valid anchor selected
- Visible-near anchor rejected
- Unreachable anchor rejected
- Terrain tag respected
- Anchor cooldown respected
- Same seed produces same plan

---

# Navigation tests

- Horde reaches tank across a valley
- Horde uses plateau access
- Horde does not climb invalid cliff
- Horde does not permanently jam under escarpment
- Elite does not outrun escort
- Far integration preserves distance over real time
- Flow refresh remains bounded
- Stuck recovery remains bounded

---

# Combat 05 regression tests

- Normal contact does zero damage
- Dash contact uses existing authoritative service
- No fall damage
- Instant turret
- Action-time aim
- Normal cannon
- Charge Shot tap
- Partial charge
- Full charge
- Charge Shot splash uses spatial index
- Cannon modifiers still apply
- No Jackpot system or HUD
- Reticle charge meter remains correct

---

# LOD tests

- Hysteresis prevents thrashing
- Tier update frequency correct
- Promotion override correct
- Damage outcome unchanged
- Movement distance preserved within tolerance
- HP/reward ownership unchanged
- Aggregate conversion preserves count and threat
- Demotion never affects visible interacting enemy
- No queue growth during long far simulation

---

# Rendering tests

- Draw calls scale by archetype/LOD, not entity count
- Stable pooled instance slots
- Purge releases all appropriate slots
- No object/material leak
- Correct flash/death/purge state
- Special elite rig remains separate
- LOD migration does not duplicate an enemy

---

# Networking tests

- Protocol version updated deliberately
- Combat 05 action protocol still works
- Spawn/death/purge ordering
- Near delta interpolation
- Mid and far update rates
- Sector state replication
- Leader death immediate
- Critical events survive backpressure
- Two clients see consistent population
- Reconnect reconstructs stage/wave/population state
- Snapshot/delta queues remain bounded
- 100 ms RTT
- 150 ms RTT

---

# Manual verification scenarios

Run:

```text
full core loop from start to boss clear
Wave 1 fast clear
Wave 1 slow clear
Wave 2
Boss Wave
tank death during farming
tank death during wave
leader death surrounded by ambient enemies
cohort purge with 100+ wave monsters
Dramatic Highlands
Mega Bonk Highlands
dense normal cannon splash
dense full Charge Shot splash
Dash through dense pack
Single Player
two-client Multiplayer
100 ms RTT
150 ms RTT
15-minute population soak
```

Verify:

- Same gameplay counts and rules in both modes
- No visible nearby far-horde fake targets
- No duplicate enemies
- No trapped cap-consuming mass
- No duplicate reward from purge
- No Combat 05 regression

---

# Debug tooling

Add a Horde Debug overlay.

Display:

```text
stage phase
farming time remaining
active wave ID
leader ID
leader HP

ambient entities
ambient threat
wave entities
wave threat
boss entities
aggregate count

soft caps
hard cap
leader reserve
technical reserve

spawn budget
last selected pack
last anchor
anchor failures

Tier 0 count
Tier 1 count
Tier 2 count
Tier 3 sectors

enemy update ms
flow-field ms
spatial-query ms
spawn ms
purge ms
render ms
draw calls

snapshot bytes
enemy bytes
sector bytes
serialization ms
parse ms
buffered amount
```

Developer controls:

```text
force stage phase
force wave
kill leader
set ambient target
spawn pack
freeze spawning
visualize flow
visualize regions
visualize spatial cells
visualize spawn anchors
visualize LOD rings
```

Keep developer controls out of production-facing UI.

---

# Required documentation

Create:

```text
docs/coreloop06/CORELOOP06_IMPLEMENTATION_REPORT.md
docs/coreloop06/CORELOOP06_AUTHORING_GUIDE.md
docs/coreloop06/CORELOOP06_NETWORK_AND_CAPACITY_REPORT.md
docs/coreloop06/CORELOOP06_PERFORMANCE_REPORT.md
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

The implementation report must include:

1. Initial code audit
2. Baseline test results
3. Baseline capacity results
4. Stage state machine
5. Population ownership
6. Wave and boss lifecycle
7. Purge reward suppression
8. Content schemas
9. Spawn packs
10. Spawn-anchor generation
11. Spatial index
12. Flow-field navigation
13. Instanced rendering
14. Simulation LOD
15. Multiplayer replication
16. Far aggregation
17. Files added/modified/deleted
18. Protocol changes
19. Generated-content changes
20. Unit/integration/E2E outputs
21. Manual verification
22. Performance before/after
23. Selected cap and evidence
24. Known limitations
25. Completion checklist

---

# Required commands

Inspect `package.json` and use only commands that actually exist after implementation.

At minimum run:

```bash
npx tsc --noEmit

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

Add appropriate scripts:

```text
test:coreloop
test:horde
test:horde:benchmark
test:horde:e2e
```

Report actual output.

Do not hide failing commands.

Do not regenerate golden fixtures merely to make an unexpected regression disappear.

Intentional golden changes require:

- A focused assertion for the intended behavior
- Documentation of the changed value
- Regeneration only after verification

---

# Performance gates

The implementation is not complete merely because tests pass.

Required performance properties:

- O(n²) separation removed
- No global enemy scan per ordinary explosion/contact query
- Fodder draw calls bounded by archetype/LOD
- No per-fodder cloned hierarchy at scale
- No hot-loop unbounded allocations
- Tiered simulation uses bounded queues
- Full-charge Cannon splash remains bounded
- Indefinite far-horde simulation has no memory growth
- Multiplayer output does not resend all unchanged enemy fields
- Backpressure remains bounded
- Two-client soak remains stable
- Selected cap stays inside simulation, frame, and network budgets

Record target-hardware and test-environment limitations honestly.

---

# Completion gate

Complete only when all of the following are true:

1. `combat-rework` remains the implementation base.
2. No merge/rebase/cherry-pick dependency was introduced.
3. Farming countdown starts at 180 seconds.
4. Wave 1 triggers at 120 remaining.
5. Wave 2 triggers at 60 remaining.
6. Boss Wave triggers at 0.
7. Countdown pauses during waves.
8. Leader death resumes farming countdown.
9. Boss death clears the stage.
10. Tank death causes immediate game over.
11. Ambient monsters persist through wave clear.
12. Wave and boss cohorts are tagged.
13. Only the owned cohort purges.
14. Purge grants no unintended rewards.
15. Wave reinforcements are finite.
16. Spawn packs are data-driven.
17. Single Player and Multiplayer resolve one gameplay horde definition.
18. Counts, stats, waves, and rewards are identical in both modes.
19. Spawn anchors are terrain-aware and deterministic.
20. O(n²) separation is removed.
21. Area combat queries use a spatial index.
22. Dash-only contact behavior remains intact.
23. Charge Shot behavior remains intact.
24. No fall damage returns.
25. No Jackpot path returns.
26. Ordinary horde movement uses a shared flow field.
27. Trapped enemies do not consume the cap indefinitely.
28. Fodder rendering is instanced and pooled.
29. Simulation LOD uses hysteresis.
30. LOD preserves gameplay outcomes.
31. Multiplayer uses tiered/delta enemy replication.
32. Critical events remain immediate.
33. Far population can aggregate safely.
34. Far visuals materialize before interaction range.
35. Capacity is selected from measurements.
36. Required tests pass.
37. Manual full-loop verification passes.
38. Reports accurately document failures and limitations.
39. New monsters, packs, waves, bosses, and stages can be added through content.
40. Core-loop progression and horde execution remain separate typed modules.

Final invariant:

> Starting from the completed Combat 05 branch, one shared authoritative core loop and horde simulation powers both Single Player and Multiplayer. Farming continuously fills the map, elite-led waves add finite temporary crisis populations, and scalable navigation, simulation, rendering, and replication preserve the same gameplay pressure at every distance.
