# Recoil Crew DS — Refactor Status

**Baseline commit:** `2fff386` (pre-Phase-0 HEAD: "Fix TPS controls, turret spaces, prediction, interpolation, collision, and copy")
**Current commit:** `8cb15af` (Phase 2 completion: "refactor: Phase 2 immutable match rules, runtime stats, DemoMode, and extracted systems")
**Current phase:** 2 — Stats/DemoMode (automated gate passed)
**Last passing phase:** 2 — Stats/DemoMode
**Content schema version:** 1 (Zod 4 schema set in `src/shared/content/schemas/`)
**Content pack:** `demo@1.0.0` — `content/` (validated, frozen, hash `e4afdf7a10b0…`)
**Rules revision format:** per-match `MatchRules` (ContentPack -> mode -> difficulty); `rulesRevision` + `movementRulesRevision` + compact movement block replicated on snapshots

## Baseline evidence

```text
npm run build: PASS (client dist/ + server dist-server/)
npm test: PASS — 21 files, 201/201 tests (Phase 1 baseline: 17 files, 163 tests)
npm run test:e2e: PASS — 14/14 Playwright tests (4.4m)
npm run test:loop: PASS — 90.1s round, score 4969, grade B, JACKPOT x2,
  combo x5, rematch ok (moonYard, fresh score 0, same room), 1353 snapshots
npm run test:demo: PASS — deterministic Demo fixture still matches golden
```

Current unit test count: 201 (21 files) — includes 38 new Phase 2 tests
Current E2E test count: 14 (unchanged)
Known baseline limitations:

- `Match.cfg`/`mcfg` are now per-match frozen projections of resolved stats
  (shared `BASE_CONFIG` reference removed).
- `MatchRuntime` remains large (~1270 lines) with legacy weapon/enemy/shell/
  pickup/spawn/barrel paths (Phase 3/4 extraction targets); `Game` remains
  a monolith (1053 lines).
- `Match` consumes global `Math.random`; determinism is achieved by seeding
  in the fixture, not by injection.
- `REFACTOR_02_DATA_DRIVEN_CONTENT_AND_STATS_SPEC.md` is referenced by the
  execution guide and is now present in `docs/refractor/`.
- The authoritative server path resolves rules from validated JSON; the
  client Practice path resolves identical values from legacy constants
  (parity-tested) to keep fs/zod out of the browser bundle.
- Arena layout (obstacles, barrels, ramps, truck route) is still hardcoded in
  `arena.ts`.

## Phase status

| Phase | Status | Commit | Gate |
|---|---|---|---|
| 0 — Baseline audit | Complete | `eb5c1e5` | All four commands PASS |
| 1 — Core/content runtime | Complete | `5444fe2` | All four commands PASS |
| 2 — Stats/DemoMode | Automated gate passed | `8cb15af` | All four commands PASS |
| 3 — Weapons/damage/projectiles | Not started | | |
| 4 — Enemies/items/objectives | Not started | | |
| 5 — Client/assets | Not started | | |
| 6 — Proof/cleanup | Not started | | |

Allowed status:

```text
Not started
In progress
Blocked
Automated gate passed
Human review passed
Complete
```

## Current architecture

### New final modules

```text
content/ — validated Demo content pack (26 JSON files, zod schemas)
src/shared/content/ — ContentLoader, ContentPack, DefinitionRegistry,
  BehaviorRegistry, ReferenceValidator, stat-id catalog, deterministic hash
src/shared/core/ — GameplaySystem, SimulationContext, GameplayEventBus,
  EntityRegistry, SystemScheduler, GameModeRegistry
src/shared/stats/ — known-stat registry, base blocks, StatResolver
  (add/multiply/override, priorities, stacking, duration, dirty cache),
  rulesRevision/movementRulesRevision
src/shared/rules/ — MatchRules (content + legacy paths), legacy Demo bundle
src/shared/modes/ — DemoScoreAttackModeDefinition + DemoScoreAttackModeRuntime
src/shared/sim/systems/ — RoundSystem, ObjectiveSystem, ScoreSystem,
  ComboSystem, JackpotSystem, ResultSystem
src/shared/sim/matchRuntime.ts — orchestration; Match is now a thin facade
```

### Compatibility adapters still present

```text
LegacyConfigAdapter (maps ContentPack -> GameConfig/MatchConfig; now feeds
  MatchRules projections; removal: Phase 3+)
LegacyContentAdapter (content id <-> legacy enum maps; removal: Phase 3)
```

### Compatibility adapters removed

```text
None
```

### Hardcoded Demo rules remaining

```text
The sim executes from per-match frozen rule projections fed by the stat
service; duration, assistance, score/combo/JACKPOT mode rules, and results
selection are content-driven. Still hardcoded in MatchRuntime: weapon/enemy/
shell/pickup/spawn/barrel algorithms and private spawn schedules (Phase 3/4).
Arena obstacle/barrel/ramp/route layout remains hardcoded in arena.ts.
```

### Data not yet migrated to JSON

```text
Phase 1 JSON now mirrors tank/weapon/projectile/enemy/scoring/jackpot/spawn/
difficulty/results/presentation data. Still TypeScript-only:
arena obstacle layout, barrel positions, ramps, truck route, and the
authoritative weapon/enemy/spawn algorithms in matchRuntime.ts (Phase 3/4).
```

## Current phase changes

Files added:

```text
REFACTOR_BASELINE_AUDIT.md
REFACTOR_STATUS.md
tests/helpers/demoFixture.ts
tests/demoRegression.test.ts
tests/baselineCharacterization.test.ts
tests/fixtures/demo-golden.json
scripts/demo-regression.ts
content/ (26 JSON definitions + manifest)
src/shared/content/ (schemas, loader, pack, registries, validator, hash, stats)
src/shared/core/ (system/context/event-bus/entity/scheduler/mode contracts)
src/shared/legacy/ (LegacyConfigAdapter, LegacyContentAdapter)
tests/contentPack.test.ts
tests/coreContracts.test.ts
tests/legacyAdapters.test.ts
tests/roomContentMetadata.test.ts
src/shared/stats/ (statIds, statBlock, statModifier, statResolver, rulesRevision)
src/shared/rules/ (matchRules, legacyDemoRules)
src/shared/modes/ (demoScoreAttack)
src/shared/sim/systems/ (context + 6 systems)
src/shared/sim/matchRuntime.ts
src/shared/sim/match.ts (rewritten as a thin facade)
tests/stats.test.ts
tests/matchRules.test.ts
tests/modeSystems.test.ts
tests/roomRules.test.ts
docs/refractor/REFACTOR_02_DATA_DRIVEN_CONTENT_AND_STATS_SPEC.md
```

Files modified:

```text
package.json (npm scripts: test:demo, demo:write)
package.json + package-lock.json (new dependency: zod 4)
src/server/room.ts (additive content metadata on rooms + start message)
src/server/index.ts (loads and validates content pack at startup)
Dockerfile (ships content/ in the production image)
src/server/room.ts (Phase 2: rooms resolve rules from the content pack;
  snapshots carry rulesRevision/movementRulesRevision/movement block)
src/client/predictor.ts (applyMovementRules)
src/client/game.ts + main.ts (movement block -> predictor)
src/shared/types.ts + net/interpolation.ts (additive snapshot fields)
tests/baselineCharacterization.test.ts (cfg shared-reference pin replaced by
  per-match immutable projection assertions)
```

Behavior changes:

```text
Phases 0-1: no gameplay/network behavior change; Demo golden fixture
unchanged (1641 events, same results).

Phase 2 — gameplay numbers are byte-for-byte unchanged (golden fixture,
all 163 pre-existing tests, e2e, loop). Structural changes only:
- Match split into a thin facade + MatchRuntime with immutable MatchRules.
- Six systems extracted; duration/assistance/score/combo/JACKPOT/results
  ownership moved out of Match into content-driven systems.
- Snapshots additively carry rulesRevision/movementRulesRevision and the
  compact movement block on change; Driver predictor applies it.
```

## Verification

```text
npm run build: PASS
npm test: PASS — 21 files, 201/201
npm run test:e2e: PASS — 14/14
npm run test:loop: PASS — 90.0s full round + rematch
npm run test:demo: PASS — deterministic fixture matches tests/fixtures/demo-golden.json
```

Manual tests:

```text
Not performed beyond the automated e2e/loop suites (Phases 0-2 change nothing
in runtime behavior; browser play was verified by e2e + loop gates).
```

## Blockers and risks

```text
1. Missing authority doc: REFACTOR_02_DATA_DRIVEN_CONTENT_AND_STATS_SPEC.md
   is now present; Phase 2 read it.
2. Shared cfg reference: removed in Phase 2 — Match.cfg/mcfg are frozen
   per-match projections; per-room isolation is tested.
3. Global Math.random: the golden fixture seeds it; production does not.
   Later phases should inject RNG into the sim to harden determinism.
4. Golden file size: tests/fixtures/demo-golden.json contains a full 1641-
   event canonical trace; regeneration requires deliberate `npm run demo:write`.
5. E2E remains wall-clock bound (real 90 s rounds); it is intentionally not
   canonicalized.
6. Dual rule paths: the server resolves from validated JSON; the browser
   Practice path resolves from legacy constants. Both are parity-tested and
   frozen; the client path intentionally avoids fs/zod.
7. Client bundle grew ~24 KB with the stats/rules/systems code (no fs/zod).
8. Stat scope is intentionally match/tank/weapon/enemy only; scoring/jackpot/
   arena values still flow through the legacy config projection.
9. MatchRuntime still owns weapon/enemy/shell/pickup/spawn/barrel algorithms
   (~1270 lines) — extraction targets for Phases 3-4.
10. The stat resolver cache is per-stat; whole-config projection refreshes
    on any stat change (cheap at 30 Hz, revisited if profiling demands).
```

## Next phase prerequisites

```text
Apply the recommended tag refactor-baseline to the Phase 0 completion commit
(recorded here per REFACTOR_03 §2; tag creation is a one-line follow-up).

Phase 3 (weapons/damage/projectiles) prerequisites:
- Migrate loadout slots to primary/secondary/ability behind a
  LegacyWeaponInputAdapter while mg/cannon/charge remain on the wire.
- Resolve weapon/projectile behavior from content definitions with the
  stat service; keep cooldowns/recoil authoritative.
- Keep the golden fixture, rules revisions, and movement block passing.
```
