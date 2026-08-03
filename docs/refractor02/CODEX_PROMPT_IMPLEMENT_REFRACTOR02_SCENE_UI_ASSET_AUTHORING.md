# Codex Prompt — Implement Refractor 02
## Data-Driven Scene, HUD, and Asset Authoring Foundation

Repository:

```text
mwl313/RecoilCrewDS
```

Target documentation directory:

```text
docs/refractor02/
```

Read and follow:

```text
docs/refractor02/REFRACTOR02_SCENE_UI_ASSET_AUTHORING_DESIGN.md
```

Treat the design document and this prompt as the binding implementation contract.

Use the latest active development branch containing Map Lab and current game functionality. Inspect the actual tree before editing; do not assume paths from older reports are unchanged.

---

# Mission

Refactor Recoil Crew presentation so new scenes, HUD elements, themes, and project assets can be added through validated data and focused registry extensions instead of editing a monolithic hardcoded `Hud` implementation.

The result must also provide the document/runtime foundation required for a future browser-based Scene and UI Editor.

This is a presentation-authoring refactor. It must not change authoritative gameplay rules, networking semantics, map generation, or player controls.

---

# Read first

Inspect at minimum:

```text
README.md
docs/README.md
docs/guides/ARCHITECTURE.md
docs/guides/ASSET_GUIDE.md
docs/guides/CONTENT_AUTHORING_GUIDE.md
docs/guides/SMOKE_TEST.md
docs/refractor/

package.json
vite.config.ts
tsconfig.json

src/client/main.ts
src/client/hud.ts
src/client/styles.css
src/client/app/hudController.ts
src/client/app/gameClient.ts
src/client/app/renderWorld.ts
src/client/app/cameraManager.ts
src/client/app/pipRenderer.ts
src/client/app/presentationEventRouter.ts

src/client/assets.ts
src/client/assets/
src/shared/assetRegistry.ts
src/shared/content/
content/presentation/
public/assets/manifest.json

tests/
e2e/
```

If `public/assets/manifest.json` does not exist, inspect its documented contract and test fixtures instead.

Create first:

```text
docs/refractor02/REFRACTOR02_IMPLEMENTATION_PLAN.md
```

Document the current-state audit and exact migration sequence. Then implement immediately. Do not stop after planning.

---

# Non-negotiable constraints

Preserve:

- Authoritative Node WebSocket server
- Shared simulation
- Client prediction
- Driver and Gunner controls
- Online room lifecycle
- Rematch/reconnect
- Practice
- Map generation and checksum gates
- Current visual behavior unless an intentional parity note is documented
- Built-in semantic asset fallbacks
- Map Lab as a separate tool
- Existing content loading conventions

Do not:

- Rewrite the game in React/Vue/Svelte
- Add arbitrary JavaScript execution to scene JSON
- Expose authoritative `MatchState` directly to content expressions
- Put networking logic in scene documents
- Put gameplay rules in scene documents
- Remove built-in fallback guarantees
- Include preview/editor tools in the normal game bundle
- Delete old screens before migrated equivalents pass tests
- Perform a one-shot monolithic rewrite
- Change UI text or game flow casually
- Claim tests passed without running them

---

# Milestones

Implement in these milestones:

```text
Milestone 0 — Audit, golden parity, and shared contracts
Milestone 1 — Presentation content pipeline
Milestone 2 — Scene runtime and application flow migration
Milestone 3 — Gameplay HUD runtime migration
Milestone 4 — Extensible project asset catalog
Milestone 5 — Hybrid presentation scenes and preview tool
Milestone 6 — Cleanup, hardening, and documentation
```

Run focused tests after every milestone.

---

# Milestone 0 — Audit and parity baseline

## 0.1 Inventory current presentation

Record:

- Every non-gameplay screen
- Every screen node ID
- Every button/action
- Every flow state and transition
- Every network-driven screen transition
- Every gameplay HUD element
- Every direct `document.getElementById` and `querySelector`
- Every cached HUD node
- Every CSS class and custom property used by presentation
- Every HUD update path
- Every transient presentation event
- Every semantic asset ID
- Every direct asset file/path reference
- Every hardcoded environment/light/fog/post-process value
- Every teardown/listener lifecycle

Put the inventory in the implementation plan.

## 0.2 Golden parity

Before migration, add deterministic DOM or screenshot fixtures for:

```text
boot
main
create
join
ready
countdown
results
error
pause
howto
driver HUD
gunner HUD
```

Use stable fixture states.

Do not depend only on pixel-perfect screenshots where platform font rendering may vary. Combine:

- DOM structure assertions
- Text assertions
- computed key style/token assertions
- screenshots for broad visual regression

## 0.3 Define boundaries

Document:

- Application behavior owned by `AppFlowController`
- Presentation document ownership
- Safe action ownership
- Binding view-model ownership
- Asset catalog ownership
- Scene lifecycle ownership
- Gameplay `RenderWorld` ownership
- Presentation preview ownership

---

# Milestone 1 — Presentation content pipeline

## 1.1 Shared schemas

Create schemas for:

```text
SceneDefinition
UiNodeDefinition
SceneEntityDefinition
SceneFlowDefinition
HudDefinition
ThemeDefinition
ProjectAssetDefinition
BindingDefinition
ActionBindingDefinition
TransitionDefinition
PreviewStateDefinition
```

Use Zod and repository content conventions.

Required validation:

- ID prefixes
- Unique scene IDs
- Unique node/entity IDs within documents
- Valid component types
- Valid action IDs
- Valid binding paths
- Valid transform IDs
- Valid asset references
- Valid scene references
- Valid theme references
- No cycles in UI/entity trees
- Reasonable depth/node-count limits
- Valid layout combinations
- Valid custom asset namespaces

## 1.2 Content directories

Add source content under:

```text
content/scenes/
content/hud/
content/scene-flows/
content/assets/
content/themes/
```

Do not migrate every scene yet. Add minimum seed definitions and schemas first.

## 1.3 Component registries

Implement registries for:

```text
UI components
presentation 3D components
binding transforms
scene actions
```

Registration must include runtime factory and inspector metadata.

Example:

```ts
interface UiComponentRegistration<T> {
  type: string;
  schema: ZodType<T>;
  create(definition: T, services: UiRuntimeServices): UiComponentInstance;
  inspector: ComponentInspectorDescriptor;
}
```

Avoid a large central switch statement.

## 1.4 Generated content

Create:

```text
scripts/generate-presentation-content.ts
src/generated/presentationContent.generated.ts
```

Add:

```bash
npm run generate:presentation-content
```

The generator must:

1. Use authoritative schemas.
2. Validate cross-references.
3. Validate actions and bindings.
4. Resolve themes and assets.
5. Sort output deterministically.
6. Add an auto-generated warning.
7. Export a source hash.
8. Support stale-generation tests.

Wire it into relevant builds/tests.

## 1.5 Backward compatibility

Keep current `Hud` active while the new bundle and runtime contracts are introduced.

No behavior change in Milestone 1.

---

# Milestone 2 — Scene runtime and application flow migration

## 2.1 SceneRuntime

Implement:

```ts
class SceneRuntime {
  load(scene: SceneDefinition, context: SceneBindingContext): Promise<void>;
  update(context: SceneBindingContext): void;
  dispatch(event: PresentationEvent): void;
  unload(): void;
  dispose(): void;
}
```

Responsibilities:

- Build component tree once
- Cache binding handles
- Apply theme
- Attach safe action handlers
- Play enter/exit transitions
- Dispose nodes/listeners/resources

## 2.2 UI components

Implement only the components needed by current screens first:

```text
Container
Panel
Text
Button
Input
Horizontal
Vertical
Grid
Spacer
Conditional
Repeater
ProgressBar
Image
```

Support current layouts and styling before adding new capabilities.

## 2.3 Action registry

Create a typed, allowlisted action registry.

Register current actions:

```text
app.enter
app.createCrew
app.openJoin
app.joinCrew
app.ready
app.startPractice
app.openHowTo
app.back
app.leave
app.rematch
app.retry
app.resume
app.returnToMenu
app.copyRoomCode
```

Actions call existing application/network methods.

Scene content only references IDs.

## 2.4 AppFlowController

Extract flow ownership from `src/client/main.ts`.

It must manage:

- Current state
- Current scene
- Screen transitions
- Network-triggered changes
- Gameplay start/teardown
- Pointer lock policy
- Input enable policy
- Error state
- Results state
- Practice entry

Do not over-abstract networking. Keep the network client and current message contracts.

## 2.5 Migrate scenes incrementally

Order:

```text
boot
main
howto
create
join
ready
countdown
pause
error
results
```

For each scene:

1. Add content definition.
2. Add fixture preview state.
3. Render through `SceneRuntime`.
4. Run parity tests.
5. Remove only that scene's old construction path.

Maintain a compatibility adapter until all scenes migrate.

## 2.6 Remove hardcoded screen construction

After all scene gates pass:

- Remove `Hud.makeScreens()` or reduce `Hud` to a compatibility facade scheduled for Milestone 3 removal.
- Remove obsolete direct screen DOM queries.
- Keep stable IDs only where external tests genuinely require them; prefer data-node IDs and runtime lookup APIs.

---

# Milestone 3 — Gameplay HUD runtime migration

## 3.1 HudViewModel

Define a typed safe projection.

Do not bind content directly to `MatchState`.

Implement a `HudProjector` converting:

```text
MatchState
role
peer connection
ping
fps
pointer lock
practice state
projected objective
presentation state
```

into `HudViewModel`.

Document every field.

## 3.2 Binding registry

Support safe binding targets:

```text
text
value
visible
class
style token
attribute
```

Support registered transforms:

```text
number
integer
time
percentage
ratio
boolean class
role label
connection label
```

Do not add arbitrary expression evaluation.

Validate all source paths at build time.

## 3.3 HUD components

Implement components needed by the current HUD:

```text
RoleChip
ConnectionIndicator
Timer
Score
Combo
IntegrityBar
JackpotMeter
SpeedText
Prompt
Crosshair
CooldownArc
PipFrame
FpsText
PopupLayer
PauseButton
ObjectiveMarker
PracticeTag
```

Use generic components when sufficient; specialized components are acceptable for performance or canvas/SVG behavior.

## 3.4 High-frequency update strategy

Requirements:

- Build DOM once.
- Cache binding handles.
- Update only changed values.
- Avoid JSON traversal every frame by compiling accessors or binding handles.
- Do not rebuild component trees during normal gameplay.
- Measure update cost against current HUD.
- No per-frame listener allocation.

## 3.5 Event presentation

Migrate transient effects separately:

- Score popups
- Combo pulses
- Damage/hit feedback
- Countdown
- Result reveal
- Objective warning
- UI sounds

Use event-driven presenters.

## 3.6 Role themes and variants

Move driver/gunner colors and theme tokens into validated themes.

Support either:

```text
shared gameplay HUD + role theme
```

or:

```text
base HUD + role-specific override documents
```

Choose the simpler approach that preserves current layout.

## 3.7 Remove monolithic Hud ownership

After parity:

- Replace `HudController` thin forwarding with meaningful projection/runtime coordination.
- Remove obsolete cached DOM fields.
- Keep a small facade only if it simplifies call-site migration.

---

# Milestone 4 — Extensible project asset catalog

## 4.1 Split built-in required assets from project assets

Preserve the current required semantic IDs and fallback checks.

Add dynamic project asset validation.

Recommended APIs:

```ts
isBuiltInAssetId(id: string): boolean;
isProjectAssetId(id: string, catalog: ProjectAssetCatalog): boolean;
assertResolvableAssetId(id: string, catalog: AssetCatalog): void;
```

## 4.2 Namespaces

Allow project asset namespaces such as:

```text
custom.*
scene.*
environment.*
ui.*
```

Protect built-in required IDs.

Explicit replacement of a built-in may be supported through an override field, not an accidental duplicate.

## 4.3 Asset definitions

Support:

```text
model
image
texture
audio
vfx
uiTheme
postProcessPreset
```

Initial runtime support may remain strongest for models and themes, but schemas should be forward-compatible.

## 4.4 AssetService migration

Update manifest/catalog loading so:

- Built-in replacements continue working.
- Custom scene assets resolve.
- Unknown unregistered IDs are no longer blindly skipped if they are valid project catalog entries.
- Missing required assets use fallback.
- Missing required custom scene assets fail presentation-content validation.
- Optional assets use a documented placeholder/warning policy.
- Prototypes remain cached and cloned.

## 4.5 Import-ready metadata

Support metadata needed by a future importer:

```text
default transform
material overrides
socket definitions
collider definition
tags
thumbnail
LOD references
```

Do not build the complete importer UI in this milestone.

## 4.6 Authoring example

Add one sample custom scene asset and use it in a preview or migrated scene without adding it to the built-in required-ID array.

---

# Milestone 5 — Hybrid scenes and presentation preview

## 5.1 PresentationWorld

Implement a lightweight presentation-only Three.js scene host.

Support:

```text
Model
Camera
DirectionalLight
HemisphereLight
PointLight
RotateAnimation
FloatAnimation
LookAt
AudioSource
simple post-process preset
```

Do not instantiate gameplay simulation.

## 5.2 Renderer decision

Audit whether to:

- share a renderer host with gameplay, or
- use a separately disposed presentation renderer.

Document the decision with lifecycle and memory reasoning.

Do not keep two active expensive renderers unnecessarily.

## 5.3 Hybrid scenes

Add a hybrid capability to at least one scene, preferably Main Menu:

- 3D tank/model background
- UI overlay
- scene camera
- data-driven environment
- no gameplay state

Preserve an easy way to disable the 3D background for low-quality mode.

## 5.4 Preview tool

Create:

```text
tools/presentation-preview/
```

Commands:

```json
{
  "dev:presentation-preview": "vite --config tools/presentation-preview/vite.config.ts",
  "build:presentation-preview": "npm run generate:presentation-content && vite build --config tools/presentation-preview/vite.config.ts",
  "test:presentation": "vitest run tests/presentation"
}
```

Features:

- Scene selector
- HUD selector
- Preview-state selector
- Role selector
- Resolution presets
- Component hierarchy
- Binding diagnostics
- Asset diagnostics
- Theme selector
- UI/hybrid preview
- Responsive resize
- Screenshot-friendly stable mode

Keep preview dependencies out of the normal client bundle.

---

# Milestone 6 — Cleanup, tests, and docs

## 6.1 Remove compatibility code

Only after all parity gates pass:

- Remove old hardcoded scene HTML.
- Remove obsolete DOM field caches.
- Remove old screen map ownership.
- Remove duplicate theme sources.
- Remove obsolete asset validation paths.
- Keep migration helpers only when needed for old content.

## 6.2 Documentation

Create:

```text
docs/refractor02/REFRACTOR02_IMPLEMENTATION_REPORT.md
docs/refractor02/SCENE_AUTHORING_GUIDE.md
docs/refractor02/HUD_AUTHORING_GUIDE.md
docs/refractor02/PROJECT_ASSET_AUTHORING_GUIDE.md
```

Update:

```text
docs/README.md
docs/guides/ARCHITECTURE.md
docs/guides/ASSET_GUIDE.md
docs/guides/CONTENT_AUTHORING_GUIDE.md
docs/guides/SMOKE_TEST.md
docs/planning/BUILD_STATUS.md
```

Guides must include complete examples for:

1. Add a Credits scene.
2. Add a new HUD warning bound to an existing view-model field.
3. Add a new HUD field requiring a `HudViewModel` extension.
4. Add a custom GLB scene asset.
5. Add a new component type with inspector metadata.

---

# Required test coverage

## Schema/reference tests

- Valid definitions pass.
- Duplicate IDs fail.
- Unknown components fail.
- Unknown actions fail.
- Unknown bindings fail.
- Unknown transforms fail.
- Unknown assets fail.
- Invalid namespace fails.
- Cycles/depth excess fail.
- Missing required assets fail appropriately.
- Stale generated bundle fails.

## Component tests

For every core component:

- Mount
- Initial properties
- Binding update
- Visibility
- Action dispatch
- Dispose
- Listener cleanup

## Scene tests

- Load/unload
- Enter/exit transitions
- Theme
- Flow change
- Preview state
- Hybrid resource disposal

## HUD tests

- Driver projection
- Gunner projection
- Practice state
- Connection state
- Timer
- Score/combo
- Integrity
- Jackpot/cooldown
- Objective marker
- PIP
- Results events
- No full DOM rebuild
- Stable update performance

## Asset tests

- Required built-in fallback
- Built-in replacement
- Custom project model
- Missing custom critical asset
- Optional placeholder
- Transform/material metadata
- Prototype reuse
- Unknown unregistered ID

## E2E parity

Run the full user flow in two browsers:

```text
boot
main
create
join
ready
countdown
gameplay
results
rematch
leave
practice
pause/resume
disconnect/error
howto
```

Verify Driver and Gunner HUD states.

## Preview E2E

- Load every scene.
- Load Driver/Gunner HUD.
- Change preview states.
- Resize through presets.
- Load hybrid main menu.
- Report missing binding/asset errors.

---

# Performance and lifecycle gates

Measure and report:

- HUD update average and p95 time
- DOM node count before/after
- Event-listener cleanup
- Scene load/unload retained nodes
- Hybrid scene GPU resources after disposal
- Asset prototype count
- Normal game bundle size change
- Confirmation that preview code is absent from normal chunks

Acceptance:

- No repeated DOM tree rebuild per frame.
- No meaningful HUD frame-time regression.
- No retained scene resources after repeated transitions.
- No duplicate audio/action handlers after revisiting scenes.
- No second persistent renderer after entering gameplay unless explicitly justified.

---

# Build and regression commands

Add the new generation command to normal build as appropriate.

Run and report actual output:

```bash
npm run generate:map-profiles
npm run generate:presentation-content
npm run build
npm test
npm run test:demo
npm run test:e2e
npm run test:loop
npm run test:maps
npm run test:maps:sweep
npm run build:maplab
npm run test:maplab
npm run build:presentation-preview
npm run test:presentation
```

Do not rewrite deterministic golden fixtures merely to hide unintended behavior changes.

If an intentional presentation DOM structure change requires fixture migration, document it explicitly.

---

# Implementation report requirements

Create:

```text
docs/refractor02/REFRACTOR02_IMPLEMENTATION_REPORT.md
```

Include:

1. Current-state audit
2. Final architecture
3. Content schemas
4. Component registries
5. Generated bundle
6. SceneRuntime
7. AppFlowController
8. Safe actions
9. HudViewModel and projector
10. Binding runtime
11. HUD component migration
12. Asset catalog migration
13. Hybrid presentation world
14. Preview tool
15. Files added/modified
16. Compatibility paths removed
17. Unit test results
18. E2E results
19. Performance results
20. Bundle separation results
21. Remaining limitations
22. Recommended Studio editor next phase

---

# Completion gate

The refactor is complete only when:

1. All current non-playable screens are content-driven.
2. A new scene can be added without editing the central HUD implementation.
3. Current gameplay HUD structure is content-driven.
4. Existing HUD behavior is projected through a typed safe view model.
5. Existing actions and flow remain code-owned and tested.
6. New HUD elements using existing bindings can be added through content alone.
7. New binding fields require only a typed projector extension, not monolithic DOM changes.
8. Custom project assets can be registered without modifying the built-in required asset list.
9. Required gameplay assets still have guaranteed fallbacks.
10. Scene/HUD/asset references fail at build time when invalid.
11. Hybrid scenes can render presentation-only 3D content.
12. Preview tooling can inspect every scene and HUD state.
13. Registries expose inspector metadata for the future visual editor.
14. Preview/editor code is excluded from the normal game bundle.
15. Existing online, Practice, map, network, and presentation tests pass.

Final invariant:

> Presentation content defines what is shown and how it is laid out; tested runtime code defines what the game does.
