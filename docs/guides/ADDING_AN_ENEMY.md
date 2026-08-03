# Adding an Enemy

Compose existing behavior primitives in JSON. No `EnemySystem` edit.

```json
{
  "id": "enemy.myHound",
  "type": "scrapBug",
  "presentationId": "enemy.scrapBug",
  "behaviors": [
    { "id": "movement.seekTank", "parameters": { "speed": 4.5 } },
    { "id": "movement.integrate", "parameters": {} },
    { "id": "attack.contactRam", "parameters": { "damage": 3 } }
  ],
  "hp": 8,
  "radius": 0.8,
  "score": 120,
  "jackpotGain": 4,
  "contributionPoints": 2,
  "dropTableId": "drops.myHound"
}
```

Create a drop table, add a spawn entry in a spawn director's
`initialSpawns` or schedules, and register everything in the manifest.
Behaviors: `movement.seekTank/followRoute/circleTarget/separation/
obstacleAvoid/integrate`, `attack.telegraphedCharge/projectileBurst/
contactRam`, `defense.armoredFront`, `trait.nonAttackingObjective/
vulnerableRear`. Novel AI patterns are registered TypeScript primitives.
