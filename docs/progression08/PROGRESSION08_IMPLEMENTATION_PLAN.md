# Progression08 — Implementation Plan

Canonical working branch: `progression` (user override; prompt names
`combat-rework`).

## Milestones → commits

| # | Milestone | Primary files | Commit |
|---|-----------|---------------|--------|
| 0 | Audit + baseline | `docs/progression08/PROGRESSION08_*` | `progression08: add audit and baseline` |
| 1 | Schemas | `src/shared/content/schemas/progression.ts`, content pack categories | `progression08: add progression content schemas` |
| 2 | Content | `content/progression/**`, manifest | `progression08: add upgrade and relic content` |
| 3 | Team XP | `src/shared/progression/*` | `progression08: add team XP and queued level ups` |
| 4 | XP shards + magnet | `src/shared/pickups/xpShardSystem.ts` | `progression08: add XP shards and magnet collection` |
| 5 | Reward routing | `rewardEventRouter.ts`, kill/purge hooks | `progression08: add reward event routing` |
| 6 | Offers | `upgradeOfferGenerator.ts` | `progression08: add deterministic upgrade offers` |
| 7 | Selection + pause | `upgradeSelectionController.ts`, flow gate | `progression08: add authoritative upgrade selection` |
| 8 | Level-up stat layer | `upgradeEffectApplier.ts` | `progression08: apply level-up stat modifiers` |
| 9 | Chests | `treasureChestSystem.ts` | `progression08: add treasure chest lifecycle` |
| 10 | Relic inventory + rolls | `relicInventory.ts`, `relicOfferGenerator.ts` | `progression08: add relic rolls and inventory` |
| 11 | Relic stat projection | `relicStatProjector.ts` | `progression08: project relic stat layers` |
| 12 | Trigger registry | `relicEffectRegistry.ts` | `progression08: add relic trigger registry` |
| 13–16 | Relic effects by rarity | effect handlers | `progression08: implement <rarity> relics` |
| 17 | ROADKILL | `roadkillContactRule.ts`, `TankContactCombat` | `progression08: add relic-gated roadkill contact` |
| 18 | Capabilities | progression capabilities | `progression08: add progression capabilities` |
| 19 | Damage/weapon hooks | damage/weapon integration | `progression08: integrate damage and weapons` |
| 20 | Network | `src/shared/net/progression/*`, room, protocol v6 | `progression08: add progression network protocol` |
| 21 | UI | `src/client/progression/*` | `progression08: add progression roulette UI` |
| 22 | Debug/telemetry | `progressionTelemetry.ts`, debug overlay | `progression08: add progression debug and telemetry` |
| 23 | Lifecycle | reset/rematch/reconnect | `progression08: harden progression lifecycle` |
| 24 | Tests + reports | `tests/progression08/*`, docs | `progression08: finalize tests and reports` |

## Key contracts (from the prompt/design)

- XP: ambient 1, wave 2, elite 40, boss 150 (provisional); level curve
  20→45→75→110→150→195→245→300, `repeatLastDelta` overflow.
- Level-up: 3 cards; first level-up = Epic + normal + (50% Legendary);
  later = C50/R30/E15/L5 independent.
- Chests: first E70/L30; later C55/R30/E13/L2; wave leader guaranteed;
  purge none.
- Relics: 28, stacks additive per relic, unique duplicates → +250 XP.
- ROADKILL: capability `tank.roadkillContact`; Dash priority; per-target
  cooldown; distinct `roadkill` attribution; coefficient +25%/stack.
- Stat layers: level cards multiply-stack; relic % aggregate additive;
  relic flat before multipliers; layers multiply; clamp last.
- Selection pause: `MatchFlowState` gate; wall-clock 10 s timeout;
  deterministic auto-pick; both roles required in multiplayer.
