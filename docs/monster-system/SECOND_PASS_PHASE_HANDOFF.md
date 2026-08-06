# Recoil Crew — Monster System Second-Pass Phase Handoff

## Status

```text
Starting SHA: 18a8fe8054d948d32738d3d5ac4b993a7edf62a5
Branch: monster-system
Unmerged: true
```

## Phase 1 — Render grounding and XP instancing

### Commits

```text
a589ad1 monster-fix2: add second-pass binding documents
<pending>  monster-fix2: correct monster grounding and xp instances
```

### Grounding

Implemented one production convention in `src/client/app/monsterTransform.ts`:

```text
sourceGroundOffset = max(0, -sourceMinY)
scaledGroundOffset = sourceGroundOffset x finalScale
visualRootY = terrainY + authoredScaledY + scaledGroundOffset
```

The helper composes normalization scale x tier scale x variant scale with the
full authored profile scale (vector), rotation, and position, then measures
the model's own final local bounds so the lowest visible point lands on the
terrain plane even for authored rotation and nonuniform scale. The canonical
unrotated case reduces exactly to `model.position.y = scaledGroundOffset`.
The sign defect (`- groundOffset` in the normal path, missing terrain height
in the aggregate path) is fixed in both renderers.

### XP instancing

`XpShardRenderer` now packs all live instances contiguously every frame,
packs pop instances after them, and sets `mesh.count` to the exact packed
total. Persistent arbitrary slots are gone, so arbitrary removal order can
never hide a surviving shard. Overflow policy is deterministic: 512 live
shards render individually; beyond that, a visible overflow cluster
indicator plus throttled diagnostics; pop effects (presentation-only) may be
dropped after live shards at capacity. `reset()`/`dispose()` clear all maps,
and rematch now calls the renderer reset.

### Tests added

```text
tests/monsters/groundingTransform.test.ts   (12 tests, real Object3D world bounds)
tests/pickups/xpShardRenderer.test.ts       (7 tests: removals, pops, 129/256/512, overflow, reset)
```

### Gates run

```text
npx tsc --noEmit                     PASS
npm test                             PASS (144 files / 1050 tests)
npm run test:demo                    PASS (golden unchanged)
```

### Handoff notes

Phase 2 (difficulty clock + engagement geometry), Phase 3 (airborne
replication + protocol gate), Phase 4 (transforms/ownership/atomic packs),
and Phase 5 (qualification) remain.

---

## Phase 2 — Active-farming clock and engagement geometry

### Commits

```text
<pending>  monster-fix2: align farming difficulty and engagement geometry
```

### Active-farming clock

One authoritative value now drives every farming/elite-wave difficulty input:

```text
activeFarmingTime = stage.activeFarmingElapsed
```

`EnemySystem.resolveMonsterSpawnLock` (spawn-locked HP, damage, XP/reward
level inputs) and the HUD monster block in `monsterStageView` read it.
`StageDirector` already pauses `activeFarmingElapsed` during elite waves, so
held waves freeze both the countdown and the monster level; the boss phase
locks to the authored boss level.

### Engagement geometry

New `src/shared/monsters/engagementGeometry.ts`:

```ts
effectiveMeleeDistance = enemyCollisionRadius + tankCollisionRadius + authoredAttackReach
```

Used for reservation eligibility, reserved target points, approach stop,
attack acceptance, release, and boss melee patterns. Reservation angles are
now tank→enemy bearings and reserved enemies physically approach their
assigned ring point. Density/separation is blended after engagement vector
selection (never overwritten), with dedicated `runtime.densityX/Z`.

Staging band note: the staging multipliers remain reach-relative (the
previously qualified un-reserved ring); all attack-facing values use the
effective distance. Boss definitions moved `attack.bossCue` before
`movement.integrate` so the melee hold can stop the boss at the resolved
distance without body overlap.

### Tests added/updated

```text
tests/monsters/engagementGeometry.test.ts   (4 tests)
tests/horde/timerPacing.test.ts             (90s wave freeze, HUD/spawn-lock, boss lock)
tests/monsters/movementBehaviors.test.ts    (effective-distance attack position)
tests/monsterStage.test.ts                  (HUD level reads active-farming clock)
```

### Gates run

```text
npx tsc --noEmit                     PASS
npm test                             PASS (145 files / 1057 tests)
npm run test:demo                    PASS (golden unchanged)
npm run generate:content-pack        PASS (boss behavior order regenerated)
```

### Handoff notes

Phase 3 (airborne replication + protocol gate), Phase 4 (transforms/
ownership/atomic packs), and Phase 5 (qualification) remain.

---

## Phase 3 — Airborne replication and protocol gate

### Commits

```text
<pending>  monster-fix2: replicate airborne monsters and gate protocol
```

### Airborne replication

Horde materialize and near/mid delta records now carry:

```text
quantized Y        (0.025 m)
quantized vertical velocity (0.0625 m/s)
airborne flag      (HORDE_FLAG_AIRBORNE)
impulse start tick (30 Hz)
```

Far deltas intentionally stay terrain-projected (spec permits). The client
materializes and updates at the authoritative Y, never re-grounding an
airborne enemy; landing clears the airborne flag and returns to the
replicated Y. Airborne death keeps the last replicated Y.

### Protocol compatibility gate

`PROTOCOL_VERSION` bumped 9 → 10. Handshake validates:

```text
protocol version
content-pack hash
enemy-definition-order hash (new ENEMY_DEFINITION_ORDER_HASH in generated index)
```

Server includes the hashes in runConfig/start/rejoin and rejects mismatched
`assetReady` before the countdown. The client refuses runConfig/start/
reconnect on mismatch. Unknown enemy definition indices now throw instead
of silently reconstructing a Scrap Bug/monster.

### Tests added/updated

```text
tests/horde/hordeReplication.test.ts   (airborne materialize/delta/landing/death,
                                        far projection, unknown-index rejection)
tests/netcode/protocol.test.ts         (old-version + hash mismatch rejection)
tests/roomProductionPreload.test.ts    (assetReady hash rejection)
protocol-version assertions            (lobby/progression/combat suites -> 10)
```

### Gates run

```text
npx tsc --noEmit                     PASS
npm test                             PASS (145 files / 1066 tests)
npm run test:demo                    PASS (golden unchanged)
```

### Handoff notes

Phase 4 (transforms/ownership/atomic packs) and Phase 5 (qualification)
remain.

---

## Phase 4 — Transforms, ownership, and atomic packs

### Commits

```text
<pending>  monster-fix2: preserve transforms ownership and atomic packs
```

### Transforms / aggregate terrain

Profile rotation and full vector scale composition shipped in Phase 1's
production helper and are re-verified here (world-bounds tests). Aggregate
sectors sample the world ground-height function at the sector center and
use a measured local foot offset, so raised terrain and LOD transitions stay
vertically consistent.

### Boss intro

`BOSS INCOMING` is emitted once at the deferred intro start. Boss activation
now emits the distinct `BOSS ENGAGED` label, so the incoming sting can never
replay.

### Atomic packs

`WaveController.spawnCohortPack` / `spendReinforcementPack` preflight wave
state, every entry definition, total entity count, and threat budget, then
spawn every authored entry or none (shared pack instance id). Opening packs
and reinforcements both route through the atomic path.

### Generated runtime typing

`ENEMY_RUNTIME_TYPE_BY_DEF_ID` is generated from validated content for every
definition (no partial handwritten map); `enemy.scrapBugHorde` is a real
scrapBug. `ENEMY_FORMATION_ROLE_ORDER` is generated from spawn-pack content
for compact ownership encoding. `enemy.testHound` correctly resolves to its
validated content type `scrapBug` (there is no `testHound` runtime type in
the schema).

### Compact ownership replication

Materialize records append `[classIndex, waveId, leaderId, ownershipFlags,
formationRoleIndex]` (documented bit layout: leader, purge, boss priority,
elite priority). Clients reconstruct population class, wave id, leader/
featured state, purge semantics, formation role, and elite/boss animation
priority; the LOD selector now keeps priority-1/2 enemies at hero tier.

### Tests added/updated

```text
tests/horde/waveController.test.ts       (atomic all-or-none packs, cap/unknown-def preflight)
tests/horde/timerPacing.test.ts          (BOSS INCOMING exactly once, BOSS ENGAGED once)
tests/horde/hordeReplication.test.ts     (scrapBugHorde typing, ownership round-trip, priority)
tests/animation/lod.test.ts              (replicated priority -> hero tier)
```

### Gates run

```text
npx tsc --noEmit                     PASS
npm test                             PASS (145 files / 1074 tests)
npm run test:demo                    PASS (golden unchanged)
```

### Handoff notes

Phase 5 (full qualification incl. browser rounds and visual review) remains.
