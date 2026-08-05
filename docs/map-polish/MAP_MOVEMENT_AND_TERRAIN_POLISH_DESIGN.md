# Recoil Crew — Map Movement & Terrain Polish

> **Status:** Binding implementation design  
> **Target branch:** `map-movement-polish`  
> **Base:** Latest `main`  
> **Scope:** Two contained changes only  
> **Default map:** Keep `map.rocketJumpHighlands`  
> **Out of scope:** `map-overhaul`, terraced maps, new road/building systems, new terrain shaders

---

# 1. Goal

Return to the stable smooth-heightfield map system currently on `main` and make only two focused improvements:

1. A fast tank can leave the crest of any upward hill or ramp and gain natural airtime.
2. Generated terrain must remain within a render-safe slope range so stretched or broken steep-hill textures do not return.

Environmental variety will later come from roads, buildings, props, and landmark assets rather than extreme procedural cliffs.

The intended result is:

```text
existing rolling procedural terrain
+ natural speed-based hill launching
+ safe terrain slopes
+ future asset-based environmental variety
```

---

# 2. Branch policy

Create a new branch from the latest `main`:

```bash
git switch main
git pull --ff-only
git switch -c map-movement-polish
```

Do not merge, cherry-pick, or copy the `map-overhaul` implementation.

Leave `map-overhaul` untouched for archival/reference purposes.

Do not change the map generation mode or introduce a second map architecture.

---

# 3. Existing architecture to preserve

Keep the current systems on `main`:

- `smoothHeightfield` procedural terrain
- Existing map profiles and generated content
- `map.rocketJumpHighlands`
- Existing route, zone, furniture, density, and landmark integration
- Existing cliff/step traversal protection
- Shared `stepTankKinematics()` used by server authority and client prediction
- Existing explicit ramp launch behavior
- Existing terrain chunk renderer and LOD system
- Existing deterministic seed, retry, checksum, and fallback behavior

No large refactor is required.

---

# 4. Change A — Natural hill and ramp crest launching

## 4.1 Problem

The current tank follows terrain horizontally and snaps its vertical position to the ground:

```text
move horizontally
→ sample ground
→ snap tank Y to ground
→ set vertical velocity to zero
```

Explicit ramp assets can launch the tank because they have a special exit rule.

Natural hills cannot launch the tank because the upward component of hill motion is discarded every grounded frame.

## 4.2 Design

Use a small, stateless crest detector based on terrain heights behind and ahead of the moving tank.

At the end of horizontal movement, before the grounded snap:

1. Measure horizontal speed.
2. Resolve horizontal movement direction.
3. Sample terrain height behind the tank.
4. Sample terrain height at the tank.
5. Sample terrain height ahead of the tank.
6. Calculate the incoming and outgoing grades.
7. Launch only when the tank arrived from a meaningful uphill slope and the terrain ahead becomes flat or descends.

Definitions:

```text
incomingGrade =
(currentHeight - behindHeight) / lookBehindDistance

outgoingGrade =
(aheadHeight - currentHeight) / lookAheadDistance
```

Launch condition:

```text
tank was grounded
AND no manual jump occurred this step
AND horizontal speed >= minimum speed
AND incomingGrade >= minimum uphill grade
AND outgoingGrade <= crest release grade
AND derived vertical launch velocity >= minimum launch velocity
```

Derived launch velocity:

```text
launchVy =
clamp(
  horizontalSpeed × incomingGrade × retention,
  minimumLaunchVy,
  maximumLaunchVy
)
```

When accepted:

```text
tank.y = current ground height + small detach epsilon
tank.vy = max(existing vy, launchVy)
tank.grounded = false
```

## 4.3 Why this method

This method is intentionally simple:

- No persistent slope-history state
- No new terrain representation
- No special tags for natural hills
- Works with generated hills and authored ramps
- Uses the shared authoritative ground query
- Runs identically on server and predictor
- Avoids launching from a surface that is still rising
- Avoids launching from downhill travel alone

## 4.4 Required tuning fields

Add these tank configuration values:

```ts
surfaceLaunchMinSpeed: number;
surfaceLaunchLookBehind: number;
surfaceLaunchLookAhead: number;
surfaceLaunchMinIncomingGrade: number;
surfaceLaunchMaxOutgoingGrade: number;
surfaceLaunchRetention: number;
surfaceLaunchMinVy: number;
surfaceLaunchMaxVy: number;
surfaceLaunchDetachEpsilon: number;
```

Initial values:

```json
{
  "surfaceLaunchMinSpeed": 7.0,
  "surfaceLaunchLookBehind": 2.0,
  "surfaceLaunchLookAhead": 2.5,
  "surfaceLaunchMinIncomingGrade": 0.15,
  "surfaceLaunchMaxOutgoingGrade": 0.05,
  "surfaceLaunchRetention": 0.80,
  "surfaceLaunchMinVy": 1.5,
  "surfaceLaunchMaxVy": 8.0,
  "surfaceLaunchDetachEpsilon": 0.05
}
```

These values are tuning defaults.

Do not hardcode them inside `tankKinematics.ts`.

## 4.5 Explicit ramp compatibility

Keep the existing authored-ramp exit launch as a compatibility fallback.

Rules:

- Run generic terrain crest launch first.
- Track whether a launch was accepted this step.
- Do not apply the explicit ramp launch a second time in the same step.
- Existing ramp tests must continue to pass.

The long-term behavior should feel consistent whether the takeoff surface is a generated hill or an authored ramp.

## 4.6 Non-launch cases

The following must not launch the tank:

- Flat ground
- Speed below the threshold
- Driving downhill without first climbing
- A hill that continues rising ahead
- Tiny terrain noise below the grade threshold
- Manual jump already accepted that step
- Tank already airborne
- Reverse travel unless the actual movement direction forms a valid uphill crest

---

# 5. Change B — Render-safe rolling terrain

## 5.1 Problem

The terrain renderer uses world X/Z UV projection.

A very steep heightfield triangle has a large visible vertical area but almost no horizontal UV area. The texture stretches severely and may appear as broken triangular terrain.

The current `map.rocketJumpHighlands` profile also includes narrow dedicated cliff features, which can create exactly these near-vertical triangles.

## 5.2 Philosophy

Do not solve this with a new shader or a new mesh architecture.

The revised map direction does not need procedural vertical cliffs.

Use object assets later for:

- Buildings
- Roads
- Bridges
- Retaining walls
- Industrial structures
- Landmark silhouettes
- Other environmental verticality

The procedural terrain should provide safe rolling hills, ridges, plateaus, basins, and valleys.

## 5.3 Profile changes

Retune:

```text
content/terrain-profiles/rocket_jump_highlands.json
```

Required changes:

```json
{
  "correctAllMap": true,
  "smoothingPasses": 2,
  "finalSmoothingPasses": 2,
  "features": {
    "cliffPlateau": {
      "count": 0
    },
    "escarpment": {
      "count": 0
    }
  }
}
```

Keep the ordinary terrain features:

- Basin
- Ridge
- Plateau
- Valley
- Hill

Recommended initial slope values:

```json
{
  "maxSlope": 0.9,
  "slopeRules": {
    "driveableMax": 0.70,
    "riskyMax": 0.85,
    "blockedMin": 1.0,
    "cliffMin": 1.25,
    "spawnMax": 0.2,
    "recoveryMax": 0.15,
    "landingMax": 0.3,
    "maxStepUp": 0.8
  }
}
```

Tune ordinary feature widths or heights only if the full-map correction removes too much shape.

Do not restore narrow procedural cliff edges.

## 5.4 Render-safety invariant

For `map.rocketJumpHighlands`, the generated terrain must satisfy:

```text
maximum neighboring height delta
<= terrainProfile.maxSlope × cellSize + epsilon
```

With a 4 m cell and `maxSlope = 0.9`, the initial maximum neighboring height difference is approximately:

```text
3.6 m
```

This check should be exercised through tests and seed sweeps.

## 5.5 No renderer overhaul

Do not:

- Add triplanar terrain shaders
- Replace terrain chunk generation
- Split the terrain into top and wall meshes
- Add terraced geometry
- Add new cliff wall geometry
- Change LOD architecture
- Introduce a second terrain material pipeline

The safe-slope profile is the fix.

---

# 6. Files expected to change

Primary files:

```text
src/shared/config.ts
src/shared/sim/tankKinematics.ts
content/terrain-profiles/rocket_jump_highlands.json
tests/tankKinematics.test.ts
tests/mapgen.test.ts
```

Possible generated files after normal content generation:

```text
src/generated/mapProfiles.generated.ts
src/generated/contentPack.generated.ts
```

Do not edit generated files manually.

No changes should be required in:

```text
src/client/map-debug/terrainMesh.ts
src/shared/mapgen/terraced/
tools/maplab terraced modules
```

---

# 7. Tests

## 7.1 Tank crest-launch tests

Add deterministic ground fixtures for:

### Fast crest launch

A piecewise surface:

```text
behind: rising
current: crest
ahead: flat or descending
```

Expected:

```text
grounded → airborne
vy > 0
horizontal momentum retained
```

### Slow crest

Same terrain below minimum speed.

Expected:

```text
remains grounded
vy = 0
```

### Continuing uphill

Incoming and outgoing grades both positive.

Expected:

```text
remains grounded
```

### Downhill-only movement

Incoming grade is not uphill.

Expected:

```text
no artificial upward launch
```

### Flat terrain

Expected:

```text
no launch
```

### Vertical velocity cap

A steep synthetic fixture and dash-level speed.

Expected:

```text
vy <= surfaceLaunchMaxVy
```

### Existing explicit ramp

Existing behavior still launches.

### Shared determinism

Running the same fixed inputs and ground fixture produces the same final state.

## 7.2 Terrain safety tests

For `map.rocketJumpHighlands`:

- Dedicated cliff counts are zero.
- `correctAllMap` is true.
- All samples are finite.
- All generated seeds remain in configured height range.
- Maximum neighboring height delta stays within render-safe tolerance.
- No fallback across the qualification sweep.
- Same seed produces the same checksum.

Development sweep:

```text
100 seeds
```

Final quick qualification:

```text
1,000 seeds
```

A 10,000-seed sweep is optional for this small patch unless existing scripts make it inexpensive.

---

# 8. Manual checks

Use at least three fixed seeds.

For each seed:

1. Drive slowly over hills.
2. Drive at normal maximum speed over hill crests.
3. Dash into an uphill crest.
4. Drive downhill.
5. Use an explicit ramp.
6. Inspect terrain from near and far camera distances.
7. Confirm no stretched black or triangular texture artifacts.
8. Confirm hills remain visually noticeable.
9. Confirm no frequent launches from tiny surface noise.
10. Confirm multiplayer and Single Player use the same terrain and movement.

---

# 9. Acceptance criteria

The patch is complete when:

- The branch is based on latest `main`.
- No `map-overhaul` code is imported.
- The old smooth map architecture remains active.
- `map.rocketJumpHighlands` remains the default.
- A fast tank launches from a natural uphill crest.
- A slow tank remains grounded.
- Continuing uphill does not launch.
- Downhill-only movement does not launch.
- Existing authored ramps still launch.
- Server and predictor use the same shared implementation.
- Horizontal momentum is retained in flight.
- Launch vertical velocity is configurable and capped.
- Dedicated procedural cliff features are disabled.
- Whole-map safe-slope correction is enabled.
- Generated terrain stays within the render-safe neighboring-height limit.
- Texture artifacts do not appear in manual fixed-seed checks.
- Existing map, movement, multiplayer, and build tests pass.
- The completed branch is left unmerged for review.

---

# 10. Explicitly prohibited scope expansion

Do not:

- Rebuild Map Lab
- Reintroduce the terraced overhaul
- Add procedural square blocks
- Add a new terrain renderer
- Add a triplanar shader
- Add roads or buildings in this patch
- Change map IDs
- Change mode IDs
- Change furniture or density systems
- Replace existing ramp physics entirely
- Make cliff validation globally weaker
- Add unrelated refactors
- Merge the branch into `main`

---

# 11. Final summary

```text
Map:
Keep the current smooth heightfield generator.
Disable narrow procedural cliffs.
Correct the full map to a render-safe slope.
Use assets later for buildings, roads, and vertical variety.

Tank:
Sample terrain behind, under, and ahead.
Detect a real uphill-to-flat/downhill crest.
Convert speed and incoming grade into capped vertical velocity.
Keep existing explicit ramps as a fallback.
Run everything in shared deterministic kinematics.
```
