# Recoil Crew DS — Refactor Status

**Baseline commit:** `2fff386` (pre-Phase-0 HEAD: "Fix TPS controls, turret spaces, prediction, interpolation, collision, and copy")
**Current commit:** `4bc3d7c` (Phase 5 completion: "refactor: Phase 5 client coordinator split and complete asset/presentation architecture")
**Current phase:** 5 — Client/presentation/assets (automated gate passed)
**Last passing phase:** 5 — Client/presentation/assets
**Content schema version:** 1 (Zod 4 schema set in `src/shared/content/schemas/`)
**Content pack:** `demo@1.0.0` — `content/` (validated, frozen; now includes drop tables + pickups; hash regenerated)
**Rules revision format:** per-match `MatchRules` (ContentPack -> mode -> difficulty); `rulesRevision` + `movementRulesRevision` + compact movement block replicated on snapshots

## Baseline evidence

```text
npm run build: PASS (client dist/ + server dist-server/)
npm test: PASS — 23 files, 227/227 tests (Phase 3 baseline: 22 files, 215 tests)
npm run test:e2e: PASS — 14/14 Playwright tests (4.4m)
npm run test:loop: PASS — 90.4s round, score 14327, grade S, JACKPOT x2,
  combo x5, rematch ok (moonYard, fresh score 0, same room), 1353 snapshots
npm run test:demo: PASS — deterministic Demo fixture still matches golden
```

Current unit test count: 234 (24 files) — includes 7 new Phase 5 tests
Current E2E test count: 14 (unchanged)
Known baseline limitations:

- `MatchRuntime` (~430 lines) still owns tank movement, barrels, results
  wiring, and input; enemy AI, pickups, drops, and spawn pacing are migrated.
- `Game` remains a monolith (1053 lines) — Phase 5 splits the client.
- Arena obstacle/barrel/ramp/route layout remains hardcoded in `arena.ts`.
- Demo ships no items/status effects (framework is tested via variant packs).
- The shared dodge-credit flag was preserved per-enemy-system (legacy was
  one flag per match); noted as latent behavior, kept for parity.
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
| 3 — Weapons/damage/projectiles | Complete | `720e880` | All four commands PASS |
| 4 — Enemies/items/effects/spawning | Complete | `b468724` | All four commands PASS |
| 5 — Client/presentation/assets | Automated gate passed | `4bc3d7c` | All four commands PASS |
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
src/shared/enemies/ — EnemySystem (no per-type switch), EnemyBehaviorRegistry
  (seekTank/followRoute/circleTarget/separation/obstacleAvoid/integrate,
  telegraphedCharge/projectileBurst/contactRam, armoredFront,
  nonAttackingObjective/vulnerableRear), EnemyRuntimeState
src/shared/pickups/ — PickupSystem (life/magnet from pickup definitions)
src/shared/drops/ — DropTableResolver (deterministic scatter)
src/shared/spawning/ — SpawnDirectorRuntime (schedules, truck timing,
  final chaos from content)
src/shared/items/ — ItemSystem, StatusEffectSystem, TriggeredEffectRegistry
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
The Demo loop executes weapons, projectiles, damage, recoil, enemies
(composed behaviors), pickups, drops, and spawn pacing through validated
content with registered behavior primitives. Still hardcoded in
MatchRuntime: tank movement, barrel props, and results wiring. Arena
obstacle/barrel/ramp/route layout remains hardcoded in arena.ts.
```

### Data not yet migrated to JSON

```text
Phase 1-4 JSON now mirrors tank/weapon/projectile/enemy/drop-table/pickup/
scoring/jackpot/spawn/difficulty/results/presentation data. Still
TypeScript-only: arena obstacle layout, barrel positions, ramps, truck
route, and client presentation (Phase 5).
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
src/shared/enemies/ (system, behavior registry, runtime state)
src/shared/pickups/ (PickupSystem)
src/shared/drops/ (DropTableResolver)
src/shared/spawning/ (SpawnDirectorRuntime)
src/shared/items/ (ItemSystem, StatusEffectSystem, TriggeredEffectRegistry)
content/drop-tables/ (4 tables), content/pickups/ (3 pickup defs)
tests/enemySystem.test.ts
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
content/enemies/*.json (composed behaviors, dropTableId, presentationId)
content/spawn-directors/demoScoreAttack.json (truck timing block)
src/shared/sim/matchRuntime.ts (enemy/pickup/spawn paths migrated)
src/shared/damage/damageSystem.ts (trait/armor-driven damage modifiers)
src/shared/sim/systems/objectiveSystem.ts (typed objective events)
```

Behavior changes:

```text
Phases 0-2: no gameplay/network behavior change; Demo golden fixture
unchanged (1641 events, same results).

Phases 2-3: gameplay numbers byte-for-byte unchanged (golden fixture, all
pre-existing tests, e2e, loop); structural changes only.

Phase 4 — gameplay numbers are byte-for-byte unchanged (golden fixture,
all pre-existing tests, e2e, loop). Structural changes only:
- Enemies are composed behavior lists in JSON; EnemySystem has no per-type
  switch. Rammer/Tower/Truck machines and bug movement run as registered
  primitives (seekTank, circleTarget, separation, obstacleAvoid, integrate,
  contactRam, telegraphedCharge, projectileBurst, followRoute, traits).
- Damage modifiers (armoredFront, vulnerableRear) come from enemy traits.
- Drops resolve from drop tables through DropTableResolver + PickupSystem;
  pickup life/magnet/collection formulas moved out of MatchRuntime.
- SpawnDirectorRuntime owns schedules, budgets, Loot Truck timing, and
  final chaos from content; assistance stays in ObjectiveSystem.
- ItemSystem/StatusEffectSystem/TriggeredEffectRegistry support instant +
  timed modifiers with stacking/expiration (framework; Demo has none).
- Objectives can react to typed kill/collection events (and the type list
  includes zone/delivery/protection/timer for future modes).
```

## Verification

```text
npm run build: PASS
npm test: PASS — 23 files, 227/227
npm run test:e2e: PASS — 14/14
npm run test:loop: PASS — 90.0s full round + rematch
npm run test:demo: PASS — deterministic fixture matches tests/fixtures/demo-golden.json
```

Manual tests:

```text
Not performed beyond the automated e2e/loop suites (Phases 0-4 change nothing
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
9. MatchRuntime still owns tank movement, barrel props, and results wiring
   (~430 lines); Game remains a monolith (Phase 5).
10. The stat resolver cache is per-stat; whole-config projection refreshes
    on any stat change (cheap at 30 Hz, revisited if profiling demands).
11. Weapon statBlocks and enemy per-type fields mirror some values in the
    legacy config projection; parity tests enforce sync.
12. The shared dodge-credit flag (one per match) is preserved for golden
    parity even though per-enemy would be more correct.
```

## Next phase prerequisites

```text
Apply the recommended tag refactor-baseline to the Phase 0 completion commit
(recorded here per REFACTOR_03 §2; tag creation is a one-line follow-up).

Phase 5 (client/presentation/assets) — DONE. Client split complete:
GameClient coordinates RenderWorld, EntityViewRegistry/Factory,
NetworkStatePresenter, CameraManager, PredictionController,
PresentationEventRouter, HudController, PipRenderer, and QualityManager.
AssetService.load() is awaited; models are cached prototypes (custom GLBs or
registered procedural fallbacks), cloned per instance, and transformed by
manifest metadata. VFX/audio/themes/icons/camera impulses route through the
bundled presentation definition; no gameplay dependency on child names.
E2E, HUD, cameras, PIP, audio, and VFX remain functional (14/14, loop PASS).

Phase 6 (proof content and cleanup) prerequisites:
- Add one alternate mode, one ordinary new weapon, one composed enemy, and
  one stat-changing item through validated content (no MatchRuntime edits).
- Remove the migrated adapters (LegacyConfigAdapter/LegacyContentAdapter/
  LegacyWeaponInputAdapter) where callers now consume content directly.
- Produce authoring guides (ARCHITECTURE, CONTENT_AUTHORING,
  ADDING_A_GAME_MODE/WEAPON/ENEMY/ITEM, NETWORK_RULES).
- Keep the golden fixture, rules revisions, and movement block passing.
```
