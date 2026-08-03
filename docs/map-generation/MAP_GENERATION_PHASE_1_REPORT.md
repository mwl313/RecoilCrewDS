# Map Generation Phase 1 — Report

**Specification:** `docs/design/01-맵-디자인.md` (binding)
**Branch:** `map-creation` · **Status:** Complete
**Scope:** seed pipeline, deterministic PRNG/substreams, 400×400
heightfield, macro terrain features, legacy arena compatibility, core
validation, deterministic retries, known-safe fallback, unit tests.

## 1. Files added

```text
src/shared/mapgen/index.ts          exports + MAP_GENERATION_ENABLED flag
src/shared/mapgen/seed.ts           hash32, ARENA_GENERATOR_VERSION=1,
                                    composeArenaBaseSeed/CandidateSeed
src/shared/mapgen/prng.ts           mulberry32, forkSeed, named substreams
src/shared/mapgen/heightfield.ts    Float32Array grid, bilinear queries,
                                    normal/slope, border clamp, FNV checksum
src/shared/mapgen/features.ts       basin/ridge/plateau/valley/hill stamps
                                    + deterministic spacing placement
src/shared/mapgen/generator.ts      pipeline + GeneratedArena runtime model
src/shared/mapgen/validation.ts     pure validators + structured reports
src/shared/mapgen/profiles.ts       profile types, pack resolver, legacy mirror
src/shared/mapgen/retry.ts          attempts 0..7 -> first valid -> fallback
src/shared/mapgen/compat.ts         buildLegacyArenaModel + createArenaQueries
src/shared/content/schemas/map.ts
src/shared/content/schemas/terrainProfile.ts
src/shared/content/schemas/validationProfile.ts
content/maps/arena_400_primary.json
content/maps/fallback_legacy.json
content/terrain-profiles/primary.json
content/terrain-profiles/fallback.json
content/validation-profiles/primary.json
content/validation-profiles/fallback.json
tests/mapgen.test.ts                 25 tests
scripts/mapgen-report.ts             64-seed sweep report CLI
docs/map-generation/MAP_GENERATION_PHASE_1_PLAN.md
docs/map-generation/MAP_GENERATION_PHASE_1_REPORT.md   (this file)
```

## 2. Files modified

```text
content/manifest.json                    new categories registered
src/shared/content/contentPack.ts        maps/terrainProfiles/validationProfiles
src/shared/content/contentLoader.ts      schemas + registries for new categories
src/shared/content/schemas/pack.ts       manifest file categories
src/shared/content/referenceValidator.ts cross-refs for map/profile ids
package.json                             "test:maps" script
tests/contentPack.test.ts                new category pins + escape-test manifest
e2e/tps.spec.ts                          type-only fix for the dash test hook
```

No gameplay, balance, networking, or rendering code changed. The fixed
`ARENA` and all existing query callers are untouched.

## 3. Algorithms

### Seed

```text
baseSeed      = hash32("arena-seed", roomCode, matchIndex, profileId, version)
candidateSeed = hash32("arena-attempt", baseSeed, attempt)
```

`hash32` is FNV-1a per component with a separator mix and a Murmur-style
final avalanche; the final combination is never a raw XOR. Numeric
components are hashed as unsigned 32-bit bytes; strings as UTF-16 code
units. `ARENA_GENERATOR_VERSION = 1`.

### PRNG and substreams

`mulberry32(seed)` produces deterministic floats; every layer forks its own
stream with `forkSeed(seed, name)` (terrain/routes/furniture/spawns), so a
later furniture change cannot alter terrain output.

### Heightfield

400×400 m at 4 m cells → 101×101 edge-inclusive `Float32Array` samples.
Queries: bilinear `heightAt`, central-difference `normalAt`/`slopeAt`,
4-neighbour `maxSlope`/`slopeGrid`, and an FNV-1a checksum over the sample
bytes (explicit little-endian) + dimensions. Coordinates outside the grid
clamp to the nearest edge sample (bounded terrain).

### Macro features

- Basin/hill: Gaussian stamps (`amplitude * exp(-(d/r)^2)`).
- Plateau: flat core with smoothstep falloff band.
- Ridge/valley: elongated Gaussian cross-section with rounded end falloff
  along a rotated axis.
- Placement: deterministic rejection sampling (512 attempts/feature) with
  the stricter of the two features' minimum separations; the best candidate
  is kept if the budget is exhausted and validation retries.

### Generation pipeline

```text
base → macro stamps → smoothing (3×3 weighted) → height clamp →
iterative slope correction (symmetric neighbor pull, half-excess) →
final smoothing → clamp → slope classification (slopeGrid + steepMask)
```

The fallback profile uses `legacySampled: true`, which samples the legacy
analytic ground (flat 0 + center bowl + three ramps) onto the same grid.

### Validation / retry / fallback

Pure `validateArena` returns structured errors/warnings/metrics covering
determinism (optional regenerate-and-compare), bounds, height range,
finite samples, slope limits, feature spacing (with the validation-profile
floor), generation-time metric, and stable checksum. `generateArenaWithRetry`
tries attempts `0..retryLimit-1` (8) in deterministic order; all failures
return the fixed fallback map with `fallbackUsed: true`. The fallback
validation profile allows `maxSlope: 0.75` — the intentional legacy
ramp-edge cliff (rise 3 m over a 4 m sample cell) that feeds the ramp-launch
mechanic.

### Compatibility

`buildLegacyArenaModel()` wraps the static `ARENA` (21×21 sampled heightfield
of the legacy ground + the fixed obstacle/barrel/ramp/spawn/truck data) into
the `GeneratedArena` interface, and `createArenaQueries(arena)` exposes the
classic query surface (`groundHeightAt`, `groundNormalAt`, `obstacleAt`,
`resolveCircle[Contacts]`, `rampAt`, `nearestSpawn`, `boundsHalf`).

## 4. Final data values

```text
ARENA_GENERATOR_VERSION ...... 1
Map .......................... 400×400 m, 4 m cells, 101×101 samples
Height range ................. -5 .. +10 m (profile + validation)
Max slope .................... 0.50 (rise/run)
Smoothing .................... 2 passes + 1 final pass
Slope correction ............. up to 48 iterations
Retry limit .................. 8 attempts, then fallback
Generation budget ............ 500 ms
Features ..................... basin 1 (sep 60), ridge 2 (sep 70),
                              plateau 3 (sep 60), valley 2 (sep 70),
                              hill 5 (sep 25) = 13 features
Fallback ..................... legacy-sampled terrain, maxSlope 0.75
```

## 5. Test results (all run)

```text
npm run build:      PASS
npm test:           PASS — 26 files, 295/295 (25 new mapgen tests)
npm run test:maps:  PASS
  [mapgen] runs: 64 success: 64/64 retries: 0 fallback: 0
  [mapgen] generation ms — p50: 4.2 p95: 9.4 min: 3.6 max: 21.1
  [mapgen] height min: -5.00 max: 8.38
  [mapgen] maximum slope: 0.4911 (limit 0.5)
  [mapgen] determinism recheck: PASS
npm run test:demo: PASS — golden Demo byte-identical (unchanged)
npm run test:e2e:  PASS — 17/17
npm run test:loop: PASS — 90.3 s round, grade S, JACKPOT ×3,
  rematch ok (moonYard), 1353 snapshots (LOOP_EXIT=0)
```

Fixed-value tests pin: `hash32('hello') = 3570176842`,
`composeArenaBaseSeed('ABCDEF', 0, map.arena400Primary, v1) = 225852939`,
attempt seeds `2974508065` / `3358617151`, mulberry32(1) first values, and
all four fork seeds. Same-seed regeneration is byte-identical; different
room/matchIndex/version/profile seeds differ; forced validation failure
retries attempts 0–7 in order and returns the stable fallback.

## 6. Limitations

- The generated 400×400 map is not wired into gameplay: `MAP_GENERATION_ENABLED
  = false`, and the simulation still imports the static `ARENA`. Online
  checksum propagation and arena-instance wiring are Phase 3.
- Phase 1 generates terrain only. Obstacles, barrels, ramps, crates, spawn
  points, routes, gates, and semantic zones are not generated (the legacy
  model carries the static props purely for compatibility testing).
- The fallback heightfield is a 4 m sampled approximation of the legacy
  analytic ground; ramp-edge slopes up to ~0.69 are intentional and
  reflected in the fallback validation allowance (0.75).
- Generation-time is measured with `performance.now()` (wall clock), so the
  metric varies by machine; the 500 ms budget is very generous (observed
  p95 ≈ 9 ms).
- Checksum determinism relies on IEEE-754 Float32 arithmetic being identical
  across engines (standard, and verified by regenerate-and-compare).

## 7. Phase 2 prerequisites

- Route graph layer (waypoint candidates, connectivity, gate placement) on
  the `routes` substream, with slope/width validation.
- Semantic zone labels (`flat/slope/highland/valley/basin`) from the stored
  slope/height classification.
- Furniture layer (obstacles, barrels, ramps, crates, spawns) on the
  `furniture`/`spawns` substreams with clearance and reachability
  validation; extend `ArenaProps` for generated maps.
- Phase 3 wiring: `generateArenaWithRetry` at match start, checksum
  broadcast in the start/snapshot envelope, client-side regeneration and
  checksum comparison, then swap arena queries behind
  `MAP_GENERATION_ENABLED`.
