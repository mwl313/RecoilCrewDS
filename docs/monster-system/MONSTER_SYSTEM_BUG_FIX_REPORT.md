# Monster-System Bug-Fix Report

Target branch: `monster-system` (never merge into `main`).

Starting SHA: `f3ee97034775f1ee3d216144cb1bc2be489ba542`

## Phase status

| Phase | Status | Commit |
| --- | --- | --- |
| 1 — Multiplayer identity and wave composition | IN PROGRESS | (next commit) |
| 2 — Scale, collision, and grounding | IN PROGRESS | (next commit) |
| 3 — Movement and behavior | IN PROGRESS | (next commit) |
| 4 — Timer, pacing, boss intro | pending | |
| 5 — XP presentation and cleanup | pending | |
| 6 — End-to-end qualification | pending | |

## Phase 1 — Multiplayer identity and wave composition

### Defect 7 (confirmed): legacy type codec reconstructs monsters as Scrap Bugs

Root cause: `hordeProtocol.ts` encoded enemy identity through the five-entry
legacy `TYPE_ORDER` codec. A generalized monster's `type: 'monster'` encoded
as index 0 and the client `materializeTypeName(0)` fell back to `scrapBug`;
`HordeReplicationClient` then set `defId: typeDefId('scrapBug')`.

Fix:

- New generated `src/generated/enemyDefinitionIndex.generated.ts`
  (`ENEMY_DEFINITION_ORDER`, `ENEMY_DEFINITION_INDEX`,
  `LEGACY_ENEMY_TYPE_BY_DEF_ID`), produced by
  `scripts/generate-enemy-definition-index.ts` and wired into
  `npm run generate:content-pack`.
- Materialize records now carry `[id, defIndex, xq, zq, yawq, hpq, maxHpq,
  flags, profileIndex]`; the client reconstructs `type: 'monster'` with the
  exact `defId` and exact presentation profile. No manual monster list in
  the legacy switch.

### Defect 8 (confirmed): aggregate-sector identity lost

`encodeSector` mapped `enemyDefId` through the legacy codec (and the client
derived `enemy.<typeName>`). It now encodes the exact `defIndex`; the client
decodes the exact definition id. No Scrap Bug fallback remains.

### Defect 9/10 (confirmed): wave/reinforcement/escort packs collapsed to entries[0]

`HordeDirector.onStageEvent` summed all entry counts and spawned the total as
`entries[0]`; `stepWave` reinforced with `entries[0]` only. Both now iterate
every authored entry with exact slot resolution, count, deterministic
position slices, and formation role (added to `SpawnOwnership` and
`WaveController.spawnCohort`/`spendReinforcement`). Boss escorts use the
selected Phase 3 close/ranged/specialist identities.

### Tests added

- `tests/horde/hordeReplication.test.ts`: exact round-trips for ordinary
  melee (Ninja), ranged (Wizard), specialist (Orc Enemy), elite (Demon
  elite), boss (Ninja boss), aggregate sector identity, and a never-Scrap-Bug
  assertion.
- `tests/horde/waveComposition.test.ts`: wave 1 opening composition
  (waveCohort 2/1/1 + farmingCluster 3 close), reinforcement composition,
  and boss-escort Phase 3 composition with formation roles.

### Gates

`npx tsc --noEmit` PASS · `npm test` PASS (138 files / 1005 tests).

## Phase 2 — Scale, collision, and grounding

### Defect 4/5 (confirmed): authored tier scale not applied; collision fell back to 0.8

Root cause:

- `scripts/generate-monster-dimensions.ts` swapped height/depth axes and
  hardcoded every ground offset to 0.
- `resolveMonsterDimensions` returned a partial record with no final scale
  or source foot offset.
- `EntityViewFactory` rendered raw models with presentation transforms only
  (no tier scale, no ground offset).
- `EnemySystem.radiusFor` routed monsters through `enemyRadius(def)` whose
  monster branch fell back to `0.8`.

Fix:

- Generator now uses Y-up axes (`height = maxY - minY`,
  `depth = maxZ - minZ`) and preserves the neutral-pose foot plane
  (`groundOffset = -minY`), and emits `ENEMY_DEFINITION_SIZE_TIER`
  (defId → sizeClass/tier/variant) for every generalized monster.
- `monsterNormalization.ts` now produces one authoritative
  `ResolvedMonsterDimensions` record (source bounds, normalization/tier/
  variant/final scales, final dimensions, scaled ground offset, collision,
  spawn clearance, engagement radius, shadow radius, projectile socket).
- `EnemySystem.radiusFor` resolves monsters through
  `resolveMonsterDimensions(...).collisionRadius`; the 0.8 fallback is no
  longer reachable on live monster paths.
- `EntityViewFactory` applies `finalScale` to the model and places its feet
  at the terrain plane (`position.y = authoredOffset×scale - groundOffset`),
  including on near↔far LOD swaps; `AggregateSectorRenderer` uses the same
  resolved scale/offset per sector definition.

### Tests added

- `tests/monsters/scaleGrounding.test.ts`: small ordinary ≈ 1.02 m, medium
  elite ≈ 4.59 m, large boss ≈ 8.50 m, boss > elite > ordinary colliders,
  foot contact 0–0.05 m on the flat plane, all featured bosses tier ×5,
  projectile/spawn/engagement/shadow fields on the resolved record.

### Gates

`npx tsc --noEmit` PASS · `npm test` PASS (139 files / 1012 tests) ·
`npm run build` PASS · `test:demo` PASS (golden unchanged). Three pre-existing
Map Lab integration tests were given a 30 s timeout (they perform real
mapgen and exceeded vitest's 5 s default only under full-suite load).

## Phase 3 — Movement and behavior ordering

### Defect 1/2 (confirmed): unreserved melee circled from spawn distance

Root cause: `movement.meleeEngagement` rotated unreserved melee movement
sideways unconditionally, so enemies orbited before ever approaching;
reservations are only granted inside attack range, so many enemies never
attacked.

Fix: a shared `MeleeMovementProfile` state machine in
`movement.meleeEngagement`:

- CHASE (outside `stagingRadiusMultiplier × attack range`): direct pursuit.
- STAGE (inside staging band, no reservation): controlled tangential
  movement with a slow inward drift to probe for an open arc; never crosses
  the tank (min ring = max(inner staging, enemy radius + tank radius + 0.2)).
- RESERVED_APPROACH: direct pursuit, slower near the attack point.
- ATTACK_HOLD: stop, face the tank, let `attack.meleeCue` fire.

### Defect 3 (confirmed): ranged oscillation

`movement.trackTank` now uses a reusable hold band
(`RANGED_HOLD_PROFILE`: inner 0.80, outer 1.10 of preferred range). Outside
the outer band it approaches, inside the inner band it retreats, and inside
the band it holds with a slow stable strafe (no per-update direction flip).

### Defect 18 (confirmed): speed modifiers applied after integration

The post-behavior `runtime.speed *= enemySpeedMultiplier` was removed from
`EnemySystem.update`; `movement.integrate` now applies the progression/relic
multiplier immediately before displacement.

### Defect 19 (confirmed): semantics evaluated before behavior finished

`updateEnemySemantics`/`syncSemanticCue` now run after the current frame's
behaviors and impulse update (death lock still overrides everything), so an
accepted attack emits its Attack cue in the same tick and movement produces
Walk.

### Tests added

`tests/monsters/movementBehaviors.test.ts` (flat static world,
multi-second simulations):

- far unreserved melee chases (distance decreases over 3 s);
- near unreserved melee stages on a ring without crossing the tank;
- reserved melee reaches the attack position;
- only reservation owners enter Attack (non-owner attack set is empty);
- ranged hold band stays inside 10.5–16.5 m at preferred 14 m;
- ranged approaches from 30 m and retreats from 7 m;
- a 0.5× speed modifier reduces displacement below 0.75× baseline;
- Attack cue same tick and Death override after kill.

### Gates

`npx tsc --noEmit` PASS · `npm test` PASS (140 files / 1020 tests) ·
slow mapgen tests given explicit 30 s timeouts.
