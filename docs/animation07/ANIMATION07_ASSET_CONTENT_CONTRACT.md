# Animation07 — Asset and Content Contract

## Loaded model asset

```ts
interface LoadedModelAsset {
  id: string;
  scene: THREE.Object3D;          // immutable cached prototype
  animations: readonly THREE.AnimationClip[]; // shared immutable clip data
  hasSkinnedMesh: boolean;
}

interface LoadedModelInstance {
  root: THREE.Object3D;           // safe per-instance clone
  source: LoadedModelAsset;
  skinned: boolean;
}
```

Rules:

- `AssetService.model(id)` keeps returning `THREE.Object3D` for existing
  callers.
- `AssetService.modelAsset(id)` and `AssetService.createModelInstance(id)`
  are additive APIs.
- Rigid instances use `scene.clone(true)`; skinned instances use
  `SkeletonUtils.clone(scene)`.
- Cached prototype scenes are never mutated by instances.
- Materials: animated enemy instances clone the minimal material set so hit
  flash is per-instance; shared cached prototype materials are never
  disposed by instances.

## Presentation profile

```ts
interface EnemyPresentationProfileDefinition {
  id: string;                    // enemyPresentation.*
  label: string;
  nearModelAssetId: string;      // resolvable built-in or project asset
  farModelAssetId?: string;      // rigid far variant
  aggregateModelAssetId?: string;
  animationProfileId?: string;   // enemyAnimation.*
  lodPolicyId: string;           // animationLod.*
  shadowPolicyId: string;        // animationShadow.*
  transform?: { scale?, position?, rotation? };
  socketBindings?: Record<string, string>;
  materialPolicy?: { cloneForHitFlash: boolean; allowSharedMaterials: boolean };
  tags?: string[];
}
```

## Animation profile

Semantic roles (shared vocabulary, not family-specific):

```text
idle walk run attackPrimary attackSecondary attackSpecial castStart castLoop
castRelease hit stagger knockback land spawn entrance death phaseTransition
recovery
```

Every role is optional. Profiles define a fallback chain. `rootMotion: false`
is required. Locomotion uses authoritative speed + reference speeds.

## LOD and shadow policies

`AnimationLodPolicyDefinition` uses enter/leave hysteresis distances,
update rates, mixer caps, and priority weights. `AnimationShadowPolicyDefinition`
is content-driven per tier.

## Enemy definition

`presentationProfileId?: string` is additive on `EnemyDefinition`. Resolution:

1. explicit `presentationProfileId`,
2. legacy rigid profile synthesized from `presentationId`,
3. registered procedural fallback + one diagnostic warning.

## Horde wire contract

- Materialize records gain a presentation profile index (0 = legacy/type
  default) so new families resolve profiles on clients without full enemy
  JSON.
- No bone transforms, mixer time, or clip names are ever serialized.
- Optional `EnemyActionCue` is compact and sequenced; it never applies damage.

## Placeholder policy

Project model ids (`custom.enemy.witch.common.skinned` etc.) are registered
in the asset catalog without files; each has a valid built-in procedural
fallback. Missing final GLBs never break startup.
