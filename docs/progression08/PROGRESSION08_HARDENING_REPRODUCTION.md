# Progression08 — Hardening Reproduction

Reproduction method: write focused tests first, run them against the
baseline checkout (`b9c3c7e`), record failures, then implement and rerun.

## Pre-fix reproduction run

Command:

```bash
npx vitest run tests/progression08/firstChestIntegration.test.ts \
  tests/progression08/progressionDisabledMode.test.ts \
  tests/progression08/xpGrantRouting.test.ts \
  tests/progression08/relicSelectionFlow.test.ts \
  tests/progression08/progressionOverlay.test.ts \
  tests/progression08/relicParameterization.test.ts \
  tests/progression08/progressionFlowQueue.test.ts
```

Result: **7 files failed / 41 tests failed, 8 passed**.

## Issue → proof matrix

| Issue | Proof in the failing run |
| --- | --- |
| 1. First chest uses wrong table | `first real open … is Epic/Legendary only` → `expected ['epic','legendary'] to include 'common'` (first open rolled `common`); `wave leader guaranteed chest …` same failure |
| 2. Disabled mode leaks rewards | `enemy kills produce no XP shards …` → `expected 1 to be +0` (one XP shard); `spawnChest cannot create an active … chest` → `expected 1 to be +0`; `noteMissedShard` → `expected 7 to be +0` |
| 3. Overlay structure | all 8 overlay tests failed (`expected 'none' not to be 'none'`, null layer lookups, stale DOM) |
| 4. Leader/elite/boss XP path | `wave leader XP crossing a threshold starts upgrade selection` → `expected 'playing' to be 'upgradeSelection'`; `elite leader reward uses shared path` → `expected ['reward'] to include 'xpCollected'` |
| 5. No relic reveal flow | `opening a chest enters relicSelection` → `expected 'playing' to be 'relicSelection'`; `gameplay is paused during the reveal` → `expected 2.0 to be +0`; `skip is idempotent` → `m.skipProgressionRelic is not a function` |
| 6. No acquisition sequence | `later chests … consumed exactly once` → `expected undefined to be 2` (`acquisitionSequence` missing); `same stackable relic presents again` failed on stale `×1` text |
| 7. Hardcoded tuning | `VAMPIRE ROUNDS heal amount comes from content` failed at fixture load with no validation; `shipped relic numeric behavior …` → `expected undefined to be 25` (`shockwaveDamage` missing from content); `missing required … fail validation` → loader accepted missing `amountPerStack` |
| 8. Flow serialization | `only one active flow exists` → `expected 'playing' to be 'relicSelection'`; `a second chest cannot nest` → non-null result; `terminal state cancels pending presentation` → null `expiresAtWallMs` |

## Post-fix run

Same command after implementation:

```text
7 files passed / 49 tests passed
```

The full `tests/progression08` suite is 21 files / 116 tests PASS, and the
new `npm run test:progression:hardening` script reports 7 files / 49 tests
PASS. E2E proofs: `progression-first-chest.spec.ts`,
`progression-relic-reveal.spec.ts`, and `progression-disabled-demo.spec.ts`
all PASS in `npm run test:progression:e2e` (7/7) and `npm run test:e2e`
(40/40).
