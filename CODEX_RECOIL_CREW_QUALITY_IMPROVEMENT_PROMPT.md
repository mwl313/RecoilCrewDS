# Codex Prompt — Recoil Crew Quality Improvement Milestone

Repository:

```text
https://github.com/mwl313/RecoilCrewDS
```

Recent audit anchor when this prompt was written:

```text
f0f4fc1824da5bf4b08f2cfae24e787ba17902ae
```

This SHA is only a reference. Fetch the repository and work from the latest valid remote default-branch head. Never reset newer work back to this commit.

Target branch:

```text
quality-improvement
```

Primary binding document:

```text
RECOIL_CREW_QUALITY_IMPROVEMENT_MILESTONE.md
```

Expected location:

```text
docs/quality/RECOIL_CREW_QUALITY_IMPROVEMENT_MILESTONE.md
```

If the file exists elsewhere, use the existing copy and do not create a duplicate.

---

# 1. Mission

Implement the complete quality-improvement milestone in the document, in this binding order:

```text
A. Vehicle and camera feel
B. Monster presentation quality
C. Performance and enemy-capacity evaluation
D. Environment and visual-direction prototype
```

Do not merely write a plan. Inspect the current production code, implement the changes, add tests and diagnostic tools, run qualification, capture evidence, and write the required reports.

The milestone priority is:

```text
feel first
clarity second
cohesion third
population fourth
environment replacement last
```

Do not change audio or music systems in this task.

---

# 2. Repository safety

Before editing, run:

```bash
git fetch --all --prune
git status --short
git branch --show-current
git rev-parse HEAD
git log --oneline --decorate -40
```

Then:

1. Detect the current default branch.
2. Create or switch to `quality-improvement` from its latest remote head.
3. Record the starting SHA.
4. Inspect existing uncommitted and branch-specific work.

Rules:

```text
work only on quality-improvement
do not merge into main
do not force-push
do not discard user changes
do not squash existing history
do not weaken tests to make them pass
do not update Demo golden to conceal a regression
do not make unrelated UI, audio, balance, or boss-design changes
```

Read the entire milestone document before changing code.

Discover and inspect the real current files for:

```text
tank movement and dash
authoritative input and simulation
client prediction and reconciliation
driver and gunner cameras
camera collision
renderer color space and tone mapping
scene lighting and fog
monster asset and material loading
monster animation and LOD
remote interpolation and horde replication
benchmark tools
Map Lab and map profiles
package scripts and existing tests
```

Do not assume old file paths are still correct.

---

# 3. Prerequisite gate

Verify the milestone prerequisites before implementation:

```text
monster-system P0 fixes are present
multiplayer monster identity is correct
monster grounding is correct
elite and boss scale/collision are correct
XP rendering is stable
farming timer and level clock are correct
airborne monster replication is correct
Demo regression is unchanged
```

Use current tests and smoke checks rather than trusting reports alone.

If a prerequisite is broken, fix only a small direct regression required by this milestone and document it. Do not reopen the entire monster-system project.

Do not begin Phase D while grounding, collision, identity, or multiplayer presentation is unreliable.

---

# 4. Required phase structure

Use focused commits, approximately:

```text
quality: improve dash and camera feel
quality: correct monster presentation and lod motion
quality: benchmark and tune enemy presentation capacity
quality: add isolated urban visual prototype
quality: qualify quality-improvement milestone
```

At the end of each phase:

```text
build
run focused tests
run relevant regressions
update the handoff report
commit
leave the worktree clean
```

Create and maintain:

```text
docs/quality/QUALITY_IMPROVEMENT_IMPLEMENTATION_REPORT.md
docs/quality/QUALITY_IMPROVEMENT_PHASE_HANDOFF.md
docs/quality/DASH_AND_CAMERA_TUNING_REPORT.md
docs/quality/MONSTER_PRESENTATION_AUDIT.md
docs/quality/ENEMY_CAPACITY_BENCHMARK.md
docs/quality/URBAN_PROTOTYPE_EVALUATION.md
```

---

# PHASE A — Dash and camera

## A1. Diagnose the existing dash

Trace the full path:

```text
driver input
client prediction
authoritative input handling
tank simulation
speed limiting
collision/ram state
snapshot replication
reconciliation
```

Prove the root cause of the boost disappearing. The likely issue is that the normal speed limiter clamps the total velocity immediately after the impulse, but confirm the actual code path.

Record the root cause before implementing the correction.

## A2. Implement a real dash state

Use an explicit state equivalent to:

```ts
type TankDashState = 'inactive' | 'burst' | 'recovery';
```

At activation:

```text
capture chassis-forward direction
enter burst
force movement along that captured direction
permit speed above ordinary maximum
restrict steering during the initial lock period
decay the dash contribution through a curve
enter recovery
return smoothly to ordinary movement
```

The captured direction must be the tank chassis forward vector at the activation edge.

Never use:

```text
camera forward
turret forward
current velocity direction
later chassis rotation
```

## A3. Separate velocity components

Implement the conceptual architecture:

```ts
finalVelocity = clampedBaseDriveVelocity + temporaryDashVelocity;
```

Requirements:

```text
normal maximum speed clamps only base driving velocity
dash velocity can exceed normal maximum
dash velocity decays independently
no permanent speed accumulation
no abrupt snap at dash completion
```

Do not implement this as only a temporary global max-speed increase.

## A4. Keep tuning data-driven

Use the existing config/content system.

Initial ranges from the milestone:

```text
burst duration:             0.30–0.45 s
full direction lock:        0.10–0.15 s
initial steering influence: 0%
late steering influence:    15–25%
peak speed multiplier:      1.8–2.3× normal maximum
recovery duration:          0.15–0.25 s
cooldown:                   preserve current authored value
```

Use a configurable curve with:

```text
fast initial acceleration
brief peak
controlled decay
smooth return
```

Add development diagnostics for dash state, base speed, dash speed, final speed, captured direction, steering multiplier, and cooldown.

## A5. Preserve authority and prediction

Requirements:

```text
server validates dash edge and cooldown
server owns dash state and ram eligibility
driver predicts the same dash locally
gunner sees the same chassis motion
reconciliation does not create a large snap
reconnect/rematch cannot leave a phantom dash
```

Do not make dash client-authoritative.

If the wire format changes, follow the existing protocol-version and compatibility policy.

## A6. Dash collision

Use authoritative dash state, not raw speed alone.

```text
valid dash ram window → ram damage may occur
ordinary driving       → no new collision damage
```

Prevent repeated uncontrolled overlap damage and damage after the dash state has expired.

## A7. Correct valley camera behavior

Trace both driver and gunner camera systems and preserve their independent look controls.

The follow target must derive from:

```text
current chassis transform + local camera pivot offset
```

Do not use stale world-space height.

Separate horizontal and vertical smoothing.

Initial guidance:

```text
horizontal follow: smooth and cinematic
vertical follow: faster and tightly bounded
vertical follow time: 0.12–0.22 s
maximum vertical lag: 1.5–2.5 m
upward follow: slightly slower
downward follow: faster
```

Add a hard vertical leash. When the smoothed pivot exceeds the maximum vertical separation, apply a fast but smooth correction.

Keep these systems independent:

```text
tank-follow smoothing
camera obstruction/collision correction
```

Camera collision may shorten the boom, but it must not leave stale vertical displacement after the obstruction clears.

## A8. Phase A tests and evidence

Add deterministic tests where practical for:

```text
dash exceeds ordinary maximum speed
normal clamp does not erase dash
dash direction equals chassis forward at activation
camera and turret do not influence dash direction
direction lock and steering ramp
dash decay and smooth completion
cooldown and repeated input edges
authoritative ram gating
client/server dash agreement
reconnect and rematch cleanup
valley descent
hill crest
ridge jump
cliff fall
rolling terrain
airborne rotation
wall obstruction and recovery
vertical-leash enforcement
finite values after frame spikes
```

Run a two-client browser check and capture clips for:

```text
dash from rest
dash at normal max speed
dash while turning
valley descent
ridge jump
wall-camera recovery
```

Commit:

```text
quality: improve dash and camera feel
```

---

# PHASE B — Monster color, animation, and distant motion

## B1. Diagnose color discoloration first

Do not immediately brighten textures or add blanket emissive.

Audit in this order:

```text
source base color and texture
texture color-space assignment
renderer output color space
tone mapping
exposure
hemisphere/ambient fill
directional light
shadow strength
fog color and density
material tint
vertex-color handling
roughness
metallic
ambient occlusion
```

For every stage, record the current behavior, whether it contributes to discoloration, and the fix or reason no change was needed.

## B2. Create a neutral comparison tool

Create or extend a development-only preview showing the same selected monster in:

```text
unlit/base-color reference
neutral PBR reference
current production lighting
```

Support representative ordinary, elite, and boss assets.

Display useful material and renderer diagnostics, including texture color space, material type, base color, vertex-color flag, roughness, metalness, emissive, tone mapping, exposure, lights, and fog.

## B3. Correct the common pipeline

Preserve:

```text
recognizable source colors
high contrast
flat-shading character where authored
vertex colors
low/zero metallic unless authored
moderately high roughness
soft readable shadows
sufficient ambient/hemisphere fill
no unintended dark global tint
```

Fix the shared importer/material/lighting cause before adding per-family exceptions.

Avoid:

```text
manual texture brightening across the roster
blanket emissive
unlit monsters everywhere
hard-coded overrides per slug
```

## B4. Remove distant T-poses

Trace:

```text
asset preload
clip discovery
semantic-action mapping
mixer lifecycle
LOD selection
visibility changes
state restoration
animation update cadence
remote interpolation
aggregate fallback
```

Determine whether the T-pose is caused by a missing clip, stopped mixer, disabled far animation, state loss during rig swap, preload failure, or aggregate representation.

Binding rule:

```text
T-pose is never an intentional LOD state
```

If an action is unavailable, fall back to a validated locomotion or idle animation, never bind pose.

## B5. Implement three presentation tiers

Initial data-driven bands:

```text
near: 0–40 m
mid:  40–90 m
far:  90 m+
```

Near:

```text
full skeletal animation
full semantic actions
attack and death cues
smooth transform interpolation
selected shadows
```

Mid:

```text
walk, attack, and death animation
reduced animation-update frequency
smooth render-frame interpolation
reduced/disabled shadows
lower presentation cost
```

Far:

```text
low-cost animated representation
at least a valid locomotion cycle
smooth transform interpolation
no dynamic shadows
minimal attack indication
```

Allowed far approaches include simplified rigs, baked vertex animation, animated impostors, or billboard sequences. Choose based on the current asset pipeline and measured cost.

## B6. Separate simulation rate from visual smoothness

Far enemies may update authoritatively at a lower rate while rendering smoothly every frame.

Use interpolation buffers. Do not raise server snapshot frequency solely to hide client stepping.

Preserve through LOD changes:

```text
position
Y position
yaw
semantic action
animation phase where practical
attack state
death lock
airborne state
grounding envelope
ownership/priority metadata
```

Prevent visible position, yaw, or vertical snaps, action reset, brief bind pose, death resurrection, and airborne re-grounding.

## B7. Fog only after correctness

After animation and interpolation are fixed, tune atmospheric fog to provide:

```text
clear combat range
gradual far haze
mild long-distance desaturation
strong concealment only beyond meaningful gameplay range
```

Do not use fog to hide broken mid-range enemies.

## B8. Phase B tests and evidence

Add tests for:

```text
far enemy never enters bind pose
missing action falls back to valid animation
far locomotion advances over time
mid attack remains visible
death remains locked at mid/far range
near→mid and mid→far continuity
airborne state survives LOD transition
remote motion interpolates sparse updates
grounding remains stable across LODs
```

Capture a deterministic gallery with:

```text
unlit/neutral/current comparison
ordinary before/after
elite before/after
boss before/after
same identity at near/mid/far
LOD transition clips
distant locomotion and death
airborne LOD transition
fog at combat, mid, and far distance
```

Human-review the images and clips. A nonblank-pixel check is not sufficient.

Commit:

```text
quality: correct monster presentation and lod motion
```

---

# PHASE C — Performance and enemy-capacity evaluation

## C1. Do not raise production population yet

Server simulation results alone are insufficient.

Measure separate costs for:

```text
server AI/simulation
client interpolation
skeletal animation
GPU skinning
draw calls
triangles
shadows
collision
projectiles
snapshot size
network bandwidth
XP
particles
memory and allocation
```

Keep current production caps until the benchmark supports a change.

## C2. Add deterministic benchmark scenarios

Create reproducible scenes for:

```text
100 enemies
250 enemies
500 enemies
750 enemies
```

For each count, support:

```text
all near/full animated
mixed near/mid/far
reduced mid animation
animated far tier
aggregate far tier
projectile pressure
XP pressure
elite
boss and escorts
```

Use fixed seeds and document camera position, resolution, browser, warm-up, and duration.

## C3. Record real metrics

Collect where available:

```text
CPU frame time
GPU frame time
p50/p95/p99 frame time
average FPS and low-frame behavior
draw calls
triangles
active mixers
active skinned meshes
shadow casters
snapshot bytes/sec
interpolation cost
server step p50/p95/p99
event-loop delay
WebSocket buffered amount
memory
state growth
GC spikes
```

If reliable GPU time is not exposed, state that limitation. Never fabricate measurements.

## C4. Produce data-backed tier budgets

Recommend:

```text
max near full-animation population
max mid reduced-animation population
max far animated population
max aggregate population
max total production population
shadow-caster budget
animation-mixer budget
network/snapshot budget
```

Build the benchmark so the user can run it on:

```text
integrated/low-end laptop GPU
mid-range desktop GPU
current development machine
```

Codex may only have one machine available. Record only what was actually run and provide instructions for additional machines.

Allowed optimizations include animation throttling, shadow budgets, batched far presentation, cached resources, reduced allocation, payload improvements, and LOD hysteresis.

Do not remove all visible far animation, hide everything with fog, weaken authority, or lower tick rate without evidence.

Commit:

```text
quality: benchmark and tune enemy presentation capacity
```

---

# PHASE D — Cohesion pass and isolated urban prototype

## D1. Preserve the production map

Do not replace the current default map.

The urban environment must be:

```text
a separate development prototype
selectable only through a development/test path
isolated from normal matchmaking
easy to remove
clearly experimental
```

## D2. Apply a restrained cohesion pass first

Standardize the current scene where appropriate:

```text
lighting
tone mapping
exposure
fog
shadow softness
ground material scale
material roughness
sky color
prop density
projectile colors
damage effects
XP color
monster material response
```

Do not redesign UI or replace the entire art stack.

## D3. Build one urban prototype

Target:

```text
approximately 200×200 m
mostly flat urban district
wide roads
open plazas
low building density
gentle ramps
limited chokepoints
clear monster spawn lanes
one boss arena
```

Character:

```text
flat roads and plazas
rubble ramps
overpasses where affordable
shallow height variation
no deep procedural valleys
```

Use only already approved and licensed assets. Do not purchase or import new commercial assets without user approval.

## D4. Navigation constraint

Current direct-pursuit monsters may fail around hard obstacles.

For this prototype:

```text
prefer wide, permeable routes
avoid maze-like alleys and narrow dead ends
create broad pursuit and spawn lanes
add only limited recovery/avoidance needed for evaluation
```

Do not implement a major navmesh, flow-field, or pathfinding rewrite without separate approval.

Measure stuck-enemy rate, recovery, boss reliability, escort reliability, and congestion.

## D5. Compare current versus urban

Use the same gameplay configuration and compare:

```text
visual cohesion
dash enjoyment
jump usefulness
camera quality
monster navigation
spawn readability
combat readability
performance
boss encounter quality
multiplayer clarity
art-production cost
```

The final recommendation must be exactly one:

```text
retain current terrain
hybridize with urban elements later
replace with urban direction in a future milestone
```

The recommendation is advisory. The production default must not change in this milestone.

Commit:

```text
quality: add isolated urban visual prototype
```

---

# 5. Qualification

Inspect `package.json` and run the real current equivalents of:

```bash
npx tsc --noEmit
npm run generate:content-pack
npm run generate:presentation-content
npm run generate:map-profiles
npm test
npm run build
npm run test:demo
npm run test:netcode
npm run test:horde
npm run test:horde:benchmark
npm run test:progression
npm run test:animation
npm run test:animation:benchmark
npm run validate:enemy-animations
npm run test:monsterpack-import
npm run test:monsterpack-rendering
npm run test:maps
npm run test:maplab
```

If a listed command was renamed, use and report the current equivalent.

Also run focused browser qualification for:

```text
full Single Player round
two-client multiplayer round
driver dash prediction
gunner observation of dash
valley and ridge camera
wall-camera recovery
monster color gallery
near/mid/far animation gallery
far sparse-update interpolation
airborne LOD transition
elite and boss readability
100/250/500/750 benchmark scenes
current versus urban prototype
victory, result, reconnect, and rematch cleanup
```

Verify:

```text
no critical console errors
no protocol regression
no identity or grounding regression
no XP regression
no stale dash or camera state
no intentional T-pose
no production map replacement
```

Human-review screenshots and clips.

Never claim a test, device, benchmark, or visual review that was not actually performed.

Final commit:

```text
quality: qualify quality-improvement milestone
```

---

# 6. Forbidden shortcuts

Do not:

```text
only raise global max speed and call it a dash
use camera/turret direction for dash
make dash client-authoritative
gate ram damage by raw speed alone
combine follow smoothing and camera collision state
teleport the camera vertically every frame
brighten every monster texture manually
add blanket emissive
make all monsters unlit
use fog as the primary T-pose fix
treat bind pose as a valid far LOD
increase server snapshot rate merely to hide stepping
make every far monster a full-cost near rig without benchmarks
fabricate GPU or hardware measurements
raise production enemy count before measuring
replace the production map
perform a major pathfinding rewrite
redesign the HUD or menu
change boss mechanics
rebalance monsters or relics
change sound design or music
update Demo golden to hide regressions
merge into main
```

---

# 7. Report requirements

`QUALITY_IMPROVEMENT_IMPLEMENTATION_REPORT.md`:

```text
starting and ending SHA
branch and commits
files and architecture changed
tests and browser runs
visual evidence
known limitations
confirmation branch remains unmerged
```

`DASH_AND_CAMERA_TUNING_REPORT.md`:

```text
old root causes
new dash architecture
authoritative/predicted paths
tuning parameters and speed curve
ram behavior
camera root cause
axis smoothing and leash
collision recovery
tests and recommended tuning
```

`MONSTER_PRESENTATION_AUDIT.md`:

```text
color-pipeline findings
source-versus-production comparison
material, lighting, and fog changes
T-pose root cause
near/mid/far implementation
fallback and continuity policy
human visual review
known asset limitations
```

`ENEMY_CAPACITY_BENCHMARK.md`:

```text
machine, browser, and resolution
scenario definitions
warm-up and duration
100/250/500/750 results
frame, draw, animation, shadow, network, server, and memory metrics
measurement limitations
recommended tier budgets and production cap
instructions for additional machines
```

`URBAN_PROTOTYPE_EVALUATION.md`:

```text
prototype layout and asset sources
navigation approach
current-map comparison
dash/camera/navigation/performance/boss comparison
visual evidence
art-production cost
retain/hybridize/replace-later recommendation
confirmation production default remains unchanged
```

---

# 8. Final Codex response

When done, report:

```text
1. Starting SHA
2. Ending SHA
3. Branch
4. Commit list
5. Summary of each phase
6. Root causes found
7. Tests actually run
8. Tests not run and why
9. Benchmark headline results
10. Recommended presentation/population budgets
11. Human visual-review status
12. Urban prototype recommendation
13. Known limitations
14. Exact report paths
15. Confirmation that main was not merged
```

Do not stop after writing documents. Completion requires production code, tests, evidence, and reports, or explicit evidence-backed blockers.
