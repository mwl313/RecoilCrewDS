# Recoil Crew — Refractor 02 Design Document
## Data-Driven Scene, HUD, and Asset Authoring Foundation

**Repository:** `mwl313/RecoilCrewDS`  
**Target documentation directory:** `docs/refractor02/`  
**Proposed implementation base:** current `map-lab` branch or its latest successor  
**Primary goal:** make new scenes, custom assets, and HUD elements easy to add, edit, preview, validate, and eventually manipulate through Recoil Crew Studio without modifying central runtime code for every addition.

---

# 1. Executive summary

Yes, this refactor will make the following work substantially easier:

- Creating a new title, menu, lobby, tutorial, loading, credits, or results scene
- Adding a new HUD widget
- Moving, resizing, styling, or conditionally displaying HUD elements
- Creating role-specific HUD variants
- Adding 3D presentation backgrounds to menus
- Registering new project-specific models and scene props
- Replacing built-in models without touching gameplay code
- Previewing scenes with mocked runtime states
- Building a future drag-and-drop Scene/UI Editor
- Saving editor output as validated project content
- Keeping runtime behavior deterministic and testable

The current runtime has good foundations but several authoring bottlenecks:

1. Non-gameplay screens are constructed as hardcoded HTML inside `Hud`.
2. Gameplay HUD structure is also constructed in code.
3. Application flow is represented by hardcoded screen names and direct method calls.
4. `HudController` mostly forwards state into the monolithic `Hud`.
5. `RenderWorld` hardcodes the gameplay environment, lighting, fog, and post-processing setup.
6. The asset service is semantic and replaceable, but the valid asset ID set is fixed at compile time.
7. Unknown custom IDs in the manifest are rejected rather than becoming validated project assets.
8. There is no unified scene document, component registry, binding model, or action registry.

Refractor 02 replaces those bottlenecks with an editor-ready architecture.

---

# 2. Product boundary

This refactor is the **runtime and authoring foundation** for a future Recoil Crew Studio.

It is not intended to implement a complete Unity clone in one pass.

## Included

- Data-driven UI and hybrid scene definitions
- Data-driven gameplay HUD layouts
- Shared component schemas
- Safe state bindings
- Safe action registry
- Scene flow definitions
- Dynamic project asset catalog
- Built-in asset fallback guarantees
- Scene and HUD preview runtime
- Generated client-safe bundles
- Validation and migration tooling
- Inspector metadata for future visual editing
- Current screen and HUD migration
- Regression tests
- Documentation

## Not included in this refactor

- Full mouse-based visual scene editor
- Terrain sculpting
- Manual map object placement
- Multiplayer simulation workspace
- Generator node graph
- Arbitrary user-authored JavaScript
- General game scripting language
- Shader graph
- Animation state-machine editor
- Full GLB optimization/conversion pipeline
- Direct GitHub commits from the browser

Those can be implemented safely after this foundation exists.

---

# 3. Governing architecture principles

## 3.1 Data describes presentation; code owns behavior

Scene and HUD JSON may describe:

- Structure
- Layout
- Styling
- Models
- Lights
- Cameras
- Bindings
- Transitions
- Whitelisted actions

It may not execute arbitrary JavaScript.

```text
JSON content
→ schema validation
→ generated client bundle
→ component registry
→ runtime instances
```

## 3.2 Gameplay remains authoritative and code-driven

The refactor must not move authoritative gameplay rules into scene documents.

Scene/HUD content can read projected view state but cannot mutate the authoritative match directly.

Actions invoke existing application commands through an allowlisted registry.

## 3.3 Built-in assets remain safe

Required semantic assets continue to have registered procedural fallbacks.

Custom project assets extend the catalog but do not weaken fallback guarantees for required gameplay assets.

## 3.4 Editor and runtime use the same documents

The future editor must not create a separate scene format.

```text
Scene Editor
→ SceneDefinition JSON
→ same validator
→ same runtime renderer
```

## 3.5 New components are registry additions, not central switches

Adding a new UI or scene component should require:

1. Component schema
2. Runtime factory
3. Inspector descriptor
4. Focused tests

It should not require editing one enormous `Hud` class or a central chain of `if` statements.

## 3.6 Existing behavior remains available during migration

Each migration phase must leave a working game.

A compatibility adapter may temporarily host the old HUD/screens until a scene is migrated.

---

# 4. Current-to-target architecture

## 4.1 Current

```text
src/client/main.ts
├── hardcoded application flow
├── calls Hud methods directly
└── constructs gameplay

src/client/hud.ts
├── creates all screen HTML
├── creates gameplay HUD HTML
├── caches individual DOM nodes
├── binds actions
├── updates runtime values
├── applies themes
└── handles many effects and events

src/client/app/hudController.ts
└── thin forwarding wrapper

src/client/app/renderWorld.ts
├── hardcoded scene environment
├── hardcoded lights/fog/stars
├── arena
├── VFX
└── post-processing

AssetService
├── fixed valid semantic IDs
├── optional replacement manifest
└── procedural fallbacks
```

## 4.2 Target

```text
AppFlowController
├── application state machine
├── SceneRuntime selection
└── registered application commands

SceneRuntime
├── UI scene renderer
├── hybrid 3D presentation scene
├── scene-local binding context
├── transition player
└── lifecycle/disposal

HudRuntime
├── gameplay HUD document
├── projected HUD view model
├── component instances
├── high-frequency binding updates
└── event presentation

ComponentRegistry
├── UI components
├── 3D presentation components
├── behavior components
└── inspector metadata

AssetCatalog
├── required built-ins with fallbacks
├── project custom assets
├── scene-only assets
└── manifest/runtime metadata

Content pipeline
content/scenes/*.json
content/hud/*.json
content/assets/*.json
content/scene-flows/*.json
      ↓
schema/reference validation
      ↓
src/generated/presentationContent.generated.ts
      ↓
runtime and Studio preview
```

---

# 5. Proposed content structure

```text
content/
├── scenes/
│   ├── boot.json
│   ├── mainMenu.json
│   ├── createCrew.json
│   ├── joinCrew.json
│   ├── readyLobby.json
│   ├── countdown.json
│   ├── results.json
│   ├── error.json
│   ├── pause.json
│   └── howTo.json
├── hud/
│   ├── gameplay.json
│   ├── driver.json
│   └── gunner.json
├── scene-flows/
│   └── primary.json
├── assets/
│   ├── builtins.json
│   └── project.json
├── themes/
│   ├── base.json
│   ├── driver.json
│   └── gunner.json
└── presentation/
    └── demoScoreAttack.json
```

The exact split may be adjusted after inspecting the existing content loader. The important property is that every file is schema-validated and reference-checked.

---

# 6. Scene document model

## 6.1 Scene definition

```ts
export interface SceneDefinition {
  id: string;
  label: string;
  type: "ui" | "hybrid" | "gameplayOverlay";

  root: UiNodeDefinition;

  environment?: PresentationEnvironmentDefinition;
  entities?: SceneEntityDefinition[];
  cameras?: CameraDefinition[];
  audio?: SceneAudioDefinition[];

  enterTransition?: TransitionDefinition;
  exitTransition?: TransitionDefinition;

  previewStates?: PreviewStateDefinition[];
  editor?: SceneEditorMetadata;
}
```

## 6.2 UI node

```ts
export interface UiNodeDefinition {
  id: string;
  type: UiComponentType;

  layout?: LayoutDefinition;
  style?: StyleDefinition;

  text?: string;
  assetId?: string;

  bindings?: BindingDefinition[];
  actions?: ActionBindingDefinition[];
  animations?: AnimationDefinition[];

  visible?: boolean;
  children?: UiNodeDefinition[];

  editor?: NodeEditorMetadata;
}
```

Every node ID must be stable and unique within the scene.

Stable IDs support:

- Runtime references
- Editor selection
- Diffs
- Undo/redo
- Automated tests
- Binding diagnostics
- Migrations

## 6.3 Scene entities

```ts
export interface SceneEntityDefinition {
  id: string;
  transform: TransformDefinition;
  components: SceneComponentDefinition[];
  children?: SceneEntityDefinition[];
  editor?: EntityEditorMetadata;
}
```

Initial presentation components:

- Model
- DirectionalLight
- HemisphereLight
- PointLight
- Camera
- RotateAnimation
- FloatAnimation
- AudioSource
- ParticleEmitter
- Billboard
- LookAt
- PostProcessPreset

These are presentation-only components. Gameplay entities remain owned by `GameClient` and the simulation.

---

# 7. UI component registry

## 7.1 Core component types

Initial registry:

```text
Container
Panel
Text
Image
Button
Input
ProgressBar
ArcMeter
RoleChip
ConnectionIndicator
StatText
Crosshair
PictureInPictureFrame
ObjectiveMarker
Repeater
Conditional
Spacer
ScrollView
ModelPreview
```

## 7.2 Layout types

```text
Absolute
Anchor
Horizontal
Vertical
Grid
Overlay
Flow
```

Each component supports only the layout properties meaningful to it.

## 7.3 Component contract

```ts
export interface UiComponentInstance {
  readonly id: string;
  readonly element: HTMLElement;

  mount(parent: HTMLElement): void;
  update(context: BindingContext): void;
  handleEvent?(event: PresentationEvent): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}
```

## 7.4 Component registration

```ts
export interface UiComponentRegistration<TDefinition> {
  type: string;
  schema: ZodType<TDefinition>;
  create(definition: TDefinition, services: UiRuntimeServices): UiComponentInstance;
  inspector: ComponentInspectorDescriptor;
}
```

This is the key editor-enabling contract.

A future visual editor can read `inspector` metadata to construct property panels automatically.

---

# 8. HUD architecture

## 8.1 Separate layout from data projection

Current match state must not be exposed directly to arbitrary JSON paths.

Introduce an explicit `HudViewModel`.

```ts
export interface HudViewModel {
  role: "driver" | "gunner";
  practice: boolean;

  connection: {
    peerConnected: boolean;
    pingMs: number;
    fps: number;
  };

  match: {
    timeRemaining: number;
    score: number;
    combo: number;
    phase: string;
  };

  tank: {
    integrity: number;
    integrityMax: number;
    speed: number;
    grounded: boolean;
    dashReady: boolean;
  };

  gunner: {
    jackpot: number;
    jackpotMax: number;
    cannonCooldown: number;
    machineGunHeat?: number;
  };

  objective: {
    visible: boolean;
    screenX: number;
    screenY: number;
    label?: string;
  };

  pip: {
    visible: boolean;
    roleLabel: string;
    connected: boolean;
  };
}
```

`HudProjector` converts authoritative/interpolated state and client context into this safe view model.

## 8.2 Binding definitions

```ts
export interface BindingDefinition {
  target: "text" | "value" | "visible" | "class" | "style" | "attribute";
  source: string;
  format?: string;
  transform?: BindingTransformId;
  fallback?: unknown;
}
```

Examples:

```json
{
  "target": "text",
  "source": "match.score",
  "format": "{0}"
}
```

```json
{
  "target": "value",
  "source": "tank.integrity",
  "transform": "ratio:tank.integrityMax"
}
```

Only registered binding paths and transforms are accepted.

## 8.3 High-frequency updates

HUD updates may occur every frame.

Do not rebuild DOM every frame.

At scene load:

```text
JSON
→ component instances
→ cached binding handles
```

At runtime:

```text
HudViewModel
→ compare selected binding values
→ mutate only changed DOM properties
```

## 8.4 Event-driven presentation

Transient effects remain event-driven:

- Score popups
- Hit flashes
- Combo pulse
- Countdown animation
- Results reveal
- Objective warnings

Use `PresentationEventRouter` or a dedicated `HudEventPresenter`.

Do not force all transient effects into continuous bindings.

---

# 9. Scene flow and safe actions

## 9.1 Scene flow definition

```ts
export interface SceneFlowDefinition {
  id: string;
  initialSceneId: string;
  states: SceneFlowStateDefinition[];
  transitions: SceneFlowTransitionDefinition[];
}
```

Application state remains code-controlled, but scene selection becomes data-driven.

## 9.2 Action registry

Scene JSON references action IDs:

```json
{
  "event": "click",
  "action": "app.createCrew"
}
```

Runtime registry:

```ts
export interface SceneActionRegistry {
  register(id: string, handler: SceneActionHandler): void;
  execute(id: string, payload?: unknown): Promise<void> | void;
}
```

Initial action IDs:

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

Actions must be registered in code and validated by ID.

No inline JavaScript, expressions, or `eval`.

## 9.3 Navigation ownership

`AppFlowController` owns:

- Current flow state
- Current scene
- Network-driven transitions
- Scene lifecycle
- Input lock/release policy
- Gameplay startup/teardown

Scene buttons request actions. They do not directly manipulate network or gameplay objects.

---

# 10. Hybrid and non-playable 3D scenes

## 10.1 Presentation world

Add a lightweight `PresentationWorld` separate from gameplay `RenderWorld`.

```ts
export class PresentationWorld {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;

  load(definition: SceneDefinition): Promise<void>;
  update(dt: number): void;
  render(): void;
  resize(width: number, height: number): void;
  dispose(): void;
}
```

It supports:

- Title backgrounds
- Rotating tank preview
- Lobby showcase
- Results podium
- Credits backgrounds
- Model preview widgets

It does not instantiate gameplay simulation.

## 10.2 Shared renderer strategy

Choose one of two approaches after audit:

### Option A — one renderer, two scene hosts

Preferred when lifecycle is manageable.

```text
ClientRendererHost
├── PresentationWorld
└── RenderWorld
```

### Option B — separate lightweight presentation renderer

Simpler migration, but potentially more GPU memory.

The implementation plan must measure and choose explicitly.

## 10.3 Environment definitions

```ts
export interface PresentationEnvironmentDefinition {
  background: string | number;
  fog?: FogDefinition;
  lights?: LightDefinition[];
  postProcessPresetId?: string;
  cameraId?: string;
}
```

Move hardcoded menu environment values into scene data.

Gameplay environment may remain separate initially and migrate later if useful.

---

# 11. Theme and style system

## 11.1 Design tokens

```ts
export interface ThemeDefinition {
  id: string;

  colors: Record<string, string>;
  spacing: Record<string, number>;
  typography: Record<string, TypographyToken>;
  radii: Record<string, number>;
  shadows: Record<string, string>;
  motion: Record<string, number>;
}
```

Example tokens:

```text
color.background
color.panel
color.text
color.muted
color.driver
color.gunner
color.warning
color.danger

space.xs
space.sm
space.md
space.lg

font.display
font.body
font.mono
```

## 11.2 Style definitions

Scene nodes reference tokens where possible:

```json
{
  "background": "$color.panel",
  "color": "$color.text",
  "padding": "$space.md"
}
```

Raw values remain available for exceptional cases.

## 11.3 Generated CSS variables

At load:

```text
ThemeDefinition
→ CSS custom properties
```

This retains the efficiency of CSS while making style authoring data-driven.

---

# 12. Asset catalog refactor

## 12.1 Asset categories

```ts
export type ProjectAssetCategory =
  | "model"
  | "texture"
  | "image"
  | "fontReference"
  | "audio"
  | "vfx"
  | "uiTheme"
  | "postProcessPreset";
```

Actual font files must remain project-owned and licensed; the editor should reference them, not embed arbitrary external fonts automatically.

## 12.2 Built-in versus project assets

```ts
export interface AssetCatalog {
  required: RequiredAssetDefinition[];
  project: ProjectAssetDefinition[];
}
```

Required IDs retain fallback enforcement.

Custom IDs use allowed namespaces:

```text
custom.*
scene.*
ui.*
environment.*
prop.*
```

Existing built-in namespaces remain protected from accidental duplicate definitions unless an explicit override is permitted.

## 12.3 Project asset definition

```ts
export interface ProjectAssetDefinition {
  id: string;
  category: ProjectAssetCategory;
  file?: string;

  transform?: TransformDefinition;
  materials?: MaterialOverrideDefinition[];
  sockets?: SocketDefinition[];
  collider?: ColliderDefinition;
  metadata?: Record<string, string | number | boolean>;
}
```

## 12.4 Resolution behavior

```text
required built-in ID
→ project replacement file
→ built-in procedural fallback

custom project ID
→ project file
→ explicit placeholder/failure policy
```

Custom assets may use an editor placeholder if missing, but critical runtime scenes must fail validation before build if required references are unresolved.

## 12.5 Catalog lookup

Replace the current global fixed-ID validity check with:

```ts
isBuiltInAssetId(id)
isProjectAssetId(id, catalog)
assertResolvableAssetId(id, catalog)
```

Gameplay-required IDs remain compile-time known.

Scene and project assets are content-validated.

## 12.6 Import-ready metadata

The catalog schema should already support the future model importer:

- Bounding box
- Default transform
- Pivot policy
- Material overrides
- Collider profile
- LOD references
- Thumbnail path
- Tags

The full file-import UI is outside this refactor.

---

# 13. Content generation pipeline

## 13.1 Generated bundle

Create:

```text
scripts/generate-presentation-content.ts
        ↓
src/generated/presentationContent.generated.ts
```

The generator:

1. Loads scene, HUD, flow, theme, and asset definitions.
2. Runs Zod schemas.
3. Resolves references.
4. Ensures unique IDs.
5. Ensures action and binding IDs exist.
6. Ensures required assets resolve.
7. Produces deterministic TypeScript.
8. Produces a source hash.
9. Fails on stale generated output in tests.

## 13.2 Runtime does not fetch authoring JSON

The normal game can consume the generated bundle directly.

This provides:

- Build-time validation
- Stable startup
- Client-safe data
- Easy editor parity
- Deterministic tests

## 13.3 Studio preview

The future Studio may load working JSON dynamically through a local bridge, validate it, and pass it into the same runtime factories.

---

# 14. Editor metadata

Each schema may include an optional `editor` block ignored by runtime behavior.

```ts
export interface NodeEditorMetadata {
  locked?: boolean;
  hidden?: boolean;
  notes?: string;
  color?: string;
  collapsed?: boolean;
}
```

Component registry inspector metadata:

```ts
export interface InspectorFieldDescriptor {
  path: string;
  label: string;
  type: "number" | "text" | "boolean" | "select" | "color" | "asset" | "binding";
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
}
```

This is the bridge to future automatic property panels.

---

# 15. Scene and HUD preview tool

Refractor 02 should include a focused preview tool even if the full visual editor is deferred.

```text
tools/presentation-preview/
├── index.html
├── vite.config.ts
└── src/
```

Features:

- Select scene
- Select preview state
- Select resolution
- Toggle role
- Toggle network conditions
- Preview UI or hybrid 3D scene
- Inspect component hierarchy
- Show binding values
- Show unresolved references
- Reload current generated content
- Capture screenshots for regression tests

This validates the architecture and materially improves authoring immediately.

---

# 16. Migration strategy

## Phase 0 — Audit and contracts

- Inventory every screen and HUD element.
- Inventory every direct DOM query.
- Inventory all flow transitions.
- Inventory all asset IDs and references.
- Inventory current CSS dependencies.
- Define schemas and registries.
- Add golden screenshots or DOM snapshots for current presentation.

## Phase 1 — Presentation content pipeline

- Add schemas.
- Add content directories.
- Add generated bundle.
- Add reference validation.
- Add stale-file test.
- Keep old runtime active.

## Phase 2 — Scene runtime and flow controller

- Add `SceneRuntime`.
- Add `AppFlowController`.
- Add action registry.
- Migrate Boot and Main Menu first.
- Keep compatibility adapter for remaining screens.

## Phase 3 — Remaining non-gameplay scenes

Migrate:

- Create Crew
- Join Crew
- Ready Lobby
- Countdown
- Results
- Error
- Pause
- How To Play

After parity tests, remove hardcoded `makeScreens()`.

## Phase 4 — Gameplay HUD runtime

- Define `HudViewModel`.
- Add `HudProjector`.
- Add component bindings.
- Migrate static HUD structure.
- Migrate transient event presentation.
- Preserve PIP, crosshair, cooldown arc, objective marker, and popups.
- Remove per-element ownership from monolithic `Hud`.

## Phase 5 — Asset catalog

- Split built-in required IDs from project IDs.
- Generate project asset catalog.
- Update manifest loader and AssetService.
- Migrate current manifest.
- Add missing/custom asset diagnostics.

## Phase 6 — Hybrid scenes and preview

- Add `PresentationWorld`.
- Add model, camera, lights, and simple animation components.
- Add presentation preview tool.
- Add mocked states and responsive previews.

## Phase 7 — Cleanup and documentation

- Remove compatibility code.
- Update guides.
- Add examples for a new scene, HUD element, and custom asset.
- Update build status.

---

# 17. Adding content after the refactor

## 17.1 Add a new scene

Expected workflow:

```text
1. Create content/scenes/credits.json
2. Reference registered UI/3D components
3. Add scene to scene flow
4. Preview it
5. Run validation
6. No central Hud class edit
```

## 17.2 Add a HUD element

Example: team damage warning.

```text
1. Add field to HudViewModel
2. Project value in HudProjector
3. Add node to content/hud/gameplay.json
4. Add binding
5. Add tests
```

No manual `getElementById`, cached field, and update branch are needed.

For an element using an existing view-model field, only the HUD document changes.

## 17.3 Add a custom asset

```text
1. Place GLB/image/audio under public/assets/
2. Add ProjectAssetDefinition
3. Reference custom ID from scene or HUD
4. Generate content
5. Preview and validate
```

No addition to a central hardcoded required-ID array is needed for non-required custom assets.

---

# 18. Testing strategy

## 18.1 Schema tests

- Valid scenes accepted
- Unknown component rejected
- Duplicate node IDs rejected
- Unknown actions rejected
- Unknown binding paths rejected
- Unknown assets rejected
- Invalid project namespaces rejected
- Cyclic scene/entity hierarchy rejected
- Required assets retain fallbacks

## 18.2 Runtime tests

- Mount/update/dispose components
- Scene transitions
- Action execution
- Binding updates only changed properties
- Hidden/conditional components
- Theme application
- Role variants
- Hybrid scene lifecycle
- Asset resolution and fallback

## 18.3 Parity tests

Before deleting old screens:

- Same screen copy
- Same button actions
- Same room flow
- Same ready flow
- Same countdown
- Same result stats
- Same pause/error behavior
- Same HUD values
- Same PIP visibility
- Same role theming

## 18.4 E2E

- Boot to Main
- Create room
- Join room
- Ready
- Countdown
- Gameplay HUD
- Results
- Rematch
- Pause/resume
- Disconnect/error
- Practice
- How To
- New sample scene
- Custom asset scene preview

## 18.5 Performance

- No DOM rebuild per frame
- Binding update budget measured
- Scene disposal has no retained nodes/listeners
- Presentation renderer disposed
- Asset prototypes reused
- Normal game bundle excludes preview/editor code

---

# 19. Build commands

Proposed:

```json
{
  "scripts": {
    "generate:presentation-content": "tsx scripts/generate-presentation-content.ts",
    "dev:presentation-preview": "vite --config tools/presentation-preview/vite.config.ts",
    "build:presentation-preview": "npm run generate:presentation-content && vite build --config tools/presentation-preview/vite.config.ts",
    "test:presentation": "vitest run tests/presentation"
  }
}
```

Normal build:

```text
generate map profiles
generate presentation content
build client
build server
```

---

# 20. Risks and mitigations

## Risk: over-generalized UI engine

Mitigation:

- Support only components Recoil Crew currently needs.
- Add registry extensions incrementally.
- Avoid implementing a browser framework from scratch.

## Risk: performance regression

Mitigation:

- Compile binding handles once.
- Update changed properties only.
- Keep transient VFX event-driven.
- Benchmark current and new HUD.

## Risk: migration breaks flow

Mitigation:

- Migrate one scene at a time.
- Use a compatibility adapter.
- Maintain E2E parity gates.

## Risk: custom assets weaken safety

Mitigation:

- Required IDs remain protected.
- Project assets are schema-validated.
- Missing critical references fail build.

## Risk: content documents become code

Mitigation:

- No expressions or arbitrary scripts.
- Whitelisted actions and transforms only.
- Keep application logic in controllers.

## Risk: one giant Codex rewrite

Mitigation:

- Mandatory milestone commits/checkpoints.
- Tests after each migrated scene.
- Do not remove compatibility code early.

---

# 21. Recommended directory structure

```text
src/shared/presentation/
├── sceneTypes.ts
├── uiTypes.ts
├── bindingTypes.ts
├── assetCatalogTypes.ts
└── schemas/

src/client/presentation/
├── sceneRuntime.ts
├── appFlowController.ts
├── actionRegistry.ts
├── bindingRuntime.ts
├── hudProjector.ts
├── hudRuntime.ts
├── presentationWorld.ts
├── themeRuntime.ts
├── componentRegistry.ts
├── components/
└── scene-components/

src/generated/
└── presentationContent.generated.ts

content/scenes/
content/hud/
content/scene-flows/
content/assets/
content/themes/

scripts/
└── generate-presentation-content.ts

tools/presentation-preview/
tests/presentation/
docs/refractor02/
```

Adapt naming to repository conventions after the audit.

---

# 22. Acceptance criteria

Refractor 02 is complete only when:

1. New non-gameplay scenes can be added through validated content without editing the monolithic HUD implementation.
2. Existing Boot, Main, Create, Join, Ready, Countdown, Results, Error, Pause, and How To scenes run through `SceneRuntime`.
3. Gameplay HUD structure is defined through a validated HUD document.
4. HUD values are supplied through a typed `HudViewModel`.
5. Existing HUD behavior and performance remain within accepted parity.
6. Scene actions are allowlisted and code-owned.
7. Scene and HUD bindings cannot access arbitrary runtime objects.
8. New project asset IDs can be added without modifying the built-in required-ID list.
9. Required gameplay assets still have guaranteed fallbacks.
10. Scene and asset references are checked at build time.
11. UI and hybrid scenes can be previewed outside a match.
12. Component registrations include inspector descriptors for the future editor.
13. Generated presentation content has deterministic output and stale-file detection.
14. Normal gameplay bundles exclude preview/editor-only code.
15. Existing game, map, network, Practice, and E2E tests pass.
16. Documentation demonstrates adding:
    - one new scene,
    - one new HUD element,
    - one new custom model.

---

# 23. Final design invariant

> Recoil Crew presentation should be authored as validated scenes, components, bindings, themes, and asset references, while application behavior and authoritative gameplay remain owned by tested code.

This refactor does not merely clean up the current HUD. It creates the stable document and runtime boundary required for a powerful future Recoil Crew Studio.
