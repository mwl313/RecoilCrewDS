# Adding a Game Mode

A mode is JSON that selects existing systems. No TypeScript is required
for modes using existing objectives/systems.

1. Create an objective (or reuse one): `content/objectives/<id>.json`.
2. Create `content/modes/<id>.json`:

```json
{
  "id": "mode.myMode",
  "label": "My Mode",
  "difficulty": "difficulty.standard",
  "tank": "tank.default",
  "loadout": "loadout.default",
  "objectives": ["objective.myObjective"],
  "spawnDirector": "spawn.director.demoScoreAttack",
  "scoring": "scoring.demoScoreAttack",
  "results": "results.demoScoreAttack",
  "presentation": "presentation.demoScoreAttack"
}
```

3. Register in the manifest, validate, and select with
   `MatchRuntime.fromContentPack(pack, id, modifier, 'mode.myMode')`.

`MatchRuntime` contains no mode-id branches; completion rules are driven by
the objective definition (e.g. `completionOnTruckEscape`).
