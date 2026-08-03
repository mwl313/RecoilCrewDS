# Dramatic Terrain & Cliffs — Implementation Report

**Branch:** `map-lab`
**Plan:** `docs/map-generation/DRAMATIC_TERRAIN_CLIFF_IMPLEMENTATION_PLAN.md`

## 1. What changed

The map generator no longer assumes every cell is driveable. Terrain is
classified per-cell (driveable/risky/blocked/cliff wall + protected bits),
required traversal is corrected and validated strictly, optional terrain
may be steep/blocked/cliff-like, dedicated `cliffPlateau` and `escarpment`
features produce authoritative wall masks + edge segments, vertical walls
render from that data, and the tank (plus ground enemies) can never snap
upward through a cliff while falling downhill stays airborne physics.

`ARENA_GENERATOR_VERSION` was bumped **1 → 2**; old active matches fail the
existing version gate instead of reconstructing different terrain.

## 2. Files added

```text
src/shared/mapgen/terrainFlags.ts       bitmask classes, protected masks, metrics, checksum
src/shared/mapgen/cliffs.ts             cliff features, masks, access corridors, edges
src/shared/mapgen/terrainTraversal.ts   queryTerrainTransition / canTraverseGroundStep
src/client/map-debug/layers/terrainClassLayer.ts  driveable/risky/blocked/cliff/protected/cost layers
content/terrain-profiles/{dramatic_highlands,cliff_arena}.json
content/validation-profiles/{dramatic_highlands,cliff_arena}.json
content/maps/{dramatic_highlands,cliff_arena}.json
tests/terrainTraversal.test.ts
tests/mapgenDramatic.test.ts
docs/guides/DRAMATIC_TERRAIN_PROFILE_AUTHORING.md
docs/map-generation/DRAMATIC_TERRAIN_CLIFF_IMPLEMENTATION_REPORT.md (this file)
```

## 3. Files modified

```text
src/shared/content/schemas/terrainProfile.ts    slopeRules + cliff feature configs
src/shared/mapgen/{profiles,features,generator,routes,spawns,recovery,layout,
                   validation,validation2,retry,arenaSession,compat,seed,index}.ts
src/shared/sim/{groundQuery,tankKinematics}.ts
src/shared/enemies/enemyBehaviors.ts
src/shared/mapgen/validationIssues.ts           cliffs category
src/client/arenaView.ts                         cliff wall meshes + camera colliders
src/client/map-debug/{terrainMesh,index}.ts
tools/maplab/src/{main,panels/ui}.ts            fallback banner, metrics, layers, profile list
tools/maplab/src/parameters/terrainParameters.ts + registry (slopeRules + cliff controls)
tools/maplab/src/{generatorAdapter,io/export}.ts  flags/edges/access in serialization/exports
scripts/mapgen-sweep.ts (+ test:maps:sweep:full)
content/manifest.json, tests/*, docs/*
```

## 4. Algorithms

### Terrain classes

`terrainFlags` is a `Uint32Array` aligned with the heightfield. Slopes come
from the `slopeRules` profile (back-compat defaults derived from
`maxSlope`). Protected flags (routes/spawns/gates/recovery/landings/access)
are stamped after layout, protected cells are corrected to `driveableMax`,
and the final smoothing pass excludes cliff-wall cells.

### Cliffs

`cliffPlateau` stamps a flat top with a narrow transition band; `escarpment`
stamps a directional height step whose lower side faces the map center.
Masks (top/wall/bottom) are computed from the feature geometry, access
corridors are carved before route generation, and `CliffEdgeSegment[]`
(top/bottom heights, normals, feature id) is extracted from wall cells
adjacent to top cells in stable order.

### Checksum

`computeArenaChecksum` = hash of heightfield bytes + terrain flags + cliff
edge geometry. It replaces the bare heightfield checksum in
`metadataFromArena` and the client reconstruction gate.

### Traversal guard

`queryTerrainTransition` reads the authoritative heightfield/flags;
`canTraverseGroundStep` blocks grounded upward movement above `maxStepUp`
or through a cliff wall. It runs inside every tank integration substep
(dash and recoil included), in the enemy movement behavior, and in the
truck behavior. Downhill movement is always allowed; a sufficient drop
leaves the tank airborne.

### Validation philosophy

- Global sanity (bounds, finite, height, determinism, time, masks, spikes
  without cliff data) — strict.
- Required traversal (connectivity, width, slope, no wall crossing, spawn/
  gate/recovery safety, access corridors, loops) — strict.
- Optional terrain — permissive; metrics/warnings.
- Optional content (invalid ramp skipped, furniture underfill, decorations)
  — soft-fail warnings.

## 5. Results

### Unit

```text
npm test              384/384 PASS (37 files)
npm run test:maplab    32/32  PASS (7 files)
```

New coverage: terrain flags, protected masks, localized correction, cliff
exclusion, deterministic edge extraction/order, same-seed parity, route
wall avoidance, access corridors, required-route slope, optional steep
acceptance, spawn/recovery buffers, ramp skip warning path, Exact Candidate
invalid rendering, fallback retry diagnostics, step-up/step-down/cliff/dash/
recoil/fall/low-gravity/predictor-convergence kinematics, wall geometry
vertex alignment, and a bad-seed corpus (wall-crossing corridor, missing
access, spawn on wall, missing recovery, extreme drop).

### Maps and sweeps

```text
npm run test:maps        PASS (64 runs, retries 3, fallback 0)
npm run test:maps:sweep  PASS (350/profile):
  primary           fallback 0, driveable 100%
  dramaticHighlands fallback 5, driveable 99.4%, avg cliff edges 100.8, max drop 9.2m, access 1.97
  cliffArena        fallback 4, driveable 99.4%, avg cliff edges 97.5, max drop 12.1m, access 1.98
npm run test:maps:sweep:full  PASS (1000/profile):
  primary 0 fallback; dramatic 18; cliffArena 9
  p50/p95/p99 gen ms: primary 25.6/28.6/35.9, dramatic 37.0/39.0/43.6, cliff 32.4/37.7/45.3
  determinism recheck PASS
```

### Game gates

```text
npm run build           PASS
npm run build:maplab    PASS
npm run test:demo       PASS (golden byte-identical — legacy arena untouched)
npm run test:e2e        PASS 23/23
npm run test:loop       PASS (score 525, JACKPOT x1, rematch ok)
```

## 6. Known limitations

- Fallback rate for the new profiles is ~1–2% (mostly access-corridor and
  gate-connectivity retries); `retryLimit` 8–10 absorbs them. Raising
  access counts or lowering `minSeparation` reduces retries at the cost of
  drama.
- Cliff walls are camera colliders in the game view but not physics
  colliders — tank blocking comes from the shared step guard, which is
  authoritative and identical on server/predictor/Practice.
- Escarpment access corridors are carved from the lower side facing the map
  center; strongly off-center escarpments may retry more often.
- The optional `cliffMaterialId` profile field currently selects between
  the default rock and an ice variant; a full material registry is future
  work.
- Route generation still samples straight-line candidates; access corridors
  let routes reach high ground, but complex switchback routes are not
  generated.

## 7. How to use

See `docs/guides/DRAMATIC_TERRAIN_PROFILE_AUTHORING.md` for profile tuning,
mask inspection, fallback interpretation, seed sweeps, and safe promotion.
