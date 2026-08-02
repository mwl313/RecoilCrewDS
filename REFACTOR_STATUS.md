# Recoil Crew DS — Refactor Status

**Baseline commit:** `2fff386` (pre-Phase-0 HEAD: "Fix TPS controls, turret spaces, prediction, interpolation, collision, and copy")
**Current commit:** `eb5c1e5` (Phase 0 completion: "refactor: Phase 0 baseline audit and golden-master protection")
**Current phase:** 1 — Core/content runtime (automated gate passed)
**Last passing phase:** 1 — Core/content runtime
**Content schema version:** 1 (Zod 4 schema set in `src/shared/content/schemas/`)
**Content pack:** `demo@1.0.0` — `content/` (validated, frozen, hash `e4afdf7a10b0…`)
**Rules revision format:** none yet — per-match `MatchConfig` still built in memory by `buildMatchConfig(modifier)`; content difficulty `match.*` overrides are modeled and validated for Phase 2

## Baseline evidence

```text
npm run build: PASS (client dist/ + server dist-server/)
npm test: PASS — 17 files, 163/163 tests (Phase 0 baseline: 13 files, 128 tests)
npm run test:e2e: PASS — 14/14 Playwright tests (4.4m)
npm run test:loop: PASS — 90.0s round, score 14600, grade S, JACKPOT x2,
  combo x5, rematch ok (moonYard, fresh score 0, same room), 1353 snapshots
npm run test:demo: PASS — deterministic Demo fixture still matches golden
```

Current unit test count: 163 (17 files) — includes 35 new Phase 1 tests
Current E2E test count: 14 (unchanged)
Known baseline limitations:

- `Match.cfg` defaults to a shared mutable `BASE_CONFIG` reference; only
  `mcfg` is per-match (documented + pinned by characterization tests).
- `Match` and `Game` remain monoliths (1331 and 1053 lines).
- `Match` consumes global `Math.random`; determinism is achieved by seeding
  in the fixture, not by injection.
- `REFACTOR_02_DATA_DRIVEN_CONTENT_AND_STATS_SPEC.md` is referenced by the
  execution guide but is missing from `docs/refractor/`.
- The sim still reads `BASE_CONFIG`/`MatchConfig`; JSON content is a validated
  mirror proven equal by the legacy adapters (caller migration is Phase 2+).
- Arena layout (obstacles, barrels, ramps, truck route) is still hardcoded in
  `arena.ts`; content covers arena constants and spawn schedules only.

## Phase status

| Phase | Status | Commit | Gate |
|---|---|---|---|
| 0 — Baseline audit | Complete | `eb5c1e5` | All four commands PASS |
| 1 — Core/content runtime | Automated gate passed | (Phase 1 commit) | All four commands PASS |
| 2 — Stats/DemoMode | Not started | | |
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
```

### Compatibility adapters still present

```text
LegacyConfigAdapter (maps ContentPack -> GameConfig/MatchConfig; removal: Phase 2)
LegacyContentAdapter (content id <-> legacy enum maps; removal: Phase 3)
```

### Compatibility adapters removed

```text
None
```

### Hardcoded Demo rules remaining

```text
The sim still executes entirely from BASE_CONFIG/MatchConfig and match.ts
constants; JSON values are mirrored but not yet consumed by the runtime.
Arena obstacle/barrel/ramp/route layout remains hardcoded in arena.ts.
```

### Data not yet migrated to JSON

```text
Phase 1 JSON now mirrors tank/weapon/projectile/enemy/scoring/jackpot/spawn/
difficulty/results/presentation data. Still TypeScript-only:
arena obstacle layout, barrel positions, ramps, truck route, and the
authoritative algorithms in match.ts.
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
```

Files modified:

```text
package.json (npm scripts: test:demo, demo:write)
package.json + package-lock.json (new dependency: zod 4)
src/server/room.ts (additive content metadata on rooms + start message)
src/server/index.ts (loads and validates content pack at startup)
Dockerfile (ships content/ in the production image)
```

Behavior changes:

```text
None — Phase 0 is audit + golden-master protection only. No source files in
src/ were modified. All pre-existing tests still pass unchanged.

Phase 1 — no gameplay/network behavior change. The `start` message gains an
additive `content` field only when the server loads a pack; rooms without
content metadata are byte-for-byte unchanged. The Demo golden fixture is
unchanged (1641 events, same results).
```

## Verification

```text
npm run build: PASS
npm test: PASS — 17 files, 163/163
npm run test:e2e: PASS — 14/14
npm run test:loop: PASS — 90.0s full round + rematch
npm run test:demo: PASS — deterministic fixture matches tests/fixtures/demo-golden.json
```

Manual tests:

```text
Not performed beyond the automated e2e/loop suites (Phases 0-1 change nothing
in runtime behavior; browser play was verified by e2e + loop gates).
```

## Blockers and risks

```text
1. Missing authority doc: REFACTOR_02_DATA_DRIVEN_CONTENT_AND_STATS_SPEC.md
   is referenced by REFACTOR_00 but absent from docs/refractor/. Phase 1 can
   proceed, but Phase 2's spec will be unavailable unless it is added.
2. Shared cfg reference: Match.cfg === BASE_CONFIG for every match; Phase 2
   must introduce frozen per-room rules before any mutation of cfg.
3. Global Math.random: the golden fixture seeds it; production does not.
   Later phases should inject RNG into the sim to harden determinism.
4. Golden file size: tests/fixtures/demo-golden.json contains a full 1641-
   event canonical trace; regeneration requires deliberate `npm run demo:write`.
5. E2E remains wall-clock bound (real 90 s rounds); it is intentionally not
   canonicalized.
6. Phase 1 content is a frozen mirror, not the runtime source: two copies of
   the truth (JSON + BASE_CONFIG) must be kept in sync until Phase 2 migrates
   callers; the LegacyConfigAdapter parity tests enforce the invariant.
7. Content loading is server-side only; the client does not consume the pack
   yet (Phase 5 asset migration will route presentation through it).
8. The stat-id catalog is derived from the current config shape and will be
   replaced by the Phase 2 stat service.
```

## Next phase prerequisites

```text
Apply the recommended tag refactor-baseline to the Phase 0 completion commit
(recorded here per REFACTOR_03 §2; tag creation is a one-line follow-up).

Phase 2 (rules/stats/mode/objective/round/scoring) prerequisites:
- Obtain REFACTOR_02_DATA_DRIVEN_CONTENT_AND_STATS_SPEC.md.
- Start consuming ContentPack through LegacyConfigAdapter (parity-tested).
- Replace shared Match.cfg with frozen per-room rules; add stat service,
  rule revisions, and the DemoScoreAttackMode runtime.
- Keep the content hash/golden fixture passing at every step.
```
