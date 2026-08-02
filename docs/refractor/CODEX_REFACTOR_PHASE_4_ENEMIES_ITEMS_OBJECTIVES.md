# Codex Prompt — Refactor Phase 4
## Modular Enemies, Behavior Composition, Items, Effects, Drops, Spawning, and Objectives

Prerequisite: Phase 3 complete; Damage and Weapon systems modular.

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

Make enemies, schedules, drops, items, effects, and objective mechanics expandable through validated data and registered behavior primitives.

## Required work

1. Implement:
   - `EnemyDefinition`
   - `EnemyRuntimeState`
   - `EnemyRegistry`
   - `EnemySystem`
   - `EnemyBehaviorRegistry`
2. Migrate Scrap Bug, Rammer, Gun Tower, and Loot Truck.
3. Extract reusable behaviors such as:
   - `movement.seekTank`
   - `movement.followRoute`
   - `movement.circleTarget`
   - `attack.telegraphedCharge`
   - `attack.projectileBurst`
   - `defense.armoredFront`
   - `trait.nonAttackingObjective`
   - `trait.vulnerableRear`
4. Avoid a growing ordinary enemy-type switch. Unique registered modules are allowed.
5. Implement:
   - `DropTableDefinition`
   - `DropTableResolver`
   - `PickupDefinition`
   - `PickupSystem`
6. Migrate normal, heavy, and JACKPOT scrap.
7. Implement:
   - `ItemDefinition`
   - `ItemSystem`
   - `StatusEffectDefinition`
   - `StatusEffectSystem`
   - `TriggeredEffectRegistry`
8. Support instant effects, timed modifiers, expiration, stacking, and semantic presentation IDs.
9. Implement `SpawnDirectorDefinition` and runtime. Move private spawn arrays, budgets, Loot Truck timing, assistance, and final-chaos parameters out of `Match`.
10. Ensure objectives can react to typed events such as kills, collections, zone entry, delivery, protection, and timer elapsed.
11. Remove migrated per-enemy AI branches, pickup formulas, and private schedules from `MatchRuntime`.

## Tests

- Current enemy behavior parity
- Deterministic behavior order
- Deterministic drop tables
- Pickup once
- Effect expiration/stacking
- Spawn timeline/Loot Truck/assistance parity
- Test enemy composed from existing behaviors without EnemySystem edits
- Test item modifying a stat through JSON

## Forbidden

No large content expansion, arena redesign, client split, or arbitrary JSON scripts.

## Gate/report

Run all gates. Report enemy definitions/behaviors, items/effects, spawn migration, objective events, remaining Match responsibilities, parity, and Phase 5 prerequisites.
