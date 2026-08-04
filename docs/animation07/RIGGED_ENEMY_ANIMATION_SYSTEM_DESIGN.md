# Recoil Crew — Rigged Enemy Model and Animation System Design
## Expandable skeletal-animation support for common enemies, elites, and bosses

**Repository:** `mwl313/RecoilCrewDS`  
**Canonical branch:** `combat-rework`  
**Repository path:** `docs/animation07/RIGGED_ENEMY_ANIMATION_SYSTEM_DESIGN.md`  
**Status:** Foundational implementation design  
**Related systems:** Coreloop 06, Horde spawning, enemy presentation, asset service, network replication

---

# 0. Purpose

Recoil Crew is moving toward a battlefield containing hundreds of common enemies, a small number of elites, and one major boss. The initial enemy families are:

1. Humanoid Witch
2. Spider
3. Four-Legged Beast

The intended production workflow is:

```text
High-detail master model
├── Boss runtime model
├── Elite runtime model
├── Common near-range skinned model
└── Common far-range simplified model
```

The high-detail master is the visual source of truth. It is not necessarily the file placed directly into the game.

Runtime variants preserve silhouette, proportions, colours, major anatomy, and recognizable attacks while reducing triangle count, bone count, materials, texture resolution, and secondary details.

The animation system must provide high quality close to the player without requiring hundreds of distant enemies to run independent full skeletons and animation mixers.

---

# 1. Current repository state

The current client asset pipeline:

- Loads GLB files through `GLTFLoader`
- Caches a model prototype
- Stores only the loaded scene
- Clones one model hierarchy for each enemy
- Does not retain GLB animation clips
- Does not create `AnimationMixer` instances
- Has no enemy animation state controller
- Uses a hardcoded enemy-type-to-model switch in `EntityViewFactory`
- Does not yet have the planned instanced horde renderer

A rigged GLB can therefore display in its default pose, but its animation clips will not currently play.

The horde plan also targets hundreds of enemies, so rigging support must be designed together with presentation LOD and instanced rendering.

---

# 2. Design goals

The system must:

1. Load skinned GLB models and embedded clips.
2. Clone skinned models safely.
3. Play independent animations for nearby enemies.
4. Derive presentation from authoritative gameplay state.
5. Keep animation separate from gameplay logic.
6. Support common, elite, and boss presentation profiles.
7. Support multiple art variants for one gameplay enemy.
8. Reduce animation work with distance.
9. Preserve the future instanced-horde path.
10. Avoid networking per-bone or per-frame animation data.
11. Allow new enemy families without new switch statements.
12. Support content-driven animation mappings and timings.
13. Provide preview, validation, debugging, and profiling tools.
14. Cleanly dispose mixers and model instances.
15. Preserve Single Player and Multiplayer gameplay parity.

---

# 3. Non-goals

This milestone does not require:

- Server-side bone simulation
- Networked bone transforms
- Gameplay collision from animated limbs
- Cloth or hair simulation
- Facial motion capture
- Root-motion-driven gameplay
- Hundreds of fully skinned enemies at full frame rate
- Custom GPU instanced skinning in the first implementation

Gameplay continues to use simple authoritative enemy colliders and behavior state.

---

# 4. Core architectural rule

Animation is presentation.

```text
Server or local authority
→ decides movement, attack, damage, death, knockback, and timing

Client presentation
→ chooses and plays the matching animation
```

Animation never decides whether an attack hits, damage occurs, a monster dies, or a wave clears.

---

# 5. Asset hierarchy

Each family should have a shared source hierarchy:

```text
Enemy family source
├── high-detail sculpt/master
├── shared visual reference
├── shared skeleton convention
├── shared animation source
├── boss runtime mesh
├── elite runtime mesh
├── common skinned runtime mesh
└── common far/instanced runtime mesh
```

Recommended semantic IDs:

```text
enemy.witch.common.skinned
enemy.witch.common.far
enemy.witch.elite
enemy.witch.boss

enemy.spider.common.skinned
enemy.spider.common.far
enemy.spider.elite
enemy.spider.boss

enemy.beast.common.skinned
enemy.beast.common.far
enemy.beast.elite
enemy.beast.boss
```

Gameplay definitions should reference a presentation profile rather than a hardcoded file path.

---

# 6. Runtime asset structure

Replace the model-only result with:

```ts
export interface LoadedModelAsset {
  scene: THREE.Object3D;
  animations: THREE.AnimationClip[];
  hasSkinnedMesh: boolean;
}
```

The model provider caches:

```text
prototype scene
animation clips
skinned-mesh flag
```

Animation clips are shared immutable data. Independently animated scene instances are cloned.

---

# 7. Safe cloning

Rigid models may use:

```ts
prototype.scene.clone(true)
```

Skinned models must use:

```ts
SkeletonUtils.clone(prototype.scene)
```

This gives each enemy independent bones and skeleton bindings while safely sharing reusable geometry and clips.

The loader should detect `SkinnedMesh` automatically.

---

# 8. Enemy presentation profile

Add a content-driven profile:

```ts
export interface EnemyPresentationProfileDefinition {
  id: string;

  nearModelAssetId: string;
  farModelAssetId?: string;
  aggregateModelAssetId?: string;

  animationProfileId?: string;

  scale: number;
  verticalOffset: number;
  yawOffset: number;

  shadowPolicyId: string;
  lodPolicyId: string;

  socketBindings?: Record<string, string>;
}
```

Enemy content should use:

```json
{
  "presentationProfileId": "enemyPresentation.witchCommon"
}
```

The client should stop selecting models from a hardcoded enemy-type switch.

---

# 9. Animation profile

Add a validated profile:

```ts
export interface EnemyAnimationProfileDefinition {
  id: string;

  clips: {
    idle?: string;
    walk?: string;
    run?: string;
    attackPrimary?: string;
    attackSecondary?: string;
    castStart?: string;
    castLoop?: string;
    castRelease?: string;
    hit?: string;
    stagger?: string;
    knockback?: string;
    land?: string;
    spawn?: string;
    death?: string;
    phaseTransition?: string;
  };

  locomotion: {
    walkSpeedReference: number;
    runSpeedReference: number;
    playbackMin: number;
    playbackMax: number;
    randomStartPhase: boolean;
  };

  transitions: {
    defaultCrossFadeSeconds: number;
    attackCrossFadeSeconds: number;
    deathCrossFadeSeconds: number;
  };

  rootMotion: false;

  events?: Record<string, Array<{
    normalizedTime: number;
    event: string;
  }>>;
}
```

The profile maps semantic roles to Blender clip names. Gameplay code never depends on names such as `Action.003`.

---

# 10. EnemyRig expansion

```ts
export interface EnemyRig {
  group: THREE.Group;
  model: THREE.Object3D;

  mixer?: THREE.AnimationMixer;
  actions?: Map<string, THREE.AnimationAction>;

  currentRole?: string;
  currentAction?: THREE.AnimationAction;

  animationUpdateAccumulator: number;
  animationPhaseSeed: number;
  lodTier: number;

  head?: THREE.Object3D;
  materials: THREE.MeshStandardMaterial[];

  telegraph: THREE.Group;
  telegraphMat: THREE.MeshBasicMaterial;

  deadT: number;
}
```

Only skinned or clip-driven rigs require a mixer. Rigid far variants do not.

---

# 11. EnemyAnimationController

Recommended location:

```text
src/client/enemies/enemyAnimationController.ts
```

Responsibilities:

- Resolve presentation and animation profiles
- Build animation actions from clips
- Select semantic animation roles
- Cross-fade actions
- Match locomotion playback to movement speed
- Randomize loop phase
- Play one-shot attack, hit, stagger, and death clips
- Reduce updates by LOD
- Stop and uncache mixers on removal
- Expose debug state

It never mutates gameplay.

---

# 12. Animation-state selection

Initial rules:

```text
not alive
→ death

knockback / airborne impulse
→ knockback

stagger state
→ stagger

attack action active
→ attack or cast

moving above run threshold
→ run

moving above walk threshold
→ walk

otherwise
→ idle
```

The controller can initially infer from:

- `alive`
- `state`
- `stateT`
- `speed`
- `telegraph`
- `flash`
- impulse state

For future enemies with several attacks, use compact authoritative action cues.

---

# 13. Authoritative action cues

Do not replicate bones or clip time. When inference is insufficient, replicate:

```ts
export interface EnemyActionCue {
  enemyId: number;
  sequence: number;

  actionId: string;
  startedAtTick: number;
  durationTicks: number;
}
```

Examples:

```text
attack.meleePrimary
attack.webShot
attack.pounce
attack.castProjectile
attack.areaSpell
boss.phaseTransition
```

Clients map the cue to animation through content. Gameplay still owns the hit.

---

# 14. Attack synchronization

Every attack should expose:

```ts
export interface EnemyAttackPresentationTiming {
  telegraphSeconds: number;
  impactSeconds: number;
  recoverySeconds: number;
}
```

Example:

```text
0.00 s attack begins
0.00–0.45 s wind-up
0.45 s authoritative impact
0.45–0.85 s recovery
```

Animation events may trigger VFX or sound only. Damage uses authoritative timing.

---

# 15. Root-motion policy

All locomotion clips are in place.

```text
Animation
→ moves limbs and body locally

Gameplay
→ moves the enemy root through the world
```

Allowed:

- Local bob
- Body lean
- Recoil
- Attack lunge that returns to origin

Forbidden:

- Permanent forward translation
- Permanent yaw rotation
- Animation-controlled world displacement

---

# 16. Animation LOD

## Tier A — Hero

Used for bosses, active elites, and important specialists.

```text
full skeleton
full clip set
30–60 FPS mixer update
full cross-fades
hit/stagger/attack/death
selected shadows
```

Expected count: `1–10`.

## Tier B — Near common

```text
full common skeleton
idle/walk/run/attack/death
30 FPS animation
limited hit reactions
no expensive secondary motion
```

Initial profiling target: `30–60` skinned common enemies.

## Tier C — Mid common

```text
same or simplified skeleton
10–15 Hz mixer updates
locomotion + attack only
reduced cross-fades
no individual hit clip
no cast shadow
```

## Tier D — Far common

```text
rigid or baked far model
no AnimationMixer
shader wobble, morph frames, or rigid-limb phase
instanced rendering
```

## Tier E — Aggregate horde

```text
billboard or very low-poly crowd
GPU phase animation
no individual skeleton
no individual animation state machine
```

---

# 17. Recommended far-animation methods

## Rigid procedural limbs

Best for spiders, mechanical beasts, and chunky creatures. Parts rotate from a shared animation phase.

## Baked vertex or morph poses

Bake a few locomotion poses and blend or switch them in the renderer.

## Shader deformation

Use simple bob, sway, pulse, or limb-like vertex movement.

## Billboard animation

Use only for distant aggregate enemies.

---

# 18. Animation update scheduling

Suggested schedule:

```text
Hero: every frame
Near common: every frame or 30 Hz
Mid common: 10–15 Hz
Far common: no mixer
Aggregate: shader time only
```

Use stable groups:

```ts
group = enemyId % groupCount;
```

Reduced-rate updates must use actual elapsed time since the previous update.

---

# 19. Random animation phase

Identical enemies should not step together.

```ts
phase = hash(enemyId, matchSeed) % 1;
action.time = phase * clip.duration;
```

Exact cross-client phase agreement is not gameplay-critical.

---

# 20. Materials and hit flash

Common enemies should normally use one material.

The hit-flash system must not permanently mutate a material shared by every clone.

Preferred approaches:

1. Clone the small material set for hero and near rigs.
2. Use shader/uniform hit flash for instanced far models.
3. Restore values after flash.
4. Avoid large unique material collections.

---

# 21. Shadows

Recommended:

```text
Boss: selected cast and receive shadows
Elite: cast shadow near player only
Near common: receive shadow, optional simplified cast
Mid common: no cast shadow
Far/aggregate: no dynamic shadow
```

---

# 22. Cleanup

When removing an animated enemy:

```ts
mixer.stopAllAction();
mixer.uncacheRoot(model);
```

Also:

- Remove the rig from the scene
- Clear action maps
- Release pooled presentation slots
- Remove references
- Ensure wave purge releases every mixer

---

# 23. Asset validation

Validate:

```text
GLB loads
required clips exist
clip names are unique
root motion stays within tolerance
model faces +Z
base is near Y = 0
scale is plausible
bone count within profile limit
maximum four vertex influences
material count within limit
texture dimensions within limit
no cameras or lights
no unsupported compression
```

Warnings should cover missing optional clips, large texture/triangle counts, too many bones/materials, and unexpected root translation.

---

# 24. Enemy preview tool

Extend the presentation preview or create:

```text
tools/enemy-preview/
```

Features:

- Select enemy profile and model variant
- Select and scrub clips
- Change playback speed
- Toggle skeleton
- Display triangles, bones, materials, and texture sizes
- Display root-motion trace
- Preview hit flash
- Preview LOD swaps
- Spawn 1, 10, 25, or 50 animated copies
- Display animation CPU time and draw calls

---

# 25. Networking policy

Do not send:

- Bone matrices
- Mixer time every frame
- Per-bone transforms
- Full animation state every snapshot

Send only gameplay state and compact action cues when necessary. Clients animate independently.

---

# 26. Single Player and Multiplayer

Both modes use identical:

- Gameplay enemy definitions
- Presentation profiles
- Animation profiles
- Attack timings
- LOD thresholds

Only authority and transport differ. Graphics settings may alter presentation but not gameplay.

---

# 27. Quality settings

## High

- Hero full animation
- Higher near-skinned cap
- Mid reduced update
- Selected shadows

## Medium

- Hero full animation
- Lower near-skinned cap
- Earlier far-model swap
- No common cast shadows

## Low

- Hero full animation
- Very small near-skinned population
- Common enemies use rigid far variants earlier
- Simplified aggregate horde

---

# 28. Implementation milestones

## Milestone 1 — Asset data

- Preserve GLB clips
- Add `LoadedModelAsset`
- Detect skinned meshes
- Add safe skeleton cloning
- Add animation mappings and validation

## Milestone 2 — Animation controller

- Add `EnemyAnimationController`
- Extend `EnemyRig`
- Implement idle, locomotion, attack, hit, and death
- Add cross-fades, random phase, and cleanup

## Milestone 3 — Content-driven presentation

- Replace the hardcoded model switch
- Add presentation and animation profiles
- Add witch, spider, and beast family IDs

## Milestone 4 — Authoritative action cues

- Add compact action sequence/timing
- Map gameplay actions to semantic animation roles
- Handle reconnect reconstruction

## Milestone 5 — Animation LOD

- Hero, near, mid, far, and aggregate tiers
- Reduced update groups
- Shadow policy
- Mixer caps and profiling

## Milestone 6 — Far common animation

- Rigid, morph, or shader-based far variant
- Instancing compatibility
- Distance swap without duplication

## Milestone 7 — Preview and performance

- Preview tool
- Asset validation report
- Animated-population benchmark
- Memory soak and wave-purge cleanup tests

---

# 29. Tests

## Loader and cloning

- Rigid and skinned GLBs load
- Clips are retained
- Failed assets use fallbacks
- Two clones have independent skeleton poses
- Removing one clone does not break another

## State controller

- Idle → walk → run
- Attack one-shot
- Hit and stagger policy
- Death locks final state
- Cross-fade timing
- Random phase

## Cleanup and LOD

- Removal stops and uncaches mixer
- Wave purge releases every animated rig
- Restart/rematch does not grow mixer count
- LOD hysteresis prevents thrashing
- Far model has no mixer
- Model swap never duplicates an enemy

## Networking

- Action cue plays once
- Duplicate cue ignored
- Reconnect restores important action/death state
- Animation differences never alter gameplay

---

# 30. Acceptance criteria

Complete when:

1. Skinned GLBs load with clips.
2. Skeleton instances clone safely.
3. Nearby enemies independently animate.
4. Animation roles are content-driven.
5. Gameplay does not reference Blender clip names.
6. Root motion does not drive gameplay.
7. Attack timing remains authoritative.
8. New enemy families require no hardcoded model switch.
9. Bosses and elites support full animation.
10. Common enemies support reduced skinned models.
11. Common enemies also support far non-skeletal models.
12. Animation frequency scales with distance.
13. Far hordes require no individual mixer.
14. Wave purge releases all animation resources.
15. Both modes use the same profiles.
16. Graphics settings affect only presentation.
17. Preview and validation expose asset problems.
18. Benchmarks establish a safe animated-enemy cap.
19. Horde scalability is preserved.
20. Witch, spider, and beast families all work through the same system.

Final invariant:

> Recoil Crew uses full skeletal animation only where it creates visible value, while common distant hordes progressively switch to cheaper representations that preserve silhouette and motion without changing gameplay.
