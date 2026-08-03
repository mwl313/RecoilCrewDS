# Recoil Crew — Refractor 02 Verification Audit

**Repository:** `mwl313/RecoilCrewDS`  
**Branch audited:** `map-lab`  
**Audit date:** 2026-08-04  
**Target repository path:** `docs/refractor02/REFRACTOR02_VERIFICATION_AUDIT.md`

---

# 1. Audit scope

This audit verifies whether the Refractor 02 design was actually implemented in the current `map-lab` branch.

Reviewed areas:

```text
package.json
docs/refractor02/REFRACTOR02_IMPLEMENTATION_REPORT.md

content/scenes/
content/hud/
content/scene-flows/
content/themes/
content/assets/

scripts/generate-presentation-content.ts

src/generated/presentationContent.generated.ts
src/shared/presentation/schemas.ts
src/shared/assetCatalog.ts

src/client/main.ts
src/client/hud.ts
src/client/app/hudController.ts
src/client/presentation/
src/client/assets/
```

This was a static source audit. The implementation report records passing test runs, but those commands were not independently executed as part of this review.

---

# 2. Verdict

## Overall result

**Refractor 02 is substantially implemented, but it is not yet correctly completed.**

The architecture is real:

- Non-gameplay scenes are content-driven.
- The gameplay HUD is content-driven.
- Presentation content is generated and validated.
- A safe action registry exists.
- `HudViewModel` and `HudProjector` exist.
- A project asset catalog exists.
- A presentation preview tool exists.
- The old monolithic screen construction was removed.

However, several defects prevent the implementation from satisfying its strongest promises:

- Hybrid presentation scenes do not reliably start.
- Presentation-world disposal may destroy shared cached model resources.
- Real custom project models are not correctly preloaded.
- The UI component registry is bypassed by the runtime.
- Several live HUD bindings do not match the actual view model.
- The gameplay pause button is wired to Resume.
- Application-flow ownership remains duplicated.
- Repeaters retain stale jobs and instances.
- Nested presentation entities lose their parent transform.

## Readiness rating

| Area | Status |
|---|---|
| Data-driven static scenes | Good |
| Data-driven gameplay HUD | Good foundation, live defects |
| Safe action model | Good |
| Scene-flow ownership | Partial |
| UI component extensibility | Partial / incorrectly wired |
| Project asset extensibility | Partial / custom model path broken |
| Hybrid 3D scenes | Not reliable |
| Visual-editor foundation | Promising, requires hardening |
| Production readiness | Not yet |

The implementation is suitable as a foundation, but a hardening pass should precede a full visual Scene Editor.

---

# 3. Correctly implemented areas

## 3.1 Presentation content generation

Implemented:

```text
content/{scenes,hud,scene-flows,themes,assets}
→ Zod validation
→ cross-reference checks
→ deterministic generated TypeScript
```

Relevant files:

```text
scripts/generate-presentation-content.ts
src/generated/presentationContent.generated.ts
src/shared/presentation/schemas.ts
```

The normal client build runs `generate:presentation-content`.

## 3.2 Hardcoded screen migration

`src/client/hud.ts` is now a presentation facade rather than the former monolithic screen/HUD builder.

Existing screens are represented through scene content, including:

```text
Boot
Main Menu
Create Crew
Join Crew
Ready Lobby
Countdown
Results
Error
Pause
How To
```

## 3.3 Safe scene actions

Scene content references allowlisted action IDs.

Examples:

```text
app.createCrew
app.joinCrew
app.ready
app.startPractice
app.rematch
app.resume
```

No arbitrary JavaScript or `eval` is exposed to scene documents.

## 3.4 Typed HUD projection

`HudProjector` is the presentation boundary between `MatchState` and HUD content.

This is the correct direction:

```text
MatchState + local context
→ HudViewModel
→ cached bindings
→ HUD components
```

## 3.5 Built-in asset safety

Required gameplay assets still use semantic IDs and procedural fallbacks.

The new project catalog extends this rather than deleting the built-in fallback system.

## 3.6 Separate preview build

Presentation preview tooling is a separate Vite entry and package scripts exist for:

```bash
npm run dev:presentation-preview
npm run build:presentation-preview
npm run test:presentation
```

---

# 4. Critical findings

# P0-1 — Hybrid presentation worlds are constructed but not started

`PresentationWorld` provides:

```ts
start(): void
```

but the active flow creates it through:

```ts
new PresentationWorld(scene, container, loadedAssets)
```

without calling `start()`.

`AppFlowController.syncPresentationWorld()` stores the factory result but also does not call `start()`.

## Impact

The canvas can be added to the menu without a running render loop. The hybrid Main Menu may remain blank or static and its animations do not run.

## Required fix

Choose one lifecycle owner.

Recommended:

```ts
const world = this.presentationFactory(scene, container);
world?.start();
this.activeWorld = world;
```

Do not start the world inside both factory and controller.

Add a test proving:

```text
Main Menu shown
→ requestAnimationFrame scheduled
→ render called
→ leaving Main Menu cancels RAF
```

---

# P0-2 — Presentation disposal may invalidate shared gameplay assets

`AssetInstanceFactory.instanceModel()` uses:

```ts
proto.clone(true)
```

Three.js deep object cloning normally shares geometry and material resources.

`PresentationWorld.dispose()` traverses cloned models and disposes their geometry and materials.

## Impact

A Main Menu model cloned from a cached built-in prototype can dispose resources later reused by gameplay models.

Likely failure sequence:

```text
Main Menu loads player tank clone
→ Main Menu exits
→ PresentationWorld disposes shared geometry/material
→ gameplay requests the cached player tank prototype
→ cloned gameplay model references disposed resources
```

This can produce missing meshes, invalid buffers, or inconsistent rendering after leaving a hybrid scene.

## Required fix

Define resource ownership explicitly.

Recommended options:

### Option A — AssetService owns cached model resources

Presentation scenes remove model instances but do not dispose geometry/material resources obtained from `AssetService`.

### Option B — PresentationWorld requests isolated resources

Clone geometry and materials for presentation-owned instances, then dispose only those isolated resources.

Option A is simpler and preferable unless presentation scenes modify materials per instance.

Add a resource-ownership helper rather than ad hoc traversal disposal.

---

# P0-3 — Custom project models are registered after preload and remain unloaded

`AssetService.load()` currently:

1. Registers manifest model files.
2. Preloads built-in presentation model IDs.
3. Registers project-catalog model files afterward.

`AssetService.model()` is synchronous and throws when a prototype is not already loaded.

## Impact

A real custom scene model with a file can be registered but still fail at runtime:

```text
model 'custom.example' is not loaded; await AssetService.load() first
```

The current `scene.menuTank` path is special-cased to return `playerTank.chassis`, which hides this defect rather than proving custom assets work.

## Required fix

Load order should be:

```text
load catalog
→ register built-in overrides
→ register project model files
→ collect every model referenced by gameplay and scenes
→ preload all required model prototypes
→ expose synchronous model lookup
```

Remove the hardcoded:

```ts
if (assetId === 'scene.menuTank')
```

Project asset fallback/placeholder policy must be catalog-driven.

---

# P0-4 — The UI component registry is not actually used by SceneRuntime

`SceneRuntime` owns a `UiComponentRegistry`, but node construction calls:

```ts
createUiComponent(node, services)
```

without passing the registry.

Therefore, runtime construction falls back to the internal factory table.

Additionally, default component registrations use:

```ts
schema: z.any()
```

rather than component-specific property schemas.

## Impact

The implementation report describes registry-driven extensibility, but adding or replacing registered components does not reliably affect runtime construction.

Future inspector panels cannot trust component schemas.

## Required fix

Use:

```ts
createUiComponent(node, services, this.services.registry)
```

Every component registration must provide:

- Component-specific Zod schema
- Runtime factory
- Inspector descriptor
- Focused tests

Remove the duplicate internal factory path after registry parity is established.

---

# P0-5 — Live HUD bindings contain mismatches

The HUD document and `HudViewModel` disagree.

## Combo hot state

HUD document:

```text
combo.hot
```

View model:

```text
match.comboHot
```

Result: the live combo-hot class does not receive the projected value.

## Cannon cooldown arc

HUD component:

```text
valueSource: cooldownRatio
```

View model:

```text
gunner.cooldownRatio
```

Result: the live cooldown arc does not receive the intended value.

## Charge progress

Charge progress uses:

```text
valueSource: gunner.chargeRatio
maxSource: gunner.chargeRatio
```

Any positive value divided by itself becomes `1`, so the bar jumps to full instead of showing progress.

## Required fix

Use one canonical schema generated from the `HudViewModel` contract.

Recommended content fixes:

```text
combo.hot                → match.comboHot
cooldownRatio            → gunner.cooldownRatio
charge max source        → constant 1 support or gunner.chargeMax
```

Add validation proving every allowlisted binding path resolves on an empty view model.

Do not maintain the allowlist independently by hand.

---

# P0-6 — Gameplay pause button is wired to Resume

The gameplay HUD pause button references:

```text
app.resume
```

`HudRuntime` maps that action to the Resume handler.

## Impact

Clicking the visible pause button during gameplay does not request Pause.

## Required fix

Add:

```text
app.pause
```

to:

- Action schema
- Action registry
- HUD document
- `AppFlowHandlers`
- `Hud` facade
- Main application handler

The pause button must call the same `showPause()` policy as Escape.

---

# 5. High-priority findings

# P1-1 — Application flow ownership is duplicated

`AppFlowController` stores a current state, but `src/client/main.ts` still maintains:

```ts
let flow = ...
```

and directly performs most state transitions.

The scene-flow document is used primarily as a state-to-scene lookup. Its transition definitions do not own navigation.

## Impact

Adding a scene is easier, but adding a real flow state or transition can still require editing central application code in several places.

## Required direction

Either:

### Make AppFlowController canonical

Move the authoritative presentation/application state into it and expose typed transitions.

or:

### Rename it honestly

If `main.ts` remains the state owner, rename the controller to `SceneFlowPresenter` and document the boundary.

The current dual ownership should not remain.

---

# P1-2 — Repeater rerenders retain stale jobs and instances

`SceneRuntime` keeps:

```text
itemJobs
instances
```

for repeated nodes.

When a repeater changes, old DOM is cleared but old jobs are not fully removed. Template IDs are also reused across repeated items.

The implementation report already notes accumulation.

## Impact

- Memory growth
- Retained detached DOM nodes
- Duplicate/stale component instances
- Incorrect `getNode()` resolution
- Event listener retention

## Required fix

Give every repeated instance a scoped runtime ID:

```text
templateId::itemId
```

Track repeater-owned:

- Instances
- Bindings
- Actions
- Disposers

Dispose the old item subtree before rebuilding.

---

# P1-3 — Nested presentation entities are flattened

`PresentationWorld.buildEntity()` creates a group, adds it to the scene, then recursively calls `buildEntity(child)`.

The child is added to the scene root rather than to the parent group.

## Impact

Nested transforms do not compose.

## Required fix

Pass a parent:

```ts
buildEntity(entity, parent: THREE.Object3D)
```

and mount children beneath the entity group.

---

# P1-4 — Scene transitions do not follow a complete lifecycle

Scenes are cached and hidden rather than entered/unloaded on each transition.

Exit transition classes are added immediately before disposal/removal when `unload()` is called, so a timed exit transition cannot visibly complete.

## Required fix

Separate:

```text
mount
enter
leave
unmount
dispose
```

Cache the mounted scene if desired, but replay `enter()` and `leave()` per transition.

---

# P1-5 — Several declared presentation components are incomplete

The schemas list components including:

```text
lookAt
directionalLight
hemisphereLight
pointLight
audioSource
particleEmitter
billboard
postProcessPreset
```

but `PresentationWorld` does not implement all of them as entity components.

The image component also creates an `<img>` but does not resolve `assetId` into a source URL.

## Required fix

A component type should be one of:

```text
implemented
explicitly editor-only
explicitly unsupported
```

Do not advertise no-op runtime components as complete.

---

# P1-6 — Some HUD values remain hardcoded

Examples:

```text
integrityMax = 100
chargeSeconds = 1.0
cannonCooldown denominator = 1.6
```

These values can diverge from resolved content or modifiers.

## Required fix

Project from resolved runtime rules or replicated presentation values.

---

# 6. Test coverage assessment

The implementation report records passing test totals, which is positive.

However, the current test suite did not prevent the following source-level defects:

- Presentation world never starts
- Shared model resources may be disposed
- Custom project model is not preloaded
- Registry bypass
- Live HUD path mismatches
- Broken pause action
- Repeater retention
- Flattened entity hierarchy

Therefore, passing existing tests should not be treated as proof that Refractor 02 is complete.

Add regression tests specifically for these findings.

---

# 7. Recommended hardening order

## Hardening milestone A — Runtime correctness

1. Start/stop presentation world correctly.
2. Fix asset resource ownership.
3. Preload custom models.
4. Remove `scene.menuTank` hardcode.
5. Fix live HUD bindings.
6. Add `app.pause`.

## Hardening milestone B — Extensibility contract

1. Wire SceneRuntime through `UiComponentRegistry`.
2. Replace `z.any()` with component-specific schemas.
3. Resolve image/project assets.
4. Fix nested entity hierarchy.
5. Clarify unsupported scene components.

## Hardening milestone C — Lifecycle and flow

1. Fix repeater disposal/scoped IDs.
2. Add proper enter/leave lifecycle.
3. Remove duplicated flow ownership.
4. Make scene-flow transitions useful or narrow their documented scope.

## Hardening milestone D — Editor readiness

1. Generate binding paths from view-model contracts.
2. Expose reliable inspector descriptors.
3. Add custom asset preview tests.
4. Add scene-tree mutation tests.
5. Add save/apply bridge only after runtime parity.

---

# 8. Final conclusion

Refractor 02 successfully changed Recoil Crew from a hardcoded presentation surface into a content-driven architecture.

It did **not** yet fully deliver the dependable editor-ready platform described in the original design.

The correct assessment is:

> Architecturally successful, functionally incomplete, and in need of one focused hardening milestone before building the full Scene Editor.

The movement rework can proceed independently because its implementation belongs primarily to:

```text
content stats
MatchRules
shared kinematics
weapon behaviors
impulse effects
projectile effects
enemy movement
prediction/network synchronization
```

It should preserve the presentation refactor and only update presentation content where controls or HUD copy change.
