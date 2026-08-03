# Dramatic Terrain & Cliffs — Implementation Plan

**Binding spec:** `docs/map-generation/CODEX_PROMPT_IMPLEMENT_DRAMATIC_TERRAIN_AND_CLIFFS.md`
**Branch:** `map-lab`

## 0. Audit (Milestone 0)

### Current generation order

`buildArenaCandidate` → `generateTerrain`:

```text
base fill → macro feature stamps (basin/ridge/plateau/valley/hill)
→ whole-map smooth(profile.smoothingPasses) → height clamp
→ correctSlopes(profile.maxSlope, iterations) [whole map]
→ whole-map final smooth(1) → clamp → slopeGrid/steepMask
```

Then `generateMapLayout`: route graph → `carveRoutes` → gates → spawns →
zones → recovery → ramps → furniture. `carveRoutes` blends corridor
samples toward endpoint heights, smooths them, and enforces
`maxRouteSlope` locally.

### Current global slope correction

`correctSlopes()` applies one `profile.maxSlope` to **every cell**; the
final `smooth(hf, 1)` runs unconditionally over the whole map.
`validateArena` rejects any candidate with any cell above one global
`profile.maxSlope`. There is no notion of intentional cliff vs broken
spike.

### Current route carving and hardcoded thresholds

| Location | Hardcoded value |
| --- | --- |
| `validation2.pathToCenter` | `e.slope > 0.35`, `e.halfWidth < 12` |
| `spawns.broadRouteToCenter` | `e.slope > 0.35`, `e.halfWidth < 12`, node slope `> 0.35` |
| `spawns.gateCandidateValid` | slope `> 0.2`, ring slope `> 0.25`, ring height `> 2` |
| `spawns.spawnCandidateValid` | slope `> 0.15`, ring slope `> 0.2`, ring height `> 2` |
| `recovery.recoveryCandidateValid` | slope `> 0.12`, ring slope `> 0.18`, ring height `> 1.5` |
| `validation2` spawn slope | `> 0.2` |
| `routes.buildWaypointCandidates` | highland `h >= 2.5 && slope <= 0.2` |
| `routes.buildRouteGraph` | candidate `slope <= maxRouteSlope * 1.5` (resolved, ok) |

### Tank grounding on sudden height changes

`stepTankKinematics` integrates per substep, then reads
`ground.groundHeightAt(t.x, t.z)` once per step. If grounded and
`t.y <= h + 0.08` it snaps `t.y = h` — an upward cliff crossing teleports
the tank to the top. No transition query exists. Dash and recoil share the
same substep loop, so a guard inside the loop fixes all three.

### Enemy movement

`movement.integrate` (and the truck behavior) move horizontally and then set
`e.y = world.groundHeightAt(...)` — the same upward-snap behavior.
Enemy spawns come from the spawn director (fixed content coordinates near
the center) and gate `bugSpawns`; generated `towerSpots` are currently
empty.

### Terrain mesh building

`src/client/map-debug/terrainMesh.ts` builds 4×4 chunks of
`CELLS_PER_CHUNK=25` cells from the authoritative heightfield (LOD half
step, frustum culling, shared material). Diagonal triangles cannot render
vertical walls, so cliff walls need separate quad geometry from
authoritative edge segments.

### Checksum serialization

`Heightfield.checksum()` (FNV-1a over IEEE-754 LE sample bytes +
dimensions) is the arena checksum; `terrainSeedChecksum` anchors
determinism before carving. `serializeArena` (Map Lab worker) transfers
heightfield samples only. Flags/edges must be added to both.

### Map Lab failure/fallback behavior

Production uses `selectArenaSession`; Exact Candidate uses
`buildArenaCandidate`. The Map Lab UI currently drops invalid candidates
(`if (!result.ok || !result.arena) return`) and shows only one PASS/FAIL
boolean; the retry loop's per-attempt detail is not preserved.

## 1. Contracts to modify

- `src/shared/content/schemas/terrainProfile.ts` — `slopeRules`,
  cliff feature configs (`cliffPlateau`, `escarpment`), opt-in legacy
  `correctAllMap`.
- `src/shared/mapgen/profiles.ts` — `SlopeRules`, extended
  `TerrainProfileDef`/`MacroFeatureConfigs`, `resolveSlopeRules` defaults.
- `src/shared/mapgen/terrainFlags.ts` (new) — `TerrainFlag` bitmask,
  classification, protected masks, metrics, hash helpers.
- `src/shared/mapgen/cliffs.ts` (new) — cliff placement/application,
  wall/top/bottom masks, access corridors, `CliffEdgeSegment` extraction.
- `src/shared/mapgen/terrainTraversal.ts` (new) —
  `queryTerrainTransition` / `canTraverseGroundStep`.
- `src/shared/mapgen/generator.ts` — new pipeline order, `terrainFlags`,
  `cliffEdges`, `cliffFeatures`, terrain metrics.
- `src/shared/mapgen/routes.ts` — flag-cost route candidates, no
  hardcoded thresholds.
- `src/shared/mapgen/spawns.ts` / `recovery.ts` — profile-driven slope
  rules and cliff-safe buffers.
- `src/shared/mapgen/validation.ts` / `validation2.ts` — global sanity
  strict, required traversal strict, optional terrain permissive,
  optional content soft-fail.
- `src/shared/mapgen/retry.ts` — `retryReport` per-attempt diagnostics.
- `src/shared/mapgen/arenaSession.ts` — arena checksum includes flags +
  edges; `ARENA_GENERATOR_VERSION = 2`.
- `src/shared/sim/groundQuery.ts` / `tankKinematics.ts` /
  `enemyBehaviors.ts` — shared step-transition guard.
- `src/client/map-debug/terrainMesh.ts` + `arenaView.ts` +
  `tools/maplab/src/rendering/viewport.ts` — cliff wall geometry,
  disposal, new layers.
- `tools/maplab/*` — parameter descriptors, layers, Exact Candidate
  invalid rendering, fallback banner + retry report, metrics, exports,
  worker serialization.
- `content/` — `map.dramaticHighlands`, `map.cliffArena` profiles.
- `scripts/mapgen-sweep.ts` (+ full sweep) — new profiles and metrics.

## 2. Milestone 1 — terrain classes and route-focused validation

1. `TerrainFlag` bitmask + `terrainFlags: Uint32Array` on the arena;
   classification from `slopeRules` (driveable/risky/blocked/cliff) plus
   protected flags (route/spawn/landing) applied after layout.
2. `slopeRules` in the schema with back-compat defaults derived from
   `maxSlope`; primary keeps legacy behavior via explicit rules /
   `correctAllMap` opt-in; fallback unchanged.
3. Protected mask construction (corridors + spawn clear + gate exits +
   recovery + mandatory landings) with tank/reconciliation buffer.
4. Mask-aware correction: protected cells pulled to `driveableMax`;
   cliff-wall cells excluded from correction and smoothing.
5. Route graph uses flag costs: walls/blocked forbidden, risky penalized;
   all thresholds resolved from profile values.
6. Validation split: strict sanity + strict required traversal +
   permissive optional terrain (metrics/warnings) + soft-fail optional
   content (skip invalid ramp, reduce furniture, never reject decorations).

## 3. Milestone 2 — dedicated cliffs

1. `cliffPlateau` + `escarpment` feature types with schema controls
   (height/drop, top radius/length/width, edge width/roughness, access
   count/width/slope, safety buffers).
2. Pipeline: non-cliff features → broad smoothing → cliff placement →
   cliff masks → access corridors → classification → route graph →
   route carving → protected correction → mask-aware final smoothing →
   cliff-edge refresh → layout/props → validation.
3. `CliffEdgeSegment[]` derived in stable order from wall masks; included
   in serialization, checksum, exports, layers, rendering, traversal.
4. Vertical wall quads from authoritative segments (top/bottom heights,
   stable winding, correct normals, shared material, chunked, disposed).
5. Shared `queryTerrainTransition` guard in tank kinematics substeps:
   upward > `maxStepUp` or cliff-wall crossing blocks horizontal motion;
   downward drops go airborne. Enemies use the same guard.
6. Falling/recovery validation; camera collision uses cliff-wall data.

## 4. Milestone 3 — Map Lab

1. Descriptor controls for `slopeRules` + cliff features (registry-driven,
   no hardcoded panel fields).
2. Layers: driveable/risky/blocked masks, cliff top/bottom/walls, protected
   traversal, safety buffer, access routes, terrain cost.
3. Exact Candidate renders invalid payloads (`generationSucceeded` vs
   `validationPassed`); Apply stays gated on validation.
4. Fallback banner + per-attempt retry diagnostics.
5. Metrics: driveable/risky/blocked %, cliff length/count, largest drop,
   route slope, access count, skipped ramps/furniture, fallback reason.
6. `map.dramaticHighlands` + `map.cliffArena` content profiles.

## 5. Tests and gates

- Unit: terrain flags, protected masks, localized correction, cliff
  exclusion, edge determinism/order, route wall avoidance, access
  corridors, required-route slope, optional steep acceptance, spawn/
  recovery buffers, ramp skip, furniture underfill, Exact Candidate
  invalid render, fallback diagnostics.
- Kinematics: step-up success, > maxStepUp blocked, cliff snap blocked,
  downward drop airborne, dash/recoil guarded, fall callbacks, Moon Yard
  determinism, predictor/server convergence.
- Rendering: wall/top/bottom alignment, no gaps, normals, LOD keeps walls,
  disposal, camera clip check (DOM/geometry level).
- Sweeps for primary + dramatic + cliff profiles; bad-seed corpus.
- Full command gate: `generate:map-profiles`, `build`, `test`, `test:demo`,
  `test:e2e`, `test:loop`, `test:maps`, `test:maps:sweep`,
  `test:maps:sweep:full`, `build:maplab`, `test:maplab`.
