# Codex Prompt — Fast Map Movement & Terrain Polish

Repository:

```text
https://github.com/mwl313/RecoilCrewDS
```

Implement a short, focused patch based on the latest `main`.

Do not implement or merge the `map-overhaul` branch.

---

# 1. Objective

Make exactly two gameplay improvements:

1. A sufficiently fast tank can leave the crest of any generated uphill surface or authored ramp and gain natural airtime.
2. The existing smooth procedural map no longer creates steep heightfield triangles that produce stretched or broken terrain textures.

Keep the existing smooth-heightfield map system.

Future environmental variation will come from object assets such as roads and buildings. Do not add those assets in this task.

---

# 2. Branch safety

Before editing:

```bash
git fetch origin
git status --short
git branch --show-current
git rev-parse HEAD
git rev-parse origin/main
```

Create:

```bash
git switch main
git pull --ff-only
git switch -c map-movement-polish
```

If local uncommitted work exists, preserve it and do not run destructive commands.

Do not:

- Merge `map-overhaul`
- Cherry-pick `map-overhaul`
- Delete `map-overhaul`
- Merge this completed branch into `main`
- Force-push

---

# 3. Read the design

Read in full:

```text
docs/map-polish/MAP_MOVEMENT_AND_TERRAIN_POLISH_DESIGN.md
```

Treat it as binding.

---

# 4. Preserve current architecture

Keep:

- `smoothHeightfield`
- `map.rocketJumpHighlands`
- Existing map IDs and mode wiring
- Existing route/layout/furniture/density systems
- Existing terrain renderer
- Existing LOD
- Existing explicit ramp launch
- Shared server/predictor `stepTankKinematics()`
- Existing retry, fallback, checksum, and seed behavior

This is not a map-system redesign.

---

# 5. Implement natural terrain crest launching

Primary files:

```text
src/shared/config.ts
src/shared/sim/tankKinematics.ts
tests/tankKinematics.test.ts
```

## Required algorithm

At the end of horizontal movement and before grounded snapping:

```text
speed = horizontal velocity magnitude
direction = normalized horizontal velocity

behindHeight = groundHeightAt(position - direction × lookBehind)
currentHeight = groundHeightAt(position)
aheadHeight = groundHeightAt(position + direction × lookAhead)

incomingGrade =
(currentHeight - behindHeight) / lookBehind

outgoingGrade =
(aheadHeight - currentHeight) / lookAhead
```

Launch when:

```text
tank was grounded
AND no manual jump was accepted this step
AND speed >= surfaceLaunchMinSpeed
AND incomingGrade >= surfaceLaunchMinIncomingGrade
AND outgoingGrade <= surfaceLaunchMaxOutgoingGrade
```

Resolve:

```text
launchVy =
clamp(
  speed × incomingGrade × surfaceLaunchRetention,
  surfaceLaunchMinVy,
  surfaceLaunchMaxVy
)
```

Then:

```text
tank.y = currentHeight + surfaceLaunchDetachEpsilon
tank.vy = max(tank.vy, launchVy)
tank.grounded = false
```

Use movement direction, not chassis forward, so recoil, drift, dash, and reverse motion remain physically consistent.

## Configuration

Add these fields to `GameConfig.tank` and `BASE_CONFIG`:

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

Do not hardcode these values in the kinematics function.

## Existing ramp behavior

Keep the current authored-ramp launch as fallback compatibility.

Prevent double launch:

```text
generic crest launch accepted
→ do not apply explicit ramp impulse in the same step
```

Do not replace the existing ramp content or ramp query.

---

# 6. Retune terrain for render safety

Edit:

```text
content/terrain-profiles/rocket_jump_highlands.json
```

Required direction:

```json
{
  "maxSlope": 0.9,
  "correctAllMap": true,
  "smoothingPasses": 2,
  "finalSmoothingPasses": 2,
  "slopeRules": {
    "driveableMax": 0.7,
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

Set:

```text
features.cliffPlateau.count = 0
features.escarpment.count = 0
```

Keep basin, ridge, plateau, valley, and hill features.

Tune their width/height ranges only if necessary after running the seed sweep.

Do not restore narrow procedural cliff transitions.

---

# 7. Terrain safety regression

Add or extend map-generation tests.

For `map.rocketJumpHighlands`, assert:

```text
correctAllMap === true
cliffPlateau count === 0
escarpment count === 0
all height samples finite
maximum neighboring height delta
  <= maxSlope × cellSize + epsilon
same seed produces same checksum
qualification sweep uses no fallback
```

Use a small epsilon for floating-point comparison.

Do not weaken structural validation.

Do not modify generated files manually.

Regenerate content through repository scripts.

---

# 8. Required tank tests

Add deterministic tests for:

1. Fast uphill-to-flat crest launches.
2. Fast uphill-to-downhill crest launches.
3. Slow crest does not launch.
4. Continuing uphill does not launch.
5. Flat ground does not launch.
6. Downhill-only travel does not launch upward.
7. Launch velocity is capped.
8. Horizontal momentum is retained.
9. Manual jump is not overwritten.
10. Existing authored ramp still launches.
11. Same initial state and inputs produce identical final state.

Use a small custom `GroundQuery` fixture with piecewise analytic heights.

Do not depend on random generated maps for the kinematic unit tests.

---

# 9. Commands to run

Discover exact available scripts from `package.json`, then run at minimum:

```bash
npx tsc --noEmit
npm run generate:map-profiles
npm run generate:content-pack
npm test
npx vitest run tests/tankKinematics.test.ts
npx vitest run tests/mapgen.test.ts
npm run test:maps
npm run test:maps:sweep
npm run build
npm run test:demo
```

Run the existing 1,000-seed or full map sweep when available.

Run browser/manual verification for at least three fixed seeds.

If a command cannot run because of the environment, document the exact reason. Do not claim it passed.

---

# 10. Manual verification

For three fixed seeds:

- Inspect terrain near and far.
- Verify no broken triangular or black stretched textures.
- Drive slowly over hills.
- Drive at full speed over crests.
- Dash up a hill.
- Drive downhill.
- Use an explicit ramp.
- Confirm small bumps do not cause constant hopping.
- Confirm multiplayer and Single Player behave identically.

Record the seeds and observations.

---

# 11. Keep the patch small

Expected primary code changes:

```text
src/shared/config.ts
src/shared/sim/tankKinematics.ts
content/terrain-profiles/rocket_jump_highlands.json
tests/tankKinematics.test.ts
tests/mapgen.test.ts
```

Generated content may change after generation.

Do not modify unrelated systems.

Do not add:

- Terraced map code
- New terrain shaders
- New terrain mesh formats
- Roads
- Buildings
- Map Lab redesign
- Broad physics refactors
- Unrelated cleanup

---

# 12. Acceptance criteria

Complete only when:

```text
[ ] Branch starts from latest main
[ ] No map-overhaul code imported
[ ] Smooth generator remains active
[ ] map.rocketJumpHighlands remains default
[ ] Fast natural crest produces airtime
[ ] Slow crest remains grounded
[ ] Continuing uphill does not launch
[ ] Downhill-only movement does not launch
[ ] Manual jump remains correct
[ ] Explicit ramps still launch
[ ] Vertical launch is capped and configurable
[ ] Dedicated procedural cliffs are disabled
[ ] Whole-map safe-slope correction is active
[ ] Neighbor height deltas pass render-safety test
[ ] Seed sweep has no fallback
[ ] Fixed-seed visual inspection shows no broken textures
[ ] Typecheck, tests, and build pass
[ ] Branch remains unmerged
```

---

# 13. Commit

Use one or two focused commits, for example:

```text
map-polish: add natural terrain crest launches
map-polish: enforce render-safe rolling terrain
```

Leave the branch unmerged for review.

---

# 14. Final report

Report:

1. Starting and final SHA
2. Files changed
3. Crest-launch algorithm
4. Final tuning values
5. Terrain profile changes
6. Tests and commands actually run
7. Seed-sweep result
8. Manual seeds tested
9. Remaining tuning notes
10. Confirmation that `map-overhaul` was not merged and this branch remains unmerged
