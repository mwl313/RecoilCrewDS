# Dramatic Terrain & Cliff Profile Authoring

This guide explains how to author terrain profiles for MegaBonk-style maps:
tall plateaus, deep valleys, narrow ridges, steep escarpments, deliberate
cliff walls, and safe roads weaving through dangerous terrain.

## The governing rule

> Recoil Crew guarantees a safe connected gameplay network, not a
> universally driveable landscape.

Everything inside the required traversal network (route corridors, player
spawn clear areas, enemy gate exits, recovery zones, mandatory ramp
landings, and cliff access roads) must be reliably driveable. Everything
outside that network may be risky, blocked, elevated, or cliff-like — as
long as it is deterministic and cannot trap required gameplay.

## Driveable vs risky vs blocked vs cliff

Every terrain cell gets a bit-mask classification from the profile's
`slopeRules`:

| Class | Slope | Meaning |
| --- | --- | --- |
| **Driveable** | `< driveableMax` | Normal ground; routes may use it. |
| **Risky** | `driveableMax..riskyMax` | Steep optional terrain; a shortcut only, never required. |
| **Blocked** | `>= blockedMin` | Impassable optional terrain (or cliff walls). |
| **Cliff wall** | `>= cliffMin` (with valid cliff data) | Deliberate vertical wall from a `cliffPlateau`/`escarpment` feature. |

The flags also include `CliffTop`, `CliffBottom`, `RouteProtected`,
`SpawnProtected`, `GateProtected`, `RecoveryProtected`,
`LandingProtected`, and `CliffAccess`.

```json
{
  "slopeRules": {
    "driveableMax": 0.35,
    "riskyMax": 0.9,
    "blockedMin": 0.9,
    "cliffMin": 1.2,
    "spawnMax": 0.2,
    "recoveryMax": 0.15,
    "landingMax": 0.25,
    "maxStepUp": 0.8
  }
}
```

`maxStepUp` is the highest upward step a grounded tank may climb; cliff
walls are never climbable by snapping. Downhill falls are always allowed.

Old profiles without `slopeRules` keep working: rules are derived from the
legacy `maxSlope`. The primary profile keeps its old all-map flattening via
`"correctAllMap": true`; dramatic/cliff profiles leave it off so only
required terrain is corrected.

## Why only required paths are strictly driveable

The generator:

1. Shapes terrain (base → macro features → smoothing → cliff features).
2. Carves cliff access corridors and classifies every cell.
3. Builds the required route graph using a traversal-cost model: cliff
   walls and blocked cells are forbidden for required edges, risky cells
   cost more.
4. Carves route corridors, then applies **localized** slope correction
   (protected cells only) and mask-aware smoothing that never touches
   cliff walls.

Optional steep terrain is never "fixed" and never rejected. The validators
report driveable/risky/blocked ratios as warnings; they only fail when a
required path, spawn, gate, recovery zone, or mandatory landing is unsafe.

## Cliff features

Two dedicated feature types live under `terrainProfile.features`:

```json
{
  "cliffPlateau": {
    "count": 3,
    "minSeparation": 80,
    "radius": [24, 42],
    "height": [6, 12],
    "falloff": 0.15,
    "edgeWidth": [3, 6],
    "edgeRoughness": 0.45,
    "accessCount": 1,
    "accessWidth": 10,
    "accessMaxSlope": 0.3,
    "safetyBuffer": 8,
    "boundaryClearance": 25,
    "spawnClearance": 40
  },
  "escarpment": {
    "count": 2,
    "minSeparation": 80,
    "length": [70, 150],
    "width": [18, 34],
    "height": [6, 11],
    "edgeWidth": [3, 6],
    "edgeRoughness": 0.45,
    "accessCount": 1,
    "accessWidth": 10,
    "accessMaxSlope": 0.3,
    "safetyBuffer": 8,
    "boundaryClearance": 25,
    "spawnClearance": 40
  }
}
```

### Tuning cliff height and access

- **Height/drop** (`height` on cliffPlateau, escarpment): the vertical
  difference. The wall must be steeper than `cliffMin`; if
  `edgeWidth` is too wide for the height, the feature produces **no wall**
  and the candidate fails validation.
- **edgeWidth**: the sharp transition band. Narrow (3–6 m) = sheer cliff;
  wide = a ramp-like edge that may not qualify as a wall.
- **edgeRoughness**: 0..1 deterministic edge irregularity.
- **accessCount**: how many driveable roads are carved up to the top.
  `0` = inaccessible optional high ground (allowed only if no spawn/gate/
  recovery sits on top and no required progression needs it).
- **accessWidth / accessMaxSlope**: width and steepness of the carved
  access roads.
- **safetyBuffer / boundaryClearance / spawnClearance**: keep-away zones
  below walls, from map edges, and from spawns.

## Inspecting masks in Map Lab

Open Map Lab, load a dramatic/cliff profile, and use the bottom layer
drawer:

- `driveableMask`, `riskyMask`, `blockedMask` — terrain classes
- `cliffTop`, `cliffBottom`, `cliffWalls`, `cliffSafetyBuffer`
- `protectedTraversal`, `cliffAccessRoutes`, `terrainCost`

Toggle them and regenerate to verify the safe network winds around the
dangerous terrain. Validation issues in the right panel focus the camera on
the exact problem cell.

## Interpreting fallback

If every retry attempt fails, the game uses the fixed known-safe fallback
map. Map Lab shows a prominent **FALLBACK MAP** banner with every attempt's
index, candidate seed, and errors, so you can see the dominant failure
category (e.g. access corridors, gate connectivity, cliff walls). Raise
`retryLimit`, relax spacing, or give cliffs more access before shipping.

## Evaluating multiple seeds

```bash
npm run test:maps:sweep        # default runs per profile
npm run test:maps:sweep:full   # 1000 runs per profile
```

The sweep reports accepted maps, retry distribution, fallback rate,
driveable/risky/blocked ratios, cliff edge count/length, largest drop,
access success, route max slope, loops, widths, and generation-time
percentiles (p50/p95/p99). Determinism is re-checked for the first seed of
every profile.

## Fatal failures vs warnings

**Fatal (candidate rejected, deterministic retry):**

- broken required route network, corridor crossing a cliff wall
- corridor slope/width above the profile limits
- unsafe spawn, gate, or recovery (steep, on a wall, on a cliff top)
- missing recovery zones
- cliff feature that cannot form a wall; corrupt mask/edge data
- configured access corridor missing, too steep, or blocked
- nondeterminism, non-finite samples, out-of-bounds heights
- required gameplay region inaccessible

**Warnings (candidate accepted):**

- optional terrain that is risky/blocked/cliff-like
- invalid optional ramp skipped
- furniture underfill
- decorations anywhere
- inaccessible decorative-only high ground

## Promoting a profile safely

1. Author the profile in `content/terrain-profiles/` (plus validation
   profile and map id), add files to `content/manifest.json`.
2. `npm run generate:map-profiles`
3. `npm test && npm run test:maps`
4. Sweep it: `npm run test:maps:sweep` and check the fallback rate.
5. Point a mode at it: `"mapProfileId": "map.yourMap"` in
   `content/modes/*.json` (or use Map Lab's **Save as New Profile**).
6. Rebuild and run the game; both clients must share the same content so
   the checksum gate passes.
