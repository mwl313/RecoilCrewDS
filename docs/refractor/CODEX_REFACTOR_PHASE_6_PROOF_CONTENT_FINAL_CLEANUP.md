# Codex Prompt — Refactor Phase 6
## Extensibility Proof, Legacy Removal, Documentation, and Final Acceptance

Prerequisite: Phases 0–5 complete; Demo fully migrated; asset pipeline operational.

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

Prove real extensibility, remove temporary compatibility paths, and finish authoring documentation. This is not a full-content expansion.

## Required proof content

### Alternate mode

Add one small JSON-led mode using existing systems but a different objective/completion rule. It must require no `if (modeId === ...)` branch in `MatchRuntime`.

### Proof weapon

Add one ordinary weapon using an existing behavior, loadout assignment, and presentation IDs. It should require little or no new TypeScript and no `MatchRuntime` edit.

### Proof enemy

Add one enemy composed from existing behaviors, with JSON definition, spawn entry, drop table, and no EnemySystem type branch.

### Proof item/effect

Add one item applying a runtime stat modifier. Prefer a non-movement stat unless movement-revision flow is already robust. Retain automated movement-stat synchronization coverage.

## Legacy cleanup

Remove fully migrated adapters only:

```text
LegacyConfigAdapter
LegacyContentAdapter
LegacyWeaponInputAdapter
LegacyMatchStateAdapter
LegacyAssetResolver
```

Remove dead spawn arrays, Demo weapon branches, enemy switches, duplicate values, old asset paths, and obsolete universal types. Document intentional engine defaults.

## Final architecture review

Verify thin `MatchRuntime` and `GameClient`, immutable content, match-scoped stats, selectable modes, modular weapons, composed enemies, functional items/effects, swappable assets, server authority, and prediction synchronization.

## Documentation

Create:

```text
ARCHITECTURE.md
CONTENT_AUTHORING_GUIDE.md
ADDING_A_GAME_MODE.md
ADDING_A_WEAPON.md
ADDING_AN_ENEMY.md
ADDING_AN_ITEM_OR_EFFECT.md
NETWORK_RULES.md
```

Update README, ASSET_GUIDE, DECISIONS, BUILD_STATUS, REFACTOR_STATUS, and SMOKE_TEST.

## Final tests

Run all gates plus manual/automated validation for Demo online, Demo Practice, alternate mode, proof weapon, proof enemy, proof item, two rooms with different rules, invalid content failure, and custom asset replacement.

## Completion report

Return final architecture/tree, Demo parity, proof content, legacy removal, remaining hardcoding, authoring workflows, networking/revision flow, all automated/manual results, limitations, and recommended next content milestone.
