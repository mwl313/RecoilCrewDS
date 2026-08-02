# Codex Prompt — Refactor Phase 1
## Core Runtime Contracts, JSON Schemas, Registries, and Content Loading

Prerequisite: Phase 0 complete and all gates passing.

Read all authority documents, `REFACTOR_BASELINE_AUDIT.md`, and `REFACTOR_STATUS.md`.

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

Introduce the data-driven content foundation beside the working game with no Demo behavior change.

## Required work

1. Create the `content/` structure from the specification.
2. Add validated JSON definitions for current Demo content where values are known.
3. Add one authoritative validation system, preferably Zod or a consistent equivalent.
4. Add schemas for content pack, modes, objectives, tanks, loadouts, weapons, projectiles, enemies, items, effects, spawning, scoring, results, difficulty, and presentation.
5. Implement:
   - `ContentPack`
   - `ContentLoader`
   - `DefinitionRegistry`
   - `BehaviorRegistry`
   - `ReferenceValidator`
   - deterministic content hash
6. Validate duplicates, references, behaviors, stats, and numeric constraints with useful file/JSON-path errors.
7. Freeze definitions.
8. Add small core contracts:
   - `GameplaySystem`
   - `SimulationContext`
   - `GameplayEventBus`
   - `EntityRegistry`
   - `SystemScheduler`
   - `GameModeRegistry`
9. Add explicit `LegacyConfigAdapter`/`LegacyContentAdapter` as needed.
10. Add content pack ID/version/hash/mode ID to server or room metadata additively.
11. Never accept client-authored gameplay definitions.

## Tests

- Valid Demo pack
- Duplicate/missing/unknown references fail
- Unknown behavior/stat fails
- Invalid numeric value fails
- Deterministic hash
- Frozen definitions
- No shared mutable runtime state
- Legacy adapter values equal current config

## Forbidden

Do not extract major gameplay systems, redesign input, add runtime modifiers, complete client asset migration, or remove current config callers wholesale.

## Gate/report

Run all gates. Report content files, schemas, registries, hash, adapters, metadata, tests, regressions, and Phase 2 prerequisites.
