# Progression08 — Hardening Code Audit

Branch: `main` @ `b9c3c7e` (baseline) → hardening commits on `main`.

## Audit scope

Read and audited:

```text
src/shared/progression/*            (system, types, chests, team XP, relic
                                     inventory, stat projector, effect
                                     registry, selection controller, RNG,
                                     telemetry, level curve, offer generator,
                                     effect applier)
src/shared/pickups/xpShardSystem.ts
src/shared/rules/matchRules.ts
src/shared/sim/matchRuntime.ts
src/shared/sim/systems/systemContext.ts
src/shared/combat/tankContactCombat.ts
src/shared/net/protocol.ts
src/server/room.ts
src/client/progression/progressionOverlay.ts
src/client/app/gameClient.ts
src/client/main.ts
content/modes, content/relics, content/relic-effect-templates,
content/first-treasure-rules, content/treasure-rarity-tables
tests/progression08, e2e/progression-*.spec.ts
```

## Confirmed issues

### 1. First-chest rarity rolled after the chest is consumed

`ProgressionSystem.openChest` called `TreasureChestSystem.open` (which
increments `treasureChestsOpened`) before `rollRarity`. The roll then saw
`treasureChestsOpened === 1` and used the normal table for the first chest.
Reproduced by `tests/progression08/firstChestIntegration.test.ts` (first
opens returned `common`, e.g. `relic.covering_fire`).

### 2. Progression subscriptions keyed off content presence, not the mode flag

The `ProgressionSystem` constructor subscribed to `entity.killed` /
`damage.applied` / `waveEvent` when `rules.progressionContent !== null`.
Demo (`mode.demoScoreAttack`, `progression: false`) therefore received kill
callbacks and spawned XP shards/chests. `noteMissedShard` also mutated
telemetry unconditionally. Reproduced by
`tests/progression08/progressionDisabledMode.test.ts` (kill produced 1
shard; `spawnChest` added an active chest; `noteMissedShard` mutated
`xpMissed`).

### 3. Relic toast appended to a hidden overlay root

`ProgressionOverlay` hid its single root whenever no upgrade selection was
active and appended the relic toast inside that root, making relic results
invisible. The overlay also rebuilt card DOM whenever the render key changed
and did not update the timeout text live (time was not part of the key).
Reproduced by `tests/progression08/progressionOverlay.test.ts`.

### 4. Elite/leader/boss XP bypassed the level-up start path

`onEntityKilled` called `TeamExperienceSystem.addXp` directly for leaders
and bosses and ignored the returned level-ups, so a threshold crossed by
leader/boss XP never started an upgrade selection. Reproduced by
`tests/progression08/xpGrantRouting.test.ts` (`matchFlow` stayed `playing`).

### 5. Chest acquisition bypassed the designed relic reveal flow

`openChest` applied the relic immediately and never set
`MatchFlowState.relicSelection` / `ProgressionSelectionState.kind ===
'relic'`. There was no reveal deadline, no idempotent skip, and no reconnect
restore path. Reproduced by `tests/progression08/relicSelectionFlow.test.ts`.

### 6. No match-scoped acquisition sequence

`RelicRollResult` had no `acquisitionSequence`; presentation keyed only on
`relicId + duplicateConverted`, so repeated acquisitions of the same
stackable relic produced the same key. Reproduced by
`tests/progression08/progressionOverlay.test.ts` (second acquisition would
not re-render before the fix) and asserted authoritatively in
`tests/progression08/firstChestIntegration.test.ts`.

### 7. Relic tuning constants hardcoded in handlers

`cannonKillHeal` and `waveClearHeal` ignored content parameters and used
local `{ amountPerStack: 5 }` / `{ amountPerStack: 15 }` objects; `revive`
hardcoded shockwave damage `25`; `roadkillParams` and
`twinShellCooldownMultiplier` had relic-specific fallback defaults. No
schema required effect parameters, so missing values silently fell back.
Reproduced by `tests/progression08/relicParameterization.test.ts`
(altered fixture parameters had no effect on heal/revive values; missing
parameters did not fail validation).

### 8. Flow serialization gaps

There was no central `advanceProgressionFlow()`: level-up resolution called
`tryStartLevelUp` directly and a stale selection could theoretically
overwrite terminal state; chests could be opened while another flow was
active; terminal state had no explicit cancel path for pending reveals.
Reproduced by `tests/progression08/progressionFlowQueue.test.ts`.

## Already-correct areas (regression coverage added)

- `TreasureChestSystem.rollRarity` itself implemented the E70/L30 rule
  correctly when given the right first/later state; the bug was the caller
  ordering.
- GROUND POUND, cannon kill explosion, cooldown reductions, MG buffs, and
  enemy debuffs already read content parameters.
- ROADKILL already read most coefficients from content; the fallback
  defaults were removed and a fixture test with altered values was added.
- `MatchRuntime.step` already paused during `relicSelection`, and the
  wall-clock timeout plumbing already existed for upgrades.

## Non-goals honored

- No Charge Shot file or behavior changed: `cannon.charge` capability,
  input, timing, scaling, and HUD are untouched. The only Combat 05 file
  touched is a generic regression test asserting the shared protocol
  constant (`tests/combat05/instantTurret.test.ts`, 6 → 7).
- No Combat 05 gameplay code changed: normal contact remains zero, Dash
  contact remains the only default contact attack, ROADKILL remains
  relic-gated, no fall damage, no Jackpot.
- No Coreloop 06, Horde, Animation 07, or presentation source changed.
