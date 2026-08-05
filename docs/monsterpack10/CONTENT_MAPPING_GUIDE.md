# Monster Pack 10 — Content Mapping Guide

## Semantic IDs

```text
custom.enemy.quaternius.<slugCamel>.hero|commonNear|commonFar|aggregate
enemyAnimation.quaternius.<slug>.hero|common
enemyPresentation.quaternius.<slug>.hero|common
```

Examples:

```text
mushnub        → custom.enemy.quaternius.mushnub.hero
dragon-evolved → custom.enemy.quaternius.dragonEvolved.hero
orc-enemy      → custom.enemy.quaternius.orcEnemy.commonNear
```

The slug→camel conversion is deterministic (`green-blob` → `greenBlob`) and
unique across the pack; `generated/NATIVE_CONTENT_INDEX.json` is the
authoritative bridge from `monster.quaternius.<slug>` to every native id.

## Animation profiles

Source `animation_profiles.json` semantic maps are converted 1:1 to native
roles (`idle`, `walk`, `run`, `hoverMove`, `fastHover`, `attackPrimary`,
`attackSecondary`, `hit`, `stagger`, `spawn`, `entrance`, `death`,
`recovery`, `land`). `rootMotion` is always `false`. Common profiles only
map clips present in the common-near GLB; stripped roles use semantic
fallbacks (`run→walk`, `attackSecondary→attackPrimary`, `hit→idle`, …).

## Presentation profiles

Hero profiles use the hero GLB, hero LOD/shadow policies, and the hero
animation profile. Common profiles wire:

```text
nearModelAssetId      → common-near GLB (skinned, animated)
farModelAssetId       → common-far GLB (rigid)
aggregateModelAssetId → aggregate GLB (rigid, sector proxy)
```

Transform: `scale = 1`, `position.y = hoverOffset` for flying models.

## Scale and sockets

- `generated/SCALE_MAPPING.json` records presentation transforms and
  recommended collision only (gameplay definitions are not auto-modified).
- `generated/SOCKET_MAPPING.json` records the standalone socket profile.
  Native `socketBindings` are applied only when the node exists in the GLB.

## Fallbacks

Asset failure falls back by role class:

```text
fodder/swarm/ground → enemy.scrapBug
charger/bruiser     → enemy.rammer
ranged/static       → enemy.gunTower
large/special/boss  → enemy.witch
```
