# Core Loop 06 — Authoring Guide

All horde gameplay is content-driven. Add or change monsters, packs, waves, stages, anchors, LOD, and replication through validated JSON — no code changes required for ordinary content.

## Content locations

- `content/horde/director.json` — one `horde.mainStage` director wiring stage, phases, waves, boss, packs, limits, and policies.
- `content/horde/stageSequence.json` — farming countdown + wave triggers.
- `content/horde/farmingPhase{1,2,3}.json` — entity/threat targets and spawn income ramps.
- `content/horde/waves.json` → split files `wave1.json`/`wave2.json` — leader, opening/reinforcement packs, budgets.
- `content/horde/bossWave.json` — boss wave (same controller; `completion: clearStage`).
- `content/horde/spawnPack*.json` — pack entries, formation, spacing/radius, threat/entity cost, anchor requirements, cooldown.
- `content/horde/populationLimits.json` — hard/soft caps, reserves, aggregate visual cap, stored budget.
- `content/horde/policy*.json` — anchor, navigation (flow field), LOD tiers/frequencies, replication rates.
- `content/horde/rewardTableMain.json` — ordinary/leader reward values and drop tables.
- `content/enemies/*.json` — enemy definitions with `threat`; `enemy.scrapBugHorde` is the flow-field fodder variant.

## Schemas and validation

Every definition is validated by Zod in `src/shared/content/schemas/horde.ts` and cross-referenced by `ReferenceValidator`. IDs must be dot-namespaced with letter-leading segments. Run:

```bash
npm run generate:content-pack
npm test
```

## Adding a monster

1. Add `content/enemies/<name>.json` (schema per `enemySchema`; include `threat`).
2. Reference it from packs/waves or register a behavior id in `behaviorRegistry.ts` + `enemyBehaviors.ts` only when a new primitive is needed.
3. Add the file to `content/manifest.json`.
4. Regenerate and test.

## Adding a wave

1. Create `content/horde/waveN.json` with `id: wave.<name>`.
2. Reference it from `director.json` `waveIds` and `stageSequence.json` trigger.
3. Budgets must fit `populationLimits.json` caps; leader/elite enemies should use `enemy.rammer`-class specials.

## Anchors and terrain awareness

Anchors are derived at runtime from generated arena layout (gates, zones, cliff edges, corridors). Pack `anchorRequirements` (`minimumTankDistance`, `maximumTankDistance`, `regionTags`, `terrainTags`) filter candidates; the planner rejects safe zones, visible-near-field positions, unreachable cliff-blocked lines, over-capacity, and recently used anchors. Same seed + state ⇒ same plan.

## LOD and replication policies

- `enemyLodPolicy` — hysteresis bands + per-tier Hz. Gameplay outcomes (HP/damage/reward/count) must never change with tier; only update rate/representation may.
- `hordeReplicationPolicy` — near/mid/far/sector Hz. Far records are change-driven; critical events always send immediately.

## Manual verification checklist

Run a full loop to boss clear on `map.arena400Primary` and `map.dramaticHighlands`, Wave 1 fast and slow clears, tank death in farming and waves, leader death surrounded by ambient enemies, cohort purge with 100+ wave monsters, dense Charge Shot splash, Dash through a dense pack, Single Player, and two-client Multiplayer at 100/150 ms RTT. Verify identical counts/rules in both modes, no duplicate enemies, no purge rewards, and no Combat 05 regression.
