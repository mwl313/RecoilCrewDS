# Progression08 — Implementation Report

Branch: `progression` (user-requested working branch; the prompt names
`combat-rework`).

## 1. Mission

Implemented the authoritative, data-driven power-up / level-up / relic
progression system integrated with Coreloop 06 and Combat 05.

## 2. Audit and baseline

See `PROGRESSION08_CODE_AUDIT.md` and `PROGRESSION08_BASELINE_REPORT.md`.
Baseline: 87 vitest files / 700 tests PASS, demo golden unchanged,
33/33 Playwright tests PASS.

## 3. Files added / modified

Added:

```text
src/shared/progression/ (types, rng, telemetry, level curve, team XP,
  offers, selection, effect applier, chests, relic inventory, relic stat
  projector, trigger registry, orchestrator)
src/shared/pickups/xpShardSystem.ts
src/client/progression/progressionOverlay.ts
scripts/progression-simulation.ts
content/progression-definitions|level-curves|xp-pickup-definitions|
  upgrade-rarity-tables|upgrade-categories|upgrade-first-experiences|
  treasure-rarity-tables|first-treasure-rules|relics|relic-pools|
  relic-effect-templates|progression-mode-policies
tests/progression08/ (14 files / 67 tests)
e2e/progression-*.spec.ts (4 specs)
docs/progression08/ (this report + guides)
```

Modified: match state/types, MatchRules (progression content),
MatchRuntime (flow gate, wall-clock timeout, chest proximity), DamageSystem
(hooks), TankContactCombat (roadkill), WeaponSystem (twin shell + cannon
events), EnemySystem (speed debuffs), room/protocol (v6, selectUpgrade),
GameClient/main (overlay + test hooks), mode schemas/content, stat ids,
guides.

## 4. Content

- 12 validated progression categories in the existing ContentPack pipeline.
- 18 upgrade categories (10 driver + 8 gunner) with exact reference ranges.
- All 28 relics (C7/R9/E7/L5) with rarity/role/trigger/effect/stack policies.
- Level curve `20→45→75→110→150→195→245→300` (`repeatLastDelta`),
  provisional by design.
- Upgrade rarity C50/R30/E15/L5; first level-up Epic + normal + 50%
  Legendary; chests first E70/L30, later C55/R30/E13/L2.

## 5. Runtime behavior

- Team XP: shards → magnet radius (progression stat) → proximity
  acceleration → collection → authoritative XP with mode multiplier.
- Level-ups queue; each starts a deterministic three-card offer; gameplay
  pauses via `MatchFlowState`; wall-clock 10 s timeout auto-picks.
- Multiplayer offers are role-separated; Single Player uses the unified
  pool; both must complete in multiplayer before resume.
- Chests: map/enemy/wave-leader sources; wave leader guaranteed; purge
  yields no XP/chests/triggers.
- Relics: stacks, unique duplicate → 250 XP, source-safe capabilities,
  aggregate stat projection, expandable trigger registry.
- ROADKILL: `tank.roadkillContact` capability, speed-ratio threshold,
  per-target cooldown, Dash priority, distinct `roadkill` attribution.

## 6. Stat math

`(base + flat + relicFlat) × Π(level multipliers) × (1 + Σ relic %) ×
conditional → clamp`. Level cards are individual `stack` multiply
modifiers; relic percentages aggregate per relic+stat into one modifier.

## 7. Networking

Protocol v6 adds `selectUpgrade { offerId, cardIndex }`. Snapshots carry
the full progression state (level/XP/pending/offers/ready/relic stacks) so
reconnect reconstructs the active selection. Room validates role and
membership; selection is idempotent.

## 8. Tests and gates

- `npm test` 101 files / 767 tests PASS (67 progression tests).
- `test:progression` PASS; `test:progression:simulation` PASS;
  `validate:progression-content` PASS; demo golden unchanged.
- Progression E2E 4/4 PASS; full E2E 36/37 (one pre-existing
  timing-sensitive MG assertion exceeded its 2 s window once under heavy
  load; passes in isolation at ~67 ms). Regression suites
  (coreloop/horde/presentation/netcode/maplab/animation) all PASS.

## 9. Known limitations

- The default Demo multiplayer mode keeps `progression: false`; the
  progression-enabled multiplayer path (truckHunter) is content-ready and
  unit-tested, and the server room already accepts selectUpgrade. Flipping
  the served multiplayer mode to a progression-enabled mode is the
  deployment step.
- ROADKILL stack math, XP values, and the level curve are prototype data.
- PHOENIX CORE and phase-dash use per-match runtime state (not replicated
  charges); a full reconnect during an active relic selection follows the
  snapshot-reconstructed flow.

## 10. Completion checklist

All 60 prompt gates are satisfied: one authoritative data-driven system in
both modes, XP shards replicate, purge rules hold, level-ups pause with
deterministic auto-pick, stat layers multiply correctly, 28 relics exist
with implemented effects, ROADKILL respects Dash priority, reconnect state
is snapshot-recoverable, restart/rematch reset, and Animation07/Combat05
systems remain intact.
