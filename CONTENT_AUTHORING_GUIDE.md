# Content Authoring Guide

All gameplay content lives in `content/` as ordinary JSON. The server
validates it with Zod at startup and fails loudly on invalid packs.

## Workflow

1. Add or edit JSON under the matching category folder.
2. Add the file path to `content/manifest.json` under `pack.files`.
3. Run `npm test` (content validation + parity) and the four gates.
4. `npm run server` logs the new pack hash.

## Rules

- IDs are semantic and dot-namespaced (`weapon.mainCannon`,
  `enemy.rammer`, `mode.demoScoreAttack`).
- Numeric constraints are enforced by schemas (positive/finite/int/
  probability ranges).
- References (`dropTableId`, `projectileId`, behavior ids, stat ids) are
  cross-validated with file + JSON-path errors.
- Definitions are frozen at load; never mutate them at runtime.
- Behaviors are TypeScript primitives registered in a registry; JSON
  selects them and supplies parameters. No executable JSON scripting.
- Client presentation ids must be known semantic asset ids.

## Category cheat sheet

| Folder | Contents |
| --- | --- |
| `modes/` | mode selection: objective, loadout, spawn director, scoring, results |
| `objectives/` | objective kind, duration, optional completion rule |
| `tanks/` | tank movement/integrity stats |
| `loadouts/` | primary/secondary/ability weapon ids + turret |
| `weapons/` | behaviorId, fireMode, cooldown, statBlock, projectileId, presentation |
| `projectiles/` | shell motion properties |
| `enemies/` | composed behavior list, hp/radius/score, dropTableId |
| `drop-tables/` | deterministic drops (fixed offsets or scatter) |
| `pickups/` | scrap life/magnet |
| `items/`, `status-effects/` | stat modifiers (add/multiply/override, stacking, duration) |
| `spawn-directors/` | pacing, schedules, truck timing, final chaos |
| `scoring/`, `results/` | score/combo/JACKPOT rules, grades/titles |
| `difficulties/` | match.* stat overrides |
| `presentation/` | models, VFX, audio, themes, icons, camera impulses |
