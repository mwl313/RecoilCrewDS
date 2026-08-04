# Recoil Crew — Core Loop and Horde Spawn System Design
## A scalable, data-driven stage director for dense monster populations, elite-led waves, and identical Single Player / Multiplayer difficulty

**Repository:** `mwl313/RecoilCrewDS`  
**Source branch:** `main`  
**Target repository path:** `docs/coreloop06/CORE_LOOP_AND_HORDE_SPAWN_SYSTEM_DESIGN.md`  
**Status:** Foundational design specification  
**Scope:** Core loop, stage progression, monster population, wave orchestration, pathfinding strategy, simulation LOD, rendering scale, and multiplayer replication

---

# 0. General design direction

Recoil Crew is moving toward a short-form, highly replayable arcade roguelite built around:

- **Rocket League-like tank movement**
  - Momentum, drifting, jumping, air control, dashing, terrain traversal, and physical recoil.
- **Megabonk-like battlefield spectacle**
  - A map visibly populated by large numbers of monsters.
  - Constant farming pressure and fast replacement spawning.
  - Periodic swarm events.
  - Power growth expressed through increasingly efficient crowd clearing.
- **A tightly authored three-part stage**
  - Farming → elite-led wave → farming → elite-led wave → farming → boss-led wave.
- **One gameplay difficulty shared by Single Player and Multiplayer**
  - Same spawn rules, enemy counts, enemy stats, wave compositions, elite/boss behavior, rewards, technical cap, and upgrade economy.

Single Player and Multiplayer differ only in execution architecture:

```text
Single Player
→ local authoritative simulation
→ combined Driver and Gunner controls

Multiplayer
→ server authoritative simulation
→ Driver and Gunner split between two clients
→ network replication and interpolation
```

The game must not secretly reduce enemy count, attack pressure, or wave composition in Single Player.

The intended experience is:

> Move quickly through a dangerous, monster-filled landscape; farm efficiently; become stronger; survive explosive elite-led swarms; use vehicle movement and cannon power to break through the crowd; defeat the final boss and finish the run.

This document treats **core-loop progression** and **monster spawning** as different implementations connected through a stable contract:

- The core loop decides **when the phase changes**.
- The spawn system decides **what population should exist**.
- Enemy simulation decides **how monsters behave**.
- Networking decides **how authoritative population reaches clients**.
- Rendering decides **how that population is represented efficiently**.

Each layer must remain replaceable, expandable, and independently testable.

---

# 1. Design principles

## 1.1 Same game in both modes

Single Player is not an easier variant. The following resolve from one shared gameplay definition:

```text
stage timing
ambient population targets
wave timing and composition
reinforcement budgets
elite/boss stats and behavior
enemy HP, damage, and speed
XP and rewards
technical enemy cap
```

Mode-specific definitions may change only infrastructure such as authority location, input ownership, network replication, connection UI, and results flow.

## 1.2 Spectacle without unnecessary simulation

The battlefield should look massively populated, but every distant silhouette does not always need full 30 Hz AI, precise collision, unique rendering objects, and 20 Hz individual replication.

## 1.3 Continuous farming, discrete crisis

Farming phases maintain a continuously replenished ambient population. Waves are authored crises with a leader, temporary tagged cohort, finite reinforcements, clear completion condition, and concentrated reward.

## 1.4 No individual pathfinding for ordinary hordes

Ordinary monsters use a shared terrain flow field, low-cost local steering, and special behavior only when required. No individual A* or NavMesh path per fodder enemy.

## 1.5 Content first

Content defines stage phases, targets, budgets, packs, leaders, reinforcements, anchor policy, caps, LOD, and rewards. Runtime systems interpret validated content.

## 1.6 Performance is a gameplay invariant

When performance is pressured, reduce distant rendering, animation, replication, simulation frequency, and individual representation—in that order. Never silently reduce gameplay population or stats.

---

# 2. Confirmed core loop

## 2.1 Stage sequence

```text
START
→ FARMING PHASE 1
→ WAVE 1
→ FARMING PHASE 2
→ WAVE 2
→ FARMING PHASE 3
→ BOSS WAVE
→ CLEAR
```

The farming countdown starts at `03:00`.

Wave triggers:

```text
02:00 remaining → Wave 1
01:00 remaining → Wave 2
00:00 remaining → Boss Wave
```

Real run duration is longer than three minutes because the countdown pauses during waves.

## 2.2 Countdown semantics

The timer is not a total stage time limit. It is remaining farming time before the next scripted threat escalation.

```text
Farming active → countdown runs
Wave active → countdown pauses
Wave leader dies → countdown resumes
Boss active → countdown remains at zero
Boss dies → clear
```

Waves must not be driven from total simulation time.

## 2.3 Failure

```text
Tank integrity reaches zero
→ immediate game over
→ no checkpoint retry
```

## 2.4 Victory

```text
Final boss dies
→ boss-owned cohort clears
→ custom clear screen and statistics
→ run complete
```

## 2.5 Upgrade integration

The spawn system exposes reward events without redefining the separate upgrade design:

```text
normal enemy killed → XP/drop contribution
wave leader killed → concentrated reward event
boss killed → clear reward/stat event
wave cohort purged → no individual XP/drop/kill trigger
```

---

# 3. Runtime architecture

```text
StageDirector
├── FarmingClock
├── WaveController
├── HordeDirector
├── PopulationManager
├── SpawnPlanner
└── RewardCoordinator

Supporting:
EnemySimulation
NavigationField
SpatialEnemyIndex
EnemyReplication
EnemyPresentation
HordeTelemetry
```

## 3.1 StageDirector

Owns stage phase, farming countdown, wave triggers, pause/resume, leader-death transitions, game over, clear, and phase events. It does not spawn individual monsters.

## 3.2 HordeDirector

Interprets the phase, calculates ambient targets and threat targets, accumulates spawn budget, chooses packs, reserves capacity, and requests spawn plans. It does not own stage progression.

## 3.3 WaveController

Creates a wave ID, spawns leader/opening packs, spends finite reinforcement budget, tags wave ownership, stops reinforcement on leader death, purges the cohort, and reports completion.

## 3.4 PopulationManager

Counts entities/threat by population class, enforces caps, owns simulation tiers, promotes aggregate population, conservatively demotes far enemies, and reports available capacity.

## 3.5 SpawnPlanner

Chooses anchors/formations and validates reachability, distance, visibility, terrain, capacity, and cooldown. It returns a deterministic spawn plan.

## 3.6 RewardCoordinator

Owns ordinary XP/drop events, leader reward bursts, boss clear rewards, and purge-without-reward behavior.

---

# 4. Stage state machine

```ts
export type StagePhase =
  | "farming1"
  | "wave1"
  | "farming2"
  | "wave2"
  | "farming3"
  | "bossWave"
  | "clear"
  | "gameOver";

export interface StageRuntimeState {
  phase: StagePhase;
  farmingTimeRemaining: number;
  totalElapsedTime: number;
  activeWaveId: number | null;
  activeLeaderId: number | null;
  phaseStartedAt: number;
  phaseSequence: number;
}
```

Transitions:

```text
start → farming1

remaining reaches 120
→ wave1
→ pause countdown

Wave 1 leader dies
→ farming2
→ resume countdown

remaining reaches 60
→ wave2
→ pause countdown

Wave 2 leader dies
→ farming3
→ resume countdown

remaining reaches 0
→ bossWave

Boss dies
→ clear

Tank dies in any phase
→ gameOver
```

Every transition must occur exactly once.

---

# 5. Population ownership

```ts
export type PopulationClass =
  | "ambient"
  | "wave"
  | "boss"
  | "special";

export interface SpawnOwnership {
  populationClass: PopulationClass;
  waveId: number | null;
  leaderId: number | null;
  packInstanceId: number;
  spawnAnchorId: number | null;
  purgeOnLeaderDeath: boolean;
}
```

## 5.1 Ambient

- Continuously present during farming.
- Supplies XP and baseline pressure.
- Persists when a wave begins.
- Is not purged when a leader dies.
- Receives no replacement spawns while a wave is active.
- Resumes replacement after clear.

## 5.2 Wave

- Tagged with a wave ID and leader ID.
- Spawns in opening or reinforcement packs.
- Screens the leader.
- Purges on leader death.
- Purge itself grants no XP/drop/kill triggers.

## 5.3 Boss

Uses the same ownership mechanism. Boss death purges boss-owned cohort and clears the run.

## 5.4 Special

Reserved for objective monsters, summons, neutrals, tutorials, and future modes that should not consume ordinary ambient rules.

---

# 6. Farming population

## 6.1 Population curves

```ts
export interface FarmingPhaseDefinition {
  id: string;
  durationSeconds: number;

  entityTargetStart: number;
  entityTargetEnd: number;

  threatTargetStart: number;
  threatTargetEnd: number;

  spawnIncomeStart: number;
  spawnIncomeEnd: number;

  eligiblePackTags: string[];
}
```

```ts
phaseProgress = elapsed / duration;
entityTarget = lerp(startCount, endCount, phaseProgress);
threatTarget = lerp(startThreat, endThreat, phaseProgress);
```

## 6.2 Threat budget

Each enemy has a content-defined threat value. Illustrative scale:

```text
weak fodder       1
tough fodder      2
fast specialist   3
heavy specialist  6
elite escort      8
elite/boss        separate leader budget
```

Track both entity count and weighted threat.

## 6.3 Spawn budget

```ts
spawnBudget += spawnIncomePerSecond * dt;
spawnBudget = Math.min(spawnBudget, maximumStoredBudget);
```

A pack spawns only when budget, entity capacity, threat capacity, and a valid anchor all exist.

## 6.4 Reactive replacement

```text
efficient killing
→ population drops below target
→ more replacement packs
→ more XP opportunities

slow killing
→ population remains near target/cap
→ replacement slows
→ pressure stays high
```

## 6.5 Wave interaction

```text
wave starts:
ambient remains
ambient target/ramp freezes
ambient replacement pauses
wave reserve activates

wave clears:
wave cohort purges
ambient remains
ambient target/ramp resumes
countdown resumes
```

---

# 7. Wave mechanics

## 7.1 Runtime

```ts
export interface WaveRuntime {
  waveId: number;
  definitionId: string;
  leaderId: number;

  initialThreatRemaining: number;
  reinforcementThreatRemaining: number;

  activeWaveThreat: number;
  activeWaveEntities: number;
  reinforcementAccumulator: number;

  state:
    | "opening"
    | "active"
    | "leaderDead"
    | "purging"
    | "complete";
}
```

## 7.2 Opening

```text
pause countdown
→ allocate wave ID
→ choose leader approach region
→ spawn vanguard
→ spawn leader behind vanguard
→ spawn escort
→ spawn flank packs
→ activate finite reinforcement budget
→ begin wave presentation
```

## 7.3 Physical screen

Protect the elite through ordinary systems:

- Fodder occupies route and firing lanes.
- Cannon shells collide with fodder.
- Escorts prefer positions ahead/around leader.
- Leader advances with its formation.
- Reinforcement packs restore pressure.
- Driver/Single Player creates an opening.
- Gunner/Single Player uses cannon or Charge Shot through that opening.

Do not use artificial permanent invulnerability unless a future enemy explicitly calls for it.

## 7.4 Finite reinforcements

```ts
reinforcementThreatRemaining -= spawnedPackThreat;
```

The wave arc should be:

```text
overwhelming opening
→ reinforcement restores screen
→ reserve weakens
→ crowd thins
→ opening appears
→ leader dies
```

Infinite refill is prohibited for ordinary waves.

## 7.5 Leader movement

Leader uses shared navigation plus authored approach bias, advances slower than the screen, and avoids outrunning escorts.

Escort targets formation anchors around the leader while sampling shared flow/navigation data.

## 7.6 Leader death

```text
0.00 s  leader dies and reinforcement stops
0.00–0.20 s leader reward begins
0.10–0.80 s wave cohort enters purge presentation
0.80–1.20 s wave-owned entities removed
1.20 s wave-complete event
1.50–2.00 s ambient replacement and countdown resume
```

Purged enemies grant no individual rewards or kill hooks.

## 7.7 Boss wave

Boss is the leader, boss cohort uses the same ownership/reinforcement mechanisms, and boss death transitions to clear. Boss content may add HP thresholds and special packs without requiring another spawn engine.

---

# 8. Spawn packs

```ts
export interface SpawnPackDefinition {
  id: string;
  label: string;
  tags: string[];

  entries: Array<{
    enemyId: string;
    count: number;
    formationRole?: string;
  }>;

  threatCost: number;
  entityCost: number;

  formation:
    | "cluster"
    | "line"
    | "column"
    | "arc"
    | "ring"
    | "pincer"
    | "scatter";

  spacing: number;
  radius: number;

  anchorRequirements: SpawnAnchorRequirements;

  minimumPhase?: string;
  maximumConcurrent?: number;
  cooldownSeconds?: number;
}
```

## 8.1 Farming packs

- Wandering Cluster
- Trail Pack
- Loose Encirclement
- XP Pocket
- Moving Herd

## 8.2 Wave packs

- Vanguard Wall
- Escort Ring
- Side Clamp
- Rear Pressure
- Corridor Block
- Reinforcement Column
- Downhill Flood

## 8.3 Boss packs

- Boss Guard
- Rotating Sector Flood
- Arena Compression
- Threshold Reserve

Packs improve readability, batch spawning, deterministic planning, replication, and formation behavior.

---

# 9. Spawn anchors

## 9.1 Required anchor classes

- Perimeter gates
- Regional entrances
- Access-road entrances
- Valley entrances
- Cliff-top entrances
- Cliff-bottom entrances
- Elite formation anchors
- Boss anchors
- Tower/specialist anchors

## 9.2 Metadata

```ts
export interface SpawnAnchor {
  id: number;
  x: number;
  y: number;
  z: number;

  regionId: number;
  terrainClass: string;
  tags: string[];

  capacity: number;
  reachableRegionIds: number[];

  minimumTankDistance: number;
  maximumTankDistance: number;

  cameraExposure: number;
  cooldownSeconds: number;
  lastUsedAt: number;
}
```

## 9.3 Selection score

Score anchors using:

- Outside camera frustum.
- Suitable distance and route distance.
- Correct terrain/pack tags.
- Reachability.
- Local density.
- Recent-use penalty.
- Desired wave approach direction.
- Formation requirements.

Reject if visible and near, unreachable, inside a safe/recovery region, invalid terrain, over capacity, or too close.

## 9.4 Determinism

Authoritative planning uses match RNG derived from match seed, stage phase, pack sequence, wave ID, and spawn-plan sequence. Clients never select gameplay anchors independently.

---

# 10. Navigation strategy

## 10.1 Shared flow field

For a 400×400 map at 4 m cells:

```text
approximately 100 × 100
approximately 10,000 cells
```

Compute a reverse traversal field from the tank’s region/cell. Each cell stores cost, best neighbour, flow direction, and terrain flags.

Refresh when the tank changes meaningful cell/region or at a capped `2–4 Hz`.

## 10.2 Near movement

```text
flow direction
+ direct tank direction
+ local density steering
+ attack-state steering
+ obstacle correction
```

Illustrative weighting:

```text
70% flow
20% direct target
10% local steering
```

## 10.3 Mid/far movement

Mid enemies primarily follow flow field with coarse terrain handling.

Far enemies follow flow field only, use coarse terrain projection, and run no fine separation or attacks.

## 10.4 Elite/escort movement

Leader combines flow direction, authored route bias, and formation speed limit.

Escort combines leader formation anchor, flow field, and density steering.

## 10.5 Stuck recovery

Detect insufficient route progress and attempt:

1. Re-sample flow.
2. Choose adjacent route cell.
3. Increase obstacle correction temporarily.
4. Select alternate regional route.
5. Aggregate/demote if far and unseen.
6. Despawn/refund only as a last resort.

---

# 11. Spatial enemy index

Use a uniform spatial hash shared by:

- Crowd density steering.
- Melee/contact.
- Dash contact.
- Cannon splash.
- Explosions.
- Target queries.
- Replication interest.

```ts
insert(enemyId, x, z)
remove(enemyId)
move(enemyId, oldX, oldZ, newX, newZ)

queryCircle(x, z, radius, out)
queryAabb(minX, minZ, maxX, maxZ, out)
queryCellsAlongRay(...)
```

No area attack should scan the complete population.

Pairwise O(n²) separation must be removed. Use neighbouring spatial cells or density gradients.

---

# 12. Simulation LOD

Distance is measured from the shared tank, not camera visibility. Both Multiplayer players share the same vehicle, so one authoritative interest origin is sufficient.

## 12.1 Tier 0 — Combat

Suggested hysteresis:

```text
enter below 42 m
leave above 52 m
```

Update at 30 Hz.

Full movement, attacks, contact, terrain checks, knockback, HP, projectile interaction, telegraphs, steering, and precise collision.

Near-state replication uses high-frequency deltas.

## 12.2 Tier 1 — Approach

Approximately 45–100 m with hysteresis.

Update at 10–15 Hz.

Flow movement, coarse traversal, reduced density steering, HP/death, and promotion logic. Attacks and precise collision are reduced or disabled.

Replication at 5–10 Hz.

## 12.3 Tier 2 — Far active

Approximately 90–150 m.

Update at 2–5 Hz.

Store ID, type, coarse position/route, direction, wave ownership, and HP only when still individually damageable.

No attacks, pair separation, precise contact, fine collision, or unique telegraph objects.

Replication at 1–2 Hz or event-based.

## 12.4 Tier 3 — Horde aggregate

```ts
export interface HordeSectorState {
  sectorId: number;
  enemyId: string;
  count: number;

  centerX: number;
  centerZ: number;

  routeCell: number;
  flowDirection: number;

  populationClass: PopulationClass;
  waveId: number | null;
  threat: number;
}
```

Update sector state at 1–2 Hz. No individual HP, attacks, collision, replication, JavaScript object, or Three.js object.

As a sector approaches activation range:

```text
sector count decreases
→ active pack materializes
→ enemies enter Tier 2
```

## 12.5 Hysteresis

All tiers use separate enter/leave thresholds to prevent thrashing.

## 12.6 Promotion overrides

Always promote or retain higher fidelity for:

- Elite/boss.
- Active attacker.
- Recent knockback/hit target.
- Critical telegraph.
- Leader escort in active formation.
- Entity intersecting a relevant projectile path.

## 12.7 Difficulty invariance

LOD may change update frequency and representation. It must not change HP, damage, speed over real time, reward, ownership, population count, or authoritative outcome.

---

# 13. Far-horde visual layer

The far-horde layer creates the appearance of an invasion larger than the active simulation.

Target concept:

```text
300–400 individually active enemies
+ 300–700 distant visual population
```

Far visuals may be GPU instances, low-poly crowds, billboards, or shader-driven sector clusters.

They are not individually shootable and must materialize before entering effective weapon range.

On leader death:

```text
wave-owned aggregate sectors collapse
wave distant visuals dissolve/flee
wave active cohort purges
ambient sectors remain
```

---

# 14. Rendering architecture

## 14.1 Fodder instancing

Use one `InstancedMesh` or equivalent batch per archetype/LOD.

Per-instance data:

```text
position
yaw
scale
animation phase
flash
death/purge phase
variant
```

Do not create a unique cloned model hierarchy for every fodder enemy.

## 14.2 Special rigs

Unique object hierarchies are acceptable for bounded elites, bosses, large specialists, and complex telegraph enemies.

## 14.3 Shadows

- Elite/boss near: selected shadows.
- Near fodder: receive shadow; limited/no cast shadow.
- Mid/far: no dynamic cast shadow.

## 14.4 Animation

- Tier 0: full cheap animation.
- Tier 1: reduced update frequency.
- Tier 2: shader phase or low-rate pose.
- Tier 3: GPU crowd movement.

## 14.5 Pooling

Pool enemy slots, instance indices, telegraphs, death effects, projectiles, and XP visuals.

---

# 15. Authoritative simulation data

## 15.1 Central update

One central authority update loop owns all enemies. No per-enemy independent update loop.

## 15.2 Data layout

Early refactoring may retain objects. At high count, hot fodder fields may migrate to packed arrays/SoA:

```text
position arrays
velocity arrays
yaw
hp
flags
type ID
wave ID
tier
```

Elite/special runtime may remain richer objects. Do not do a complete SoA rewrite without profiling evidence.

## 15.3 Time slicing

Use deterministic groups:

```ts
group = enemyId % tierUpdateGroupCount;
```

- Tier 0 updates all.
- Tier 1 updates one of 2–3 groups.
- Tier 2 updates one of 6–15 groups.

Integrate using real elapsed time since previous update.

---

# 16. Multiplayer networking

## 16.1 Parity

Multiplayer uses the exact same StageDirector, HordeDirector, WaveController, content, RNG rules, and cap. Networking is a representation problem, not a difficulty modifier.

## 16.2 Full-state limitation

Repeatedly sending full verbose enemy objects at 20 Hz does not scale to hundreds of enemies.

## 16.3 Logical channels

```text
critical gameplay events
near-enemy deltas
mid-enemy deltas
far-sector state
spawn/despawn
wave state
```

One WebSocket may carry all typed messages.

## 16.4 Reliable events

Send ordered events for pack spawn, materialization, death, purge, aggregation, wave start, leader assignment, and wave clear.

## 16.5 Near replication

Tier 0 at 10–20 Hz delta:

- Quantized transform.
- HP only when changed.
- Attack/telegraph flags.
- Impulse state.

## 16.6 Mid replication

Tier 1 at 5–10 Hz:

- Transform.
- Coarse state flags.
- Changed HP.

## 16.7 Far replication

Tier 2 at 1–2 Hz:

- Coarse transform.
- Route cell/direction.
- Wave ownership.

## 16.8 Aggregate replication

Tier 3 sends sector ID, enemy type ID, count, center, direction, wave ID, and presentation seed only when meaningfully changed.

## 16.9 Compact records

Intermediate compact JSON array:

```text
[id, typeId, qx, qy, qz, qyaw, hp, flags]
```

Binary `ArrayBuffer` records are a later option if measurement shows compact JSON is insufficient.

## 16.10 Quantization

Quantize position, elevation, yaw, HP, and bounded timers for the 400×400 world.

## 16.11 Shared interest origin

Both clients share the tank’s gameplay relevance area. Client camera frustum only affects rendering, not authoritative simulation.

## 16.12 Backpressure

Measure bytes, serialization, parsing, and `bufferedAmount`.

When pressured:

1. Reduce/coalesce far updates.
2. Preserve critical attacks, damage, leader death, and phase transitions.
3. Never silently lower gameplay population.

---

# 17. Single Player execution

Single Player runs the same content and gameplay systems locally, including simulation LOD and rendering LOD. It bypasses network serialization only.

This keeps gameplay parity exact and makes Single Player a meaningful performance/reproduction environment.

---

# 18. Population limits and targets

## 18.1 Current caution

The current architecture is not certified for a large horde due to O(n²) separation, every-enemy 30 Hz updates, individual object hierarchies, full-state JSON snapshots, and global area scans.

## 18.2 Benchmark ladder

Test:

```text
25, 50, 75, 100, 150, 200, 250, 300, 400, 500
```

Measure server/local simulation, client frame times, enemy update, navigation, spatial queries, render, draw calls, snapshot bytes, serialization, parse, GC, and buffered output.

## 18.3 Capacity milestones

- **Baseline:** no final count selected; provisional safety design around measured capacity, approximately 100 until certified.
- **First horde milestone:** 200–300 active after spatial hash, separation removal, instancing, and spatial area queries.
- **Release target:** 300–400 active after flow field, LOD, time slicing, and compact replication.
- **Stretch:** 400–500 active after profiling.
- **Visual invasion:** 300–400 active plus 300–700 distant visual population for 600–1,000+ perceived monsters.

These are engineering targets, not guarantees.

## 18.4 Cap structure

```ts
export interface PopulationLimits {
  hardEntityCap: number;

  ambientSoftEntityCap: number;
  ambientSoftThreatCap: number;

  waveSoftEntityCap: number;
  waveSoftThreatCap: number;

  eliteAndBossReserve: number;
  technicalEmergencyReserve: number;

  aggregateVisualCap: number;
}
```

Reserve capacity for elite/boss, critical summons, near-field materialization, and death presentation.

---

# 19. Shared gameplay definition

Both modes reference one horde director:

```json
{
  "hordeDirector": "horde.mainStage"
}
```

Do not introduce implicit `singlePlayerEasy` and `multiplayerHard` variants.

Future difficulty must be an explicit product-facing choice.

---

# 20. Proposed content model

```ts
export interface HordeDirectorDefinition {
  id: string;
  label: string;

  stage: StageSequenceDefinition;
  farmingPhases: FarmingPhaseDefinition[];
  waves: WaveDefinition[];
  bossWave: BossWaveDefinition;

  packs: string[];
  limits: PopulationLimits;

  lodPolicyId: string;
  replicationPolicyId: string;
  navigationPolicyId: string;
}

export interface StageSequenceDefinition {
  farmingCountdownSeconds: number;
  triggers: Array<{
    atRemainingSeconds: number;
    waveId: string;
  }>;
  bossAtRemainingSeconds: number;
  pauseCountdownDuringWave: true;
}

export interface WaveDefinition {
  id: string;
  label: string;

  leaderEnemyId: string;

  openingPackIds: string[];
  reinforcementPackIds: string[];

  openingThreat: number;
  reinforcementThreat: number;
  reinforcementThreatPerSecond: number;

  maximumActiveWaveThreat: number;
  maximumActiveWaveEntities: number;

  approachPolicyId: string;
  rewardTableId: string;

  purgeWaveCohortOnLeaderDeath: true;
}

export interface BossWaveDefinition extends WaveDefinition {
  bossEnemyId: string;
  hpThresholdEvents?: Array<{
    hpRatio: number;
    packIds: string[];
    threatBudget: number;
  }>;
  completion: "clearStage";
}
```

LOD and navigation policies are separate content definitions so they can be tuned without rewriting waves.

---

# 21. Current repository integration map

```text
src/shared/spawning/spawnDirectorRuntime.ts
→ evolve/delegate to StageDirector + HordeDirector

src/shared/content/schemas/spawnDirector.ts
→ replace demo-specific fields with general horde content

content/spawnDirectors/
→ add shared main-stage horde definition

content/modes/demoScoreAttack.json
content/modes/singlePlayerScoreAttack.json
→ reference the same horde definition

src/shared/enemies/enemySystem.ts
→ tiered central updates and population management

src/shared/enemies/enemyBehaviors.ts
→ remove global pair separation
→ add flow/density primitives

map generation / arena world
→ expose navigation regions and spawn anchors

client entity presentation
→ instanced fodder

server room / protocol
→ tiered delta replication

shared types
→ stage, wave ownership, LOD, compact contracts
```

---

# 22. Implementation program

## Milestone 0 — Measurement and audit

- Benchmark current 25–200 enemy performance.
- Measure snapshot bytes.
- Inventory full-population scans and object creation.
- Record baseline.

## Milestone 1 — Core-loop state machine

- Add farming countdown and explicit phases.
- Pause during waves.
- Add leader-death transition and boss clear.
- Keep old spawn director through temporary adapter.

## Milestone 2 — Population ownership

- Add ambient/wave/boss tags.
- Add wave/leader IDs.
- Add cohort purge.
- Suppress purge rewards.

## Milestone 3 — Packs and waves

- Add pack/wave schemas.
- Add finite reinforcements.
- Add leader formation and spawn-plan contract.
- Use placeholders until monster roster is designed.

## Milestone 4 — Spatial foundation

- Add enemy spatial hash.
- Remove O(n²) separation.
- Spatialize explosions/contact.
- Add density steering.
- Rebenchmark.

## Milestone 5 — Rendering scale

- Add instanced fodder and pooling.
- Add LOD materials.
- Remove per-fodder clone hierarchy.
- Rebenchmark CPU/GPU.

## Milestone 6 — Navigation

- Generate regions/flow field.
- Add tier-aware movement and stuck recovery.
- Validate dramatic terrain.

## Milestone 7 — Simulation LOD

- Add Tier 0/1/2 update groups.
- Add hysteresis and promotion overrides.
- Rebenchmark 300–500.

## Milestone 8 — Multiplayer replication

- Add spawn/despawn events.
- Add near/mid/far deltas.
- Compact records and backpressure metrics.
- Test two clients.

## Milestone 9 — Aggregate horde

- Add sector population/materialization.
- Add conservative demotion and far visuals.
- Add wave-sector collapse.

## Milestone 10 — Final content tuning

- New roster, elites, boss, XP, packs, targets, reinforcement rates, UI, music, and full-stage balance.

---

# 23. Testing

## 23.1 Progression

- Countdown starts at 180.
- Waves trigger at 120 and 60.
- Boss triggers at 0.
- Countdown pauses/resumes correctly.
- Tank death ends immediately.
- Boss death clears.
- Transitions occur once.

## 23.2 Ownership

- Ambient survives wave clear.
- Correct wave IDs.
- Only owned cohort purges.
- Purge gives no XP/drop/kill hook.
- Normally killed wave monsters follow configured rewards.

## 23.3 Reinforcement

- Finite reserve decreases and never goes negative.
- No spawn after leader death.
- Active and technical caps respected.
- Strong clearing opens formation.

## 23.4 Spawn planning

- No near visible pop-in.
- Reachability/terrain/cooldown respected.
- Deterministic result from seed.

## 23.5 Navigation

- Horde reaches tank across valleys and access roads.
- Does not climb invalid cliffs.
- No permanent cap-consuming trap.
- Elite stays with escort.
- Far movement integrates elapsed time correctly.

## 23.6 LOD

- Hysteresis works.
- HP/damage/reward unchanged.
- Promotion override works.
- Aggregate materialization preserves count and threat.
- Demotion is not visible.

## 23.7 Multiplayer

- Same horde definition in both modes.
- Ordered critical events.
- Consistent population on Driver/Gunner.
- Backpressure bounded.
- Two-client long run passes.

## 23.8 Rendering

- Draw calls scale with archetypes, not count.
- Slots/materials release correctly.
- No leaks on purge/rematch.
- LOD transitions are acceptable.

## 23.9 Capacity

At every benchmark count run stationary, moving, wave burst, explosion-heavy, Charge Shot splash, Dash contact, leader purge, and two-client scenarios.

---

# 24. Telemetry and tools

Horde debug overlay:

```text
stage phase and farming time
wave/leader IDs and HP

ambient/wave/boss counts and threat
aggregate visual count

soft/hard caps and reserve

spawn budget, selected pack, anchor failures

Tier 0/1/2/3 counts

enemy update, flow, spatial query, render time
draw calls

snapshot/enemy/sector bytes
parse time
WebSocket buffered amount
```

Developer controls:

```text
force phase
force wave
kill leader
set population target
spawn pack
freeze spawning
visualize flow
visualize spatial cells
visualize anchors
visualize LOD rings
```

---

# 25. Expandability

The architecture supports:

- New farming phases through content.
- New waves/packs/elites/bosses.
- New biomes and anchor tags.
- Endless mode.
- Multiple stages.
- Alternate objectives.
- Summoner/flying/burrowing populations.
- Explicit future difficulty settings.

Difficulty variants must be deliberate player choices, never an implicit mode difference.

---

# 26. Open decisions

Still requires monster design, upgrade integration, profiling, networking tests, and playtesting:

1. Exact monster archetypes.
2. Elite and boss designs.
3. XP values.
4. Ambient/wave counts.
5. Reinforcement rates.
6. Certified hard cap.
7. Far-horde visual method.
8. Escort positioning behavior.
9. Reward amount for normally killed wave fodder.
10. Purge presentation.
11. Whether special long-range effects can interact with aggregate visuals.
12. Future difficulty modifier policy.

---

# 27. Acceptance criteria

The foundation is complete only when:

1. Three-minute farming countdown and paused waves work.
2. Leader death resumes countdown.
3. Boss death clears; tank death ends immediately.
4. Ambient survives wave clear.
5. Wave cohort tags and purge are correct.
6. Purge grants no unintended rewards.
7. Reinforcements are finite.
8. Leader protection emerges from crowd/formation gameplay.
9. Both modes use the same horde definition, counts, stats, waves, and rewards.
10. O(n²) separation is removed.
11. Area queries use a spatial index.
12. Fodder rendering is instanced.
13. Dramatic terrain uses shared flow navigation.
14. Distant enemies use reduced simulation frequency.
15. Far populations may aggregate by sector.
16. LOD never changes difficulty or outcome.
17. Multiplayer does not resend full verbose enemies at 20 Hz.
18. Critical gameplay events remain immediate.
19. Population limits are data-driven and benchmark-supported.
20. Debug tooling exposes phase and capacity state.
21. Waves, packs, elites, bosses, and stages are content-expandable.
22. Core progression and horde implementation remain separate modules joined through typed contracts.

Final invariant:

> Recoil Crew runs one shared authoritative horde game in Single Player and Multiplayer: farming continuously fills the world, elite-led waves temporarily add a finite crisis population, and scalable simulation, rendering, and replication preserve the same gameplay pressure at every distance.
