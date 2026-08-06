# Monster-System Bug-Fix Report

Target branch: `monster-system` (never merge into `main`).

Starting SHA: `f3ee97034775f1ee3d216144cb1bc2be489ba542`

## Phase status

| Phase | Status | Commit |
| --- | --- | --- |
| 1 — Multiplayer identity and wave composition | IN PROGRESS | (next commit) |
| 2 — Scale, collision, and grounding | pending | |
| 3 — Movement and behavior | pending | |
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
