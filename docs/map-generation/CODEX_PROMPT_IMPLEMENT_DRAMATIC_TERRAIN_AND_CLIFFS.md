# Codex Prompt — Implement MegaBonk-Style Dramatic Terrain and Cliffs

Repository:

```text
mwl313/RecoilCrewDS
branch: map-lab
```

Treat this prompt as the binding implementation contract.

Before editing, inspect the current repository, especially:

```text
content/terrain-profiles/
content/validation-profiles/
content/furniture-sets/
content/maps/

src/shared/content/schemas/terrainProfile.ts
src/shared/content/schemas/validationProfile.ts
src/shared/mapgen/features.ts
src/shared/mapgen/generator.ts
src/shared/mapgen/heightfield.ts
src/shared/mapgen/routes.ts
src/shared/mapgen/layout.ts
src/shared/mapgen/validation.ts
src/shared/mapgen/validation2.ts
src/shared/mapgen/validationIssues.ts
src/shared/mapgen/retry.ts
src/shared/mapgen/arenaSession.ts
src/shared/mapgen/compat.ts
src/shared/sim/arenaWorld.ts
src/shared/sim/tankKinematics.ts

src/client/map-debug/
src/client/arenaView.ts

tools/maplab/src/
tools/maplab/src/parameters/
tools/maplab/src/generatorAdapter.ts
tools/maplab/src/rendering/viewport.ts

tests/mapgen.test.ts
tests/maplab/
scripts/mapgen-sweep.ts
```

Adapt paths to the actual tree if they changed.

---

# Mission

Change the procedural map system so Recoil Crew can generate, render, simulate, and validate exaggerated dramatic terrain inspired by MegaBonk-style maps:

- Tall plateaus
- Deep valleys
- Narrow ridges
- Steep escarpments
- Deliberately impassable cliff walls
- Large vertical differences
- Safe roads weaving through dangerous terrain
- Optional high-ground areas reached by roads, ramps, jumps, dash, or recoil movement

The new governing rule is:

> The entire map does not need to be driveable. Only the required traversal network and gameplay-critical zones must be reliably driveable and connected.

Do not solve this by merely increasing the global slope limit or disabling validation.

---

# Current assumptions to replace

The current implementation assumes almost all terrain is normal ground:

1. `correctSlopes()` applies one maximum slope across the whole heightfield.
2. The final smoothing pass affects the whole map even when normal smoothing is zero.
3. `validateArena()` rejects a candidate if any cell exceeds one global slope value.
4. The validator cannot distinguish an intentional cliff from a broken spike.
5. Route validation contains hardcoded slope/width values in some paths.
6. Spawn slope uses a hardcoded threshold.
7. Invalid optional ramps or furniture may reject an otherwise valid terrain candidate.
8. There is no dedicated cliff feature, cliff mask, cliff-edge data, or vertical wall rendering.
9. The tank may cross a sudden upward height discontinuity and snap upward because grounding uses the new `groundHeightAt()` after horizontal movement.
10. Production fallback can hide failed dramatic candidates, and Exact Candidate does not reliably render invalid candidates.

Replace these assumptions structurally.

---

# Non-negotiable constraints

Preserve:

- Authoritative Node.js server
- Browser clients
- Deterministic server/client reconstruction
- Checksum gate
- Shared server/predictor tank kinematics
- Existing room/rematch/reconnect behavior
- Practice
- Existing fallback map
- Existing rolling-terrain profile
- Existing content/Map Lab single-source pipeline
- Existing online and Demo regression behavior outside the new profile

Do not:

- Rewrite the engine
- Replace Three.js
- Add Unity/Godot
- Add a full navmesh or general enemy pathfinding system
- Copy MegaBonk code or assets
- Make all steep terrain traversable
- Remove validation
- Let visual cliff geometry disagree with authoritative data
- Add nondeterministic noise
- Make the normal client download Map Lab code
- Break old map-profile JSON without a migration/default path

---

# Implementation governance

Work in four milestones:

```text
Milestone 0 — Audit and contracts
Milestone 1 — Terrain classes and route-focused validation
Milestone 2 — Dedicated cliffs, rendering, and traversal physics
Milestone 3 — Map Lab controls, diagnostics, presets, and stress testing
```

Complete and test each milestone before starting the next.

Create first:

```text
docs/map-generation/DRAMATIC_TERRAIN_CLIFF_IMPLEMENTATION_PLAN.md
```

The plan must document:

- Current generation order
- Current global slope correction
- Current route carving
- Every hardcoded route/spawn threshold
- How tank grounding handles sudden height changes
- How enemy movement interacts with heightfields
- How terrain meshes are built
- Current checksum serialization
- Current Map Lab failure/fallback behavior
- Exact files and data contracts to modify

Then implement. Do not stop after the audit.

---

# Milestone 1 — Terrain classes and route-focused validation

## 1.1 Authoritative terrain flags

Add an authoritative per-cell terrain classification. Prefer a bit mask because a cell may belong to multiple categories.

```ts
export const enum TerrainFlag {
  Driveable        = 1 << 0,
  Risky            = 1 << 1,
  Blocked          = 1 << 2,
  CliffTop         = 1 << 3,
  CliffBottom      = 1 << 4,
  CliffWall        = 1 << 5,
  RouteProtected   = 1 << 6,
  SpawnProtected   = 1 << 7,
  LandingProtected = 1 << 8,
}
```

Store it in a deterministic typed array.

Add shared queries:

```ts
terrainFlagsAt(x, z)
isDriveableAt(x, z)
isCliffWallAt(x, z)
isRequiredTraversalAt(x, z)
```

Include the flags in:

- Serialization
- Checksum/arena identity
- Server/client reconstruction
- Arena export
- Map Lab layers
- Seed-sweep metrics

## 1.2 Split slope rules by purpose

Replace the ambiguous single global slope assumption with profile-driven categories:

```json
{
  "slopeRules": {
    "driveableMax": 0.35,
    "riskyMax": 0.8,
    "blockedMin": 0.8,
    "cliffMin": 1.2,
    "spawnMax": 0.2,
    "recoveryMax": 0.2,
    "landingMax": 0.25,
    "maxStepUp": 0.8
  }
}
```

Names may follow project conventions, but all values must be data-driven.

Backward compatibility:

- Existing profiles without `slopeRules` derive safe defaults from old values.
- The current primary profile retains approximately its existing behavior.
- The fallback profile remains unchanged.

Deprecate the old single `maxSlope` only after all consumers migrate.

## 1.3 Required traversal mask

Build a protected mask for:

- Required route corridors
- Player spawn clear areas
- Enemy gate exits
- Recovery zones
- Mandatory landing zones
- Required objective zones

The mask must include a configurable buffer for the tank footprint, steering, and reconciliation margin.

## 1.4 Mask-aware smoothing and correction

Replace global slope correction with:

```text
global broad shaping
+ localized route/spawn/landing correction
+ cliff-preserving exclusion
```

Required behavior:

- Protected cells are corrected to `driveableMax`.
- Risky cells may exceed `driveableMax`.
- Cliff-wall cells are excluded from ordinary slope correction.
- Cliff-top and cliff-bottom interiors may be smoothed separately.
- Smoothing must not erode a cliff edge.
- Do not run an unconditional whole-map final smoothing pass that destroys cliff edges.
- Existing rolling profiles may opt into old all-map correction behavior through defaults if necessary.

## 1.5 Route generation uses terrain cost

Route generation must use a traversal-cost model:

```text
Driveable: low cost
Risky: high cost, optional shortcut only
Blocked: forbidden for required routes
Cliff wall: forbidden
```

Required routes may not cross cliff walls.

Routes may:

- Go around cliffs
- Enter a cliff top through an explicit access corridor
- Use a validated ramp only for optional traversal
- Never require jump or recoil for baseline progression

Remove hardcoded route checks such as:

```text
slope <= 0.35
halfWidth >= 12
```

Use resolved profile values everywhere.

## 1.6 Spawn, gate, recovery, and landing rules

Make these profile-driven:

- Maximum spawn slope
- Maximum recovery slope
- Maximum landing slope
- Route distance
- Required exit count
- Gate clear radius
- Cliff-edge safety buffer

Critical zones must not overlap:

- Cliff walls
- Cliff safety buffers
- Blocked terrain
- Unstable steep cells

## 1.7 Revised validation philosophy

### Global sanity — strict

Validate:

- Grid dimensions
- Finite values
- Height range
- Determinism
- Checksum stability
- Generation time
- Valid masks
- No corrupt one-cell spikes unless represented as valid cliff data

### Required traversal — strict

Validate:

- Required graph connected
- Required corridor width
- Required corridor slope
- Spawn/gate/recovery accessibility
- Required loops
- No required route through cliff walls
- No required progression dependent on aerial movement

### Optional terrain — permissive

Do not reject merely because non-required terrain is:

- Too steep to drive
- Risky
- Blocked
- An intentional cliff

Report metrics and warnings instead.

### Optional content — soft failure

- Invalid optional ramp: skip/remove and warn.
- Furniture placement failure: reduce count and warn.
- Decorations: never reject a candidate.
- Fail only if minimum required gameplay content cannot be produced.

Document every candidate-fatal error.

---

# Milestone 2 — Dedicated cliffs

## 2.1 Add cliff feature types

Extend macro features:

```ts
type MacroFeatureType =
  | "basin"
  | "ridge"
  | "plateau"
  | "valley"
  | "hill"
  | "cliffPlateau"
  | "escarpment";
```

`cliffPlateau`:

- Broad flat top
- Flat/lower surrounding terrain
- Deliberate sharp drop
- Optional access slopes

`escarpment`:

- Long directional height step
- Upper and lower sides
- Deterministic irregular edge
- Optional passes

Add schema controls:

```text
enabled
count
minSeparation
height/drop range
top radius or length/width
edge transition width
edge roughness
minimum/maximum wall length
access count
access width
access max slope
edge safety buffer
boundary clearance
spawn clearance
```

## 2.2 Generation order

Use a pipeline equivalent to:

```text
base terrain
→ non-cliff features
→ broad initial smoothing
→ cliff feature placement
→ cliff top/bottom shaping
→ cliff masks and edges
→ terrain-cost classification
→ required route graph
→ explicit access corridors
→ route/spawn/landing carving
→ localized protected-area correction
→ mask-aware final smoothing
→ cliff-edge refresh
→ layout and optional props
→ validation
```

Do not place cliffs after routes in a way that cuts through already-valid required traversal.

## 2.3 Authoritative cliff edges

Add deterministic edge data:

```ts
export interface CliffEdgeSegment {
  id: string;
  ax: number;
  az: number;
  bx: number;
  bz: number;
  topY: number;
  bottomY: number;
  normalX: number;
  normalZ: number;
  featureId: string;
}
```

Derive segments from cliff masks/contours in stable order.

Include them in:

- `GeneratedArena`
- Serialization
- Checksum
- Arena export
- Map Lab
- Client rendering
- Traversal queries

## 2.4 Vertical wall rendering

The normal heightfield creates diagonal triangles, not convincing vertical walls.

Generate separate cliff-wall geometry from the authoritative edge segments.

Requirements:

- Vertical or near-vertical quads
- Top/bottom align with authoritative height data
- Stable vertex order
- Correct normals
- No gaps at joins
- Reusable material
- Frustum/chunk handling
- Proper disposal
- Optional material ID in profile
- No visual randomness that affects authority

The top and bottom remain standard heightfield terrain.

## 2.5 Prevent upward ground snapping

Fix shared deterministic movement.

Per horizontal substep, evaluate:

```text
current ground height
candidate ground height
height delta
terrain flags
crossed cliff edge
```

Rules:

- Grounded upward delta above `maxStepUp`: block or slide.
- Upward crossing of a cliff wall: blocked.
- Downward crossing: allowed.
- A sufficient ground drop makes the tank airborne.
- Never snap upward onto a cliff top.
- Dash and recoil use the same substep guard.
- Server, predictor, Practice, and replay use one implementation.

Add a shared query such as:

```ts
queryTerrainTransition(fromX, fromZ, toX, toZ)
canTraverseGroundStep(fromX, fromZ, toX, toZ, actorProfile)
```

Do not embed map-generation internals directly in `tankKinematics.ts`.

## 2.6 Other ground actors

Audit ground enemies and moving actors.

Without adding full pathfinding:

- Ground enemies cannot snap upward through cliffs.
- Required enemy spawns/routes stay on the connected driveable network.
- Local movement rejects impossible upward cliff crossings.
- Trapped optional actors use bounded recovery/despawn behavior.
- Towers do not spawn on walls.

## 2.7 Falling and recovery

Validate:

- Tank may fall from cliff tops.
- Falling does not cause permanent terrain penetration.
- Recovery handles unusable landings or stuck states.
- Recovery points avoid cliff edges.
- Fall damage callbacks still work.
- Low gravity remains deterministic.
- Out-of-bounds falls recover safely.

Do not add invisible horizontal barriers that prevent intended falls.

## 2.8 Camera behavior

Audit camera collision around cliff walls.

Prevent close-range wall clipping using cliff-wall data or a camera-specific wall representation.

Do not use a crude full-height 2D obstacle that stops the tank from falling.

---

# Milestone 3 — Map Lab

## 3.1 New controls

Add descriptor-driven controls for:

```text
Driveable Max Slope
Risky Max Slope
Cliff Minimum Slope
Spawn Max Slope
Recovery Max Slope
Landing Max Slope
Max Step Up
Protected Route Buffer

Cliff Plateau Enabled
Cliff Plateau Count
Cliff Height/Drop
Cliff Top Radius
Cliff Edge Width
Cliff Edge Roughness
Cliff Access Count
Cliff Access Width
Cliff Access Max Slope

Escarpment Enabled
Escarpment Count
Length
Width
Drop
Edge Roughness
Pass Count
```

Do not hardcode controls in panel code.

## 3.2 New layers

Add:

```text
Driveable Mask
Risky Mask
Blocked Mask
Cliff Top
Cliff Bottom
Cliff Walls
Protected Traversal
Cliff Safety Buffer
Cliff Access Routes
Terrain Cost
```

Use distinct colors and legends.

## 3.3 Exact Candidate

Fix Exact Candidate so invalid candidates still render.

Separate:

```text
generationSucceeded
validationPassed
```

Render whenever an arena payload exists.

Disable Apply to Game when validation fails.

## 3.4 Production fallback diagnostics

When fallback is used, show a prominent banner:

```text
FALLBACK MAP
All procedural attempts failed
```

Display per attempt:

- Attempt index
- Candidate seed
- Phase 1 errors
- Phase 2 errors
- Category summary

Preserve full retry reports rather than one boolean.

## 3.5 Metrics

Display:

```text
Driveable area %
Risky area %
Blocked area %
Cliff-wall area or total length
Cliff feature count
Largest vertical drop
Required-route max slope
Optional-terrain max slope
Cliff access count
High-ground regions with access
Skipped optional ramps
Skipped furniture
Fallback reason
```

## 3.6 New profiles

Add without profile-ID code branches:

```text
map.dramaticHighlands
map.cliffArena
```

`dramaticHighlands`:

- Tall mostly sloped terrain
- Few true cliffs
- Conservative starting profile

`cliffArena`:

- Multiple plateaus/escarpments
- Strong vertical contrast
- Protected driveable network
- Optional high-ground access

Do not overwrite the current primary profile.

---

# Detailed validation rules

## Terrain-class validation

Check:

- Every cell has valid flags.
- Cliff-wall flags match valid edge segments.
- Top and bottom differ by minimum configured drop.
- No one-cell holes in cliff walls.
- Top and bottom interiors have sufficient stable area.
- No protected route/spawn/recovery/mandatory landing overlaps a wall.
- Edge buffers are respected.

## Access validation

A cliff-top region containing gameplay content must have at least one valid access method:

```text
driveable road
validated ramp
optional jump/recoil access explicitly marked optional
```

Baseline progression must not depend on aerial access.

Decorative empty cliff tops may be inaccessible if the profile allows it.

## Route validation

Use resolved profile values everywhere.

Check:

- Connectivity
- Width
- Slope
- No wall crossing
- No upward step above actor capability
- Required regions reachable
- Gate-to-centre path
- Recovery reachable

Do not use optional terrain’s global maximum slope as a failure condition.

## Cliff validation

For each cliff feature:

- Drop range
- Minimum wall length
- Boundary safety
- Spawn/gate exclusion
- Required-corridor exclusion
- Top/bottom continuity
- Access requirement
- Render segments match authoritative data

## Soft-failure policy

Warnings/skips:

- Optional ramp failure
- Decoration failure
- Furniture underfill
- Inaccessible decorative-only high ground

Fatal:

- Broken required route network
- Unsafe player spawn
- Missing recovery
- Corrupt mask/edge data
- Nondeterminism
- Cliff cutting a required route
- Required gameplay region inaccessible
- Impossible upward transition on required route

---

# Data and network compatibility

Update:

- Terrain schema
- Validation schema
- Generated client bundles
- `GeneratedArena`
- Worker serialization
- Checksum
- Arena export
- Validation export
- Map Lab draft migration
- Content authoring docs

Increment:

```ts
ARENA_GENERATOR_VERSION
```

Old active matches must fail the existing version gate rather than reconstruct different terrain silently.

---

# Tests

## Unit

Add tests for:

- Terrain flag assignment
- Protected-mask construction
- Localized slope correction
- Cliff exclusion from correction
- Mask-aware smoothing
- Deterministic cliff-edge extraction
- Stable edge ordering
- Same seed/profile parity
- Route avoidance of walls
- Access corridor validity
- Required route slope
- Optional steep terrain accepted
- Spawn/recovery/landing buffers
- Optional ramp skipped
- Furniture underfill warning
- Exact Candidate invalid payload rendering
- Fallback retry diagnostics

## Kinematics

Add shared server/predictor tests:

- Small step up succeeds.
- Step above `maxStepUp` is blocked.
- Upward cliff crossing cannot snap to top.
- Downward crossing makes tank airborne.
- Dash cannot tunnel upward.
- Recoil cannot tunnel upward.
- Falling triggers landing/fall callbacks.
- Low gravity remains deterministic.
- Predictor and server converge.

## Rendering

- Wall geometry aligns with top/bottom terrain.
- No gaps between wall segments.
- Correct normals.
- LOD does not remove walls.
- Regeneration/rematch disposes wall geometry.
- Camera does not visibly clip through walls.

## Validation

- Steep optional terrain accepted.
- Steep required route rejected.
- Cliff through spawn rejected.
- Cliff through recovery rejected.
- Inaccessible mandatory high ground rejected.
- Decorative inaccessible top accepted.
- Corrupt mask/edge mismatch rejected.

## Seed sweeps

Run both new profiles and record:

- Accepted maps
- Retry distribution
- Fallback rate
- Driveable/risky/blocked ratios
- Cliff count and edge length
- Largest drop
- Required-route slope
- Optional max slope
- Access success
- Generation p50/p95/p99
- Server/client checksum parity

Add a bad-seed corpus for:

- Cliff-route intersection
- Missing access
- Spawn near edge
- Extreme drop
- Mask discontinuity
- Recovery failure
- Upward-snap regression

---

# Command gate

Run and report actual outputs:

```bash
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
```

Also run, when available:

```bash
npm run test:maps:sweep:full
```

Manually test two browsers:

- Same dramatic map
- Same cliff walls
- Upward climbing blocked
- Downward falling allowed
- Rematch reroll
- Reconnect same map
- Practice parity

Do not claim completion without executed results.

---

# Documentation

Create:

```text
docs/map-generation/DRAMATIC_TERRAIN_CLIFF_IMPLEMENTATION_REPORT.md
docs/guides/DRAMATIC_TERRAIN_PROFILE_AUTHORING.md
```

Update:

```text
docs/guides/ARCHITECTURE.md
docs/guides/CONTENT_AUTHORING_GUIDE.md
docs/guides/NETWORK_RULES.md
docs/guides/SMOKE_TEST.md
docs/maplab/MAP_LAB_USER_GUIDE.md
docs/maplab/MAP_LAB_ARCHITECTURE.md
docs/planning/BUILD_STATUS.md
```

The authoring guide must explain:

- Driveable vs risky vs blocked vs cliff terrain
- Why only required paths are strictly driveable
- How to tune cliff height and access
- How to inspect masks in Map Lab
- How to interpret fallback
- How to evaluate multiple seeds
- Fatal failures vs warnings
- How to promote a profile safely

---

# Completion criteria

Complete only when:

1. The generator no longer assumes every cell is driveable.
2. Required routes and critical zones remain strictly safe.
3. Optional terrain may be steep, blocked, or cliff-like without global rejection.
4. Dedicated cliffs produce deterministic top, bottom, mask, and edge data.
5. Vertical walls render from authoritative data.
6. Tank cannot snap or tunnel upward through cliffs.
7. Tank may fall downward into normal airborne physics.
8. Ground enemies cannot climb cliffs through snapping.
9. Server, predictor, Practice, and reconnect remain identical.
10. Map Lab edits and visualizes all terrain classes and cliff settings.
11. Invalid Exact Candidates remain visible.
12. Production fallback clearly explains every failed attempt.
13. Existing primary and fallback profiles still work.
14. New dramatic and cliff profiles pass deterministic sweeps.
15. Existing game, map, network, and Map Lab tests pass.

Final invariant:

> Recoil Crew guarantees a safe connected gameplay network, not a universally driveable landscape. Everything outside that network may deliberately become risky, impassable, elevated, or cliff-like as long as it is deterministic, visually and physically consistent, and cannot trap required gameplay.
