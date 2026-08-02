# Codex Prompt — Refactor Phase 2
## Immutable Match Rules, Runtime Stats, DemoMode, Objectives, Round, and Scoring

Prerequisite: Phase 1 complete; validated Demo content pack loads.

Read all authority documents and status.

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

Make the score-attack loop one selectable mode and introduce safe match-scoped stat resolution.

## Required work

1. Replace shared mutable config references with immutable match-scoped rules:
   ```text
   ContentPack → mode → difficulty → MatchRules
   ```
2. Prove two simultaneous rooms can use different rules without contamination.
3. Implement:
   - known stat registry
   - base stat blocks
   - add/multiply/override
   - priorities
   - stacking
   - optional duration
   - dirty caching
   - rules revision
   - movement rules revision
4. Begin with match, tank, weapon, and enemy scopes only.
5. Synchronize movement-critical resolved values with authoritative kinematics and Driver prediction.
6. Add `DemoScoreAttackModeDefinition` and `DemoScoreAttackModeRuntime`.
7. Extract:
   - `RoundSystem`
   - `ObjectiveSystem`
   - `ScoreSystem`
   - `ComboSystem`
   - `JackpotSystem`
   - `ResultSystem`
8. Move duration, assistance ownership, score rules, combo/JACKPOT mode rules, and results selection out of `Match`.
9. Introduce/strengthen `MatchRuntime`; legacy weapon/enemy paths may remain behind adapters.
10. Load Demo mode/objective/scoring/results/timing from content data.

## Required parity

Preserve 90 seconds, combo, JACKPOT, assistance, wipeout score effect, grades/titles, and rematch reset using Phase 0 fixtures.

## Tests

Modifier operations/stacking/expiration/priority/cache, immutable definitions, per-match isolation, revisions, predictor update, mode selection, and Demo parity.

## Forbidden

Do not migrate weapons/enemies fully, split the client, or remove all adapters.

## Gate/report

Run all gates. Report rules flow, stat order, revisions, DemoMode ownership, extracted systems, remaining `Match` responsibilities, adapters, results, and Phase 3 prerequisites.
