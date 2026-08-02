# Recoil Crew DS — Refactor Status

**Baseline commit:** `2fff386` (pre-Phase-0 HEAD: "Fix TPS controls, turret spaces, prediction, interpolation, collision, and copy")
**Current commit:** (Phase 0 completion commit — recorded after commit)
**Current phase:** 0 — Baseline audit (automated gate passed)
**Last passing phase:** 0 — Baseline audit
**Content schema version:** none yet (no JSON content in the codebase)
**Content pack:** none — gameplay values live in `src/shared/config.ts` (`BASE_CONFIG`, `MODIFIER_OVERRIDES`)
**Rules revision format:** none yet — per-match `MatchConfig` is built in memory by `buildMatchConfig(modifier)`

## Baseline evidence

```text
npm run build: PASS (client dist/ + server dist-server/)
npm test: PASS — 13 files, 128/128 tests (was 11 files, 98 tests)
npm run test:e2e: PASS — 14/14 Playwright tests (4.4m)
npm run test:loop: PASS — 90.0s round, score 14600, grade S, JACKPOT x2,
  combo x5, rematch ok (moonYard, fresh score 0, same room), 1353 snapshots
```

Current unit test count: 128 (13 files) — includes 30 new Phase 0 tests
Current E2E test count: 14 (unchanged)
Known baseline limitations:

- `Match.cfg` defaults to a shared mutable `BASE_CONFIG` reference; only
  `mcfg` is per-match (documented + pinned by characterization tests).
- `Match` and `Game` remain monoliths (1331 and 1053 lines).
- `Match` consumes global `Math.random`; determinism is achieved by seeding
  in the fixture, not by injection.
- `REFACTOR_02_DATA_DRIVEN_CONTENT_AND_STATS_SPEC.md` is referenced by the
  execution guide but is missing from `docs/refractor/`.
- All gameplay data is still hardcoded TypeScript (inventory in
  `REFACTOR_BASELINE_AUDIT.md` §8).

## Phase status

| Phase | Status | Commit | Gate |
|---|---|---|---|
| 0 — Baseline audit | Automated gate passed | (Phase 0 commit) | All four commands PASS |
| 1 — Core/content runtime | Not started | | |
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
None (Phase 0 is audit-only; no architecture migration began)
```

### Compatibility adapters still present

```text
None
```

### Compatibility adapters removed

```text
None
```

### Hardcoded Demo rules remaining

```text
All of them — see REFACTOR_BASELINE_AUDIT.md §8 for the full inventory
(spawn schedules, grades/titles, arena layout, magic damage/score values,
config.ts BASE_CONFIG values, presentation tuning).
```

### Data not yet migrated to JSON

```text
All gameplay content: tank/weapon/enemy/scoring/jackpot/arena/rematch data,
spawn schedules, asset manifest overrides (manifest.json exists but is a
client-only override file, not authoritative content).
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
```

Files modified:

```text
package.json (npm scripts: test:demo, demo:write)
```

Behavior changes:

```text
None — Phase 0 is audit + golden-master protection only. No source files in
src/ were modified. All 98 pre-existing tests still pass unchanged.
```

## Verification

```text
npm run build: PASS
npm test: PASS — 13 files, 128/128
npm run test:e2e: PASS — 14/14
npm run test:loop: PASS — 90.0s full round + rematch
npm run test:demo: PASS — deterministic fixture matches tests/fixtures/demo-golden.json
```

Manual tests:

```text
Not performed beyond the automated e2e/loop suites (Phase 0 changes nothing
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
```

## Next phase prerequisites

```text
Apply the recommended tag refactor-baseline to the Phase 0 completion commit
(recorded here per REFACTOR_03 §2; tag creation is a one-line follow-up).
Phase 1 (core/content runtime) may then begin: content loader + schemas +
registries + stable IDs + content hash + typed events + system contracts,
built beside the current behavior with compatibility adapters.
```
