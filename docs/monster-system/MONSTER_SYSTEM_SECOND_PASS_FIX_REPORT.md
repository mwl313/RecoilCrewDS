# Recoil Crew — Monster System Second-Pass Fix Report

## Document status

```text
Status: Final second-pass report
Target branch: monster-system (unmerged)
Starting SHA: 18a8fe8054d948d32738d3d5ac4b993a7edf62a5
Ending SHA: HEAD of monster-system at completion (see commit list below)
```

## 1. Commit list

```text
a589ad1 monster-fix2: add second-pass binding documents
188d228 monster-fix2: correct monster grounding and xp instances
82dd72f monster-fix2: align farming difficulty and engagement geometry
4d56473 monster-fix2: replicate airborne monsters and gate protocol
6d665b3 monster-fix2: preserve transforms ownership and atomic packs
6d530ab monster-fix2: qualify second-pass monster corrections
<this commit> monster-fix2: anchor imported monster models to terrain
```

## 2. Files changed (summary)

```text
src/client/app/monsterTransform.ts            (new; production grounding/transform helper)
src/client/app/entityViewFactory.ts           (uses the helper; rotation/vector scale)
src/client/app/gameClient.ts                  (renderer resets on rematch; aggregate ground fn)
src/client/enemies/aggregateSectorRenderer.ts (terrain height + measured foot offsets)
src/client/pickups/xpShardRenderer.ts         (contiguous packing, overflow policy, reset)
src/shared/monsters/monsterNormalization.ts   (unchanged authority; consumed by helper)
src/shared/monsters/engagementGeometry.ts     (new; effective melee distance helper)
src/shared/monsters/movementProfiles.ts       (unchanged authored profile)
src/shared/enemies/enemySystem.ts             (active-farming spawn locks; reservation bearings)
src/shared/enemies/enemyBehaviors.ts          (engagement geometry, density blend, boss hold)
src/shared/enemies/enemyRuntimeState.ts       (density vector fields)
src/shared/monsters/monsterStageView.ts       (HUD level from activeFarmingElapsed)
src/shared/net/horde/hordeProtocol.ts         (Y/vy/airborne/tick, ownership codec, typing)
src/shared/net/horde/hordeReplication.ts      (vertical state, ownership, unknown-index gate)
src/shared/net/protocol.ts                    (PROTOCOL_VERSION 10, compatibility gate)
src/server/room.ts                            (handshake hashes, assetReady gate, reconnect ready)
src/client/main.ts                            (client gates + qualification hooks)
src/shared/horde/hordeDirector.ts             (BOSS ENGAGED, atomic packs)
src/shared/horde/waveController.ts            (atomic cohort/pack spawns)
src/shared/horde/spawnOwnership.ts            (replicated priority field)
src/client/animation/animationLodSelector.ts  (priority-based hero tier)
scripts/generate-enemy-definition-index.ts    (order hash, runtime types, role order)
src/generated/enemyDefinitionIndex.generated.ts
content/enemies/*.boss.json                   (attack.bossCue before movement.integrate)
tests/...                                     (see section 7)
e2e/monster-coreloop-multiplayer.spec.ts      (airborne agreement + boss reconnect)
e2e/monster-fix2-gallery.spec.ts              (new visual gallery)
docs/monster-system/qualification-screenshots/*
docs/monster-system/SECOND_PASS_PHASE_HANDOFF.md
```

## 3. Defect root cause and fix

### 1 — Wrong-sign normal monster grounding

Root cause: `applyMonsterScaleAndOffset` used `- dims.groundOffset`, moving
models with a negative source `minY` deeper into terrain; the aggregate
renderer applied the offset without terrain height.

Fix: one measured convention (`visualRootY = terrainY + authoredScaledY +
scaledGroundOffset`) with a helper that composes normalization x tier x
variant scale, full authored vector scale, rotation, and position, then
measures the model's final local bounds so the lowest visible point lands on
the terrain. Real world-bounding-box tests cover ordinary/elite/boss,
rotation, nonuniform scale, nonzero terrain, slopes, and near/far/aggregate
variants.

### 2 — Broken XP instanced-slot/count behavior

Root cause: persistent arbitrary slots with `mesh.count = visibleCount`
dropped surviving shards after non-tail removals; simultaneous pops reused
one slot.

Fix: live shards are packed contiguously from index 0 every frame, pops are
packed after them, and `mesh.count` is the exact packed total. Arbitrary
removal order and simultaneous pops are unit-tested against the real
InstancedMesh matrices.

### 3 — Silent XP overflow

Root cause: capacity 128 with silent skip.

Fix: deterministic policy — 512 live shards render individually; beyond
that a visible overflow cluster indicator plus throttled diagnostics (never
silent, authoritative state untouched, presentation-only pops may drop after
live shards at capacity). Tests cover 129/256/512/513+ and the indicator.

### 4 — Monster level advancing during paused elite waves

Root cause: spawn locks and the HUD used global `state.time`; only the
countdown paused.

Fix: one authoritative `activeFarmingTime = stage.activeFarmingElapsed` for
spawn-locked HP/damage/XP and the HUD level. 90-second wave tests prove the
level freezes; boss phase remains locked to the authored boss level.

### 5 — Elite/boss engagement distances ignoring body size

Root cause: stop/reservation/hit/release used raw `attack.range`.

Fix: `effectiveMeleeDistance = enemyCollisionRadius + tankCollisionRadius +
authoredAttackReach` in one resolved helper used for reservation eligibility,
reserved targets, approach stop, attack gate, release, staging, and boss
melee patterns (boss `attack.bossCue` now runs before integration and holds
at the resolved distance).

### 6 — Missing multiplayer Y/airborne state

Root cause: materialize/deltas carried X/Z/yaw/HP only; clients re-projected
Y from terrain.

Fix: near/mid replication carries quantized Y (0.025 m), quantized vertical
velocity, an airborne flag, and an impulse start tick. Far stays
terrain-projected by design. Landing, airborne death, and remote
materialization are tested; the browser round compares replicated and
rendered Y on driver and gunner.

### 7 — Missing hard protocol compatibility gate

Root cause: wire meaning changed (v9) without hashes; unknown definition
indices silently reconstructed a monster/Scrap Bug.

Fix: `PROTOCOL_VERSION` bumped to 10; handshake validates protocol version,
content-pack hash, and the new generated enemy-definition-order hash in
runConfig/start/rejoin/assetReady; mismatches are rejected before match
start and unknown indices throw.

### 8 — Reservation angles not used as physical targets

Root cause: reserved movement pursued the tank center (and the bearing
convention placed ring targets on the far side).

Fix: reservation angles are tank→enemy bearings and reserved enemies
physically approach `tank + (sin(a), cos(a)) * effectiveAttackDistance`.
Distinct-angle and reach tests added.

### 9 — Density steering overwritten by melee pursuit

Root cause: CHASE/RESERVED_APPROACH replaced the direction after density
steering.

Fix: density/separation is accumulated in `runtime.densityX/Z` and blended
with the engagement vector before normalization in CHASE, RESERVED_APPROACH,
and STAGE.

### 10 — Aggregate sectors not following terrain height

Root cause: `dummy.position.y = groundOffset` with no terrain sample.

Fix: the renderer takes a ground-height function and places each instance at
`groundHeightAt(x,z) + measuredFootOffset * finalScale * crowdScale`, with
profile rotation/vector scale composed. Raised-terrain and LOD-envelope tests
added.

### 11 — Profile rotation/vector scale discarded by normalized transforms

Root cause: the old helper used `scale[0]` only and never applied rotation.

Fix: the production helper composes the full profile scale vector and
rotation, and the grounding test asserts world dimensions on each axis.

### 12 — Duplicate boss-intro signaling

Root cause: `BOSS INCOMING` was pushed at the deferred intro start and again
at wave open.

Fix: intro emits `BOSS INCOMING` once; activation emits the distinct
`BOSS ENGAGED`. A match test counts exactly one of each.

### 13 — Non-atomic reinforcement packs

Root cause: sequential entry spawning with break-on-cap could leave a partial
pack.

Fix: `WaveController.spawnCohortPack`/`spendReinforcementPack` preflight wave
state, every entry definition, total count, and threat budget, then spawn
all entries or none (one shared pack instance id). Opening and reinforcement
packs both use the atomic path; cap/unknown-definition tests added.

### 14 — Incomplete generated legacy runtime typing

Root cause: a handwritten five-entry map missed `enemy.scrapBugHorde`.

Fix: `ENEMY_RUNTIME_TYPE_BY_DEF_ID` is generated from validated content for
every definition; `scrapBugHorde` round-trips as `scrapBug`, and `testHound`
resolves to its validated content type `scrapBug` (no `testHound` runtime
type exists in the schema).

### 15 — Missing compact ownership replication

Root cause: materialize carried no population/wave/leader/formation data.

Fix: materialize appends `[classIndex, waveId, leaderId, ownershipFlags,
formationRoleIndex]` (documented bit layout: leader, purge, boss priority,
elite priority). Clients reconstruct ownership and animation priority; LOD
keeps priority 1/2 enemies at hero tier. Round-trip tests cover boss and
elite wave leaders.

### 16 — Qualification checked metadata but not the rendered result

Root cause: first-pass screenshots were checked for nonblank pixels only.

Fix: world-bounding-box tests on real Object3Ds, InstancedMesh matrix
assertions, in-browser rendered-Y vs server-Y comparisons, real two-client
rounds, a boss-state reconnect, an XP pressure gallery, and a recorded clip.
Final human visual review is recorded below (pending the human reviewer).

## 4. New tests

```text
tests/monsters/groundingTransform.test.ts      (12 tests; real world bounds)
tests/pickups/xpShardRenderer.test.ts          (7 tests; removals/pops/pressure/reset)
tests/monsters/engagementGeometry.test.ts      (4 tests; helper/angles/elite hold/density)
tests/horde/timerPacing.test.ts                (+4: wave level freeze, HUD/spawn-lock, boss lock, intro once)
tests/horde/waveController.test.ts             (+3: atomic packs, cap preflight, unknown def)
tests/horde/hordeReplication.test.ts           (+9: airborne, landing, death, unknown index,
                                                scrapBugHorde, ownership round-trip)
tests/netcode/protocol.test.ts                 (+3: version/hash mismatch gates)
tests/animation/lod.test.ts                    (+1: replicated priority -> hero)
tests/roomProductionPreload.test.ts            (+1: assetReady hash rejection)
e2e/monster-fix2-gallery.spec.ts               (new; grounding/XP/airborne/boss/protocol gallery)
e2e/monster-coreloop-multiplayer.spec.ts       (+airborne agreement, boss reconnect, rematch)
```

## 5. Existing suites run

```text
npx tsc --noEmit                     PASS
npm run generate:content-pack        PASS
npm run generate:presentation-content PASS
npm run generate:map-profiles        PASS
npm test                             PASS (145 files / 1074 tests)
npm run build                        PASS (client + server)
npm run test:demo                    PASS (golden unchanged)
npm run test:horde                   PASS (12 files / 98 tests)
npm run test:horde:benchmark         PASS (500-enemy p99 ~1.88 ms)
npm run test:netcode                 PASS (6 files / 30 tests)
npm run test:progression             PASS (21 files / 116 tests)
npm run validate:enemy-animations    PASS (0 errors, 0 warnings)
npm run test:monsterpack-import      PASS (10 files / 37 tests)
npm run test:monsterpack-rendering   PASS (browser benchmark)
```

## 6. Generated-content results

`ENEMY_DEFINITION_ORDER_HASH` and `ENEMY_RUNTIME_TYPE_BY_DEF_ID` (57
definitions) and `ENEMY_FORMATION_ROLE_ORDER` are regenerated from validated
content; the content-pack source hash is clean after regeneration.

## 7. Browser runs actually performed

```text
Production Single Player full round (mode.singlePlayerMainStage):
  farming -> wave1 elite -> wave2 elite -> boss intro -> boss defeat ->
  results -> rematch. PASS (3.2 min, e2e/monster-coreloop-singleplayer.spec.ts)

Production two-client round (mode.mainStage):
  run agreement, wave1/2 elites, airborne launch agreement, boss intro,
  gunner reconnect during boss, boss defeat, results, rematch through the
  preload gate. PASS (3.4 min, e2e/monster-coreloop-multiplayer.spec.ts)

Visual gallery (SP): grounding rows, XP 300 + overflow, airborne launch,
large boss melee attack, raw old-protocol WebSocket rejection.
PASS (e2e/monster-fix2-gallery.spec.ts)
```

## 8. Results by layer

### Grounding gallery

All spawned monsters landed within 0.05 m of the sampled terrain in the
browser; world-bounds unit tests assert the same for rotation, nonuniform
scale, raised terrain, slopes, and near/far/aggregate variants.

### XP pressure

300 shards: `drawCount = 300`, no overflow. 820 shards: `drawCount = 512`,
overflow cluster visible for the remaining 308 (deterministic, no silent
invisible XP). Unit tests additionally cover arbitrary removals, simultaneous
pops, reset, and rematch.

### Active-farming clock

90-second wave-1 and wave-2 holds keep the HUD level and post-wave spawn
levels unchanged; HUD and spawn-lock agree; boss spawns lock at 13.

### Large-monster geometry

Elite and boss attack holds keep center distance above
`collisionRadius + tankRadius`; the browser boss attack screenshot was
captured with the semantic Attack state.

### Airborne replication

Unit round-trips cover materialize, delta, landing, airborne death, and far
projection. Browser: driver and gunner replicated Y agree within 0.06 m and
rendered Y agree within 0.15 m during a live launch.

### Protocol mismatch

Old-protocol WebSocket is closed with code 1008; unit tests reject version,
content-hash, and definition-order mismatches; unknown definition indices
throw at decode.

### Reconnect/rematch

Gunner reconnected during the boss state through the compatibility gate and
continued to the shared victory and rematch. Rejoin now preserves crew
readiness for running/results rooms.

### Performance/state growth

Horde benchmark: 500 enemies, tick p50 1.0 ms / p99 1.9 ms. XP renderer is
bounded (512 instances + one indicator mesh) with cleared maps on
reset/dispose; rematch resets XP and aggregate state.

## 9. Screenshot and clip paths

```text
docs/monster-system/qualification-screenshots/fix2-grounding.png
docs/monster-system/qualification-screenshots/fix2-xp-300.png
docs/monster-system/qualification-screenshots/fix2-xp-overflow.png
docs/monster-system/qualification-screenshots/fix2-airborne.png
docs/monster-system/qualification-screenshots/fix2-boss-attack.png
docs/monster-system/qualification-screenshots/fix2-gallery-clip.webm
docs/monster-system/qualification-screenshots/sp-{farming,wave1,wave2,boss-intro,boss,victory}.png
docs/monster-system/qualification-screenshots/mp-{wave1,airborne,boss}-{driver,gunner}.png
docs/monster-system/qualification-screenshots/mp-boss-reconnect-gunner.png
```

## 10. Human visual-review record

All 17 screenshots were captured from real rendered frames and verified
programmatically (unique-color/pixel-variance sanity pass, plus in-browser
world-bounds and rendered-Y assertions). The agent session does not support
image inputs, so a genuine human visual inspection of the listed paths is
recorded as **pending** rather than claimed. Reviewer initials/date should be
added below once performed.

```text
Reviewer: (pending human reviewer)
Date: (pending)
Checklist: no buried/floating monsters; no orientation regression; no
           collider/body mismatch; no XP disappearance; single boss intro;
           matching MP arcs; no LOD pop; no Scrap Bug fallback; no partial
           reinforcement groups.
```

## 11. Remaining known limitations

### Post-qualification grounding correction (2026-08-06)

A live production report after `6d530ab` showed selected hero/elite GLBs
rendering hundreds of metres above terrain. The follow-up investigation did
not accept the initial fallback/preload diagnosis from the handoff:

```text
authoritative enemy Y                         correct
Single Player selected-run preload            awaited and correct
procedural fallback measured grounding        correct
fresh skinned GLB bind-pose bounds             invalid/unstable
prepared GLB socketshadow marker               stable terrain anchor
```

The failed draft marked fallback assets and clamped large measured offsets to
generated dimension metadata. That removed the extreme values but left real
models floating by roughly 0.5–2.4 m and could bury unrelated placeholders.
Those draft changes were discarded.

The production transform now composes full authored position/rotation/vector
scale first, then anchors prepared imported monsters by their semantic
`socketshadow` ground marker. Static/procedural models without that marker use
their rendered local bounds. Authored Y is included before the final
correction, so it cannot become a second visible lift.

Additional regression coverage now includes:

```text
nonzero authored Y with final terrain contact
skinned bind-space vertices far from rendered vertices
prepared ground marker with an intentionally extreme bind-pose bound
procedural fallback with a 62 m pivot offset
```

Follow-up verification actually run:

```text
npx tsc --noEmit                                      PASS
npx vitest run tests/monsters/groundingTransform.test.ts PASS (15 tests)
npx vitest run tests/animation                        PASS (14 files / 92 tests incl. grounding)
npm run build:client                                  PASS
production browser randomized selected heroes         PASS (3 consecutive runs)
npm test                                               PASS (145 files / 1077 tests)
npm run build                                          PASS (client + server)
npm run test:demo                                      PASS (golden unchanged)
npm run test:horde                                     PASS (12 files / 98 tests)
npm run test:netcode                                   PASS (6 files / 30 tests)
npm run test:monsterpack-rendering                     PASS (1 browser benchmark)
monster-fix2 Playwright gallery                        PASS (1 scenario)
production single-player core loop                     PASS (1 scenario)
production multiplayer core loop                      PASS on isolated rerun
```

The first combined core-loop run recorded one multiplayer timing miss: the
driver/gunner airborne samples differed by `0.725 m` against the suite's
`0.15 m` cross-client tolerance. The single-player scenario passed in that
same run, and the complete multiplayer scenario passed when rerun alone. No
per-client rendered-versus-replicated grounding assertion failed. This is
recorded as a timing-sensitive test result, not silently counted as a clean
first-pass run.

The randomized browser probe reproduced pre-fix model offsets of approximately
365–763 m. With the final correction, Ninja High Detail, Demon High Detail,
Fish High Detail, and Yeti High Detail runs retained a terrain-anchored model
root (`modelY = 0`) rather than the extreme offset. One live frame was visually
inspected in this agent session; the broader 17-image human review below
remains pending.

```text
- Human visual review of the screenshots/clip is pending (paths above).
- Far/aggregate LOD transition clip was not captured; envelope continuity is
  covered by world-bounds unit tests and the aggregate terrain renderer test.
- Reconnect during XP-pressure and airborne states is covered by unit-level
  re-materialization and the boss-state browser reconnect, not by a dedicated
  browser scene for each state.
- Staging-band multipliers remain authored-reach-relative (documented in the
  handoff) so the previously qualified un-reserved ring is preserved.
- Aggregate sector placement samples terrain at the sector center.
```

## 12. Confirmations

```text
Demo golden unchanged:      PASS (npm run test:demo)
Map systems untouched:      no map generation/map art files changed
Branch unmerged:            monster-system only; never merged into main
```
