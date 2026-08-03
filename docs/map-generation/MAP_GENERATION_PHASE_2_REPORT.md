# Map Generation Phase 2 — Report

**Specification:** `docs/design/01-맵-디자인.md` (binding, §8–9, 11–12, 15)
**Branch:** `map-creation` · **Status:** Complete
**Prerequisites met:** Phase 1 complete; all baseline + map tests pass;
heightfield deterministic; fixed fallback playable.

## 1. Files added

```text
src/shared/mapgen/spatial.ts       deterministic spatial hash
src/shared/mapgen/routes.ts        waypoints, k-NN, Prim MST, loops,
                                   swept corridors, route carving
src/shared/mapgen/zones.ts         zone grid (25 m cells) + ZoneRegion records
src/shared/mapgen/spawns.ts        gate/spawn candidates + selection
src/shared/mapgen/ramps.ts         ramp placement + approach/flight/landing
                                   validation (MOVEMENT_BOUNDS)
src/shared/mapgen/barrels.ts       barrel proximity graph + layout validation
src/shared/mapgen/recovery.ts      flat clear connected recovery zones
src/shared/mapgen/furniture.ts     ordered placement pipeline (spatial hash)
src/shared/mapgen/layout.ts        Phase 2 orchestrator
src/shared/mapgen/validation2.ts   Phase 2 validators + metrics
src/shared/mapgen/phase2Profiles.ts types + client-safe mirror
src/shared/content/schemas/landmark.ts
src/shared/content/schemas/furnitureSet.ts
src/shared/content/schemas/densityProfile.ts
content/landmarks/*.json           4 landmark definitions
content/furniture-sets/primary.json, fallback.json
content/density-profiles/primary.json, fallback.json
tests/mapgenPhase2.test.ts         18 tests
scripts/mapgen-sweep.ts            1000-seed sweep report CLI
docs/map-generation/MAP_GENERATION_PHASE_2_PLAN.md
docs/map-generation/MAP_GENERATION_PHASE_2_REPORT.md   (this file)
```

## 2. Files modified

```text
src/shared/mapgen/generator.ts      GeneratedArena gains terrainSeedChecksum
                                    and layout (routes/zones/spawns/gates/
                                    furniture)
src/shared/mapgen/profiles.ts       map bundle now carries furnitureSet,
                                    densityProfile, landmarks (+ mirror)
src/shared/mapgen/retry.ts          runs Phase 2 layout + validation in the
                                    deterministic attempt loop and fallback
src/shared/mapgen/compat.ts         toArenaProps() converts generated layout
                                    to the classic prop surface (Phase 3 hook)
src/shared/mapgen/index.ts          Phase 2 exports
src/shared/content/contentPack.ts / contentLoader.ts / schemas/pack.ts /
referenceValidator.ts               three new validated categories
src/shared/content/schemas/map.ts   furnitureSetId + densityProfileId refs
content/maps/*.json, content/manifest.json
scripts/mapgen-report.ts            determinism recheck against the pre-carve
                                    terrain checksum
package.json                        "test:maps:sweep" script
tests/contentPack.test.ts           new category pins + escape-test manifest
```

Gameplay, balance, networking, and rendering are untouched. The fixed arena
and live simulation still run behind `MAP_GENERATION_ENABLED = false`.

## 3. Algorithms

### Route graph (`routes.ts`)

1. Waypoint candidates: center cluster (4), macro feature centers (13),
   sampled highland/valley anchors (up to 8), 14 gate candidates on the edge
   ring, 14 spawn candidates near center.
2. k-nearest graph (k=5, deterministic tie-break) with edge limits
   (length ≤ 140 m, slope ≤ `maxRouteSlope × 1.5` carved tier).
3. Deterministic Prim MST from the center node (weight = length, tie-break
   by node id) — full connectivity by construction.
4. Loop edges: shortest remaining candidates added until cyclomatic
   number ≥ 2 and dead-end ratio ≤ 0.35 (gates excluded).
5. Corridors: swept segments, half-width = `routeClearance` 14 m (tank
   footprint + steering room + collision tolerance + reconciliation margin).
6. Route carving: corridor samples blend 80% toward a linear endpoint-height
   target, then 3 localized smoothing passes and corridor-only slope
   correction (boundary samples blend toward their outside neighbour).

### Semantic zones (`zones.ts`)

25 m zone grid with primary tags (transit/basin/highland/valley/slope/
flat) plus region records for openCombat (flat components ≥ 4 cells),
rampPark (ridge/plateau landmark anchors), resource (plateaus), spawnSafe,
enemyGate, and recovery. Placement requests tags, never coordinates.

### Spawns and gates (`spawns.ts`)

- Player spawns: 3-4 central candidates (45-110 m) validated for slope
  ≤ 0.15, 7 m clear/camera radius, ≥ 2 distinct route exits, gate separation
  ≥ 40 m, border margin ≥ 20 m.
- Horde gates: 6-8 edge candidates (inset 22-32 m) validated for ground,
  8 m clearance, separation ≥ 60 m, and a BFS route to center using only
  route-worthy edges (slope ≤ 0.35, half-width ≥ 12).

### Furniture (`furniture.ts`)

Order: landmarks → route reservations → ramps → large obstacles → barrels →
crates → medium → decorations. Every authoritative placement checks the
spatial hash (overlap/spacing), corridor distance, slope, zone tags, and
exclusion regions (spawnSafe/enemyGate/recovery/landing). Decorations are
`collider: false`.

### Ramps (`ramps.ts`)

`MOVEMENT_BOUNDS` mirrors the shared config (forward 18, dash cap 28,
jumpHeight 2.2, rampLaunch 4.5, gravity 16/6.5, cannon/JACKPOT recoil, air
lift). Ramps are placed on rising corridor segments (slope 0.08-0.32) and
ramp-park anchors; each ramp validates clear approach, ≤ 30° corridor
alignment, an in-bounds flight corridor (≤ 0.35 slope), a flat landing
patch inside the conservative supported range
(`max(30, dashSpeed × 2×(rampLaunch + jump + recoilLift)/moonGravity)` m,
bounded to 60 m), and post-landing route connection. Landing zones are
reserved exclusions for barrels.

### Barrels (`barrels.ts`)

Proximity graph at `chainRadius` 8 m (gameplay chain radius is 6 m).
Validation: min spacing 10 m, max connected chain 3, none within spawn/
landing/recovery exclusions, none inside required corridors.

### Validators (`validation2.ts`)

Route connectivity (BFS), required-zone reachability, minimum corridor
width, maximum required slope (post-carve, 15% tolerance), gate
connectivity, spawn safety, dead-end ratio, loop count, placement overlap,
route intrusion, barrel chain size, ramp approach/flight/landing, recovery
availability, and object/collider budgets. Failures retry deterministically
(attempts 0-7, then the fixed fallback).

## 4. Final data values

```text
Route clearance 14 m, min half-width 12 m, max route slope 0.35
k-nearest 5, max edge 140 m, min loops 2, max dead-end ratio 0.35
Player spawns 4, horde gates 6-8 (target 8), recovery zones 4
Ramps: 4 (length 8-14, width 8-12, rise 0.8-2.2, min spacing 60)
Barrels: 16 target, spacing 10, chain radius 8, max chain 3
Furniture entries: 8 containers, 6 barriers, 16 barrels, 8 crates,
  10 medium, 18 decorations
Budgets: maxObjects 80, maxColliders 60, maxBarrels 20, maxCrates 12,
  maxRamps 6, maxMedium 14, maxDecorations 24, maxBarrelChain 3
```

## 5. Test results (all run)

```text
npm run build:        PASS
npm test:             PASS — 27 files, 313/313 (18 new Phase 2 tests)
npm run test:maps:    PASS — 25 Phase 1 tests + 64-seed report
npm run test:maps:sweep: PASS
  [sweep] runs: 1000 success: 1000/1000 retries: 19 fallback: 0
  [sweep] generation ms — p50: 22.5 p95: 25.1 max: 60.4
  [sweep] loops — min: 2 max: 2 avg: 2.00
  [sweep] route half-width min: 14.0 (limit 12)
  [sweep] max route slope: 0.4005 (limit 0.35, validated at 0.4025)
  [sweep] max barrel chain: 1 (limit 3)
  [sweep] ramps — min: 3 avg: 4.0 max: 4
  [sweep] objects — avg: 52.1 max: 58 (budget 80)
  [sweep] colliders — avg: 34.1 max: 40 (budget 60)
  [sweep] determinism recheck: PASS
npm run test:demo:    PASS — golden Demo byte-identical (unchanged)
npm run test:e2e:     PASS — 17/17
npm run test:loop:    PASS — full round + rematch (LOOP_EXIT=0)
```

Phase 2 tests cover graph determinism/connectivity, loop/dead-end bounds,
corridor widths, carving slopes, zone labels/regions, spawn/gate clearance
and separation, spatial hash determinism, furniture spacing and corridor
preservation, barrel components and rejection, ramp accept/reject,
recovery availability, and full-layout determinism/variation.

## 6. Limitations

- Generated maps remain behind `MAP_GENERATION_ENABLED = false`; the sim
  still uses the fixed `ARENA`. `toArenaProps()` is ready for the Phase 3
  wiring (server generates → checksum → clients regenerate → query swap).
- Monster pathfinding, truck routes, caves, bridges, destructible terrain,
  and production rendering remain excluded per spec.
- Route carving uses a 15% slope tolerance in validation (0.4025 vs the
  0.35 target) to absorb localized smoothing at corridor boundaries.
- Ramps are placed on rising corridor segments; "ramp park" anchor
  candidates exist but corridor-based placement dominates (sweep: 3-4
  ramps per map, all validated).
- Crates land on resource/highland zones and are deliberately scarce
  (1-8 per map); the density profile caps them at 12.

## 7. Phase 3 prerequisites

- Wire `generateArenaWithRetry` into match creation behind
  `MAP_GENERATION_ENABLED`; broadcast seed + version + checksum in the
  start/snapshot envelope; clients regenerate locally and compare checksums.
- Swap `ARENA` queries per match via `createArenaQueries` +
  `toArenaProps` (obstacles/barrels/ramps/spawns/gates → ArenaProps).
- Zone-region lookup API (`findRegions`) for gameplay requests
  (spawn/gate/recovery/resource placement and future zone effects).
- Optional: terrain mesh rendering/LOD from the heightfield + zone texture
  tags, and profile-driven biome expansion (new landmark/furniture/density
  JSON only).
