# Codex Prompt — Implement the Rigged Enemy Animation System
## Expandable, data-driven animation architecture for common enemies, elites, bosses, and future enemy families

Repository:

```text
https://github.com/mwl313/RecoilCrewDS
```

Canonical branch:

```text
combat-rework
```

Binding design document:

```text
docs/animation07/RIGGED_ENEMY_ANIMATION_SYSTEM_DESIGN.md
```

Implementation prompt location:

```text
docs/animation07/CODEX_PROMPT_IMPLEMENT_RIGGED_ENEMY_ANIMATION_SYSTEM.md
```

Related model-production specification, when present:

```text
docs/animation07/ENEMY_MODEL_AND_ANIMATION_SPEC_SHEET.md
```

---

# 0. Source-of-truth and Git rules

Treat the current `combat-rework` branch as the sole implementation base.

Before editing:

```bash
git fetch origin
git switch combat-rework
git pull --ff-only origin combat-rework
git status --short
git branch --show-current
git log --oneline -15
```

Requirements:

- Work directly from the current `combat-rework` code.
- Do not merge, rebase, or cherry-pick another branch.
- Do not restore older pre-Combat-05 code.
- Do not reset or discard unrelated user work.
- Do not commit binary art assets that were not supplied.
- Do not fabricate finished Witch, Spider, or Beast GLB files.
- Use procedural test assets and fallback models until real art is supplied.
- Make reviewable milestone commits.
- Do not stop after writing an audit or skeleton implementation.

---

# 1. Mission

Implement the complete foundational rigged-enemy animation architecture described in:

```text
docs/animation07/RIGGED_ENEMY_ANIMATION_SYSTEM_DESIGN.md
```

The result must support:

- Rigid GLB models
- Skinned GLB models
- Embedded animation clips
- Safe independent skeleton cloning
- Content-driven enemy presentation profiles
- Content-driven animation profiles
- Semantic animation roles rather than hardcoded Blender clip names
- Idle, locomotion, attack, cast, hit, stagger, knockback, landing, spawn, death, and phase-transition roles
- Authoritative gameplay timing with client-side animation presentation
- Data-driven state-to-animation mapping
- Optional compact authoritative action cues
- Full animation for bosses and elites
- Reduced skeletal animation for nearby common enemies
- Reduced update rates for mid-range common enemies
- Non-skeletal far variants
- A future-compatible seam for instanced far-horde rendering
- Proper mixer and resource cleanup
- Animation validation
- An enemy animation preview tool
- Animation performance benchmarks
- Easy addition of future enemy families, models, variants, and clips

The architecture must not be specific to:

```text
Humanoid Witch
Spider
Four-Legged Beast
Scrap Bug
Rammer
Gun Tower
Loot Truck
```

Those are content examples, not engine branches.

---

# 2. Current architecture that must be preserved

Audit the actual checkout before coding.

The current branch is expected to contain these broad patterns:

- `GLTFLoader` loads optional custom GLBs.
- `ModelProvider` currently caches `THREE.Object3D` prototypes.
- The current loader interface retains only `gltf.scene`.
- `AssetService.model(id)` supplies synchronous model instances after preload.
- `EntityViewFactory` currently clones a model hierarchy per enemy.
- `EntityViewRegistry` tracks one enemy rig per enemy ID.
- Enemy gameplay is server/local-authoritative.
- Multiplayer replicates enemy gameplay state, not presentation bones.
- Semantic asset IDs and generated presentation content already exist.
- Built-in procedural fallbacks protect the game from missing assets.
- Current enemies still use `EnemyDefinition.presentationId`.
- Combat 05 and Coreloop 06 behavior must remain intact.

Preserve existing public APIs where practical.

In particular, do not casually break:

```ts
AssetService.model(id): THREE.Object3D
```

Add richer APIs alongside compatibility APIs, then migrate only the enemy presentation path that needs animation metadata.

---

# 3. Non-negotiable architecture rules

## 3.1 Animation is presentation

The authority decides:

```text
position
yaw
movement
attack start
impact timing
damage
knockback
death
wave ownership
boss phase
```

The client decides only how those states are displayed.

Animation events may trigger:

```text
sound
particles
camera-local presentation
footstep visuals
impact visuals
```

Animation events must never apply gameplay damage.

## 3.2 No networked bones

Never replicate:

```text
bone matrices
per-bone transforms
AnimationMixer time every frame
full pose data
```

Replicate only compact gameplay state or action cues when existing state is insufficient.

## 3.3 No root-motion gameplay

Locomotion clips are in place.

Gameplay moves the enemy root. Animation moves limbs and local body parts.

## 3.4 Data-driven future expansion

Adding a new enemy family should normally require:

```text
model asset definitions
presentation profile JSON
animation profile JSON
enemy definition reference
optional new authoritative action IDs
```

It should not require editing a model-selection switch or adding family-specific code.

## 3.5 Horde scalability

Do not make every enemy use a full skeleton.

The final runtime supports:

```text
Hero tier
Near common tier
Mid common tier
Far common tier
Aggregate tier
```

Only the first three may use mixers, and the mid tier uses reduced update frequency.

---

# 4. Required initial deliverables

Before implementation, create:

```text
docs/animation07/ANIMATION07_CODE_AUDIT.md
docs/animation07/ANIMATION07_IMPLEMENTATION_PLAN.md
docs/animation07/ANIMATION07_BASELINE_REPORT.md
docs/animation07/ANIMATION07_ASSET_CONTENT_CONTRACT.md
```

Then continue implementation.

Do not stop after documentation.

---

# 5. Code audit

Inspect at minimum:

```text
package.json

public/assets/manifest.json
content/manifest.json
content/assets/
content/enemies/
content/presentation/

src/client/assets.ts
src/client/assets/assetService.ts
src/client/assets/modelProvider.ts
src/client/assets/assetInstanceFactory.ts
src/client/assets/assetManifestLoader.ts
src/client/assets/assetTransformResolver.ts
src/client/assets/fallbackAssetFactory.ts
src/client/assets/types.ts

src/client/app/entityViewFactory.ts
src/client/app/entityViewRegistry.ts
src/client/app/gameClient.ts
src/client/app/renderWorld.ts
src/client/presentation/

src/shared/assetRegistry.ts
src/shared/assetCatalog.ts
src/shared/content/
src/shared/content/schemas/enemy.ts
src/shared/presentation/schemas.ts
src/shared/types.ts
src/shared/net/
src/shared/sim/
src/shared/enemies/

scripts/generate-presentation-content.ts
scripts/generate-content-pack.ts

tools/presentation-preview/
tests/
e2e/
```

Record:

- How models are registered and preloaded
- How fallback assets work
- How project model assets are generated
- Which code clones models
- Whether materials are shared between clones
- How enemy hit flash currently mutates materials
- Where enemy visual transforms update each frame
- Where dead enemy visuals are retained and removed
- How telegraphs are created
- How graphics-quality settings are represented
- How simulation or rendering LOD currently works, if present
- How enemy state and events reach Multiplayer clients
- How scene/HUD presentation content is generated
- Where a new browser tool should fit
- Which tests mock the GLTF loader
- Whether current code already includes any animation or skeleton utility

Document all exact files and symbols.

---

# 6. Baseline gate

Before modifying code, run every applicable existing command.

At minimum:

```bash
npx tsc --noEmit
npm run generate:presentation-content
npm run generate:content-pack
npm run generate:map-profiles
npm run build
npm test
npm run test:demo
npm run test:coreloop
npm run test:horde
npm run test:netcode
npm run test:presentation
npm run test:maplab
```

Run E2E suites when the environment supports them.

Record actual output in:

```text
docs/animation07/ANIMATION07_BASELINE_REPORT.md
```

Do not claim a command passed unless it was executed.

---

# 7. Recommended module structure

Use focused modules.

Recommended structure:

```text
src/shared/animation/
├── animationProfileTypes.ts
├── enemyAnimationProfileSchema.ts
├── enemyPresentationProfileSchema.ts
├── animationLodPolicySchema.ts
├── animationRoles.ts
├── enemyActionCue.ts
└── animationContentValidation.ts

src/client/animation/
├── enemyAnimationController.ts
├── enemyAnimationStateResolver.ts
├── enemyAnimationInstance.ts
├── animationClipResolver.ts
├── animationLodSelector.ts
├── animatedModelInstanceFactory.ts
├── animationTelemetry.ts
└── animationCleanup.ts

src/client/assets/
├── loadedModelAsset.ts
└── existing asset files

tools/enemy-animation-preview/
├── index.html
├── src/
└── vite.config.ts
```

Adapt naming to existing repository conventions.

Avoid putting all new definitions in:

```text
src/shared/types.ts
src/shared/presentation/schemas.ts
```

Small registration exports are acceptable, but animation logic and schemas should live in focused modules.

---

# 8. Content layout

Add generated, validated content categories.

Recommended:

```text
content/enemy-presentation-profiles/
content/enemy-animation-profiles/
content/animation-lod-policies/
content/animation-shadow-policies/
```

Example IDs:

```text
enemyPresentation.legacy.scrapBug
enemyPresentation.witch.common
enemyPresentation.witch.elite
enemyPresentation.witch.boss
enemyPresentation.spider.common
enemyPresentation.spider.elite
enemyPresentation.spider.boss
enemyPresentation.beast.common
enemyPresentation.beast.elite
enemyPresentation.beast.boss

enemyAnimation.none
enemyAnimation.witch.common
enemyAnimation.witch.elite
enemyAnimation.witch.boss
enemyAnimation.spider.common
enemyAnimation.spider.elite
enemyAnimation.spider.boss
enemyAnimation.beast.common
enemyAnimation.beast.elite
enemyAnimation.beast.boss

animationLod.defaultHorde
animationLod.hero
animationShadow.defaultHorde
animationShadow.hero
```

These profiles may initially reference project asset IDs with procedural fallbacks because final GLBs do not yet exist.

---

# 9. Backward compatibility

Current enemy definitions use:

```text
presentationId
```

Do not force every existing enemy JSON to migrate in one destructive patch.

Add:

```text
presentationProfileId?: string
```

to the validated enemy definition.

Resolution order:

```text
1. If presentationProfileId exists:
   use the referenced profile.

2. Otherwise:
   synthesize/use a legacy rigid profile from presentationId.

3. If neither resolves:
   use the registered procedural fallback and emit one diagnostic warning.
```

Existing Demo behavior, golden tests, and current visuals should continue to work.

Once the system is stable, existing enemies may be migrated to explicit profiles in a focused content commit.

---

# 10. Milestone 1 — Loaded model assets

Replace the internal model-only cache with a richer immutable asset.

```ts
export interface LoadedModelAsset {
  id: string;
  scene: THREE.Object3D;
  animations: readonly THREE.AnimationClip[];
  hasSkinnedMesh: boolean;
}
```

Update the GLTF loader interface to accept:

```ts
{
  scene: THREE.Object3D;
  animations?: THREE.AnimationClip[];
}
```

Requirements:

- Preserve animation clips from `gltf.animations`.
- Detect `SkinnedMesh` by traversing the scene.
- Procedural fallbacks return:
  - a scene
  - an empty clip list
  - `hasSkinnedMesh: false`
- Cache one immutable asset per semantic asset ID.
- Deduplicate concurrent loads.
- Failed GLBs still use fallback assets.
- Registering a new file invalidates the correct cache entries.

Compatibility API:

```ts
AssetService.model(id): THREE.Object3D
```

must continue to work for existing rigid callers.

Add richer APIs:

```ts
AssetService.modelAsset(id): LoadedModelAsset
AssetService.createModelInstance(id, options?): LoadedModelInstance
```

Do not expose mutable cached prototype scenes to callers.

Commit:

```text
animation07: preserve GLB clips and model metadata
```

---

# 11. Milestone 2 — Safe model instance creation

Create:

```ts
export interface LoadedModelInstance {
  root: THREE.Object3D;
  source: LoadedModelAsset;
  skinned: boolean;
}
```

Cloning:

```text
Rigid:
Object3D.clone(true)

Skinned:
SkeletonUtils.clone(source.scene)
```

Requirements:

- Import `SkeletonUtils` from Three.js addons.
- Two skinned instances must have independent bone poses.
- Geometry and immutable clip data may be shared.
- Materials must follow a deliberate policy.
- The current transform and material override pipeline must still apply.
- Existing socket resolution must still work.
- Rigid models must not pay unnecessary skeleton-cloning cost.

Add a procedural skinned fixture for tests only:

```text
two or three bones
one SkinnedMesh
one looping locomotion clip
one one-shot attack clip
```

Do not commit a binary test GLB when a procedural fixture can prove the behavior.

Commit:

```text
animation07: add safe animated model instances
```

---

# 12. Milestone 3 — Presentation profile schemas

Implement validated schemas.

## EnemyPresentationProfileDefinition

Required fields:

```ts
interface EnemyPresentationProfileDefinition {
  id: string;
  label: string;

  nearModelAssetId: string;
  farModelAssetId?: string;
  aggregateModelAssetId?: string;

  animationProfileId?: string;
  lodPolicyId: string;
  shadowPolicyId: string;

  transform?: {
    scale?: number | [number, number, number];
    position?: [number, number, number];
    rotation?: [number, number, number];
  };

  socketBindings?: Record<string, string>;

  materialPolicy?: {
    cloneForHitFlash: boolean;
    allowSharedMaterials: boolean;
  };

  tags?: string[];
}
```

## EnemyAnimationProfileDefinition

Required semantic roles:

```text
idle
walk
run
attackPrimary
attackSecondary
attackSpecial
castStart
castLoop
castRelease
hit
stagger
knockback
land
spawn
entrance
death
phaseTransition
recovery
```

Every role is optional except the profile must define a fallback chain.

Example:

```json
{
  "fallbacks": {
    "run": "walk",
    "walk": "idle",
    "attackSecondary": "attackPrimary",
    "hit": "idle",
    "stagger": "hit",
    "death": "idle"
  }
}
```

Profile fields:

```ts
interface EnemyAnimationProfileDefinition {
  id: string;
  label: string;

  clips: Partial<Record<EnemyAnimationRole, string>>;
  fallbacks: Partial<Record<EnemyAnimationRole, EnemyAnimationRole>>;

  stateMap?: Record<string, EnemyAnimationRole>;

  locomotion: {
    idleSpeedMax: number;
    walkSpeedMax: number;
    walkSpeedReference: number;
    runSpeedReference: number;
    playbackMin: number;
    playbackMax: number;
    randomStartPhase: boolean;
  };

  transitions: {
    defaultCrossFadeSeconds: number;
    locomotionCrossFadeSeconds: number;
    attackCrossFadeSeconds: number;
    hitCrossFadeSeconds: number;
    deathCrossFadeSeconds: number;
  };

  playback?: Partial<Record<EnemyAnimationRole, {
    loop: "repeat" | "once" | "pingPong";
    clampWhenFinished?: boolean;
    timeScale?: number;
    interruptPriority?: number;
  }>>;

  presentationEvents?: Partial<Record<EnemyAnimationRole, Array<{
    normalizedTime: number;
    eventId: string;
  }>>>;

  rootMotion: false;
}
```

## LOD policy

```ts
interface AnimationLodPolicyDefinition {
  id: string;

  heroAlwaysNear: boolean;

  nearEnter: number;
  nearLeave: number;

  midEnter: number;
  midLeave: number;

  farEnter: number;
  farLeave: number;

  nearUpdateHz: number;
  midUpdateHz: number;

  maximumNearMixers: number;
  maximumMidMixers: number;

  priorityWeights: {
    boss: number;
    elite: number;
    attacking: number;
    telegraphing: number;
    damagedRecently: number;
    distance: number;
  };
}
```

## Shadow policy

Keep shadow rules content-driven.

Add schema and generator tests.

Commit:

```text
animation07: add data-driven animation content schemas
```

---

# 13. Milestone 4 — Generated content integration

Integrate profiles into the repository’s existing generated-content architecture.

Requirements:

- Validate source JSON with Zod.
- Verify all referenced model asset IDs resolve.
- Verify all referenced animation profile, LOD, and shadow IDs resolve.
- Reject duplicate IDs.
- Reject fallback cycles in animation roles.
- Generate a browser-safe typed bundle.
- Make runtime lookup O(1) through maps/registries.
- Add profiles to the appropriate content manifest.
- Preserve deterministic generated output.
- Add content authoring documentation.

Do not create a second unrelated JSON-loading system at runtime.

Use the existing generation pipeline or a focused generator invoked by the existing presentation-content generator.

Commit:

```text
animation07: generate enemy animation presentation content
```

---

# 14. Milestone 5 — Initial family templates

Add content templates for:

```text
Humanoid Witch
Spider
Four-Legged Beast
```

Each family must include:

```text
common
elite
boss
```

Common profiles should reference:

```text
near skinned asset
far rigid asset
default horde LOD
default horde shadow policy
```

Elite and boss profiles should use hero-oriented LOD policies.

Because final GLBs are not yet supplied:

- Register project asset IDs without files where supported.
- Give every placeholder a valid built-in fallback asset.
- Do not make missing art break startup.
- Clearly mark placeholder asset entries.
- Do not activate these enemies in gameplay unless a separate enemy definition already exists.
- Do not change game balance.

Recommended project model IDs:

```text
custom.enemy.witch.common.skinned
custom.enemy.witch.common.far
custom.enemy.witch.elite
custom.enemy.witch.boss

custom.enemy.spider.common.skinned
custom.enemy.spider.common.far
custom.enemy.spider.elite
custom.enemy.spider.boss

custom.enemy.beast.common.skinned
custom.enemy.beast.common.far
custom.enemy.beast.elite
custom.enemy.beast.boss
```

Commit:

```text
animation07: add witch spider and beast profile templates
```

---

# 15. Milestone 6 — Enemy animation runtime

Create:

```text
EnemyAnimationController
EnemyAnimationStateResolver
EnemyAnimationInstance
AnimationClipResolver
```

## EnemyAnimationInstance

Owns one animated presentation instance:

```ts
interface EnemyAnimationInstance {
  mixer: THREE.AnimationMixer;
  actions: Map<EnemyAnimationRole, THREE.AnimationAction>;
  currentRole: EnemyAnimationRole | null;
  currentAction: THREE.AnimationAction | null;
  currentPriority: number;
  lastUpdateTime: number;
  phaseSeed: number;
}
```

## Clip resolution

Resolve:

```text
semantic role
→ profile clip name
→ GLB AnimationClip
```

Use fallback chains.

Missing optional clips should produce a one-time warning and fallback safely.

Missing all usable clips must leave the model in a valid static pose.

## State resolution

Resolution priority:

```text
death
explicit authoritative action cue
knockback / airborne impulse
stagger
hit reaction
explicit stateMap
telegraphing attack
run
walk
idle
```

No family-specific `if witch`, `if spider`, or `if beast` code.

## Cross-fades

Use profile-defined cross-fade times.

One-shot actions:

- Reset before play
- Use `LoopOnce`
- Respect clamp policy
- Return to the correct locomotion/idle state

Death:

- Highest priority
- Cannot be interrupted
- Stops unnecessary future transitions

## Locomotion playback

Scale walk/run playback using authoritative movement speed and profile references.

Clamp to profile limits.

## Random loop phase

Use deterministic hash from enemy ID and match/map seed where available.

Do not add network traffic solely for random phase.

Commit:

```text
animation07: add semantic enemy animation controller
```

---

# 16. Milestone 7 — Entity presentation integration

Refactor enemy model creation to use presentation profiles.

Remove the hardcoded model selection switch from the main enemy path.

Legacy fallback remains supported through the compatibility resolver.

Extend `EnemyRig` with animation/runtime data without turning it into a monolith.

Recommended:

```ts
interface EnemyRig {
  group: THREE.Group;
  model: THREE.Object3D;
  presentationProfileId: string;
  animation?: EnemyAnimationInstance;
  currentLod: EnemyAnimationLodTier;
  modelVariant: "near" | "far" | "aggregate";
  materials: THREE.MeshStandardMaterial[];
  telegraph: THREE.Group;
  telegraphMat: THREE.MeshBasicMaterial;
  head?: THREE.Object3D;
  deadT: number;
}
```

Integrate updates into the existing client presentation frame:

```text
receive/interpolate authoritative state
→ synchronize entity transforms
→ resolve animation LOD
→ resolve semantic animation state
→ update due mixers
→ apply presentation
→ render
```

Do not update animation from the server simulation loop.

Preserve:

- Existing telegraphs
- Hit flashes
- Death retention
- Markers
- Socket handling
- Rematch/reset cleanup
- Single Player behavior
- Multiplayer interpolation

Commit:

```text
animation07: integrate animated enemy presentation
```

---

# 17. Milestone 8 — Animation action cues

Implement a compact optional authoritative cue for states that cannot be inferred reliably.

Recommended:

```ts
interface EnemyActionCue {
  sequence: number;
  actionId: string;
  startedAtTick: number;
  durationTicks: number;
}
```

Possible storage:

```text
optional active cue on EnemyState
or
typed ordered enemy-action event plus reconnect reconstruction state
```

Choose the smallest architecture consistent with the existing network system.

Requirements:

- Existing enemies do not need cue changes unless necessary.
- Duplicate sequence is ignored.
- Late cue is aligned to authoritative elapsed time.
- Reconnect can reconstruct an active long attack or boss transition.
- Cue maps to semantic animation role through content.
- Cue never applies damage.
- Cue protocol/version changes are intentional and tested.
- Do not add verbose clip names to snapshots.

Example action IDs:

```text
enemy.attack.primary
enemy.attack.secondary
enemy.attack.special
enemy.cast.start
enemy.cast.release
enemy.pounce
enemy.charge
enemy.phase.transition
```

Commit:

```text
animation07: add authoritative enemy action cues
```

---

# 18. Milestone 9 — Animation LOD

Implement:

```ts
type EnemyAnimationLodTier =
  | "hero"
  | "near"
  | "mid"
  | "far"
  | "aggregate";
```

## Hero

- Bosses and active elites
- Full model and clip set
- Every-frame or high-rate mixer update
- Highest priority
- Never displaced by common mixer budget

## Near

- Common skinned model
- Full common clip set
- Profile-defined update rate
- Hit reactions allowed

## Mid

- Skinned model when budget allows
- Reduced update rate
- Locomotion and attack only
- Hit animation may be replaced with flash
- No ordinary cast shadow

## Far

- Far rigid/baked model
- No `AnimationMixer`
- Cheap procedural motion or static fallback
- Compatible with future instancing

## Aggregate

- No individual animated hierarchy
- Future far-horde renderer seam
- This milestone may expose the contract without implementing aggregate horde rendering when Coreloop/Horde has not yet supplied it

## Hysteresis

Use separate enter and leave distances.

## Mixer budgets

When too many enemies qualify:

Priority should favor:

```text
boss
elite
currently attacking
telegraphing
recently damaged
closer distance
stable existing allocation
```

Do not randomly flicker mixers between enemies each frame.

Use stable selection and hysteresis.

## Reduced updates

Mid mixers update in deterministic groups with actual accumulated elapsed time.

Commit:

```text
animation07: add enemy animation LOD and mixer budgets
```

---

# 19. Milestone 10 — Far-model switching

Implement a safe model-variant swap:

```text
near skinned model
↔ far rigid model
```

Requirements:

- Same enemy ID
- Same root transform
- No duplicate visible model
- No missing-frame flash when possible
- Correct material/transform metadata
- Correct hit flash
- Correct shadow policy
- Animation controller cleanly suspended/disposed
- Near mixer recreated or reused safely on promotion
- Hysteresis prevents thrashing
- Missing far asset falls back to near/static model without crashing

Do not implement a bespoke family-specific swap.

Expose an interface that a future instanced horde renderer can consume:

```ts
interface FarEnemyPresentationRecord {
  enemyId: number;
  presentationProfileId: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  phase: number;
  flash: number;
}
```

Commit:

```text
animation07: add far-model switching and instancing seam
```

---

# 20. Milestone 11 — Material and hit-flash safety

Audit current material sharing.

Requirements:

- A hit flash on one animated enemy must not flash every enemy sharing the asset.
- Common animated instances should clone only the minimal material set required for per-instance mutation.
- Static/far instanced path should use per-instance or shader-driven flash later.
- Preserve emissive material settings.
- Preserve manifest/content material overrides.
- Dispose only materials actually owned by the instance.
- Do not dispose shared cached prototype materials.

Add explicit ownership metadata for cloned materials.

Commit:

```text
animation07: isolate animated enemy material state
```

---

# 21. Milestone 12 — Cleanup and lifecycle

Implement one explicit cleanup path.

On enemy removal, wave purge, restart, rematch, scene destruction, or LOD demotion:

```text
stop all actions
uncache actions when appropriate
uncache root
remove mixer references
remove model from scene
release owned materials
release preview/debug state
clear maps
```

Requirements:

- Reset must not leak mixers.
- Wave cohort purge with many animated enemies must clean up.
- Repeated Single Player restarts must remain stable.
- Repeated Multiplayer rematches must remain stable.
- Model promotion/demotion must not leave orphan skeletons.

Add counters:

```text
live mixers
live skinned roots
live rigid far roots
owned material clones
animation action count
```

Commit:

```text
animation07: harden animation lifecycle cleanup
```

---

# 22. Milestone 13 — Asset validation

Create a validator for imported enemy animation assets.

Validate what can be determined at runtime/build time:

```text
model loads
scene exists
clip names unique
required semantic roles resolve
root-motion displacement within tolerance
model contains expected skinned/rigid form
bone count within profile budget
material count within budget
maximum vertex influences when inspectable
model bounds and scale plausible
base/origin plausibility
no cameras or lights
supported extensions only
```

Not every GLB property may be cheaply available through current APIs.

When a check cannot be implemented reliably, document it as a manual export check rather than pretending it is validated.

Validation levels:

```text
error
warning
info
```

Examples:

```text
Error:
required boss death clip missing

Warning:
common model has 47 bones
common model has 4 materials
root translates 1.8 m during walk
far model contains SkinnedMesh

Info:
optional land clip missing; fallback will be used
```

Provide a CLI:

```bash
npm run validate:enemy-animations
```

It should validate all registered animation profiles and supplied model files.

Commit:

```text
animation07: add enemy animation asset validation
```

---

# 23. Milestone 14 — Enemy animation preview tool

Create:

```text
tools/enemy-animation-preview/
```

Required functionality:

- Select presentation profile
- Select near/far model
- List resolved clips
- Select semantic role
- Play/pause/restart
- Scrub normalized time
- Set playback speed
- Toggle looping
- Toggle skeleton helper
- Toggle bounds and origin
- Toggle ground plane
- Toggle shadows
- Toggle hit flash
- Simulate movement speed
- Simulate attack cue
- Simulate death
- Preview near/mid/far transitions
- Spawn 1, 10, 25, or 50 copies
- Display:
  - triangle estimate where available
  - mesh count
  - material count
  - bone count
  - clip count
  - mixer count
  - animation update time
  - draw calls
  - active LOD counts
  - warnings

The tool must use the same loaders, profile registry, clip resolver, and model instance factory as production.

Do not duplicate the animation runtime in the tool.

Add:

```bash
npm run dev:animation-preview
npm run build:animation-preview
npm run test:animation-preview
```

Commit:

```text
animation07: add enemy animation preview tool
```

---

# 24. Milestone 15 — Animation benchmark

Add:

```text
scripts/benchmark-enemy-animation.ts
```

Benchmark procedural test rigs and any supplied GLBs.

Scenarios:

```text
1 hero mixer
10 hero/elite mixers
25 near common mixers
50 near common mixers
100 near common mixers
50 near + 100 mid
50 near + 200 far rigid
rapid LOD promotion/demotion
100 enemy deaths
100 enemy purge cleanup
restart/rematch cycles
```

Measure:

```text
animation controller p50/p95/p99
mixer update p50/p95/p99
model clone time
skeleton clone time
LOD selection time
model swap time
cleanup time
draw calls
renderer frame time in preview
memory trend
live mixer count
live bone/object count
```

Add:

```bash
npm run test:animation:benchmark
```

Do not claim a final near-skinned cap until measured on available hardware.

Record results in:

```text
docs/animation07/ANIMATION07_PERFORMANCE_REPORT.md
```

Commit:

```text
animation07: add animated enemy benchmark
```

---

# 25. Initial animation roles by family

The engine remains generic, but template profiles should cover these semantic roles.

## Humanoid Witch

Common:

```text
idle
walk or hoverMove
attackPrimary
hit
death
```

Elite:

```text
idle
walk
run or fastHover
attackPrimary
attackSecondary
castStart
castLoop
castRelease
hit
stagger
knockback
entrance
death
```

Boss:

```text
entrance
idle
walk
run or fastHover
attackPrimary
attackSecondary
attackSpecial
castStart
castLoop
castRelease
hit
stagger
recovery
phaseTransition
death
```

## Spider

Common:

```text
idle
walk
attackPrimary
hit
death
```

Elite:

```text
idle
walk
run
attackPrimary
attackSecondary
pounce
webCast
hit
stagger
knockback
entrance
death
```

Boss:

```text
entrance
idle
walk
run
attackPrimary
attackSecondary
attackSpecial
pounce
webCast
summon
hit
stagger
recovery
phaseTransition
death
```

## Four-Legged Beast

Common:

```text
idle
run
attackPrimary
hit
death
```

Elite:

```text
idle
walk
run
charge
attackPrimary
attackSecondary
leap
hit
stagger
knockback
entrance
death
```

Boss:

```text
entrance
idle
walk
run
charge
attackPrimary
attackSecondary
attackSpecial
leap
roar
hit
stagger
recovery
phaseTransition
death
```

These lists are profile templates, not engine enums beyond the shared semantic role vocabulary.

---

# 26. Tests

Add focused tests.

## Asset loading

- Rigid fallback returns empty clips
- GLB clips are retained
- Skinned detection works
- Concurrent loads deduplicate
- Failed GLB uses fallback
- Registering a file invalidates correct cache

## Skeleton cloning

- Two clones have independent bone transforms
- Clip data can be shared
- One clone’s animation does not pose another
- Rigid model uses cheaper clone path

## Content

- Presentation profile schema
- Animation profile schema
- LOD schema
- Shadow schema
- Reference validation
- Duplicate ID rejection
- Fallback-cycle rejection
- Legacy `presentationId` compatibility

## Clip resolver

- Semantic role resolves clip
- Fallback role resolves
- Missing optional clip falls back
- Missing all clips remains static
- Clip names never appear in gameplay code paths

## State resolver

- Death priority
- Action cue priority
- Knockback priority
- Stagger/hit policy
- State-map behavior
- Telegraphed attack behavior
- Run/walk/idle thresholds

## Mixer runtime

- Looping locomotion
- One-shot attack
- Cross-fade
- Playback speed scaling
- Random phase
- Death lock
- Cleanup

## LOD

- Boss always receives hero tier
- Mixer budgets preserve boss/elite
- Hysteresis prevents thrashing
- Mid update groups are deterministic
- Far tier has no mixer
- Near/far swap has no duplicate root
- Graphics quality changes presentation only

## Materials

- One hit flash does not affect another enemy
- Shared prototype materials are not disposed
- Owned materials are cleaned up

## Lifecycle

- Enemy removal cleans mixer
- Wave purge cleans all cohort mixers
- Reset/rematch leaves zero orphan mixers
- 100 repeated create/remove cycles stay bounded

## Networking

- Cue sequence deduplicates
- Late cue aligns to authoritative time
- Reconnect reconstructs active cue
- No bone data is serialized
- Cue cannot apply damage

---

# 27. Regression tests

Run and preserve:

```text
Combat 05 Dash-only contact
instant turret
Charge Shot
no fall damage
no Jackpot

Coreloop StageDirector
WaveController ownership/purge
Single Player
Multiplayer
content generation
asset fallback
presentation preview
Map Lab
network prediction
results and rematch
```

The animation system must not change authoritative gameplay outcomes or the Demo golden unless an intentional presentation-only fixture requires it.

Presentation-only changes should not alter simulation golden state.

---

# 28. Manual verification

Verify:

```text
Rigid existing enemy fallback
Procedural skinned test enemy
Two independently animated clones
Idle/walk/run transitions
Attack one-shot
Hit/stagger
Knockback
Death
Missing clip fallback
Missing GLB fallback
Near → mid → far transition
Far → near promotion
Boss priority over common mixer budget
50 animated common enemies
Wave purge cleanup
Single Player restart
Multiplayer rematch
Reconnect during an attack
100 ms and 150 ms RTT
```

When real GLBs are supplied later, verify all three families through the preview tool.

---

# 29. Required package scripts

Add as appropriate:

```json
{
  "scripts": {
    "dev:animation-preview": "...",
    "build:animation-preview": "...",
    "test:animation": "...",
    "test:animation-preview": "...",
    "test:animation:benchmark": "...",
    "validate:enemy-animations": "..."
  }
}
```

Use repository conventions and actual test framework.

Do not add scripts pointing to nonexistent files.

---

# 30. Required documentation

Create:

```text
docs/animation07/ANIMATION07_IMPLEMENTATION_REPORT.md
docs/animation07/ANIMATION07_CONTENT_AUTHORING_GUIDE.md
docs/animation07/ANIMATION07_GLTF_EXPORT_GUIDE.md
docs/animation07/ANIMATION07_PREVIEW_TOOL_GUIDE.md
docs/animation07/ANIMATION07_PERFORMANCE_REPORT.md
```

Update relevant existing guides:

```text
docs/guides/ASSET_GUIDE.md
docs/guides/ARCHITECTURE.md
docs/guides/CONTENT_AUTHORING_GUIDE.md
docs/planning/BUILD_STATUS.md
README.md
```

The implementation report must include:

1. Actual code audit
2. Baseline command results
3. Files added/modified/deleted
4. Loaded-model asset changes
5. Safe clone behavior
6. Content schemas and generated output
7. Legacy compatibility
8. Animation state selection
9. Action-cue architecture
10. LOD and mixer budgets
11. Model swapping
12. Material ownership
13. Cleanup lifecycle
14. Preview tool
15. Validation CLI
16. Benchmark results
17. Unit/integration/E2E results
18. Manual verification
19. Known limitations
20. Completion checklist

---

# 31. Required command gates

Inspect `package.json` and run all applicable commands.

At minimum:

```bash
npx tsc --noEmit

npm run generate:presentation-content
npm run generate:content-pack
npm run generate:map-profiles

npm run build
npm test

npm run test:animation
npm run test:animation-preview
npm run test:animation:benchmark
npm run validate:enemy-animations

npm run test:demo
npm run test:coreloop
npm run test:horde
npm run test:presentation
npm run test:netcode
npm run test:maplab

npm run build:animation-preview
npm run build:presentation-preview
npm run build:maplab
```

Run available E2E suites.

Report actual output.

Do not hide failures.

---

# 32. Performance rules

The implementation is not complete merely because one animated enemy works.

Required properties:

- Rigid existing enemies do not pay mixer cost.
- Skinned models use safe independent skeletons.
- Clip data is shared.
- Model prototypes remain cached.
- Mid mixers update at reduced rates.
- Far enemies have no mixer.
- Boss and elite animation cannot be starved by common enemies.
- LOD selection is stable.
- Material cloning is bounded.
- Cleanup prevents mixer growth.
- No per-frame network animation stream exists.
- No per-frame unbounded arrays or object churn in animation hot paths.
- Preview benchmarks expose the safe near-skinned count.
- Missing assets and clips degrade gracefully.

---

# 33. Commit discipline

Recommended commits:

```text
animation07: add audit and baseline
animation07: preserve GLB clips and model metadata
animation07: add safe animated model instances
animation07: add data-driven animation content schemas
animation07: generate enemy animation presentation content
animation07: add witch spider and beast profile templates
animation07: add semantic enemy animation controller
animation07: integrate animated enemy presentation
animation07: add authoritative enemy action cues
animation07: add enemy animation LOD and mixer budgets
animation07: add far-model switching and instancing seam
animation07: isolate animated enemy material state
animation07: harden animation lifecycle cleanup
animation07: add enemy animation asset validation
animation07: add enemy animation preview tool
animation07: add animated enemy benchmark
animation07: finalize reports and guides
```

Use fewer commits only when adjacent milestones are inseparable, but do not create one giant commit.

---

# 34. Completion gate

Complete only when all are true:

1. The current `combat-rework` branch remains the base.
2. Existing rigid model loading still works.
3. GLB animation clips are preserved.
4. Skinned meshes are detected.
5. Skeletons clone independently.
6. Cached prototype assets are not mutated by instances.
7. Presentation profiles are validated and generated.
8. Animation profiles are validated and generated.
9. LOD and shadow policies are data-driven.
10. Existing `presentationId` content remains compatible.
11. New enemies can use `presentationProfileId`.
12. Gameplay code never depends on Blender clip names.
13. Semantic animation roles resolve through content.
14. Missing clips fall back safely.
15. Static models remain valid with no clips.
16. Idle, locomotion, attack, hit/stagger, knockback, and death work.
17. One-shot animations cross-fade and return correctly.
18. Death cannot be interrupted.
19. Root motion does not drive gameplay.
20. Attack impact remains authoritative.
21. Optional action cues are compact and sequenced.
22. No bone transforms are networked.
23. Bosses and elites receive hero animation priority.
24. Near common enemies can use full reduced skeletons.
25. Mid common enemies update at reduced frequency.
26. Far common enemies use no mixer.
27. Near/far swapping has no duplicate visual.
28. A future instanced renderer has a clean far-record seam.
29. Hit flash does not leak across instances.
30. Mixer and material cleanup is correct.
31. Wave purge cleans animated cohort resources.
32. Restart/rematch/reconnect remain stable.
33. Witch, Spider, and Beast profile templates exist.
34. Missing final GLBs do not break startup.
35. The animation preview uses production runtime modules.
36. Asset validation reports real errors and warnings.
37. Benchmarks measure mixer and LOD costs.
38. All applicable tests and builds pass.
39. Documentation explains how to add a new family without engine edits.
40. Gameplay difficulty and authoritative outcomes are unchanged.

Final invariant:

> Recoil Crew resolves enemy models, animation clips, state mappings, LOD behavior, and presentation variants from validated content. Full skeletal animation is reserved for enemies close enough to benefit from it, while distant hordes use progressively cheaper representations without changing gameplay.
