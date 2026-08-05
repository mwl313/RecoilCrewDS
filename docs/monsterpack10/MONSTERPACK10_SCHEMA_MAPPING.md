# Monster Pack 10 — Schema Mapping

How standalone pack facts map to native Recoil Crew schemas.

## Asset registration

Standalone → `content/assets/project.json` project entry:

```text
source GLB path            → file ("/assets/models/enemies/quaternius/...")
slug-derived semantic id   → id
category (hero/common-*)   → tags ["enemy","quaternius",<slug>,"<tier>",
                                 "skinned"|"rigid"]
role class                 → fallbackAssetId (scrapBug/rammer/gunTower/witch)
optional                   → true (selective preload)
```

Schema fields `sockets` and `lodRefs` exist but are not required; socket
mappings are recorded in generated `SCALE_MAPPING.json`/`SOCKET_MAPPING.json`
and in presentation `socketBindings` where a node exists.

## Animation profiles

Standalone `animation_profiles.json` (per-model exact clip map) →
`content/enemy-animation-profiles/quaternius/*.json`:

```text
semantic role → clip      → clips[role]
missing clip              → fallbacks[role] (semantic fallback only)
root motion               → rootMotion: false (schema literal)
loop/once                 → playback[role].loop
```

Native roles come from `ENEMY_ANIMATION_ROLES`; unknown source roles are
either mapped to the nearest native role in the generated converter or
dropped with a validation record. Every clip name is validated against the
GLB's embedded `AnimationClip` names at import time.

## Presentation profiles

`content/enemy-presentation-profiles/quaternius/*.json`:

```text
hero        → nearModelAssetId = hero asset; animationProfileId = hero
              profile; lodPolicyId = animationLod.hero; shadow = hero
common      → nearModelAssetId = commonNear; farModelAssetId = commonFar;
              aggregateModelAssetId = aggregate; animationProfileId =
              common profile; lodPolicyId = animationLod.defaultHorde;
              shadow = defaultHorde; transform from scale profile
```

## Rendering contracts

```text
hero/common-near  → AssetInstanceFactory.createModelInstance (skinned clone)
common-far        → InstancedMesh per archetype (extended generic host)
aggregate         → far-sector aggregate mesh group keyed by profile
                    (procedural fallback preserved)
```

## Preload

`optional: true` project assets are not eagerly preloaded by
`AssetService.load()`; `enemyArtRoster` definitions list
`preloadAssetIds`; `AssetService.preloadModels(ids)` loads and caches on
demand before spawn.

## Scale/sockets

`scale_profiles.json` → `docs/monsterpack10/generated/SCALE_MAPPING.json` +
presentation `transform`. `socket_profiles.json` → `SOCKET_MAPPING.json` +
`socketBindings` when the node exists in the GLB. Gameplay collision is not
auto-modified.
