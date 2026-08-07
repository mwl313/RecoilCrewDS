# Codex Prompt — Implement Horde Density V1

Repository:

```text
https://github.com/mwl313/RecoilCrewDS
```

Target:

```text
current origin/main
```

Binding design:

```text
docs/horde/HORDE_DENSITY_V1_DESIGN.md
```

## Mission

Make Recoil Crew substantially more saturated with monsters.

Target experience:

```text
roughly 2× perceived horde density
without roughly 2× combat lethality
```

Most additional population must be close-range fodder.

Keep for V1:

```text
hardEntityCap = 300
FODDER_CAPACITY = 512
```

Do not raise those engineering caps unless a genuine implementation blocker proves otherwise.

---

# 1. Audit current main

Run:

```bash
git fetch --all --prune
git switch main
git pull --ff-only origin main
git status --short
git rev-parse HEAD
```

Inspect at minimum:

```text
content/horde/populationLimits.json
content/horde/farmingPhase1.json
content/horde/farmingPhase2.json
content/horde/farmingPhase3.json
content/horde/spawnPackProductionFarmingCluster.json
content/horde/spawnPackProductionMixedFarming.json
content/horde/spawnPackProductionWaveCohort.json
content/horde/spawnPackProductionBossEscort.json
content/horde/waveProduction1.json
content/horde/waveProduction2.json
content/horde/bossWaveProduction.json
content/horde/policyAnchor.json
content/horde/policyLod.json
content/horde/policyReplication.json
current enemy gameplay roster content
src/shared/horde/hordeDirector.ts
src/shared/horde/populationManager.ts
src/shared/horde/spawnPlanner.ts
src/shared/horde/spawnAnchors.ts
src/shared/horde/waveController.ts
src/shared/enemies/
src/shared/net/horde/
src/client/app/entityViewRegistry.ts
src/client/enemies/instancedEnemyRenderer.ts
src/client/animation/
src/client/app/debugOverlay.ts
scripts/benchmark-enemies.ts
package.json
```

Inspect existing tests before naming new ones.

Record starting SHA and baseline benchmark numbers.

---

# 2. Farming targets — use these starting values

## Phase 1

```json
{
  "entityTargetStart": 20,
  "entityTargetEnd": 32,
  "threatTargetStart": 25,
  "threatTargetEnd": 42,
  "spawnIncomeStart": 1.6,
  "spawnIncomeEnd": 2.4
}
```

## Phase 2

```json
{
  "entityTargetStart": 32,
  "entityTargetEnd": 50,
  "threatTargetStart": 42,
  "threatTargetEnd": 66,
  "spawnIncomeStart": 2.4,
  "spawnIncomeEnd": 3.2
}
```

## Phase 3

```json
{
  "entityTargetStart": 50,
  "entityTargetEnd": 72,
  "threatTargetStart": 66,
  "threatTargetEnd": 95,
  "spawnIncomeStart": 3.2,
  "spawnIncomeEnd": 4.4
}
```

Do not raise the hard cap.

---

# 3. Increase production pack totals

## Farming Cluster

Target:

```text
6 total entities
entityCost 6
threatCost approximately 6
cooldown approximately 1.25s
```

## Mixed Farming Group

Target:

```text
7 total entities
entityCost 7
threatCost approximately 8
cooldown approximately 1.5s
```

The production roster allocator may determine final role split. Do not defeat it by hardcoding the wrong composition.

## Wave Cohort

Target:

```text
8 total entities
entityCost 8
threatCost approximately 14–16
```

Use actual threat semantics.

Preserve atomic pack spawning.

---

# 4. Change ordinary mix

Change production ordinary mix to:

```text
closeFodder:  0.65
rangedFodder: 0.25
specialist:   0.10
```

Preserve phase candidate weighting and featured identity selection.

Do not increase elite leaders.

---

# 5. Boss escorts

Change current boss ordinary escort range to:

```text
8–10
```

Keep one boss.

---

# 6. Make preferred spawn distance data-driven

Add a policy field such as:

```json
"preferredTankDistance": 55
```

Update schema/content loading/generated content as necessary.

Change spawn planner scoring to read the policy field.

Backward-compatible fallback if absent:

```text
70m
```

Do not replace one magic number with another hardcoded magic number.

---

# 7. Near-field no-pop-in distance

Tune routine visible-near exclusion/minimum distance to about:

```text
22–24m
```

Preserve:
- safe-zone exclusion;
- terrain/reachability checks;
- cliff validation;
- anchor capacity;
- deterministic planning.

Do not spawn routine packs directly beside the tank.

---

# 8. Add density telemetry

Extend horde debug/telemetry with at least:

```text
global live count
live within 45m
live within 70m
current entity target
current threat target
current spawn income
last pack size
last anchor distance
anchor failures
```

Add close/ranged/specialist live counts if cheap.

This is needed because global count alone does not measure perceived density on urban400.

---

# 9. Preserve melee concurrency

Audit current melee engagement profile.

Keep approximately:

```text
max active melee engagement slots = 6
```

Do not raise it merely because more melee monsters exist.

---

# 10. Ranged/specialist pressure

First implement density and test it.

If ranged/specialist pressure becomes unfair, add lightweight data-driven concurrency limits.

Suggested fallback:

```text
ranged active attack windows:      8–10
specialist active ability windows: 3–4
```

Waiting enemies still move/reposition and rotate into eligibility.

Do not reduce global monster count first.

If current behavior is already fair, do not overbuild this system. Document that it was tested and not required.

---

# 11. Fix wave authored-cap semantics

The wave runtime must retain and enforce authored:

```text
maximumActiveWaveEntities
maximumActiveWaveThreat
```

Add them to `WaveRuntime` and initialize them from `openWave()` options.

Reinforcement preflight must enforce both authored maxima in addition to global cap/reserve/reinforcement-budget rules.

Do not leave wave maxima as dead metadata.

---

# 12. Fix living wave population accounting

When an ordinary wave-owned enemy dies:

```text
runtime.activeWaveEntities -= 1
runtime.activeWaveThreat -= authoritative threat
```

exactly once.

Requirements:
- leader death remains correct;
- later purge cannot double-decrement;
- counts clamp at zero;
- multiple simultaneous deaths remain deterministic.

Add tests.

---

# 13. Wave V1 target values

After accounting fixes:

## Wave 1

```text
maximumActiveWaveEntities: 48
maximumActiveWaveThreat:   75
reinforcementThreatPerSecond: about 2.5
```

## Wave 2

```text
maximumActiveWaveEntities: 64
maximumActiveWaveThreat:   100
reinforcementThreatPerSecond: about 3.5
```

## Boss

Prefer:

```text
maximumActiveWaveEntities: 80
maximumActiveWaveThreat:   approximately 120–135
reinforcementThreatPerSecond: about 3.5
```

Do not exceed 80 active boss-wave entities in V1 without direct performance evidence.

---

# 14. Soft caps

Keep:

```text
hardEntityCap: 300
eliteAndBossReserve: 16
technicalEmergencyReserve: 8
```

Recommended starting soft caps:

```text
ambientSoftEntityCap: 96
ambientSoftThreatCap: 120–130
waveSoftEntityCap: 120
waveSoftThreatCap: 150
```

Audit `PopulationManager.ambientCapacity()` because it currently combines ambient + wave counts.

If that behavior conflicts with intended overlap, clarify policy semantics cleanly rather than merely inflating numbers.

---

# 15. Stored spawn budget

Audit current `maximumStoredBudget = 40`.

Only if telemetry shows clipping/idle cadence, raise to approximately:

```text
48–56
```

Avoid burst dumping after a temporary spawn blockage.

---

# 16. Formation sizing

Suggested first pass:

```text
Farming Cluster:
spacing 2.2–2.5
radius 7–8

Mixed Farming:
spacing 2.6–2.8
radius 9–10

Wave Cohort:
spacing ~3.0
radius 11–13
```

Avoid overlapping spawns.

---

# 17. Anchor-capacity audit

Larger packs must still pass:

```text
anchor.capacity >= pack.entityCost
```

Test urban400 anchor availability and anchor failures.

Do not remove capacity checks.

If capacity causes starvation, adjust deterministic anchor capacity conservatively or provide a compatible fallback.

---

# 18. Engineering caps remain unchanged

Binding:

```text
hardEntityCap = 300
FODDER_CAPACITY = 512
```

Do not change these in this milestone.

The expected late battlefield population is around 100–120, far below both.

---

# 19. Preserve scalability systems

Do not regress:
- instanced fodder;
- animation LOD;
- near/mid/far replication;
- sector aggregation;
- horde materialization;
- flow-field navigation;
- spatial queries.

Do not globally increase network update rates.

---

# 20. Progression measurements

After density implementation, measure before/after:

```text
kills/min
XP/min
level-ups/min
chests/run
enemy-drop chest attempts/min
relic acquisitions/run
score/min
```

Do not preemptively halve rewards.

If progression approaches 2× current pace, target approximately:

```text
1.2–1.35× current pace
```

by tuning ordinary-enemy rewards/drop chances while preserving elite/boss reward identity.

---

# 21. World-UI/reward soak

Current main includes health bars, damage numbers, combat display units, XP/relic systems.

Test density with:
- damaged-only bars;
- damage popup pooling/coalescing;
- XP shards;
- chest drops;
- relic rendering.

Do not accept a patch where those become the new bottleneck.

---

# 22. Performance gates

Run existing benchmark harness.

Also perform real two-client urban400 browser soak:
- Driver;
- Gunner;
- Phase 3;
- Wave 2;
- boss.

Measure:
- server step p50/p95/p99;
- both-client FPS/frame intervals;
- render submit;
- draw calls/triangles;
- animation cost;
- bandwidth;
- outbound buffering;
- near/mid/far/sector replication counts.

The two-client browser soak is the binding gate, not the 750-enemy server-only benchmark.

---

# 23. Manual feel targets

Aim approximately for:

```text
Phase 1: 12–20 within ~70m
Phase 2: 20–30 within ~70m
Phase 3: 30–45 within ~70m

Wave 1 total battlefield: ~60–75
Wave 2: ~85–105
Boss: ~95–120+
```

Do not force these via unsafe close spawning.

---

# 24. Difficulty tuning order

If too lethal:

```text
1. reduce ranged/specialist mix
2. add/tighten attack concurrency
3. reduce reinforcement rate slightly
4. reduce threat target slightly
5. only then reduce entity target
```

Preserve the swarm look.

---

# 25. If still too empty

Tune in this order:

```text
1. preferred spawn distance
2. nearby anchor weighting
3. pack size
4. spawn income
5. entity targets
6. soft caps
7. hard cap last
```

---

# 26. Generated content

After source JSON/schema changes, run the repository's actual content generation script (likely `npm run generate:content-pack`; verify first).

Do not edit generated pack files by hand.

---

# 27. Tests

Add/update tests for:
- phase target interpolation;
- pack count/cost;
- atomic spawning;
- 65/25/10 allocator convergence;
- preferred-distance policy;
- too-close spawn rejection;
- wave cap persistence/enforcement;
- wave entity/threat decrement on ordinary death;
- purge no double-decrement;
- boss escort 8–10;
- hard cap still 300;
- fodder capacity still 512;
- density telemetry;
- content/schema generation;
- SP/MP production-horde parity.

Run all relevant horde/coreloop/netcode/progression suites.

---

# 28. Implementation report

Create:

```text
docs/horde/HORDE_DENSITY_V1_IMPLEMENTATION_REPORT.md
```

Include:
- start/end SHA;
- exact values changed;
- pack sizes/costs;
- roster mix;
- preferred spawn distance;
- wave accounting fixes;
- wave caps;
- boss escort values;
- soft caps;
- confirmation hard cap remains 300;
- confirmation renderer capacity remains 512;
- baseline vs new server benchmark;
- two-client browser results;
- nearby population telemetry;
- progression speed before/after;
- whether ranged/specialist concurrency caps were needed;
- follow-up recommendation.

---

# 29. Forbidden shortcuts

Do not:
- set hardEntityCap to 600;
- raise FODDER_CAPACITY;
- blindly double every enemy type;
- double elite/specialist counts;
- spawn visibly beside the tank;
- remove terrain-aware validation;
- globally raise replication frequencies;
- edit generated content manually;
- hide performance regression by degrading camera/input responsiveness;
- immediately nerf all XP without measurement;
- call the task complete based only on server benchmarks.

Definition of done is the complete checklist in the binding design document.
