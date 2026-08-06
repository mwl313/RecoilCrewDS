# Core Loop Integration — Phase Handoff

Branch: `monster-system` (unmerged; never merge into `main`).

## Phase A — Production content and deterministic run selection: COMPLETE

Commit: `monster-core-loop: add production roster selection and featured identities`.

Delivered: `enemyGameplayRosters` content category (schema/registry/loader/
manifest/validation/generated pack), `enemyGameplayRoster.quaternius.mainStage`
(39 ordinary candidates, phase weights, 50/30/20 mix, one-elite waves with
JSON-only two-elite support, boss escorts 4–6, six shared featured
identities), six provisional cross-role definitions, `mode.mainStage`,
`mode.singlePlayerMainStage`, `objective.mainStage`, `results.mainStage`,
`spawn.director.mainStage`, `horde.mainStage.production`, and deterministic
`monsterRunSelection.ts` with named PRNG streams.

## Phase B — Production horde and live match flow: COMPLETE

Commits: production horde/selection activation and boss match flow commits
(see git log). Production director uses `enforceStage: true`, production
stage sequence (`pauseCountdownDuringWave: false`), selected-slot packs,
waves, and boss wave. Tank-destruction defeat (no respawn), boss-death
victory, elite death never ends the match.

Phase D fix included in this phase's follow-up: `StageDirector` now honors
`pauseCountdownDuringWave`; the production farming clock keeps running
through waves so 60/120/180-second wave events are simulation time, while
Demo (`pauseCountdownDuringWave: true`) stays byte-identical (golden PASS).

## Phase C — Combat, XP, death, projectile and RNG wiring: COMPLETE

Commits: deterministic spawn/drop randomness, ranged telegraphs and
projectile allegiance, award-once spawn-locked XP with deterministic shard
bundles, authoritative semantic actions with death lock. Match-scoped
`MeleeReservationManager` feeds `EnemyRuntimeState.meleeReserved` before
attack behaviors; only reservation owners deal melee damage.

## Phase D — Presentation, normalization, preload and HUD: COMPLETE

Commit: `monster-core-loop: connect presentation preload and encounter HUD`
(next commit in this branch).

### Delivered

- Semantic action controller (`monsterSemantics.ts`) connected to the
  authoritative runtime; monsters now write compact `enemy.semantic.*`
  action cues (`Idle/Walk/Attack/Death`) with stable monotonic sequences.
  Multiplayer horde replication carries cues in a new `cues` block
  (once per sequence change); the client animation resolver maps them to
  Idle/Walk/Attack/Death roles. Animation never decides gameplay.
- Normalization cache (`monsterNormalization.ts`, generated
  `monsterDimensions.generated.ts`): 1.02/1.53/1.70 m targets, tier scales
  1/3/5, normalized projectile sockets; used by melee reservations and
  ranged/boss projectile origins.
- Selected-asset preload: `monsterPreload.ts` resolves near/far/aggregate
  asset ids for exactly the deterministic selected run. Single Player
  awaits preload before starting the match; multiplayer preloads on
  `start` (and on first production snapshot for reconnect). No startup
  preload of all optional monsters.
- HUD: exact `TIME UNTIL NEW WAVE` label with sim-time countdown to
  60/120/180, `BOSS INCOMING` at the boss transition (timer hidden during
  boss combat), monster level chip, wave warnings, one elite bar by
  default, two stacked elite bars when the JSON config enables a second
  elite, one boss bar, all clearing on death/results/rematch. No fodder
  overhead bars.
- Production modes are now the live loop: `MULTIPLAYER_SESSION` and
  `SINGLE_PLAYER_SESSION` point at `mode.mainStage` /
  `mode.singlePlayerMainStage`, and the server pins `mode.mainStage`
  (fixture/test servers keep Demo via content metadata).
- `HordeStageView` carries an authoritative `monster` block (phase, level,
  encounters) built by `monsterStageView.ts` on both server and SP.

### Phase D gates

`tsc --noEmit` PASS · `generate:presentation-content` PASS ·
`generate:content-pack` PASS · `generate:map-profiles` PASS · `npm test`
PASS (135 files / 988 tests) · `npm run build` PASS · `test:demo` PASS
(golden unchanged).

## Phase E — Qualification: AUTOMATED PORTION COMPLETE

Commit: `monster-core-loop: qualify production loop and document tuning`
(next commit in this branch).

Delivered:

- Selection matrix tests (fixed seeds, no consecutive repeats, Phase 1
  repeat in Phase 3, elite uniqueness, boss exclusion, one/two-elite
  configs, SP/MP same-run).
- Cross-role validation: all six identities × elite/boss (12 checks).
- Headless full SP qualification (`npm run qualify:monster-coreloop`):
  victory at 190.2 s with waves at 60/120/180, Lv1–13 boundary checks,
  boss TTK 10.1 s at synthetic 220 DPS, award-once XP totals.
- Performance: horde benchmark (500 enemies ~0.98 ms/tick p50) and
  animation benchmark (100 mixers ~0.023 ms; rematch cleanup leaves 0
  live mixers).
- Reports: `MONSTER_CORE_LOOP_IMPLEMENTATION_REPORT.md`,
  `MONSTER_CORE_LOOP_QUALIFICATION_REPORT.md`,
  `MONSTER_CORE_LOOP_AUTHORING_GUIDE.md`.

Follow-up commits since the Phase E report:

- Protocol 9 asset-ready handshake: production rooms enter a `loading`
  phase after both players ready, broadcast `runConfig`, and start the
  countdown only after both clients reply `assetReady` (or a 15 s timeout).
  Demo rooms keep the immediate countdown. Rematches re-run the gate.
- `GAME_MODE` env on the server (`mode.mainStage` default;
  `mode.demoScoreAttack` for the 8099 fixture/e2e server).
- Test-only qualification hooks (client `__recoil.*` and server
  `testDamageEnemyByDef`/`testHealTank`, gated by `ALLOW_TEST_DAMAGE=1`)
  so the e2e can complete elite/boss kills.
- Fixes found by e2e: SP results screen now appears when the match ends
  between frames; the single active elite is promoted to the primary HUD
  bar after an earlier encounter dies; `startMatch` failures return the
  crew to the lobby instead of crashing the server.

Live browser qualification (all PASS):

- `e2e/monster-coreloop-singleplayer.spec.ts` — full SP run: farming,
  wave 1/2 elites, boss intro, boss victory, clean rematch (3.0 min).
- `e2e/monster-coreloop-multiplayer.spec.ts` — two clients: identical
  runConfig, asset-ready preload gate, wave/boss/HP agreement, boss-death
  results on both, rematch through the preload gate (3.2 min).
- Demo regressions on 8099: `singlePlayer`, `progression-disabled-demo`,
  `monsterpack10-rendering` — PASS.

Remaining:

- Human visual review of `docs/monster-system/qualification-screenshots/`
  (10 PNGs captured and pixel-checked; not eyeballed in this session).

## Known limitations / tuning notes

- Multiplayer preload starts when the `start` message arrives (after the
  server countdown has already begun); a full asset-ready handshake that
  gates the countdown is the remaining follow-up if load time matters.
- Reconnecting clients reconstruct enemy presentation from materialize
  records and receive only subsequent cue changes; an attack in progress
  may not show its cue until the next change.
- A wave that outlives the next countdown threshold defers that wave until
  the active wave clears (HordeDirector opens one wave at a time). The HUD
  countdown keeps running regardless.
- Boss-intro is a 4-second presentation window derived from the bossWave
  phase; boss spawns at bossWave start.
- MP encounter bars rely on the server-authored stage `monster.encounters`
  block (horde replication strips `defId` from enemy records).
