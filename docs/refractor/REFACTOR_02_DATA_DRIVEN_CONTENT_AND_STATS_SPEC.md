# Recoil Crew DS — Data-Driven Content and Runtime Stats Specification

## 1. Expansion contract

After the refactor:

```text
New ordinary weapon:
JSON + assets

New enemy using existing behaviors:
JSON + assets

New item/effect:
JSON

New difficulty:
JSON

New mode using existing systems:
JSON

Novel algorithm:
small TypeScript behavior + registry entry + JSON
```

## 2. Content layout

```text
content/
├── manifest.json
├── modes/
├── objectives/
├── tanks/
├── loadouts/
├── weapons/
├── projectiles/
├── enemies/
├── items/
├── status-effects/
├── drop-tables/
├── spawn-directors/
├── scoring/
├── results/
├── difficulties/
└── presentation/
```

Use ordinary JSON. Do not add executable JSON scripting.

## 3. Content pack

The manifest identifies the pack, schema version, entry mode, and content files.

The loader must:

- Validate schemas
- Resolve references
- Detect duplicate IDs
- Detect unknown behaviors and stat IDs
- Freeze definitions
- Calculate a deterministic content hash
- Produce an immutable `ContentPack`
- Fail with file path and JSON path on errors

Use Zod or a consistently applied equivalent.

## 4. Registries

```text
GameModeRegistry
ObjectiveRegistry
TankRegistry
LoadoutRegistry
WeaponRegistry
ProjectileRegistry
EnemyRegistry
ItemRegistry
StatusEffectRegistry
SpawnDirectorRegistry
ScoringRegistry
ResultRulesRegistry
BehaviorRegistry
AssetRegistry
```

Definition registries store data. Behavior registries store TypeScript factories.

## 5. Example tank definition

```json
{
  "id": "tank.default",
  "presentationId": "presentation.tank.default",
  "baseStats": {
    "tank.maxIntegrity": 100,
    "tank.forwardSpeed": 18,
    "tank.reverseSpeed": 8,
    "tank.acceleration": 22,
    "tank.steeringRate": 2.4,
    "tank.lateralGrip": 7.5,
    "tank.boostMultiplier": 1.4,
    "tank.braceGripMultiplier": 2.2,
    "tank.recoilResistance": 1
  },
  "defaultLoadoutId": "loadout.demo"
}
```

## 6. Generic loadout slots

Replace weapon-specific input names with semantic slots:

```text
primary
secondary
ability
```

Demo mapping:

```json
{
  "id": "loadout.demo",
  "slots": {
    "primary": "weapon.machineGun",
    "secondary": "weapon.mainCannon",
    "ability": "weapon.jackpotShell"
  }
}
```

Use an additive compatibility adapter while `mg`, `cannon`, and `charge` remain.

## 7. Weapon definition

```json
{
  "id": "weapon.mainCannon",
  "behaviorId": "weapon.projectile",
  "fireMode": "semi",
  "cooldownSeconds": 1.6,
  "statBlock": {
    "weapon.damage": 65,
    "weapon.recoilImpulse": 14,
    "weapon.splashRadius": 4.5,
    "weapon.projectileSpeed": 42
  },
  "projectileId": "projectile.cannonShell",
  "presentation": {
    "muzzleVfxId": "vfx.cannonMuzzle",
    "fireAudioId": "audio.cannon",
    "cameraImpulseId": "cameraImpulse.cannon"
  }
}
```

Reusable behaviors may include hitscan, projectile, charge projectile, beam, and deployable.

## 8. Enemy definition

```json
{
  "id": "enemy.rammer",
  "presentationId": "presentation.enemy.rammer",
  "baseStats": {
    "enemy.health": 120,
    "enemy.moveSpeed": 10,
    "enemy.contactDamage": 25
  },
  "behaviors": [
    { "id": "movement.seekTank", "parameters": {} },
    {
      "id": "attack.telegraphedCharge",
      "parameters": {
        "telegraphSeconds": 1.2,
        "chargeSpeed": 22,
        "recoverySeconds": 1.5
      }
    },
    {
      "id": "defense.armoredFront",
      "parameters": { "damageMultiplier": 0.35 }
    }
  ],
  "dropTableId": "drops.rammer",
  "scoreValue": 300
}
```

Do not create a general state-machine language in JSON.

## 9. Items and effects

```json
{
  "id": "effect.overdrive",
  "durationSeconds": 12,
  "stacking": "refresh",
  "modifiers": [
    {
      "stat": "tank.forwardSpeed",
      "operation": "multiply",
      "value": 1.25
    },
    {
      "stat": "weapon.cooldownRate",
      "operation": "multiply",
      "value": 1.2
    }
  ],
  "presentationId": "presentation.effect.overdrive"
}
```

Support instant effects, timed effects, expiration, and deterministic stacking.

## 10. Modes and objectives

A mode definition chooses systems, objective IDs, spawn director, scoring, result rules, tank, and loadout.

Reusable objective behaviors may include:

```text
objective.scoreUntilTimer
objective.surviveDuration
objective.destroyTargets
objective.protectEntity
objective.escortEntity
objective.captureZones
objective.extractResources
```

Complex algorithms use a registered TypeScript behavior.

## 11. Spawn directors

Move private spawn arrays/timings out of `Match` into validated definitions. Support timeline entries, budgets, groups, and mode parameters. Demo-specific assistance remains Demo content/runtime behavior.

## 12. Runtime stats

Resolution order:

```text
base definition
→ content defaults
→ mode
→ difficulty
→ equipment
→ permanent upgrades
→ temporary effects
→ conditional effects
→ final value
```

Modifier contract:

```ts
type StatOperation = "add" | "multiply" | "override";
type StackingRule = "stack" | "refresh" | "replace" | "highest" | "lowest";
```

Each modifier has ID, stat ID, operation, value, source, priority, stacking, and optional duration/tags.

Recommended evaluation:

```text
base
+ additive
× multiplicative
→ highest-priority override
→ clamps
```

Use dirty caching rather than recalculating unchanged stats every frame.

## 13. Rules revisions and prediction

Snapshots/reliable events expose:

```text
contentPackId
contentPackVersion
contentHash
modeId
rulesRevision
movementRulesRevision
```

When movement stats change, replicate a compact resolved movement block. Driver prediction applies the correct revision before subsequent input simulation.

## 14. Assets and presentation

Presentation definitions may include model asset IDs, transform, scale, rotation, sockets, materials, audio IDs, VFX IDs, icons, and theme references.

Visual assets may use generated fallbacks. Invalid authoritative gameplay data may not silently fall back.
