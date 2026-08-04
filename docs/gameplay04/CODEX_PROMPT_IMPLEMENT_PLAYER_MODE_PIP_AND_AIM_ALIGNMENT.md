# Codex Prompt — Implement Gameplay 04
## Single Player Mode, PIP Removal, and Model-Driven Aim Alignment

Repository:

```text
mwl313/RecoilCrewDS
```

Target branch:

```text
latest active branch containing map-lab and the current shared-vehicle netcode
```

Read:

```text
docs/gameplay04/PLAYER_MODE_PIP_AND_AIM_ALIGNMENT_DESIGN.md
```

Treat that design document and this prompt as the binding implementation contract.

---

# Mission

Implement three product changes:

1. Remove the opposite-role partner camera completely.
2. Replace Practice with a first-class Single Player mode.
3. Align the crosshair, turret, visual muzzle, authoritative muzzle, projectile origin, and local VFX through one shared data-driven tank-rig geometry contract.

The implementation must follow the repository’s current modular, data-driven architecture.

---

# Current architecture that must be respected

The current branch already contains:

- Shared Driver/Gunner tank prediction
- Immediate Gunner action messages
- Exact tank impulse events
- Remote entity interpolation
- Camera collision spatial queries
- Content-driven scenes and HUD
- Mode definitions and MatchRules
- Semantic asset service
- Project asset socket metadata
- Generated maps and checksum gates

Do not regress or bypass these systems.

---

# Inspect first

Inspect the actual current tree.

At minimum:

```text
package.json

content/modes/
content/tanks/
content/loadouts/
content/hud/gameplay.json
content/scenes/mainMenu.json
content/scenes/results.json
content/themes/
content/assets/

src/shared/content/schemas/mode.ts
src/shared/content/schemas/tank.ts
src/shared/content/schemas/loadout.ts
src/shared/content/contentPack.ts

src/shared/rules/matchRules.ts
src/shared/rules/contentConfig.ts
src/shared/rules/legacyDemoRules.ts
src/shared/stats/rulesRevision.ts

src/shared/sim/match.ts
src/shared/sim/matchRuntime.ts
src/shared/sim/systems/systemContext.ts

src/shared/weapons/weaponBehaviors.ts
src/shared/weapons/
src/shared/projectiles/
src/shared/effects/recoilEffect.ts
src/shared/effects/tankImpulseSystem.ts

src/client/main.ts
src/client/input.ts
src/client/cameras.ts
src/client/tpsCamera.ts
src/client/cameraCollision.ts
src/client/arenaView.ts

src/client/assets.ts
src/client/assets/assetService.ts
src/client/assets/assetInstanceFactory.ts
src/client/assets/types.ts

src/client/app/gameClient.ts
src/client/app/networkStatePresenter.ts
src/client/app/predictionController.ts
src/client/app/pipRenderer.ts
src/client/app/qualityManager.ts
src/client/app/renderWorld.ts

src/client/hud.ts
src/client/app/hudController.ts
src/client/presentation/hudViewModel.ts
src/client/presentation/hudRuntime.ts
src/client/presentation/uiComponents.ts
src/client/presentation/componentRegistry.ts

src/shared/presentation/schemas.ts
src/generated/presentationContent.generated.ts

tests/
e2e/
```

Create first:

```text
docs/gameplay04/PLAYER_MODE_PIP_AND_AIM_ALIGNMENT_CODE_AUDIT.md
```

Record:

- Every PIP runtime/UI/tuning/metric reference
- Every Practice/practice reference
- Every role-swap reference
- Current mode creation flow
- Current local Match creation flow
- Current results/rematch flow
- Every hardcoded turret/barrel/muzzle/aim-pivot offset
- Current authoritative muzzle math
- Current local VFX muzzle math
- Current crosshair projection path
- Current project asset socket path
- Exact files and tests to change

Then implement. Do not stop after the audit.

---

# Non-negotiable constraints

Preserve:

- Authoritative multiplayer server
- Shared vehicle prediction
- Gunner action prediction
- Exact recoil impulse behavior
- Existing network protocol unless a typed rig block requires a compatible addition
- Practice gameplay behavior as the initial Single Player behavior
- Shared simulation
- ContentPack and MatchRules
- Generated maps
- Map checksum gate
- Reconnect and rematch
- Content-driven scenes and HUD
- Semantic assets and procedural fallbacks
- Current performance targets

Do not:

- Merely hide the PIP with CSS
- Leave a hidden PIP render running
- Duplicate the simulation for Single Player
- Add AI for the unoccupied role
- Keep role swapping in Single Player
- Keep `practice` as the final runtime product name
- Require a multiplayer server for Single Player
- Keep multiplayer-shaped rematch voting in Single Player
- Trust a client-only GLB socket as authority
- Keep separate server and client muzzle offsets
- Add hardcoded tank-model branches
- Put Three.js into shared authoritative simulation
- Rewrite unrelated netcode
- Add ballistic-drop prediction in this milestone
- Claim visual alignment from unit tests alone

---

# Milestone order

```text
Milestone 0 — Audit and regression fixtures
Milestone 1 — Remove PIP completely
Milestone 2 — Add data-driven Single Player session policy
Milestone 3 — Migrate Practice to Single Player
Milestone 4 — Add shared tank-rig geometry
Milestone 5 — Align authoritative/client muzzle paths
Milestone 6 — Implement truthful trajectory crosshair
Milestone 7 — Cleanup, tests, docs, and report
```

Run focused tests after every milestone.

---

# Milestone 0 — Audit and fixtures

Add baseline tests for:

```text
main menu Practice button
local combined controls
role swap
role chip
Practice tag
PIP second render
authoritative muzzle position
client muzzle position
crosshair/shot-ray difference
```

Capture the existing mismatch numerically before changing it.

Add a deterministic test tank state and turret state.

---

# Milestone 1 — Remove PIP

## Runtime

Remove:

```text
PipRenderer
PipCamera
GameClient pip field
PipRenderer creation
PipRenderer reset
PIP render call
PIP-only RenderWorld methods when unused
```

Audit all imports before deletion.

## HUD

Remove:

```text
pipFrame node
pip label
pip status
pip jackpot state
pip HudViewModel block
pip HUD binding paths
pip preview data
pip UI component when unused
pip CSS
```

## Quality and tuning

Remove:

```text
setPipRate
setPipScale
NET_TUNING.pip
PIP degrade policy
PIP performance metrics
F4 PIP rows
```

## Gate

Add a render-spy test proving ordinary gameplay performs no partner-camera render.

---

# Milestone 2 — Mode session policy

Extend `modeSchema` with a validated session policy.

Required concepts:

```text
kind
networkRequired
controlScheme
showRoleIdentity
showPeerStatus
allowRoleSwap
resultsFlow
```

Use exact names consistent with repository conventions.

Validation must reject contradictory combinations.

Add explicit policy to:

```text
mode.demoScoreAttack
```

Add:

```text
content/modes/singlePlayerScoreAttack.json
id: mode.singlePlayerScoreAttack
```

Initially reference the same gameplay definitions as multiplayer.

Update ContentPack reference validation and tests.

Expose the resolved policy through `MatchRules`.

---

# Milestone 3 — Practice to Single Player

## Naming

Rename production code:

```text
practiceMatch        → singlePlayerMatch
startPractice        → startSinglePlayer
stepPractice         → stepSinglePlayer
applyPracticeWeapons → applySinglePlayerWeapons
practice             → session kind/policy
```

Remove:

```text
practiceViewRole
togglePracticeView
```

Do not leave permanent aliases.

## Main menu

Change:

```text
PRACTICE
→ SINGLE PLAYER
```

Change action:

```text
app.startPractice
→ app.startSinglePlayer
```

Update schemas, action registry, flow handlers, scene content, previews, and tests.

## Match creation

Create the local match from:

```text
mode.singlePlayerScoreAttack
```

through ContentPack and MatchRules.

Do not use the no-pack legacy path as the final implementation.

If the client currently lacks an initialized ContentPack, add a proper generated/client-safe content-pack loading path rather than copying constants.

## Controls

Single Player always reads both:

```text
Driver input
Gunner aim
Gunner weapons
```

Preserve current local feel.

Remove from `InputManager`:

```text
Tab swap
Q swap
swapPressed
consumeSwap
```

Do not assign replacement actions.

## HUD

Replace `practice: boolean` with resolved session policy/context.

Single Player:

```text
role chip hidden
connection dot hidden
ping hidden
Practice tag removed
crosshair visible
combined prompt
```

Multiplayer:

```text
role chip visible
connection UI visible
role-specific crosshair/prompt behavior
```

Do not show DRIVER or GUNNER anywhere in active Single Player HUD.

## Theme

Add or use a neutral Single Player theme.

Do not force Driver identity merely to obtain a color.

## Network

A network disconnect must not terminate Single Player.

Do not send gameplay ping or input from an active local match.

## Results

Implement mode-aware results.

Single Player:

```text
PLAY AGAIN
MAIN MENU
```

Add a typed local restart action.

Do not fake Driver/Gunner rematch readiness.

---

# Milestone 4 — Shared tank-rig geometry

Extend `tankSchema` and `TankDefinition` with a validated rig definition.

Required fields:

```text
chassisAssetId
turretAssetId
barrelAssetId
turretPivot
barrelPivot
muzzleLocal
aimPivotLocal
optional cameraAnchorLocal
optional forwardAxis
optional socket node bindings
```

Add default values to:

```text
content/tanks/default.json
legacy/client-safe rule fixture
```

Do not silently infer authoritative values from Three.js objects.

Update MatchRules so it stores the selected TankDefinition.

Add a typed rig rules block for online client delivery.

Single Player reads the same data directly from local MatchRules.

Add revision/version behavior consistent with current rules blocks.

---

# Milestone 5 — Shared muzzle resolver

Create a Three.js-independent module:

```text
src/shared/vehicle/tankRigGeometry.ts
```

Implement:

```text
compute turret pivot
compute barrel pivot
compute muzzle world position
compute barrel forward direction
solve desired turret yaw/pitch to a world point
```

Use repository coordinate conventions.

## Server

Replace the hardcoded `muzzleWorld()` implementation.

MG, cannon, and JACKPOT use the shared resolver.

Use it for:

```text
hitscan origin
projectile origin
shot event origin
shot direction
recoil direction
```

## Client

Make `AssetService.tankRig()` receive rig data.

Make `AssetInstanceFactory.buildTankRig()` use rig data.

Remove hardcoded:

```text
turret.position
barrel.position
muzzleLocal
turretPivot
```

from the factory.

Replace all repeated local `new Vector3(0, 0.75, 2.9)` calls.

Use one `getMuzzleWorld()` path.

## Asset sockets

Integrate optional named/project sockets.

Named sockets are client binding aids.

Numeric shared content remains authority.

Add development mismatch diagnostics.

---

# Milestone 6 — Crosshair alignment

## Desired aim

Continue using the center-screen camera ray and current spatial camera query.

Compute the desired world point.

## Turret target

Solve turret target from the resolved rig aim pivot.

Remove hardcoded `tank + 1.15`.

## Actual trajectory

Use current predicted:

```text
tank pose
turret pose
rig
```

to calculate the actual muzzle ray.

Project the ray’s resolved world hit/fallback point into screen space.

Move the gameplay crosshair to that projected position.

Do not rebuild the HUD node.

Use a transform/style update.

## Turret lag

While the turret catches up, the trajectory crosshair may be off-center.

That is intentional and truthful.

Optionally add a subtle center camera-aim dot.

Do not present center aim as the actual shot path.

## Obstruction

Raycast from muzzle toward the desired point.

When near cover blocks the muzzle:

- Crosshair reflects the blocked trajectory
- Optional blocked state is shown
- No fake line through cover

## Gravity

Do not add a ballistic-drop impact reticle.

Document that the reticle represents initial shot line.

---

# Milestone 7 — Cleanup and documentation

Delete:

```text
obsolete Practice compatibility
obsolete PIP classes
obsolete PIP settings
obsolete PIP UI
obsolete hardcoded muzzle helpers
obsolete role-swap code
```

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

---

# Required tests

## PIP removal

```text
no PipRenderer
no PipCamera
no PIP HUD
no PIP bindings
no PIP tuning
one gameplay camera render
```

## Single Player

```text
menu label
action flow
offline start
combined movement and weapons
no role identity
no connection UI
no swap keys/state
crosshair visible
local restart
multiplayer unaffected
```

## Mode policy

```text
schema validation
contradictory policy rejection
separate mode IDs
independent future overrides
resolved MatchRules policy
```

## Rig geometry

```text
schema
content/legacy parity
shared math
Three.js transform parity
server/client muzzle equality
all weapon types
model-specific override
socket fallback
socket mismatch warning
```

## Crosshair

```text
aligned stationary case
turret lag case
tank rotation
turret rotation
pitch
model offset
near obstacle
offscreen policy
no NaN
```

## Regression

```text
shared vehicle prediction
Gunner action prediction
tank impulses
online Driver
online Gunner
reconnect
rematch
Single Player restart
map checksum
Map Lab
presentation generation
pause/results
```

---

# Required commands

Run and report actual output:

```bash
npm run generate:presentation-content
npm run generate:map-profiles
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
npm run test:netcode
npm run test:netcode:e2e
```

Use only commands that exist after inspecting `package.json`. Add focused commands where useful.

Do not claim visual alignment solely because unit tests pass.

Perform documented manual visual checks with:

```text
default procedural tank
flat ground
slope
near wall
fast turret traverse
cannon
MG
JACKPOT
Single Player
multiplayer Gunner
```

---

# Implementation report requirements

The final report must include:

1. Current-state audit
2. PIP files and systems removed
3. Render-count change
4. Single Player architecture
5. Mode policy schema
6. New mode content
7. Practice-to-Single-Player renames
8. Role-swap removal
9. Results-flow change
10. Offline behavior
11. Rig schema
12. Shared geometry math
13. Server muzzle migration
14. Client rig migration
15. Socket integration
16. Crosshair projection
17. Obstruction behavior
18. Files added/modified/deleted
19. Automated test outputs
20. Manual visual test steps/results
21. Performance before/after
22. Remaining limitations
23. Explicit completion-gate status

---

# Completion gate

Complete only when:

1. Partner PIP is fully removed.
2. No hidden PIP render remains.
3. Single Player replaces Practice in all production UI.
4. Single Player uses a distinct content mode.
5. Combined controls work without role swapping.
6. Role and peer UI are absent in Single Player.
7. Single Player works without multiplayer connectivity.
8. Single Player results restart locally.
9. Multiplayer behavior remains correct.
10. One shared rig geometry drives server and client.
11. All hardcoded muzzle/pivot duplicates are removed.
12. MG, cannon, and JACKPOT share one muzzle resolver.
13. Local VFX originate from the resolved muzzle.
14. Crosshair represents the actual predicted shot ray.
15. Near-muzzle obstruction is represented honestly.
16. Future tank models can adjust sockets through content/asset metadata.
17. Current netcode and map systems do not regress.
18. All required tests and manual visual checks pass.

Final invariant:

> Single Player is combined-control and roleless; Multiplayer remains cooperative and role-based; every visible and authoritative shot uses the same tank-model geometry.
