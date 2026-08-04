# Recoil Crew — Gameplay 04 Design
## Single Player Mode, Partner-Camera Removal, and Model-Driven Weapon Alignment

**Repository:** `mwl313/RecoilCrewDS`  
**Target branch:** latest branch containing the current `map-lab` implementation  
**Target repository path:** `docs/gameplay04/PLAYER_MODE_PIP_AND_AIM_ALIGNMENT_DESIGN.md`

---

# 1. Executive summary

This milestone makes three focused product changes:

1. Remove the opposite-role picture-in-picture camera completely.
2. Replace Practice with a proper Single Player mode.
3. Make the crosshair, turret, muzzle, projectile origin, and future tank models use one shared data-driven weapon-mount geometry contract.

These changes must preserve:

- Current authoritative multiplayer netcode
- Shared tank prediction for Driver and Gunner
- Immediate Gunner action feedback
- Exact recoil impulse handling
- Current map generation
- Current content-driven presentation architecture
- Current deterministic simulation
- Current semantic asset system

The implementation must not add parallel hardcoded paths.

---

# 2. Current repository findings

## 2.1 Partner PIP is a real additional render path

The current game creates a `PipRenderer` for every `GameClient`.

It:

- Creates a separate `PipCamera`
- Automatically selects the opposite role
- Performs another world render
- Runs at a configured reduced rate
- Has its own quality scale
- Adds HUD frame, label, status, and jackpot state
- Adds PIP-specific performance metrics
- Adds PIP-specific adaptive-quality controls

The requested change is therefore not a CSS hide.

The feature should be removed from:

```text
GameClient wiring
frame render path
camera classes
HUD content
HUD view model
HUD binding paths
quality manager
network tuning
metrics/debug overlay
styles
tests
```

## 2.2 Practice is already a combined-control local match

The current Practice path already:

- Creates a local `Match`
- Runs the same fixed-step simulation
- Samples Driver input
- Samples Gunner aim and weapon input
- Allows one player to control both systems
- Uses current map generation
- Produces normal results

However, it is still represented as a special debug-like state:

```text
mode = "practice"
practiceMatch
practiceViewRole
togglePracticeView()
PRACTICE menu label
PRACTICE HUD tag
Driver/Gunner role chip
Tab/Q role swap
multiplayer-shaped results/rematch data
```

Single Player should keep the combined controls while becoming a first-class session mode.

## 2.3 Weapon geometry is duplicated and inconsistent

The authoritative simulation computes its muzzle using hardcoded offsets:

```text
forward distance: 2.7
base height: 1.55
pitch height term: 1.4
```

The rendered tank rig uses different hardcoded offsets:

```text
turret pivot:  [0, 1.15, 0]
barrel pivot:  [0, 0.62, 0]
muzzle local:  [0, 0.75, 2.9]
```

Local Practice and predicted Gunner VFX repeat the same client-only muzzle vector manually.

The aiming code also uses a hardcoded pivot approximately at:

```text
tank position + [0, 1.15, 0]
```

This produces several possible disagreements:

```text
camera center aim point
turret pivot
visual barrel direction
visual muzzle position
authoritative muzzle position
projectile spawn position
local muzzle flash position
```

The crosshair cannot be trustworthy while these paths use different geometry.

## 2.4 The asset system already supports socket metadata

Project asset definitions already support named socket metadata.

This should be reused for future imported tank models.

However, authoritative firing cannot depend only on a client-side GLB node. Shared numeric geometry must remain available to the server.

---

# 3. Goals

## 3.1 Partner-camera removal

- No Driver view on the Gunner screen
- No Gunner view on the Driver screen
- No partner camera frame
- No partner status label
- No extra PIP render
- No PIP-specific quality or network tuning
- No dead PIP code remaining after migration

## 3.2 Single Player

- Main menu says `SINGLE PLAYER`
- One player controls driving, aiming, and weapons simultaneously
- No Driver/Gunner role label
- No Practice tag
- No role swapping
- No Tab/Q swap control
- No peer-connection UI
- No multiplayer room required
- Single Player and Multiplayer share systems, not duplicated simulations
- Single Player has its own rules mode ID so mechanics can diverge later
- Results offer a local restart rather than a two-player rematch vote

## 3.3 Crosshair and muzzle alignment

- Crosshair represents the actual predicted shot path
- Authoritative firing and rendered firing use identical geometry
- Local muzzle flash appears at the real muzzle
- Cannon, MG, and JACKPOT share the same mount resolver
- Tank model changes can adjust sockets through data
- Default procedural assets retain fallback geometry
- Imported models can use named nodes or numeric offsets
- No hardcoded muzzle vectors remain in gameplay or presentation paths

---

# 4. Non-goals

This milestone does not include:

- New Single Player enemy AI
- AI-controlled partner roles
- Split-screen multiplayer
- New scoring balance
- New enemy counts
- New Single Player-only items
- Full ballistic-drop crosshair
- Target leading
- Aim assist
- New tank models
- A full tank-rig visual editor
- Weapon customization UI
- Replacing the existing asset importer
- Rewriting multiplayer netcode

The architecture must allow later divergence without implementing it now.

---

# 5. Feature A — Remove the opposite-role camera

# 5.1 Runtime removal

Remove the current PIP runtime path.

Expected removals include:

```text
src/client/app/pipRenderer.ts
PipRenderer import and field in GameClient
PipRenderer creation in GameClient.create()
PipRenderer reset
PipRenderer update/render call
PipCamera class if no longer referenced
RenderWorld PIP-only methods if no longer referenced
```

Audit references before deleting files.

Do not preserve an invisible PIP render.

## 5.2 Quality removal

Remove PIP-specific quality controls:

```text
setPipRate
setPipScale
pip normal/low Hz
pip scale
PIP-first degrade logic
```

After removal, adaptive quality should manage only actual remaining render features.

Do not leave callbacks that mutate a deleted renderer.

## 5.3 HUD removal

Delete from the gameplay HUD:

```text
pip node
pip frame component
pip label
pip status
pip jackpot class
```

Remove from:

```text
HudViewModel
emptyHudViewModel()
HudProjector
HUD_BINDING_PATHS
preview states
component registry
component schemas
styles
tests
```

If `pipFrame` is not used by any other document, remove the component type and runtime implementation.

## 5.4 Metrics removal

Remove:

```text
pipRenderMs
PIP rate metrics
PIP scale metrics
PIP debug-overlay rows
PIP performance tests
```

Replace any overall frame-budget assumptions with main-view-only measurements.

## 5.5 Acceptance

A gameplay frame must contain exactly one normal world render, excluding deliberate post-processing passes inside that render.

A regression test should fail if a second role camera render is reintroduced.

---

# 6. Feature B — First-class Single Player mode

# 6.1 Terminology

Final product terminology:

```text
Multiplayer
Single Player
```

Remove player-facing and runtime terminology:

```text
Practice
practice
practiceMatch
practiceViewRole
togglePracticeView
```

Test fixture names may retain historic terminology only temporarily during migration.

Final production paths should use Single Player terminology.

---

# 6.2 Runtime session kind

Introduce a clear session kind:

```ts
export type GameSessionKind =
  | "multiplayer"
  | "singlePlayer";
```

`GameClient` should not use:

```ts
mode: "online" | "practice"
```

Recommended replacement:

```ts
interface GameSessionContext {
  kind: GameSessionKind;
  networked: boolean;
  localControl: "assignedRole" | "combined";
  rulesModeId: string;
}
```

The client may hold a compact runtime enum plus the resolved content policy.

---

# 6.3 Data-driven session policy

Extend the existing mode definition schema with a session policy.

Recommended:

```ts
export interface ModeSessionPolicy {
  kind: "multiplayer" | "singlePlayer";

  networkRequired: boolean;

  controlScheme:
    | "assignedRole"
    | "combinedDriverAndGunner";

  showRoleIdentity: boolean;
  showPeerStatus: boolean;
  allowRoleSwap: boolean;

  resultsFlow:
    | "crewRematchVote"
    | "localRestart";
}
```

JSON shape:

```json
{
  "session": {
    "kind": "singlePlayer",
    "networkRequired": false,
    "controlScheme": "combinedDriverAndGunner",
    "showRoleIdentity": false,
    "showPeerStatus": false,
    "allowRoleSwap": false,
    "resultsFlow": "localRestart"
  }
}
```

Backward-compatible default for old mode fixtures may be multiplayer.

Do not keep a separate hardcoded `practice` boolean as the final source of truth.

---

# 6.4 Mode content

Keep the current multiplayer regression mode:

```text
mode.demoScoreAttack
```

Add:

```text
mode.singlePlayerScoreAttack
```

Initially, the Single Player mode may reference the same:

```text
tank
loadout
objective
spawn director
scoring
results
difficulty
map
presentation
```

This is intentional.

The separate mode ID creates the future divergence seam.

Example:

```json
{
  "id": "mode.singlePlayerScoreAttack",
  "label": "Single Player Score Attack",
  "description": "Local combined-control score attack.",
  "mapProfileId": "map.arena400Primary",
  "difficulty": "difficulty.standard",
  "tank": "tank.default",
  "loadout": "loadout.default",
  "objectives": ["objective.highScore"],
  "spawnDirector": "spawn.director.demoScoreAttack",
  "scoring": "scoring.demoScoreAttack",
  "results": "results.demoScoreAttack",
  "presentation": "presentation.demoScoreAttack",
  "session": {
    "kind": "singlePlayer",
    "networkRequired": false,
    "controlScheme": "combinedDriverAndGunner",
    "showRoleIdentity": false,
    "showPeerStatus": false,
    "allowRoleSwap": false,
    "resultsFlow": "localRestart"
  },
  "behaviors": ["behavior.mode.demoScoreAttack"]
}
```

The multiplayer mode receives the explicit multiplayer policy.

---

# 6.5 Match construction

The current local mode constructs a `Match` through the legacy no-pack path.

Single Player should resolve:

```text
ContentPack
→ mode.singlePlayerScoreAttack
→ MatchRules
→ MatchRuntime
```

Do not create a second simulation implementation.

Extend match creation APIs cleanly:

```ts
MatchRuntime.fromContentPackWithWorld(
  pack,
  matchId,
  world,
  modifier,
  modeId
)
```

or an options object:

```ts
new Match({
  matchId,
  pack,
  world,
  modifier: "none",
  modeId: "mode.singlePlayerScoreAttack"
});
```

Prefer an options object if constructor growth becomes unclear.

The server continues using the multiplayer mode.

Single Player runs locally and does not require an active room.

---

# 6.6 Combined controls

Single Player always consumes both input groups:

```text
WASD / movement keys
Shift dash
Space jump
Mouse aim
Primary weapon
Secondary weapon
Ability
Recenter
Pause
```

The camera/control behavior should initially preserve the current Practice feel.

The implementation must not simulate alternating roles.

Do not implement:

```text
current practice view role
role swap state
role swap camera
role swap input mapping
```

---

# 6.7 Remove swapping

Remove:

```text
Tab swap
Q swap
swapPressed
consumeSwap()
togglePracticeView()
practiceViewRole
```

Audit tests and control instructions.

Do not reassign Tab/Q to new actions in this milestone.

---

# 6.8 Main menu and actions

Change:

```text
PRACTICE
→ SINGLE PLAYER
```

Change the action:

```text
app.startPractice
→ app.startSinglePlayer
```

Update:

```text
ACTION_IDS
flow types
SceneActionRegistry
AppFlowHandlers
Hud handlers
main menu scene
main.ts binding
tests
preview fixtures
```

Remove `app.startPractice` after migration unless a documented temporary compatibility alias is required.

Do not leave both production actions indefinitely.

---

# 6.9 HUD behavior

Replace `practice: boolean` in HUD projection with session information.

Recommended:

```ts
interface HudSessionView {
  kind: "multiplayer" | "singlePlayer";
  showRoleIdentity: boolean;
  showPeerStatus: boolean;
}
```

Derived HUD behavior:

## Multiplayer

```text
show role chip
show connection dot
show ping
crosshair only for Gunner
role-specific prompt
```

## Single Player

```text
hide role chip
hide connection dot
hide ping
hide Practice tag
show crosshair
show combined control prompts
```

Remove the `practiceTag` component if no longer used.

Suggested Single Player opening prompt:

```text
DRIVE · AIM · FIRE
WASD · SHIFT · SPACE · LMB · RMB
```

No Driver/Gunner identity should appear in Single Player HUD.

---

# 6.10 Theme behavior

Single Player should not pretend the player is only Driver or Gunner.

Options:

- Use `theme.base`
- Add `theme.singlePlayer`
- Use a neutral combined theme

Recommended initial implementation:

```text
theme.singlePlayer
```

It may initially inherit/copy base values.

This creates a later presentation divergence seam without changing gameplay.

---

# 6.11 Results flow

Current local results pass multiplayer-shaped rematch readiness.

Replace this with a mode-aware result context.

Recommended:

```ts
type ResultsFlow =
  | {
      kind: "multiplayer";
      rematch: CrewRematchState;
    }
  | {
      kind: "singlePlayer";
      canRestart: true;
    };
```

Single Player results show:

```text
PLAY AGAIN
MAIN MENU
```

`PLAY AGAIN` creates a new local Single Player match.

It must not:

- Wait for Driver readiness
- Wait for Gunner readiness
- Display crew modifier votes unless specifically added later

Add:

```text
app.restartSinglePlayer
```

or make `app.rematch` explicitly dispatch by session policy.

A dedicated action is clearer.

---

# 6.12 Network independence

Single Player:

- Does not send Driver/Gunner gameplay input to the server
- Does not send periodic gameplay ping from `onFrame`
- Does not require a room code
- Does not display connection errors during a local match
- Can start when the multiplayer server is unavailable

The application may still initialize its network client for menu multiplayer functionality.

A network disconnect must not interrupt an active Single Player match.

---

# 7. Feature C — Shared model-driven weapon geometry

# 7.1 Design invariant

> There must be one authoritative tank weapon-mount geometry definition used by server simulation and client presentation.

Do not keep separate server offsets and client offsets.

---

# 7.2 Tank rig definition

Extend `TankDefinition` with a validated rig block.

Recommended:

```ts
export interface TankRigDefinition {
  chassisAssetId: string;
  turretAssetId: string;
  barrelAssetId: string;

  turretPivot: [number, number, number];
  barrelPivot: [number, number, number];
  muzzleLocal: [number, number, number];

  aimPivotLocal: [number, number, number];
  cameraAnchorLocal?: [number, number, number];

  forwardAxis?: [number, number, number];

  socketBindings?: {
    turretPivotNode?: string;
    barrelPivotNode?: string;
    muzzleNode?: string;
    cameraAnchorNode?: string;
  };
}
```

Add to tank content:

```json
{
  "rig": {
    "chassisAssetId": "playerTank.chassis",
    "turretAssetId": "playerTank.turret",
    "barrelAssetId": "playerTank.barrel",
    "turretPivot": [0, 1.15, 0],
    "barrelPivot": [0, 0.62, 0],
    "muzzleLocal": [0, 0.75, 2.9],
    "aimPivotLocal": [0, 1.15, 0],
    "cameraAnchorLocal": [0, 1.35, 0],
    "forwardAxis": [0, 0, 1]
  }
}
```

These are the current client fallback values.

Before finalizing them, visually verify that they represent the intended procedural tank.

---

# 7.3 Why geometry belongs in shared tank content

The geometry is needed by:

```text
authoritative projectile spawn
authoritative hitscan origin
authoritative recoil direction
client tank hierarchy
local predicted muzzle flash
camera-to-turret aim solve
actual trajectory crosshair
future tank model setup
```

Therefore, it cannot live exclusively in:

```text
CSS
client-only asset metadata
GameClient constants
weapon behavior constants
```

The server may ignore asset IDs and node names, but it must use the numeric geometry.

---

# 7.4 Asset socket integration

Project asset definitions already support sockets.

Use them as optional model binding information.

Resolution order:

```text
1. Named GLB node/socket, when configured and found
2. Project asset socket metadata
3. TankDefinition numeric fallback
4. Clear validation/build error for required missing data
```

The authoritative server always uses the shared numeric fallback values.

The client must not silently use a materially different muzzle location from the server.

If a named node resolves to a different local position than the shared fallback beyond tolerance:

- Warn in development
- Show the difference in diagnostics
- Require the content values to be updated
- Do not silently fork authority and presentation

---

# 7.5 Shared pure geometry math

Create a Three.js-independent shared module:

```text
src/shared/vehicle/tankRigGeometry.ts
```

Recommended API:

```ts
export interface TankPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
}

export interface TurretPose {
  yaw: number;
  pitch: number;
}

export interface WeaponMountWorldPose {
  turretPivot: Vec3;
  barrelPivot: Vec3;
  muzzle: Vec3;
  direction: Vec3;
}

export function computeWeaponMountWorldPose(
  tank: TankPose,
  turret: TurretPose,
  rig: TankRigDefinition
): WeaponMountWorldPose;
```

Use the repository’s existing vector/math conventions rather than importing Three.js into shared simulation.

The function must match:

```text
chassis yaw
→ turret local yaw
→ barrel pitch
→ muzzle local transform
```

exactly.

---

# 7.6 Authoritative firing

Replace the current hardcoded `muzzleWorld()` offsets.

All weapon behaviors call:

```ts
const mount = computeWeaponMountWorldPose(
  ctx.state.tank,
  ctx.state.turret,
  ctx.rules.tank.rig
);
```

Use:

```text
mount.muzzle
mount.direction
```

for:

- MG hitscan
- Cannon projectile
- JACKPOT projectile
- Shot event
- Recoil direction
- Any muzzle-origin collision checks

No weapon behavior should independently reconstruct the muzzle.

---

# 7.7 Client tank rig construction

Change:

```ts
AssetService.tankRig()
```

to accept resolved rig data:

```ts
AssetService.tankRig(rigDefinition)
```

`AssetInstanceFactory.buildTankRig()` uses:

```text
rig chassis asset
rig turret asset
rig barrel asset
rig turret pivot
rig barrel pivot
rig muzzle local
```

`TankRig` stores:

```ts
rigDefinition
muzzleLocal
aimPivotLocal
cameraAnchorLocal
```

Remove hardcoded positions from `buildTankRig()`.

---

# 7.8 Rig rules delivery

Online clients must receive the exact selected tank rig.

Preferred typed block:

```ts
export interface TankRigRulesBlock {
  revision: number;
  tankId: string;
  rig: TankRigDefinition;
}
```

Delivery:

```text
match start or first snapshot
→ cache rig block
→ construct/update client rig
```

Single Player obtains the same block directly from local `MatchRules`.

Do not assume all modes use `tank.default`.

Do not overload arbitrary UI content to deliver this data.

---

# 7.9 Camera center aim point

The camera computes a desired world aim point:

```text
center-screen camera ray
→ nearest valid world collision
→ bounded fallback distance
```

Use the existing camera query index.

The desired aim point remains local presentation/input data.

---

# 7.10 Turret solve

Calculate desired turret yaw and pitch from the resolved shared mount geometry.

Do not use:

```text
tank position + hardcoded 1.15 m
```

Use the rig’s actual aim pivot.

Recommended shared/client function:

```ts
solveTurretAim(
  tankPose,
  rig,
  desiredWorldPoint,
  pitchLimits
): {
  desiredYawLocal: number;
  desiredPitch: number;
};
```

The server still receives desired yaw/pitch, not a trusted hit point.

---

# 7.11 Actual trajectory crosshair

The current center reticle represents camera intention, not necessarily the current barrel.

For a truthful crosshair:

```text
current predicted tank pose
+ current predicted turret pose
+ shared rig geometry
→ actual muzzle world ray
→ project trajectory point to screen
→ place crosshair there
```

Recommended UI behavior:

## Primary trajectory reticle

Shows the current predicted shot line.

It may move away from screen center while the turret catches up.

## Optional center aim dot

A subtle center dot may show camera intention.

Default may remain hidden if the moving reticle alone is clear.

When the turret converges:

```text
actual trajectory reticle
≈ center aim point
```

This makes the crosshair truthful during:

- Fast camera movement
- Turret traverse delay
- Tank rotation
- Recoil
- Model-specific muzzle offsets

---

# 7.12 Convergence and near obstacles

The camera can see around the tank while the muzzle is blocked.

Add a muzzle-to-target obstruction query:

```text
muzzle
→ desired aim point
```

If blocked:

- Actual trajectory reticle shows the obstruction point
- Shot still follows authoritative barrel direction
- Do not fake a path through nearby cover
- Optionally add a blocked reticle state

The server remains authoritative for the actual collision.

---

# 7.13 Projectile gravity

This milestone aligns:

```text
muzzle origin
initial shot direction
crosshair trajectory line
```

It does not calculate a complete gravity-compensated ballistic impact reticle.

Cannon drop remains visible gameplay behavior.

A future ballistic reticle may be added separately.

---

# 7.14 Local presentation

Replace every repeated local vector such as:

```ts
new Vector3(0, 0.75, 2.9)
```

with:

```ts
getMuzzleWorld(tankRig)
```

or the shared pose converted into Three.js coordinates.

Use the same source for:

- Cannon local flash
- MG local flash
- Predicted tracer
- JACKPOT charge/release
- Practice/Single Player presentation
- Authoritative event presentation where local rig position is appropriate

Authoritative shot events continue to include server muzzle and direction for remote/world effects.

---

# 8. Proposed data flow

```text
content/tanks/default.json
        ↓
TankDefinition.rig
        ↓
ContentPack validation
        ↓
MatchRules.selectedTank
        ↓
TankRigRulesBlock
        ├── server weapon mount math
        ├── Single Player local match
        └── client AssetService tank rig
                  ↓
         shared aim and muzzle math
                  ↓
      turret target + trajectory crosshair
```

---

# 9. Recommended module structure

```text
src/shared/session/
├── gameSessionKind.ts
└── modeSessionPolicy.ts

src/shared/vehicle/
├── tankRigGeometry.ts
└── tankRigTypes.ts

src/client/session/
└── singlePlayerSession.ts

src/client/aim/
├── turretAimSolver.ts
└── trajectoryReticleProjector.ts
```

Use repository conventions and avoid unnecessary folders when one focused file is sufficient.

---

# 10. Migration phases

## Phase 0 — Audit and tests

- Inventory all PIP references.
- Inventory all Practice references.
- Inventory all swap references.
- Inventory every hardcoded muzzle/pivot vector.
- Add baseline aim mismatch test.
- Add baseline single-player flow tests.

## Phase 1 — Remove PIP

- Remove runtime renderer and camera.
- Remove HUD and view-model data.
- Remove quality/tuning/metrics.
- Remove styles and tests.
- Confirm one world render.

## Phase 2 — Single Player naming and mode policy

- Add session policy to mode schema.
- Add Single Player mode content.
- Rename runtime APIs.
- Remove swapping.
- Update menu and actions.
- Make local results mode-aware.
- Hide role/peer UI in Single Player.
- Ensure offline independence.

## Phase 3 — Shared rig geometry

- Extend tank schema/content.
- Add shared pure geometry module.
- Store selected tank definition in MatchRules.
- Add rig rules delivery.
- Build client rig from resolved data.
- Replace server hardcoded muzzle.

## Phase 4 — Aim and crosshair

- Compute desired world aim.
- Solve turret from actual rig pivot.
- Compute actual muzzle ray.
- Project trajectory reticle.
- Handle obstruction.
- Remove remaining hardcoded offsets.

## Phase 5 — Cleanup and documentation

- Delete compatibility aliases.
- Update guides.
- Add tank model socket guide.
- Run all tests.
- Produce truthful implementation report.

---

# 11. Testing strategy

# 11.1 PIP tests

- No `PipRenderer` construction.
- No `PipCamera`.
- No second world render.
- No PIP HUD node.
- No PIP binding paths.
- No PIP quality fields.
- No PIP metrics.

# 11.2 Single Player tests

- Main menu displays `SINGLE PLAYER`.
- Action starts a local match.
- Server unavailable does not block Single Player.
- Driver input works.
- Gunner aim works.
- MG works.
- Cannon works.
- Ability works.
- Crosshair visible.
- Role chip hidden.
- Practice tag absent.
- Peer status hidden.
- Tab/Q do not swap roles.
- No swap state exists.
- Results show Play Again.
- Play Again starts a fresh local match.
- Multiplayer flow remains unchanged.

# 11.3 Mode separation tests

- Multiplayer resolves `mode.demoScoreAttack`.
- Single Player resolves `mode.singlePlayerScoreAttack`.
- Initial referenced gameplay definitions may match.
- Changing one mode does not mutate the other.
- Session policies differ correctly.
- Mode schema rejects contradictory policy combinations.

Examples of invalid combinations:

```text
singlePlayer + assignedRole
singlePlayer + networkRequired true
singlePlayer + allowRoleSwap true
multiplayer + combinedDriverAndGunner
```

unless explicitly supported later.

# 11.4 Geometry tests

- Default rig validates.
- Shared world transform matches Three.js rig transform.
- Server muzzle equals rendered muzzle within tolerance.
- MG, cannon, and JACKPOT share the same origin.
- Local VFX uses resolved muzzle.
- Model-specific offsets change both server and client.
- Missing required geometry fails validation.
- Optional node binding falls back to numeric socket.
- Node/fallback mismatch warns.

# 11.5 Crosshair tests

- Stationary aligned barrel reticle matches screen-center target.
- Turret traverse delay moves trajectory reticle truthfully.
- Tank yaw changes reticle correctly.
- Turret yaw changes reticle correctly.
- Pitch changes reticle correctly.
- Muzzle offset changes reticle correctly.
- Near cover blocks muzzle ray.
- Reticle never reports a path through a blocking collider.
- No NaN at near-zero distance.
- Off-screen trajectory has a clear hide/clamp policy.

# 11.6 Regression tests

- Multiplayer Driver controls
- Multiplayer Gunner controls
- Shared vehicle prediction
- Gunner local action prediction
- Exact recoil impulses
- Reconnect
- Rematch
- Generated map checksum
- Map Lab
- Presentation generation
- Results
- Pause/resume
- Current FPS target

---

# 12. Performance requirements

PIP removal should reduce work.

The new aim calculation must:

- Reuse the existing spatial camera query
- Avoid full collider scans
- Reuse scratch vectors where practical
- Avoid rebuilding the tank rig every frame
- Cache rig geometry
- Update crosshair through DOM transforms without rebuilding HUD nodes

Measure:

```text
main render p95
aim solve p95
crosshair projection p95
world sync p95
total frame p95
```

No measurable frame regression from the crosshair fix.

---

# 13. Documentation updates

Create:

```text
docs/gameplay04/PLAYER_MODE_PIP_AND_AIM_ALIGNMENT_IMPLEMENTATION_REPORT.md
docs/guides/SINGLE_PLAYER_MODE_GUIDE.md
docs/guides/TANK_RIG_AND_WEAPON_SOCKET_GUIDE.md
```

Update:

```text
README.md
docs/README.md
docs/guides/ARCHITECTURE.md
docs/guides/ASSET_GUIDE.md
docs/guides/CONTENT_AUTHORING_GUIDE.md
docs/guides/SMOKE_TEST.md
docs/planning/BUILD_STATUS.md
```

The tank rig guide must explain:

- Semantic asset IDs
- Numeric socket coordinates
- Named GLB node bindings
- Forward-axis convention
- How to adjust turret pivot
- How to adjust barrel pivot
- How to adjust muzzle
- How to verify server/client alignment
- How to preview the actual shot ray

---

# 14. Acceptance criteria

The milestone is complete only when:

1. No opposite-role camera appears for either player.
2. No PIP world render occurs.
3. PIP runtime, HUD, quality, tuning, styles, and metrics are removed.
4. Main menu says Single Player.
5. No user-facing Practice terminology remains.
6. Single Player controls driving and weapons simultaneously.
7. No Driver/Gunner role identity appears in Single Player.
8. No role swap input or state remains.
9. Single Player has a distinct content mode ID.
10. Single Player and Multiplayer may diverge through mode content.
11. Single Player does not require a server or room.
12. Single Player results restart locally.
13. Multiplayer behavior remains intact.
14. Tank rig geometry is validated and data-driven.
15. Server and client use the same rig geometry.
16. No hardcoded muzzle offsets remain outside default content fixtures.
17. All weapons use one shared muzzle resolver.
18. Local VFX uses the resolved muzzle.
19. The actual trajectory crosshair reflects the current predicted shot ray.
20. Future tank models can configure sockets without central gameplay-code edits.
21. Existing netcode, map, presentation, and regression tests pass.
22. An implementation report records actual tests and remaining limitations.

Final invariant:

> Single Player is a first-class combined-control mode, Multiplayer remains role-based, and every shot originates from one shared model-driven weapon mount.
