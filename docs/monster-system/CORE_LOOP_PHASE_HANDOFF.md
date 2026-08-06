# Core Loop Integration — Phase Handoff

Branch: `monster-system` (recreated at `880d515`, which includes all newer
valid work; the deleted branch was restored from the merged `main` head).

## Phase A — Production content and deterministic run selection: COMPLETE

Commits: `monster-core-loop: add production roster selection and featured identities`.

### Delivered

- `enemyGameplayRosters` content category (schema, registry, loader, manifest,
  reference validation, generated pack).
- `enemyGameplayRoster.quaternius.mainStage`: 39 ordinary candidates with
  phase weights, 50/30/20 ordinary mix, one-elite waves (JSON-only two-elite
  support), boss escort 4–6, six shared featured identities.
- Six provisional cross-role definitions (Alien/Cactoro/Fish/Ninja bosses,
  Demon/Yeti elites) centralized in `scripts/generate-monster-roster.ts`;
  roster now 51 validated monsters.
- `mode.mainStage`, `mode.singlePlayerMainStage`, `objective.mainStage`,
  `results.mainStage`, `spawn.director.mainStage`, and
  `horde.mainStage.production` (enforceStage: true) content.
- `src/shared/monsters/monsterRunSelection.ts`: deterministic selection with
  named PRNG streams, no-consecutive-repeat, elite uniqueness, boss
  exclusion, phase-1-repeat-in-phase-3.
- Tests: `tests/monsterRunSelection.test.ts` (8), roster counts updated.

### Gates

`tsc --noEmit` PASS · `generate:content-pack` PASS (5 modes) · `npm test`
PASS (133 files / 953 tests) · `npm run build` PASS · Demo golden unchanged
(`test:demo` not rerun this phase; no Demo content touched).

## Next steps (Phases B–E)

### Phase B — Production horde and live match flow
- Give `horde.mainStage.production` a `gameplayRosterId` reference; add
  symbolic selected-slot packs/waves; wire `MonsterRunState` into
  match-scoped state; implement 60/120 wave transitions, 180 boss intro,
  tank-death defeat (no respawn), boss-death victory; replicate run state.

### Phase C — Combat/XP/projectile/RNG wiring
- Match-scoped `MeleeReservationManager` feeding `EnemyRuntimeState.meleeReserved`
  before attack behaviors; award-once spawn-locked XP with visual shard
  bundles; telegraph lifecycle; enemy projectile `team` allegiance; replace
  remaining authoritative `Math.random()` in monster spawn/drop paths.

### Phase D — Presentation/preload/HUD
- Normalized socket cache; selected-asset preload before countdown; semantic
  action controller; TIME UNTIL NEW WAVE / BOSS INCOMING labels; elite/boss
  encounter bars (two stacked when eliteCount=2).

### Phase E — Qualification
- SP and two-client runs, selection matrix, performance, reports.

## Known Phase A notes

- `horde.mainStage.production` currently reuses the existing horde packs/
  waves/stage sequence (enforceStage already true); Phase B replaces them
  with selected-slot production content.
- Production modes still reference `scoring.demoScoreAttack` /
  `presentation.demoScoreAttack` (shared scoring/presentation are acceptable;
  the Demo fixture files themselves are untouched).
- `objective.mainStage` uses `durationSeconds: 180` with
  `kind: scoreAttack`; auto-completion is already suppressed by
  `RoundSystem` whenever `hordeDirector.enforceStage === true`.
