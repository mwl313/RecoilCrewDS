# Map Generation Phase 2 — Implementation Plan

**Specification:** `docs/design/01-맵-디자인.md` (binding, §8–9, 11–12, 15)
**Prerequisites:** Phase 1 complete (all gates pass, heightfield
deterministic, fixed fallback playable)
**Branch:** `map-creation`

## 1. Audit of current spawn/gameplay/space data

### Player spawn / respawn

- `src/shared/arena.ts` — `ARENA.spawnPoints` (3 fixed: `(-6,10)`,
  `(6,-10)`, `(0,-4)`); `nearestSpawn(x,z)` used by `MatchRuntime.respawn()`.
- `MatchRuntime.initialTank` starts at `ARENA.spawnPoints[0]`.

### Enemy spawn coordinates

- `src/shared/enemies/enemySystem.ts` `spawnEnemyDef()` — default placement
  picks a random `ARENA.bugSpawns` gate (8 fixed edge points) with ±2 m
  jitter, ≥10 m from the tank; hard fallback `(-30,-30)`.
- `src/shared/spawning/spawnDirectorRuntime.ts` — bugs/rammers use the
  default gate path; towers use fixed `ARENA.towerSpots` (2); Loot Truck uses
  `ARENA.truckRoute[0]` (truck routes remain excluded from mapgen).
- All live spawns use `Math.random()` (fine for live play; mapgen must be
  PRNG-only).

### Ramps / platforms

- `RampDef { id, x, z, w, d, dirX, dirZ, rise, baseY }` — 3 fixed ramps;
  `rampAt()` rectangle lookup; `groundHeightAt()` linear rise;
  `tankKinematics` ramp launch: `vy = rampLaunchSpeed * min(1, speed/18)`
  with `rampLaunchSpeed = 4.5`.

### Obstacles / barrels

- `Obstacle { id, x, z, w, d, h, type }` with types `container | barrier |
  wall | tires | factory | crusher | towerBase | scrapPile`; 31 fixed
  rectangles; `obstacleAt()`, `resolveCircleContacts()` iterate all boxes
  (no spatial index).
- 15 fixed barrels `{ id, x, z }`; gameplay chain radius `barrelChainRadius
  = 6` (`weapons.barrelChainRadius` in content).

### Tank footprint / movement bounds (shared, from `BASE_CONFIG`)

```text
footprint: circles offset -1.0 r0.9 / 0 r1.15 / +1.0 r0.9
collisionRadius 1.35, maxSafeStep 0.45, maxSubsteps 8
forwardSpeed 18, reverseSpeed 8
dashImpulse 9, dashMaxHorizontalSpeed 28, dashCooldown 1
jumpHeight 2.2 -> launch sqrt(2*g*h) ≈ 8.39 @ g16
gravity 16 (Moon Yard 6.5)
rampLaunchSpeed 4.5
cannon recoil 7.2, JACKPOT recoil 17, air lift 1.8*clamp(i/7,0,1.4)
```

These feed `MOVEMENT_BOUNDS` for ramp flight/landing validation.

### Spatial queries

- `src/shared/math.ts` — `pointInBox`, `resolveCircleBox` (exact), `dist`.
- `arena.ts` — `obstacleAt`, `resolveCircle[Contacts]`, `rampAt`,
  `nearestSpawn`. All O(objects) scans; no spatial hash exists yet.

### Fixed gate arrays

`ARENA.bugSpawns` (8), `ARENA.towerSpots` (2), `ARENA.spawnPoints` (3),
`ARENA.truckRoute` (4). Phase 2 generates its own gates/spawns in the
generated arena model; the fixed arena keeps its arrays for live gameplay.

## 2. Architecture (new modules in `src/shared/mapgen/`)

```text
spatial.ts      deterministic spatial hash (buckets, circle/rect queries)
routes.ts       waypoint candidates, k-NN graph, deterministic MST, loop
                edges, swept corridors, route carving/smoothing
zones.ts        zone grid + ZoneRegion records (12 tags)
spawns.ts       player spawns (3-4) + horde gates (6-8) with clearance
ramps.ts        ramp placement + approach/flight/landing validation
                (MOVEMENT_BOUNDS from shared config)
barrels.ts      barrel proximity graph (components/chains)
recovery.ts     flat clear connected recovery zones
furniture.ts    ordered placement pipeline + budgets (spatial-hash based)
layout.ts       Phase 2 orchestrator: graph -> zones -> gates/spawns ->
                recovery -> ramps -> obstacles/barrels/crates/medium/decoration
validation2.ts  Phase 2 validators (structured errors)
```

`GeneratedArena` gains `routeGraph`, `corridors`, `zones`, `zoneGrid`,
`spawnPoints`, `gates`, `objects`, `recoveryZones`; `generateArenaWithRetry`
extends its validation with Phase 2 checks and keeps the same
attempt→fallback contract.

## 3. Route graph

1. Waypoint candidates: center cluster (3), macro feature centers (13),
   highland/valley sampled anchors (~8), gate candidates (12 on the edge
   ring), spawn candidates (8 near center).
2. k-nearest graph (k=5, deterministic tie-break by node id) with edge
   validity: length ≤ 140 m, slope ≤ `maxRouteSlope` (0.35, carved edges
   may start higher).
3. Deterministic Prim MST (weight = length, tie-break by edge id) — full
   connectivity by construction.
4. Loop edges: shortest non-MST candidates added until cyclomatic number ≥ 2
   and dead-end ratio ≤ 0.35 (gates excluded from dead-end count).
5. Corridors: swept segment per edge; half-width = routeClearance 14 m
   (tank footprint + steering room + collision tolerance + reconciliation
   margin).
6. Carving: corridor samples blend toward a linear endpoint-height target
   (80%), then localized smoothing and slope correction restricted to the
   corridor, so required routes are drivable without flattening the map.

## 4. Semantic zones

Zone grid (25 m cells) primary tags: `transit` (in corridor), `basin`
(basin radius), `highland` (h ≥ 3, slope ≤ 0.2), `valley` (h ≤ -1.5 or
valley radius), `slope` (> 0.15), else `flat`. Region records added for
`openCombat` (large flat components), `rampPark`, `resource` (landmarks),
`spawnSafe`, `enemyGate`, `recovery`. Placement requests tags via
`findRegions(tag)` instead of fixed coordinates.

## 5. Spawns and gates

- Player spawns: 3-4 near center (40-110 m) requiring slope ≤ 0.15, clear
  radius 7 m, ≥2 route exits, camera clearance, gate separation ≥ 40 m, no
  cliff, corridor distance ≤ 25 m; spawnSafe regions block furniture.
- Horde gates: 6-8 edge candidates (inset 20-30 m) requiring valid ground,
  clear radius 8 m, route connection, broad corridor to center, separation
  ≥ 60 m; enemyGate regions keep layouts open for direct-follow AI.

## 6. Furniture pipeline (ordered)

```text
landmarks -> route reservations (corridors) -> ramps/platforms ->
large obstacles -> barrels -> crates -> medium furniture -> decorations
```

Every authoritative placement queries the spatial hash for overlap/spacing
and rejects corridor intrusion (`routeClearance`), spawn/gate/landing/
recovery exclusions, slope limits, and zone tags. Decorations are
non-authoritative (`collider: false`).

Barrels get a proximity graph (chainRadius 8): min spacing 10 m, max
connected chain 3, none near spawns/landings/recovery, none inside required
corridors.

Ramps validate: clear approach, route-aligned takeoff (≤ 30° to a corridor),
reserved flight corridor, safe landing zone within the conservative
supported distance (normal + dash + jump-assisted + Moon Yard bounds), and
post-landing route connection.

## 7. New content categories

```text
content/landmarks/            landmark.basinCenter, landmark.resourcePlateau,
                              landmark.rampPark, landmark.openCombat
content/furniture-sets/       furnitureSet.primary, furnitureSet.fallback
content/density-profiles/     densityProfile.primary, densityProfile.fallback
```

Schemas (`landmark`, `furnitureSet`, `densityProfile`) are zod-validated,
cross-referenced (map → furnitureSet → landmarks), frozen, and mirrored for
the client-safe path. Fallback map uses the empty furniture set.

## 8. Validators (Phase 2)

Route connectivity, required-zone reachability, min route width, max
required slope, gate connectivity, spawn safety, dead-end ratio, loop
count, placement overlap, route intrusion, barrel chain size, ramp
approach/flight/landing, recovery availability, object/collider budgets.
Failed candidates retry deterministically (existing 0..7 + fallback).

## 9. Tests and sweep

- `tests/mapgenPhase2.test.ts`: graph determinism/connectivity, widths,
  carving, zone classification, spawn/gate clearance, spatial hash,
  spacing, barrel components, ramp accept/reject, recovery, route
  preservation, AI-friendly openness.
- `scripts/mapgen-sweep.ts` (`npm run test:maps:sweep`): 1000 seeds —
  retries, fallback, loops, widths, slopes, barrel max chain, ramps, object
  counts.
- Existing `npm run test:maps` keeps running the Phase 1 suite + report.

## 10. Verification gates

```bash
npm run build
npm test
npm run test:demo
npm run test:e2e
npm run test:loop
npm run test:maps
npm run test:maps:sweep
```

The fixed arena and live gameplay remain untouched (`MAP_GENERATION_ENABLED
= false`); the Demo golden must stay byte-identical.
