# Codex Prompt — Refactor Phase 0
## Baseline Audit and Golden-Master Protection

Read:

```text
REFACTOR_00_README_EXECUTION_GUIDE.md
REFACTOR_01_PHILOSOPHY_AND_TARGET_ARCHITECTURE.md
REFACTOR_02_DATA_DRIVEN_CONTENT_AND_STATS_SPEC.md
REFACTOR_03_NON_BREAKING_MIGRATION_PLAN.md
REFACTOR_04_ACCEPTANCE_AND_REGRESSION_MATRIX.md
REFACTOR_STATUS_TEMPLATE.md
README.md
BUILD_STATUS.md
BUGFIX_REPORT_FINAL.md
DECISIONS.md
```

# Shared governance

- Read every refactor authority document before editing.
- Read and update `REFACTOR_STATUS.md`.
- Inspect the current repository; do not assume paths are unchanged.
- Do not rewrite the game or change stacks.
- Preserve server authority, Driver prediction, Gunner prediction, independent TPS cameras, and the complete Demo loop.
- Do not start a later phase.
- Do not delete compatibility code before all callers migrate.
- Do not weaken tests.
- Run all four phase-gate commands.
- Return a truthful completion report.


## Goal

Create a trustworthy migration baseline without redesigning gameplay.

## Required work

1. Inspect every source and test file.
2. Create `REFACTOR_BASELINE_AUDIT.md` documenting:
   - module dependencies
   - `Match` responsibilities
   - `Game` responsibilities
   - network messages
   - state/input ownership
   - asset path
   - hardcoded gameplay data
   - config usage
   - tests and gaps
3. Copy the status template to `REFACTOR_STATUS.md` and fill it.
4. Add a deterministic Demo regression harness using a fixed seed and scripted Driver/Gunner inputs.
5. Capture canonical checkpoints: initial, 10s, 30s, Loot Truck window, JACKPOT window, completion, results, rematch reset.
6. Canonicalize away wall-clock time, client-only presentation, debug fields, and unstable ordering.
7. Add characterization tests for:
   - Demo duration source
   - weapon input fields
   - enemy mapping
   - asset manifest behavior
   - Practice/online rule parity
   - per-room config isolation
   - Driver predictor config source
8. Record recommended tag `refactor-baseline`.

## Forbidden

No system extraction, JSON migration, stat service, network redesign, balance changes, or new content.

## Gate

```bash
npm run build
npm test
npm run test:e2e
npm run test:loop
```

## Report

Return baseline commit, architecture map, hardcoding inventory, fixture strategy, files/tests added, all results, Phase 1 risks, and confirmation that migration did not begin.
