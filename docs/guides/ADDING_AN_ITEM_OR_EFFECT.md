# Adding an Item or Effect

Items/effects apply stat modifiers through the match resolver:

```json
{
  "id": "item.myBoost",
  "kind": "boost",
  "modifiers": [
    {
      "stat": "weapon.cannonDamage",
      "operation": "multiply",
      "value": 1.5,
      "stacking": "replace",
      "priority": 70
    }
  ]
}
```

Operations: `add`, `multiply`, `override`. Stacking: `stack`, `refresh`,
`replace`, `highest`, `lowest`. Add `durationSeconds` for timed effects
(expiration is deterministic). Non-movement stats avoid client prediction
churn; movement-stat changes advance `movementRulesRevision` and replicate
the compact movement block automatically.

Apply via `ItemSystem.apply`/`StatusEffectSystem.apply`; triggers can be
wired through `TriggeredEffectRegistry`.
