# Recoil Crew DS — Refactor Status

**Baseline commit:** `2fff386` (pre-Phase-0 HEAD: "Fix TPS controls, turret spaces, prediction, interpolation, collision, and copy")
**Current commit:** `720e880` (Phase 3 completion: "refactor: Phase 3 modular loadouts, weapons, projectiles, damage, and recoil")
**Current phase:** 3 — Weapons/damage/projectiles (automated gate passed)
**Last passing phase:** 3 — Weapons/damage/projectiles
**Content schema version:** 1 (Zod 4 schema set in `src/shared/content/schemas/`)
**Content pack:** `demo@1.0.0` — `content/` (validated, frozen, hash `e4afdf7a10b0…`)
**Rules revision format:** per-match `MatchRules` (ContentPack -> mode -> difficulty); `rulesRevision` + `movementRulesRevision` + compact movement block replicated on snapshots

## Baseline evidence

```text
npm run build: PASS (client dist/ + server dist-server/)
npm test: PASS — 22 files, 215/215 tests (Phase 2 baseline: 21 files, 201 tests)
npm run test:e2e: PASS — 14/14 Playwright tests (4.4m)
npm run test:loop: PASS — 90.4s round, score 11504, grade A, JACKPOT x2,
  combo x5, rematch ok (moonYard, fresh score 0, same room), 1353 snapshots
npm run test:demo: PASS — deterministic Demo fixture still matches golden
```

Current unit test count: 215 (22 files) — includes 14 new Phase 3 tests
Current E2E test count: 14 (unchanged)
Known baseline limitations:

- `MatchRuntime` (~940 lines) still owns enemy AI, pickups, spawn pacing,
  and barrels (Phase 4 extraction targets); `Game` remains a monolith.
- Weapon behavior parameters are read from per-weapon statBlocks (resolver
  merged) with a few legacy-precedence reads (cannon recoil uses
  match.recoilImpulse so difficulty overrides keep working).
- Semantic bus events are consumed by synchronous drains (the kill reaction
  drains at emit); future presentation consumers must subscribe, not drain.
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
| 2 — Stats/DemoMode | Complete | `8cb15af` | All four commands PASS |
| 3 — Weapons/damage/projectiles | Automated gate passed | `720e880` | All four commands PASS |
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
src/shared/weapons/ — WeaponSystem, LoadoutRuntime (primary/secondary/ability),
  WeaponRegistry, WeaponBehaviorRegistry, WeaponRuntimeState,
  hitscan/projectile/chargeProjectile behaviors
src/shared/projectiles/ — ProjectileSystem, ProjectileBehaviorRegistry
src/shared/damage/ — DamageRequest/Result/Source/Tags, DamageSystem
src/shared/effects/ — RecoilEffect (reusable authoritative recoil)
src/shared/sim/enemyRadius.ts — shared radius resolver
```

### Compatibility adapters still present

```text
LegacyConfigAdapter (maps ContentPack -> GameConfig/MatchConfig; now feeds
  MatchRules projections; removal: Phase 3+)
LegacyContentAdapter (content id <-> legacy enum maps; removal: Phase 3)
LegacyWeaponInputAdapter (mg/cannon/charge -> primary/secondary/ability in
  LoadoutRuntime.actionsFromInput; generic fields win when both are sent;
  removal: when the client migrates to generic fields)
```

### Compatibility adapters removed

```text
None
```

### Hardcoded Demo rules remaining

```text
The Demo loop now executes weapons/projectiles/damage/recoil through
content-defined behaviors (hitscan/projectile/chargeProjectile) with the
stat service. Still hardcoded in MatchRuntime: enemy AI, pickups, spawn
pacing, and private spawn schedules (Phase 4). Arena obstacle/barrel/ramp/
route layout remains hardcoded in arena.ts.
```

### Data not yet migrated to JSON

```text
Phase 1 JSON now mirrors tank/weapon/projectile/enemy/scoring/jackpot/spawn/
difficulty/results/presentation data. Still TypeScript-only:
arena obstacle layout, barrel positions, ramps, truck route, and the
authoritative enemy/pickup/spawn algorithms in matchRuntime.ts (Phase 4).
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
src/shared/weapons/ (system, loadout, registries, behaviors, runtime state)
src/shared/projectiles/ (system + behavior registry)
src/shared/damage/ (types + system)
src/shared/effects/ (recoil)
src/shared/sim/enemyRadius.ts
tests/weaponSystem.test.ts
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
content/weapons/*.json (spec format: behaviorId, fireMode, cooldownSeconds,
  statBlock, projectileId, presentation)
src/shared/content/schemas/weapon.ts (spec-format schema)
src/shared/stats/statIds.ts (per-kind weapon behavior stat ids)
src/shared/server/room.ts (additive primary/secondary/ability gunner fields)
src/shared/sim/matchRuntime.ts (weapon/shell/recoil/kill paths migrated)
```

Behavior changes:

```text
Phases 0-2: no gameplay/network behavior change; Demo golden fixture
unchanged (1641 events, same results).

Phase 3 — gameplay numbers are byte-for-byte unchanged (golden fixture,
all pre-existing tests, e2e, loop). Structural changes only:
- Weapons/projectiles/damage/recoil run through content-driven systems;
  MatchRuntime no longer owns stepWeapons/stepShells/recoil/killEnemy.
- Gunner input gains additive generic actions (primary/secondary/ability);
  mg/cannon/charge map through the input adapter.
- Semantic bus events (weapon.fired, projectile.impacted, damage.applied,
  entity.killed, recoil.applied) emitted internally; wire events unchanged.
```

## Verification

```text
npm run build: PASS
npm test: PASS — 22 files, 215/215
npm run test:e2e: PASS — 14/14
npm run test:loop: PASS — 90.0s full round + rematch
npm run test:demo: PASS — deterministic fixture matches tests/fixtures/demo-golden.json
```

Manual tests:

```text
Not performed beyond the automated e2e/loop suites (Phases 0-3 change nothing
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
9. MatchRuntime still owns enemy/pickup/spawn/barrel algorithms (~940 lines)
   — extraction target for Phase 4.
10. The stat resolver cache is per-stat; whole-config projection refreshes
    on any stat change (cheap at 30 Hz, revisited if profiling demands).
11. Weapon statBlocks mirror some values that also live in the legacy config
    projection (e.g. cannon recoil base); parity tests enforce sync.
```

## Next phase prerequisites

```text
Apply the recommended tag refactor-baseline to the Phase 0 completion commit
(recorded here per REFACTOR_03 §2; tag creation is a one-line follow-up).

Phase 4 (enemies/items/effects/spawning) prerequisites:
- Compose enemy behaviors from definitions (hunt/charge/burst/route) with
  drop tables; route all enemy damage through DamageSystem (already adapted).
- Add item/status-effect runtime with stat modifiers (stacking/expiration
  exist in StatResolver); consume spawn-director definitions for pacing.
- Keep the golden fixture, rules revisions, and movement block passing.
```
