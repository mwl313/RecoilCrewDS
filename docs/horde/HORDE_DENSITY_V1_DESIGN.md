# Recoil Crew — Horde Density V1 Design
## Increase perceived monster saturation without doubling lethality

**Status:** Binding gameplay/system design specification
**Repository:** `mwl313/RecoilCrewDS`
**Target:** current `origin/main` at implementation time
**Scope:** Main Stage / Single Player Main Stage horde density and encounter pacing
**Primary goal:** Make the battlefield feel heavily saturated with monsters while preserving readable, controllable combat pressure
**Do not change yet:** 300 hard enemy cap, 512 instanced-fodder render capacity

---

# 0. Product intent

Recoil Crew should feel like:

> The battlefield belongs to the horde.

The current production stage is technically capable of supporting far more enemies than it normally asks the horde director to maintain. The problem is therefore not primarily a hard-cap problem. It is a **desired-population, spawn-batch, spawn-distance, composition, and attack-concurrency problem**.

The objective of Horde Density V1 is:

```text
roughly 2× perceived monster density
without roughly 2× actual lethality
```

The additional population should come mostly from ordinary close-range fodder.

Do not accomplish density by:
- doubling elite count;
- doubling specialist count;
- allowing all visible enemies to attack simultaneously;
- raising the hard cap to 600 before needed;
- spawning huge numbers far away where the player cannot feel them.

---

# 1. Current production baseline

The existing farming targets are approximately:

```text
PHASE 1
entities 10 → 18
threat   12 → 22
income   0.8 → 1.2 / sec

PHASE 2
entities 18 → 26
threat   22 → 32
income   1.2 → 1.6 / sec

PHASE 3
entities 26 → 36
threat   32 → 46
income   1.6 → 2.2 / sec
```

Current production farming packs are small:

```text
Production Farming Cluster
3 entities
threat cost 3
cooldown 1.5s

Production Mixed Farming Group
3 entities
threat cost 4
cooldown 2.0s

Production Wave Cohort
4 entities
threat cost 8
```

Current ordinary monster roster composition is approximately:

```text
50% close fodder
30% ranged fodder
20% specialist
```

Current global limits:

```text
hardEntityCap              300
ambientSoftEntityCap        80
ambientSoftThreatCap       100
waveSoftEntityCap          100
waveSoftThreatCap          120
eliteAndBossReserve         16
technicalEmergencyReserve    8
```

Current renderer capacity:

```text
FODDER_CAPACITY = 512
```

Horde Density V1 should remain comfortably below these engineering ceilings.

---

# 2. Design principle: perceived density > global count

A 400×400m map can contain many enemies and still feel sparse if most are:
- behind buildings;
- 80–140m away;
- approaching slowly;
- concentrated on the wrong side of the map.

Therefore success is not:

```text
"there are 100 enemies somewhere"
```

Success is:

```text
"when the player looks around, the immediate combat space is crowded"
```

Density V1 should tune:
1. desired active population;
2. spawn pack size;
3. spawn income;
4. spawn distance preference;
5. ordinary-enemy role mix;
6. attack concurrency;
7. wave accounting;
8. reinforcement pacing.

---

# 3. Recommended farming targets

Use these as the first-pass production values.

## Phase 1

```text
entityTargetStart: 20
entityTargetEnd:   32
threatTargetStart: 25
threatTargetEnd:   42
spawnIncomeStart:  1.6
spawnIncomeEnd:    2.4
```

## Phase 2

```text
entityTargetStart: 32
entityTargetEnd:   50
threatTargetStart: 42
threatTargetEnd:   66
spawnIncomeStart:  2.4
spawnIncomeEnd:    3.2
```

## Phase 3

```text
entityTargetStart: 50
entityTargetEnd:   72
threatTargetStart: 66
threatTargetEnd:   95
spawnIncomeStart:  3.2
spawnIncomeEnd:    4.4
```

These values intentionally increase target population by roughly 1.8–2× while retaining plenty of headroom under the existing hard cap.

Do not automatically double again if the first browser build feels good.

---

# 4. Spawn pack sizing

Larger batches are necessary because tiny 3-monster arrivals do not sell the feeling of a horde.

## Farming Cluster

Target:

```text
6 total entities
entityCost: 6
threatCost: approximately 6
cooldownSeconds: approximately 1.25
```

## Mixed Farming Group

Target:

```text
7 total entities
entityCost: 7
threatCost: approximately 8
cooldownSeconds: approximately 1.5
```

Do not author the final role split incorrectly if the production roster mixer rebinds the pack. The total count should be 7 and the roster allocator should produce the desired composition.

## Production Wave Cohort

Target:

```text
8 total entities
entityCost: 8
threatCost: approximately 14–16
```

Threat cost should reflect actual enemy-threat accounting, not merely copy entity count if ranged/specialist slots are more expensive.

---

# 5. Ordinary monster role mix

Do not preserve the current `50 / 30 / 20` split at double population.

Recommended Density V1 target:

```text
closeFodder:   0.65
rangedFodder:  0.25
specialist:    0.10
```

At a late farming target of ~72 enemies this is roughly:

```text
47 close
18 ranged
7 specialist
```

The extra density should predominantly be **bodies**, not extra high-value abilities/projectiles.

---

# 6. Preserve elite scarcity

Do not increase normal elite-wave leader count merely to make the screen busier.

For V1:

```text
Wave 1 elite leader count: keep current
Wave 2 elite leader count: keep current
Boss count: keep 1
```

Elite identity is stronger when surrounded by ordinary monsters.

---

# 7. Boss escort density

Current boss escort selection is approximately 4–6 ordinary escorts.

Recommended Density V1:

```text
bossEscortCount: [8, 10]
```

Do not exceed ~12 in this pass without manual testing.

---

# 8. Spawn distance policy

Current routine spawn scoring strongly prefers a distance around ~70m.

Recommended farming target distance:

```text
preferredTankDistance ≈ 55m
```

Recommended no-pop-in distance:

```text
minimum / visible near-field exclusion ≈ 22–24m
```

Desired behavior:

```text
<22m:   never spawn ordinary farming packs
22–40m: possible but low priority
50–60m: preferred routine farming band
80m+:   lower preference for routine farming
```

This should shorten time-to-engagement without obvious materialization beside the tank.

---

# 9. Make preferred distance data-driven

Do not leave a magic `70` buried in spawn-planner scoring.

Extend the anchor/spawn policy with something like:

```json
{
  "preferredTankDistance": 55
}
```

The planner should use the policy value with a backward-compatible fallback preserving legacy fixtures if the field is absent.

---

# 10. Encounter-density telemetry

Add telemetry for **nearby live population around the tank**.

Recommended bands:

```text
0–45m
0–70m
global
```

Track at least:

```text
nearbyEnemyCount45
nearbyEnemyCount70
globalEnemyCount
```

Optional split:

```text
nearbyClose
nearbyRanged
nearbySpecialist
```

Target feel ranges:

```text
Phase 1: ~12–20 enemies within ~70m much of the time
Phase 2: ~20–30
Phase 3: ~30–45
```

These are feel targets, not hard spawn caps.

---

# 11. Keep melee attack concurrency controlled

Preserve approximately:

```text
maximum melee engagement slots: 6
```

Do not increase this just because more close enemies exist.

Desired picture:

```text
40–50 close enemies can surround/chase
but only ~6 occupy active melee attack positions
```

---

# 12. Ranged/specialist concurrency fallback

Audit whether ranged/specialist attacks naturally remain fair under the new density.

If projectile/ability pressure becomes oppressive, add lightweight data-driven concurrency budgets such as:

```text
ranged active attack windows:       ~8–10
specialist active ability windows:  ~3–4
```

Waiting enemies should continue moving/repositioning and rotate into attack eligibility as slots free.

Do not build this machinery if real play proves it unnecessary.

---

# 13. Fix wave authored-cap semantics

The current wave API accepts:

```text
maximumActiveWaveThreat
maximumActiveWaveEntities
```

but those authored maxima are not fully retained/enforced as definitive runtime reinforcement gates.

Add to `WaveRuntime`:

```ts
maximumActiveWaveThreat: number;
maximumActiveWaveEntities: number;
```

Populate from `openWave()` options.

Reinforcement preflight must enforce:

```text
runtime.activeWaveEntities + packEntities <= runtime.maximumActiveWaveEntities
runtime.activeWaveThreat + packThreat <= runtime.maximumActiveWaveThreat
```

while also respecting global hard/soft caps and remaining reinforcement budget.

---

# 14. Wave live counters must represent living cohort population

When a wave-owned ordinary enemy dies:

```text
runtime.activeWaveEntities -= 1
runtime.activeWaveThreat -= that enemy's authoritative threat
```

exactly once.

Requirements:
- leader accounting remains correct;
- later purge cannot double-decrement;
- counts clamp at zero;
- ownership/wave id is authoritative association.

This fix is required before increased wave caps are trusted.

---

# 15. Wave density targets

## Wave 1

```text
maximumActiveWaveEntities: 48
maximumActiveWaveThreat:   ~75
reinforcementThreatPerSecond: ~2.5
```

## Wave 2

```text
maximumActiveWaveEntities: 64
maximumActiveWaveThreat:   ~100
reinforcementThreatPerSecond: ~3.5
```

## Boss wave

Keep within current range:

```text
maximumActiveWaveEntities: 72–80
maximumActiveWaveThreat:   ~120–135
reinforcementThreatPerSecond: ~3.5
```

Do not increase boss active-wave cap above 80 in V1 without evidence.

---

# 16. Combined battlefield expectations

Intended approximate populations:

```text
End Phase 1 / Wave 1:
ambient ~30–32
wave ~30–45
total ~60–75

End Phase 2 / Wave 2:
ambient ~45–50
wave ~40–55
total ~85–105

Phase 3 / Boss:
ambient ~60–72
boss + escorts/reinforcements ~30–50
total ~95–120+
```

These are observation targets, not literal fixed caps.

---

# 17. Keep engineering caps unchanged in V1

Binding:

```text
hardEntityCap = 300
FODDER_CAPACITY = 512
```

Do not change either merely because a synthetic server benchmark survived more.

The real two-client browser is the more meaningful next constraint.

---

# 18. Soft-cap guidance

Recommended first pass:

```text
ambientSoftEntityCap: 96
ambientSoftThreatCap: 120–130
waveSoftEntityCap:    120
waveSoftThreatCap:    150
```

Keep:

```text
hardEntityCap: 300
eliteAndBossReserve: 16
technicalEmergencyReserve: 8
```

Audit `PopulationManager.ambientCapacity()` because it currently combines ambient + wave counts. If that behavior unintentionally suppresses desired farming/wave overlap, clarify the policy rather than blindly inflating numbers.

---

# 19. Spawn budget storage

Current `maximumStoredBudget` is 40.

With larger income/packs, audit clipping.

Recommended if needed:

```text
maximumStoredBudget: 48–56
```

Do not allow giant post-stall spawn dumps.

---

# 20. Formation spacing

Larger packs should not spawn as one pile.

Suggested:

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

---

# 21. Spawn-anchor capacity audit

The planner rejects anchors where:

```text
anchor.capacity < pack.entityCost
```

After moving to 6–8 entity packs:
- test urban400 anchor acceptance;
- monitor anchor failure counts;
- ensure enough valid anchors exist.

Do not remove capacity validation.

---

# 22. Spawn fairness

Keep:
- safe/recovery-zone exclusion;
- minimum tank distance;
- reachability;
- terrain/cliff validation;
- deterministic planning.

Density should feel like the city is continuously feeding enemies into combat, not like enemies pop into existence beside the tank.

---

# 23. Progression/economy consequences

More monsters mean more:
- kills;
- XP;
- XP shards;
- score;
- enemy-drop chest rolls;
- relic opportunities.

Do not automatically rebalance rewards in the same first pass.

Measure before/after:

```text
kills/min
XP/min
levels/min
chests/run
enemy-drop chests/min
relic acquisitions/run
score/min
```

Preferred post-density progression speed:

```text
~1.2–1.35× previous pace
```

rather than necessarily 2×.

If progression approaches 2×, reduce ordinary-enemy reward output/chest chances before cutting elite/boss rewards.

---

# 24. XP / world-UI pressure

Density V1 must soak-test:
- XP shard pooling/magnet;
- damaged-only health bars;
- floating damage numbers;
- MG popup coalescing;
- relic chest drops.

Do not accept a horde patch that moves the bottleneck into reward/world UI presentation.

---

# 25. Rendering/network scalability

Preserve:
- instanced fodder;
- animation LOD;
- tiered near/mid/far replication;
- sector aggregation;
- flow-field navigation;
- spatial queries.

Do not increase all replication rates or force all enemies into near-tier presentation.

---

# 26. Required performance gates

## Server benchmark

Use the existing harness where available for:

```text
100
150
200
300
500
750
```

Record:
- server step p50/p95/p99;
- enemy/horde update cost;
- spawn planning;
- replication bytes.

## Real two-client browser soak

Binding gate:
- Driver browser;
- Gunner browser;
- urban400;
- Phase 3;
- Wave 2;
- boss.

Measure:
- both client frame interval/FPS;
- render submit;
- draw calls/triangles;
- animation cost;
- server step p95;
- network bandwidth/outbound buffering.

Do not raise engineering caps based only on server benchmark results.

---

# 27. Difficulty tuning order

If too lethal:

```text
1. reduce specialist/ranged mix
2. add/tighten attack concurrency
3. lower reinforcement rate slightly
4. lower threat target slightly
5. only then lower entity target
```

Do not immediately undo visual density.

---

# 28. Density tuning order

If it still feels empty:

```text
1. reduce preferred spawn distance slightly
2. increase nearby-anchor preference
3. increase pack size modestly
4. increase spawn income modestly
5. increase entity target
6. increase soft caps
7. hard cap only as last resort
```

---

# 29. Data-driven configuration

Prefer source changes in:

```text
content/horde/farmingPhase*.json
content/horde/spawnPackProduction*.json
content/horde/policyAnchor.json
content/horde/populationLimits.json
content/horde/waveProduction*.json
content/horde/bossWaveProduction.json
enemy gameplay roster content
```

Use code changes only where data is currently not enforced or where a clean new policy field is required.

Regenerate generated content with the repository's normal generation command.

Do not edit generated content by hand.

---

# 30. SP / MP parity

Main Stage Multiplayer and Single Player Main Stage use the production horde system.

Use the same density/difficulty unless an explicit future mode policy says otherwise.

Do not secretly halve Single Player density.

---

# 31. Required tests

Add/update tests for:
- farming target interpolation;
- 6/7/8 entity pack counts;
- atomic spawn behavior;
- 65/25/10 roster convergence;
- data-driven preferred spawn distance;
- too-close anchor rejection;
- wave authored-cap storage/enforcement;
- ordinary wave death decrements entity/threat counters exactly once;
- purge no double-decrement;
- boss escort 8–10 range;
- hard cap remains 300;
- fodder capacity remains 512;
- nearby-population telemetry;
- content generation;
- SP/MP production-horde parity.

---

# 32. Manual qualification

Play:

```text
Phase 1
Wave 1
Phase 2
Wave 2
Phase 3
Boss
```

Desired:
- no long empty late-game streets;
- frequent 6–8 enemy arrivals;
- many close fodder surrounding the tank;
- specialists remain visually identifiable;
- waves feel like crises;
- boss is surrounded by a crowd;
- group kills create satisfying XP/damage spectacle.

Undesired:
- specialist wall;
- unavoidable projectile wall;
- visible close pop-in;
- wave counters stuck at cap after deaths;
- renderer overflow;
- target consumed by far-away enemies;
- huge progression acceleration.

---

# 33. Debug density report

Extend development horde reporting with:

```text
phase
global live entities
ambient / wave / boss / special counts
live within 45m
live within 70m
close / ranged / specialist counts
entity target
threat target
spawn income
stored spawn budget
last pack + pack size
last anchor distance
anchor failures
wave active entities/threat
wave authored caps
replication near/mid/far/sector counts
```

---

# 34. Forbidden changes

Do not:
- set hardEntityCap to 600 in V1;
- raise FODDER_CAPACITY above 512 without evidence;
- simply double every spawn pack and stop;
- preserve 50/30/20 at 2× population without testing;
- double elite count;
- double specialist count;
- remove safe spawn distances;
- spawn visibly beside the tank;
- bypass terrain-aware spawning;
- globally raise replication rates;
- edit generated content by hand;
- hide performance regression by reducing camera/input responsiveness;
- immediately halve XP/rewards before measurement.

---

# 35. Definition of done

- [ ] Farming targets are approximately 20→32, 32→50, 50→72.
- [ ] Farming threat targets are raised proportionally.
- [ ] Farming spawn income is approximately doubled.
- [ ] Farming packs arrive in 6–7 enemy groups.
- [ ] Wave cohort is about 8 enemies.
- [ ] Ordinary roster is approximately 65% close / 25% ranged / 10% specialist.
- [ ] Elite counts remain scarce.
- [ ] Boss escort is approximately 8–10.
- [ ] Preferred routine spawn distance is data-driven around 55m.
- [ ] Near-field exclusion remains around 22–24m.
- [ ] Nearby-population telemetry exists.
- [ ] Melee attack concurrency remains controlled.
- [ ] Ranged/specialist concurrency is measured and capped only if needed.
- [ ] Wave authored active caps are stored/enforced.
- [ ] Ordinary wave deaths decrement live wave counters.
- [ ] Purge cannot double-decrement counters.
- [ ] Wave 1/Wave 2 caps are moderately increased.
- [ ] Boss wave remains within existing ~80 active-wave cap in V1.
- [ ] Hard cap remains 300.
- [ ] Fodder renderer capacity remains 512.
- [ ] Tiered replication / LOD / aggregation remain intact.
- [ ] Progression speed is measured after density increase.
- [ ] Real two-client urban400 soak passes.
- [ ] Gunner responsiveness and cannon presentation do not regress.
- [ ] Late-game combat visually feels saturated with monsters.

Final invariant:

> Horde Density V1 should make the player see and feel dramatically more monsters around the tank, while most of the extra population is inexpensive close fodder waiting, approaching, surrounding, and rotating into attack opportunities rather than every additional monster simultaneously increasing lethal pressure.
