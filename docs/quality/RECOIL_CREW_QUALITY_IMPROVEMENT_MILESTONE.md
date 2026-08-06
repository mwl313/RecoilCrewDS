# Recoil Crew — Quality Improvement Milestone

## Document status

```text
Status: Planned post-stabilization milestone
Project: Recoil Crew
Dependency: Complete the current monster-system bug-fix pass first
Scope: Vehicle feel, camera quality, monster presentation, performance capacity, and visual-direction prototyping
Out of scope: Final UI redesign, full balance pass, permanent urban-map commitment
```

This milestone improves how Recoil Crew feels and looks after the monster-system correctness work is stable.

The milestone is divided into four workstreams:

```text
A. Vehicle and camera feel
B. Monster presentation quality
C. Performance and enemy-capacity evaluation
D. Environment and visual-direction prototype
```

The workstreams should be implemented in that order.

---

# 1. Milestone goals

The milestone should achieve:

- A dash that feels like a real forward burst
- A camera that remains attached to the tank through valleys and drops
- Bright, high-contrast monster colors closer to the source assets
- Smooth and animated distant monster presentation
- A measured understanding of the engine’s real enemy capacity
- Better visual cohesion between tank, monsters, terrain, lighting, and effects
- A controlled urban-apocalypse prototype before any permanent map replacement
- Clear evidence for later art-direction and population decisions

The milestone should not hide existing correctness bugs through visual changes.

---

# 2. Prerequisites

Before beginning this milestone:

```text
[ ] Monster-system second-pass P0 bugs fixed
[ ] Multiplayer monster identity correct
[ ] Monster grounding correct
[ ] Elite/boss scale and collision correct
[ ] XP rendering stable
[ ] Farming timer and level clock correct
[ ] Airborne monster replication correct
[ ] Demo regression unchanged
```

Do not begin the environment prototype while monster grounding, collision, or multiplayer presentation is still unreliable.

---

# 3. Workstream A — Vehicle and camera feel

## 3.1 Dash problem

Current observed behavior:

```text
Dash applies a brief speed increase
→ normal maximum-speed logic immediately clamps the tank back down
→ dash does not feel useful as a speed boost
```

The dash also does not reliably force the tank in its current facing direction.

## 3.2 Dash design

The dash should be a temporary movement state rather than a one-frame impulse.

Recommended state:

```ts
type TankDashState =
  | 'inactive'
  | 'burst'
  | 'recovery';
```

At dash activation:

1. Capture the tank chassis forward vector.
2. Enter `burst`.
3. Force acceleration along the captured chassis direction.
4. Temporarily allow speed above normal tank maximum.
5. Reduce steering influence during the early burst.
6. Decay the dash velocity through a controlled curve.
7. Enter recovery.
8. Return smoothly to ordinary driving.

The dash direction must use:

```text
tank chassis forward direction at activation
```

Do not use:

```text
camera direction
current velocity direction
turret direction
```

## 3.3 Velocity architecture

Separate:

```text
base driving velocity
+
temporary dash velocity
```

Normal maximum-speed logic clamps only the base driving component.

The dash component decays independently.

Concept:

```ts
finalVelocity =
  clampedBaseDriveVelocity
  + dashVelocity;
```

This prevents the normal speed cap from instantly deleting the dash.

## 3.4 Initial dash tuning values

These are provisional and must remain content-driven:

```text
Burst duration:             0.30–0.45 seconds
Full direction lock:        0.10–0.15 seconds
Initial steering influence: 0%
Late steering influence:    15–25%
Peak speed multiplier:      1.8–2.3× normal maximum
Recovery duration:          0.15–0.25 seconds
Cooldown:                   preserve current value unless tuning is needed
```

Use a curve rather than a linear hard cutoff.

Recommended curve behavior:

```text
fast initial acceleration
brief peak
controlled decay
smooth return to normal speed
```

## 3.5 Dash collision behavior

Dash and ordinary collision remain separate.

```text
dash active
→ high-speed ram damage may occur

dash inactive
→ normal collision damage remains disabled unless another system enables it
```

Dash collision should use authoritative dash state, not only raw speed.

## 3.6 Dash tests

Required:

```text
dash exceeds normal maximum speed
dash direction matches chassis forward at activation
normal speed cap does not cancel dash immediately
steering is restricted during initial burst
dash decays smoothly
dash ends without speed snapping
dash collision damage occurs only during valid dash state
multiplayer clients see the same dash direction and duration
```

---

# 4. Camera valley-follow correction

## 4.1 Current problem

When the tank descends into a valley:

```text
tank moves downward
camera pivot follows too slowly or remains near the previous height
camera appears to float high above the tank
```

This makes the camera feel detached from the vehicle.

## 4.2 Camera target

The camera should follow:

```text
tank chassis transform
+
local camera pivot offset
```

Do not derive the vertical target from a stale world-space height.

## 4.3 Separate smoothing axes

Horizontal and vertical smoothing must be tuned separately.

Recommended behavior:

```text
horizontal follow:
smooth and cinematic

vertical follow:
faster and more tightly bounded
```

Initial values:

```text
Vertical follow time:       0.12–0.22 seconds
Maximum vertical lag:       1.5–2.5 metres
Upward follow:              slightly slower
Downward follow:            faster
```

The downward camera correction should be stronger than upward correction so valleys do not leave the camera behind.

## 4.4 Hard vertical leash

Add a maximum permitted vertical separation between the camera pivot target and tank-relative pivot.

If exceeded:

```text
apply fast corrective follow
```

This prevents long-lived detachment.

## 4.5 Camera collision separation

Keep these responsibilities separate:

```text
tank-follow correction
terrain/wall camera collision correction
```

Terrain collision may push the camera closer to the tank.

It must not leave the camera suspended above the tank after the obstruction is gone.

## 4.6 Camera tests

Required scenarios:

```text
drive down a steep valley
cross a hill crest
jump from a ridge
fall beside a cliff
drive through rapid rolling terrain
rotate while airborne
camera collision near a wall
camera recovery after obstruction
```

Acceptance:

```text
camera remains visually attached to the tank
vertical lag never exceeds configured leash
camera does not snap violently
camera does not remain elevated after descent
```

---

# 5. Workstream B — Monster presentation quality

## 5.1 Monster color problem

Observed behavior:

```text
monster assets appear dark and discolored
source assets are expected to be brighter and higher contrast
```

The likely cause is the rendering/material pipeline rather than the original source textures.

Potential causes:

- Incorrect texture color space
- Incorrect renderer output color space
- Excessively dark lighting
- Tone-mapping exposure
- Fog darkening
- Material tint
- Excessive ambient occlusion
- Metallic/roughness conversion
- Ignored or multiplied vertex colors
- Flat-shaded source materials converted into dark PBR materials

## 5.2 Color-pipeline audit

Audit in this order:

```text
1. Source base color and texture
2. Texture color-space assignment
3. Renderer output color space
4. Tone mapping
5. Exposure
6. Hemisphere/ambient fill
7. Directional light
8. Shadow strength
9. Fog color and density
10. Material tint
11. Vertex-color handling
12. Roughness, metallic, AO
```

## 5.3 Neutral comparison scene

Create a monster material-debug scene with three views:

```text
Unlit/base-color
Neutral PBR
Current game lighting
```

Use the same source monster in all three views.

This should reveal whether the problem comes from:

```text
asset import
material conversion
lighting
tone mapping
fog
```

## 5.4 Recommended monster material direction

For bright low-poly monsters:

```text
strong hemisphere or ambient fill
soft directional shadows
low or zero metallic
moderately high roughness
preserved flat-shading character
preserved vertex colors
no global dark tint
limited ambient occlusion
```

Do not manually brighten every texture unless the common pipeline has been proven correct.

## 5.5 Color acceptance criteria

```text
[ ] Source colors remain recognizable
[ ] Bright colors do not become muddy gray
[ ] Dark monsters remain readable against grass and terrain
[ ] Elite and boss silhouettes remain visible at combat distance
[ ] Fog does not destroy color before far-LOD distance
[ ] Lighting remains coherent with tank and environment
```

---

# 6. Distant monster animation and motion

## 6.1 Current problem

Observed at distance:

```text
T-pose or missing animation
jerky movement
visible snapshot stepping
LOD transitions reduce the overall quality of the game
```

Fog alone should not be the primary fix.

## 6.2 Final presentation tiers

Use three visual tiers.

### Near tier

```text
full skeletal animation
full semantic action set
attack cues
death animation
smooth transform interpolation
optional full shadows
```

### Mid tier

```text
walk, attack, and death animations
reduced animation-update frequency
render-frame transform interpolation
reduced or disabled shadows
lower-detail model
```

### Far tier

Preferred:

```text
low-cost animated representation
simple walk cycle
smooth transform interpolation
no dynamic shadows
minimal attack indication
```

Allowed alternatives:

```text
simplified skeleton
baked vertex animation
animated impostor
billboard sprite sequence
```

T-pose is never an acceptable LOD state.

## 6.3 Simulation versus presentation frequency

Separate:

```text
authoritative update frequency
from
visual interpolation frequency
```

A far enemy may receive authoritative updates at:

```text
5–10 Hz
```

while rendering smoothly at:

```text
display frame rate
```

Use interpolation buffers rather than frame-by-frame snapping.

## 6.4 Initial distance bands

Provisional:

```text
Near:  0–40 m
Mid:   40–90 m
Far:   90 m+
```

Keep values data-driven.

## 6.5 LOD transition continuity

Preserve through LOD swaps:

- Position
- Yaw
- Semantic action
- Animation phase
- Attack state
- Death lock
- Airborne state
- Grounding envelope

Use a short crossfade or transition window where practical.

## 6.6 Fog policy

After animation and interpolation are corrected, add atmospheric support:

```text
clear combat range
gradual far-distance haze
mild desaturation at long range
strong concealment only beyond meaningful gameplay distance
```

Fog may support cohesion but must not hide broken mid-range presentation.

## 6.7 Distant-presentation tests

Required:

```text
far enemy walks without T-pose
far enemy moves smoothly between snapshots
mid enemy attacks visibly
death remains visible at mid/far distance
near↔mid transition preserves action phase
mid↔far transition avoids visible snap
airborne enemy remains airborne through LOD change
```

---

# 7. Workstream C — Performance and enemy-capacity evaluation

## 7.1 Purpose

The engine may support more enemies than originally expected.

This must be measured rather than assumed.

Server simulation performance alone is insufficient.

## 7.2 Separate budgets

Measure:

```text
server AI and simulation
client transform interpolation
skeletal animation
GPU skinning
draw calls
triangle count
shadows
collision
projectiles
snapshot size
network bandwidth
XP items
particles
memory
```

## 7.3 Benchmark scenarios

Create fixed scenarios:

```text
100 enemies
250 enemies
500 enemies
750 enemies
```

For each count, test:

```text
all near/full animated
mixed near/mid/far
reduced mid animation
animated far tier
aggregate far tier
with projectiles
with XP pressure
with elite
with boss
```

## 7.4 Metrics

Record:

- CPU frame time
- GPU frame time
- p50 frame time
- p95 frame time
- p99 frame time
- Draw calls
- Triangles
- Active animation mixers
- Active skinned meshes
- Shadow casters
- Snapshot bytes per second
- Network interpolation cost
- Server step cost
- Memory usage
- State growth over time

## 7.5 Target hardware classes

At minimum test:

```text
Integrated/low-end laptop GPU
Mid-range desktop GPU
Current development machine
```

Record browser and resolution.

## 7.6 Population decision

After benchmarking, define:

```text
maximum full-animation near population
maximum mid-animation population
maximum far-animation population
maximum aggregate population
maximum total production population
```

Do not make all far monsters full skeletal rigs unless the benchmark proves it is affordable.

## 7.7 Benchmark acceptance

The result must be a data-backed recommendation.

Example format:

```text
Near full animation:  40
Mid reduced animation: 120
Far animated:         200
Aggregate:            300
Total:                660
```

The actual values must come from measured results.

---

# 8. Workstream D — Visual cohesion and urban prototype

## 8.1 Current visual problem

The game currently combines several visual languages:

```text
tank
Quaternius monsters
procedural terrain
grass
sky
fog
lighting
UI
effects
```

The result may feel visually ununified.

## 8.2 Cohesion pass before map replacement

Before replacing the current map, standardize:

- Lighting
- Tone mapping
- Exposure
- Fog
- Shadow softness
- Ground material scale
- Material roughness
- Sky color
- Prop density
- Projectile colors
- Damage effects
- XP color
- Monster material response

The current environment may improve significantly after this pass.

## 8.3 Urban-apocalypse concept

Potential future direction:

```text
mostly flat urban roads
abandoned buildings
road barriers
rubble
plazas
overpasses
zombie-apocalypse asset set
```

Benefits:

- Stronger visual identity
- Better fit with low-poly monsters
- Better fit with vehicle combat
- Stronger connection to the #DRIVE-inspired UI direction
- Readable landmarks
- Better camera consistency
- Fewer grounding problems
- More intentional boss arenas

## 8.4 Navigation risk

Urban obstacles create a major AI requirement.

Current direct pursuit may fail around:

- Buildings
- Walls
- Fences
- Alleys
- Rubble
- Road barriers
- Dead ends

Before urban becomes default, support at least one:

```text
navmesh pathfinding
flow-field navigation
road/waypoint graph
robust obstacle avoidance and recovery
wide-road layout designed for direct steering
```

## 8.5 Prototype only

Do not replace the current map in this milestone.

Create one independent prototype:

```text
200×200 m urban district
wide roads
open plazas
low building density
gentle ramps
limited chokepoints
clear monster spawn lanes
one boss arena
```

Recommended terrain character:

```text
mostly flat
+
rubble ramps
+
overpasses
+
shallow height variation
```

This preserves jump and dash opportunities without deep procedural valleys.

## 8.6 Prototype comparison

Compare current polished terrain versus urban prototype on:

- Visual cohesion
- Dash enjoyment
- Jump usefulness
- Camera quality
- Monster navigation
- Spawn readability
- Combat readability
- Performance
- Boss encounter quality
- Multiplayer clarity
- Art-production effort

## 8.7 Decision gate

Urban becomes the future default only if it clearly improves:

```text
visual identity
movement
combat readability
navigation reliability
performance
```

Otherwise retain the current terrain and continue polishing it.

---

# 9. Implementation phases

## Phase A — Dash and camera

Deliver:

- Dash movement state
- Separate dash velocity
- Chassis-forward lock
- Dash decay/recovery
- Dash collision gating
- Valley-follow camera
- Vertical leash
- Camera collision recovery
- Tests and tuning report

## Phase B — Monster rendering and LOD presentation

Deliver:

- Color-space/material audit
- Neutral monster comparison scene
- Corrected lighting/material pipeline
- Near/mid/far animation tiers
- Smooth transform interpolation
- LOD action continuity
- Supporting atmospheric fog
- Visual gallery

## Phase C — Performance capacity

Deliver:

- 100/250/500/750-enemy scenarios
- Client/server/network metrics
- Animation-tier capacity recommendations
- Production population proposal
- Stress and memory report

## Phase D — Environment direction prototype

Deliver:

- Current-map cohesion pass
- Separate urban prototype
- Navigation evaluation
- Performance comparison
- Visual comparison
- Recommendation: retain, hybridize, or replace later

---

# 10. Scope exclusions

Do not include:

```text
full UI redesign
final HUD redesign
new monster attacks
boss mechanic redesign
ordinary monster balance overhaul
relic balance overhaul
permanent default-map replacement
large navigation-system rewrite without prototype evidence
asset-store purchases without approval
```

---

# 11. Required documentation

Create:

```text
docs/quality/QUALITY_IMPROVEMENT_IMPLEMENTATION_REPORT.md
docs/quality/DASH_AND_CAMERA_TUNING_REPORT.md
docs/quality/MONSTER_PRESENTATION_AUDIT.md
docs/quality/ENEMY_CAPACITY_BENCHMARK.md
docs/quality/URBAN_PROTOTYPE_EVALUATION.md
```

Each report must state:

- Starting and ending SHA
- Changes made
- Tests run
- Browser/device used
- Measurements
- Screenshots or clips
- Known limitations
- Final recommendation

---

# 12. Final acceptance criteria

## Vehicle

```text
[ ] Dash exceeds normal maximum speed
[ ] Dash is not immediately clamped away
[ ] Dash follows chassis direction
[ ] Initial steering lock works
[ ] Dash decays smoothly
[ ] Dash collision gating works
[ ] Multiplayer dash agrees
```

## Camera

```text
[ ] Camera follows tank into valleys
[ ] Vertical lag remains within configured leash
[ ] Downward follow is responsive
[ ] Terrain collision does not leave stale camera height
[ ] Hill, valley, jump, fall, and wall tests pass
```

## Monster presentation

```text
[ ] Monster colors resemble source assets
[ ] Color-space pipeline verified
[ ] No global dark tint
[ ] Near monsters animate correctly
[ ] Mid monsters animate correctly
[ ] Far monsters never T-pose
[ ] Far movement is smooth
[ ] LOD swaps preserve action and position
[ ] Fog supports rather than hides presentation
```

## Capacity

```text
[ ] 100/250/500/750 scenarios measured
[ ] CPU and GPU timings recorded
[ ] Network bandwidth recorded
[ ] Animation-mixer counts recorded
[ ] Shadow and draw-call costs recorded
[ ] Memory/state growth recorded
[ ] Production population recommendation documented
```

## Visual direction

```text
[ ] Current map receives a cohesion pass
[ ] Separate urban prototype exists
[ ] Urban navigation is tested
[ ] Dash and camera tested in urban prototype
[ ] Performance compared
[ ] Boss arena compared
[ ] Final retain/hybrid/replace recommendation documented
```

---

# 13. Final decision principle

The milestone should optimize for:

```text
feel first
clarity second
cohesion third
population fourth
environment replacement last
```

The highest-priority improvements are:

```text
1. Proper dash
2. Valley-follow camera
3. Correct monster color pipeline
4. Smooth animated distant monsters
5. Measured population expansion
6. Urban prototype evaluation
```

Do not commit to a permanent environment replacement until the earlier improvements and benchmarks are complete.
