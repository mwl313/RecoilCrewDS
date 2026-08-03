# Codex Prompt — Map Generation Phase 2
## Route Graph, Semantic Zones, Spawns/Gates, Furniture, Ramps, and Traversal Validation

Prerequisite:

```text
Phase 1 complete
all baseline and map tests pass
heightfield deterministic
fixed fallback playable
```

Read the adopted specification and Phase 1 plan/report.

# Goal

Add:

```text
route graph
route carving
semantic zones
player spawns
horde gates
obstacles
barrels
crates
ramps/platforms
safe landing areas
spatial hash
traversal validation
```

Monster pathfinding and truck routes remain excluded.

# Required first step

Create:

```text
docs/map-generation/MAP_GENERATION_PHASE_2_PLAN.md
```

Audit current spawn logic, enemy spawn coordinates, ramps/platforms, obstacle/barrel types, tank footprint, jump/dash/recoil limits, spatial queries, and fixed gate arrays. Then implement.

# 1. Route graph

Generate waypoint candidates from:

- Central basin
- Macro feature centers
- Highlands
- Valleys
- Outer gate candidates
- Spawn region candidates

Use deterministic:

```text
Delaunay + MST + extra edges
```

or a dependency-free equivalent:

```text
k-nearest graph + deterministic MST + loop edges
```

Guarantee:

- Full connectivity
- At least two major loops
- Limited dead ends
- Minimum width
- Maximum slope
- Multiple exits from center
- Gates connected to center
- No required jump route
- Tank-friendly curvature

Carve and smooth terrain around required routes.

# 2. Reserved route corridors

Represent routes as swept corridors, not centerlines.

All authoritative placement must reject overlap with required corridors.

Clearance must include tank footprint, steering room, collision tolerance, and reconciliation margin.

# 3. Semantic zones

Generate and store:

```text
flat
slope
highland
valley
basin
transit
openCombat
rampPark
resource
spawnSafe
enemyGate
recovery
```

Placement and gameplay request tags instead of fixed coordinates.

# 4. Player spawn

Generate 3–4 central candidates.

Require:

- Low slope
- Clear radius
- No barrel
- At least two route exits
- Camera clearance
- Gate separation
- No cliff/edge
- Route connectivity

# 5. Horde gates

Generate 6–8 edge candidates.

Require:

- Route connection
- Clear radius
- Valid ground
- Broad route to center
- No maze or obstacle wall
- Gate separation

Keep layouts open enough for current direct-following AI.

# 6. Spatial hash

Implement a deterministic shared spatial hash for placement and nearby queries.

Use for overlap, spacing, barrels, spawn clearance, and landing clearance.

Do not scan every object for every placement.

# 7. Furniture data

Add validated categories:

```text
content/landmarks/
content/furniture-sets/
content/density-profiles/
```

Placement order:

```text
landmarks
route reservations
ramps/platforms
large obstacles
barrels
crates
medium furniture
small non-authoritative decoration
```

Use semantic asset IDs, slope rules, region density, spacing, and explicit budgets.

# 8. Barrel validation

Build a proximity graph.

Validate:

- Minimum spacing
- Maximum connected chain
- No barrels near spawn
- No required-route obstruction
- No landing-zone barrels
- No map-wide chain reaction

# 9. Ramps and landing zones

Place ramps in ramp parks, highlands, valley transitions, and open-combat edges.

Each ramp needs:

- Clear approach
- Route-aligned takeoff
- Reserved flight corridor
- Safe landing zone
- Post-landing route connection

Validate profiles for:

- Normal top speed
- Dash speed
- Jump-assisted motion when relevant
- Cannon recoil
- JACKPOT recoil
- Moon Yard gravity

Use shared movement parameters or conservative supported bounds.

# 10. Recovery zones

Generate multiple flat, clear, connected, in-bounds recovery zones away from gates/barrels.

Use them for out-of-bounds, under-terrain, stuck, or unrecoverable flip handling.

# 11. Full validators

Add:

- Route connectivity
- Required-zone reachability
- Minimum route width
- Maximum required slope
- Gate connectivity
- Spawn safety
- Dead-end ratio
- Loop count
- Placement overlap
- Route intrusion
- Barrel chain size
- Ramp approach/flight/landing
- Recovery availability
- Object/collider budgets

Failed candidates retry deterministically.

# Tests

Test graph determinism/connectivity, route widths, carving, zone classification, spawn/gate clearance, spatial hash, spacing, barrel components, ramp acceptance/rejection, recovery, route preservation, and AI-friendly openness.

Add a 1,000-seed sweep and report retries, fallback, loops, widths, slopes, barrel size, ramps, and object counts.

# Forbidden

No pathfinding/navmesh, truck routes, caves, bridges, destructible terrain, full production rendering, or removal of fallback.

# Verification

```bash
npm run build
npm test
npm run test:demo
npm run test:e2e
npm run test:loop
npm run test:maps
npm run test:maps:sweep
```

# Documentation

Create:

```text
docs/map-generation/MAP_GENERATION_PHASE_2_REPORT.md
```

Report actual algorithms, metrics, tests, limitations, and Phase 3 work.
