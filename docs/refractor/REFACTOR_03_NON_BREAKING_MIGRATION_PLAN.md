# Recoil Crew DS — Non-Breaking Migration Plan

## 1. Strategy

Use a strangler refactor:

```text
working path
→ interface around it
→ move unchanged behavior
→ parity tests
→ switch callers
→ remove old path
```

Do not replace `Match` or `Game` in one operation.

## 2. Baseline

Before architecture changes:

- Record current commands/results.
- Add deterministic Demo fixtures.
- Add canonical state normalization.
- Confirm online/Practice rule parity.
- Inventory hardcoding and dependencies.
- Create a baseline commit/tag such as `refactor-baseline`.

## 3. Compatibility adapters

Temporary examples:

```text
LegacyConfigAdapter
LegacyContentAdapter
LegacyWeaponInputAdapter
LegacyMatchStateAdapter
LegacyAssetResolver
```

Every adapter must list its removal phase. Do not create permanent dual sources of truth.

## 4. Phases

### Phase 0 — Audit and golden baseline

No architecture migration. Add audit, status, deterministic fixtures, and characterization tests.

### Phase 1 — Core runtime and content loading

Add content loader, schemas, registries, stable IDs, content hash, events, and system contracts beside current behavior.

### Phase 2 — Rules, stats, mode, objective, round, scoring

Add immutable match rules, runtime stat service, revisions, `DemoScoreAttackMode`, Round/Objective/Score/Combo/JACKPOT/Result systems.

### Phase 3 — Weapons, projectiles, damage

Add generic loadout slots, weapon definitions/runtime, projectile system, damage system, recoil effect, and legacy input adapter.

### Phase 4 — Enemies, items, effects, spawning

Add enemy definitions and composed behaviors, drop tables, items, status effects, spawn director, and objective event primitives.

### Phase 5 — Client and assets

Split `Game`, await asset loading, instantiate custom GLB assets, support transform/socket metadata, route VFX/audio/UI through registries, and separate client coordinators.

### Phase 6 — Proof and cleanup

Add one alternate mode, one ordinary weapon, one composed enemy, and one stat-changing item. Remove migrated adapters and create authoring guides.

## 5. Behavior parity

Require parity in:

- Match phases and duration
- Controls/cameras
- Tank movement within tolerance
- Weapon cooldowns and accepted shots
- Damage
- Enemy timings/counts
- Score, combo, JACKPOT
- Wipeout
- Results
- Rematch
- Practice

Canonical fixtures may remove timestamps, debug fields, unstable ordering, and client-only presentation.

## 6. Extraction order

From `Match`:

```text
Round/results
→ Score/Combo/JACKPOT
→ Spawning
→ Pickups
→ Damage
→ Projectiles
→ Weapons
→ Enemies
→ final MatchRuntime cleanup
```

From `Game`:

```text
Asset readiness
→ Entity view registry
→ Presentation event router
→ Network state presenter
→ Camera manager
→ Prediction controller
→ PIP/quality
→ final GameClient cleanup
```

## 7. Network migration

Make schema changes additive first.

```text
Old:
mg/cannon/charge

Transitional:
old fields + primary/secondary/ability + loadout IDs

Final:
primary/secondary/ability
```

Add content identity and rules revisions before removing legacy fields.

## 8. Configuration safety

Replace shared mutable references such as `cfg = BASE_CONFIG` with immutable match-scoped rules produced from a frozen content pack.

Two rooms must be able to use different rules without contamination.

## 9. Rollback

If a phase fails:

- Do not begin the next.
- Keep the previous passing commit.
- Record the blocker.
- Do not disable tests or remove Demo features.
- Do not replace full-round browser coverage with mocks.

## 10. Phase report

Every phase reports commits, files, architecture, adapters, behavior changes, all test results, limitations, and next prerequisites.
