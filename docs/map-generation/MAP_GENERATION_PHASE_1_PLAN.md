# Map Generation Phase 1 — Implementation Plan

**Specification:** `docs/design/01-맵-디자인.md` (binding)
**Branch:** `map-creation` (carries the Tank Jump & Dash milestone work)
**Phase scope:** seed pipeline, deterministic PRNG/substreams, 400×400
heightfield, macro terrain features, legacy arena compatibility, core
validation, deterministic retries, known-safe fallback, unit tests.

## 1. Static `ARENA` data (current engine)

`src/shared/arena.ts` defines a frozen-at-import module singleton:

```ts
export const ARENA = {
  half: 40,                       // arena half-size (80×80 m playfield)
  obstacles: Obstacle[],          // rectangles: {id,x,z,w,d,h,type}
  barrels: BarrelProp[],          // {id,x,z} — 15 barrels
  ramps: RampDef[],               // {id,x,z,w,d,dirX,dirZ,rise,baseY} — 3
  spawnPoints: {x,z}[],           // 3 player spawns
  bugSpawns: {x,z}[],             // 8 bug entry gates
  truckRoute: {x,z}[],            // 4-corner loop (loot truck; map spec excludes)
  towerSpots: {x,z}[],            // 2 gun-tower bases
};
```

Obstacle types: `container | barrier | wall | tires | factory | crusher |
towerBase | scrapPile`. Walls are 8 segments around the ±40 m border with
gate gaps. Collision uses the exact rectangles through `resolveCircleBox`
(`src/shared/math.ts`).

## 2. Ground queries

- `groundHeightAt(x, z)` — analytic: ramp boxes get a linear rise along
  `dirX/dirZ` (`baseY + rise * t`); inside radius 7 of the center the bowl
  sinks to `-0.45`; everywhere else `0`.
- `groundNormalAt(x, z)` — central differences with `e = 0.25`.
- `pitchFromNormal(normal, yaw)` — slope along the tank's forward vector.
- `obstacleAt(x, z)` — first obstacle rectangle containing the point.
- `resolveCircle(x, z, r)` / `resolveCircleContacts(x, z, r)` — iterate all
  obstacle rectangles with `resolveCircleBox`, then clamp to
  `±(ARENA.half - 0.5)`. `ARENA.half` is the hardcoded boundary assumption
  used by tank collision and the arena clamp.
- `rampAt(x, z)` — ramp rectangle lookup.
- `nearestSpawn(x, z)` — nearest of `ARENA.spawnPoints`.

Ramps are visual+collision boxes in `arenaView.ts` (client collider list)
and gameplay ground rises in the shared sim. Barrels are props with a
separate barrel-state array in `matchRuntime` (`makeBarrels()`).

## 3. Server/client arena imports

- `src/shared/arena.ts` is imported by both server-side simulation
  (`tankKinematics.ts`, `matchRuntime.ts`, `enemyBehaviors.ts`,
  `pickupSystem.ts`, `spawnDirectorRuntime.ts`, `projectileBehaviors.ts`)
  and the client renderer (`arenaView.ts`, `gameClient.ts`,
  `networkStatePresenter.ts`, `cameraManager.ts`).
- There is no arena instance passed into `MatchRuntime`; every module reads
  the module-level `ARENA` and query functions directly.
- Practice uses the exact same `Match` + `ARENA` imports as the server
  (`gameClient.startPractice()` → `new Match(...)`), so Practice ground
  queries are identical to online.

## 4. Existing tests touching the arena

- `tests/tankKinematics.test.ts` — footprint/tunneling against the bowl
  barrier and south gate gap (positions hardcoded to the 80×80 layout).
- `tests/match.test.ts` / `weaponSystem.test.ts` — spawns, barrels, ramps,
  tower bases by fixed coordinates.
- `tests/demoRegression.test.ts` + `tests/fixtures/demo-golden.json` —
  byte-exact golden trace depends on the fixed arena.
- `tests/roomRules.test.ts`, `room.test.ts` — per-room play on the fixed
  arena.
- No tests enumerate `ARENA` itself; the golden fixture is the strongest
  implicit pin.

## 5. Hardcoded arena half-size assumptions

- `ARENA.half = 40` feeds `resolveCircleContacts` boundary clamp
  (`half - 0.5 = 39.5`), `tankKinematics` footprint clamp
  (`ARENA.half - 0.5`), arena rendering (`PlaneGeometry(half*2+4)`), camera
  colliders, and e2e gate expectations (`z 35.25..37.75`).
- Phase 1 must NOT change these; the generated 400×400 arena is a parallel,
  validated model behind `MAP_GENERATION_ENABLED = false`. Gameplay keeps
  using `ARENA` unchanged until Phase 3 wiring.

## 6. Phase 1 architecture

```text
src/shared/mapgen/
  seed.ts          hash32 (FNV-1a + avalanche, no raw XOR), ARENA_GENERATOR_VERSION=1,
                   composeArenaBaseSeed / composeArenaCandidateSeed
  prng.ts          mulberry32; forkSeed(seed, name); named substreams
                   (terrain/routes/furniture/spawns)
  heightfield.ts   Float32Array grid (101×101 @ 4 m), bilinear heightAt,
                   normalAt, slopeAt, maxSlope, border clamp, FNV checksum
  features.ts      basin/ridge/plateau/valley/hill smooth stamps + spacing
                   placement (deterministic rejection sampling)
  generator.ts     pipeline: base → macro stamps → smoothing → height clamp
                   → iterative slope correction → final smoothing → slope
                   classification; GeneratedArena runtime model
  validation.ts    pure validators: determinism, bounds, height range,
                   finite, slope limits, feature spacing, generation time,
                   stable checksum → structured report
  retry.ts         attempts 0..7 → first valid wins; else fixed fallback
                   (legacy-sampled terrain, fallbackUsed=true)
  compat.ts        buildLegacyArenaModel() from static ARENA +
                   createArenaQueries(arena) adapter (same query surface)
  profiles.ts      structural profile types + legacy mirror + pack resolver
content/maps/                map.arena400Primary, map.fallbackLegacy
content/terrain-profiles/    terrainProfile.primary, terrainProfile.fallback
content/validation-profiles/ validationProfile.primary, validationProfile.fallback
tests/mapgen.test.ts         full Phase 1 matrix
scripts/mapgen-report.ts     sweep report (success/retries/fallback/p50/p95/
                             height min/max/max slope)
```

New content categories are added to the manifest, loader, pack registries,
and reference validator; definitions are zod-validated, cross-referenced,
and frozen.

## 7. Seed formula

```text
baseSeed      = hash32("arena-seed", roomCode, matchIndex, profileId, version)
candidateSeed = hash32("arena-attempt", baseSeed, attempt)
```

`hash32` is FNV-1a over each component with a separator mix and a final
avalanche — never raw XOR as the final combination. Fixed expected-value
tests pin exact outputs; rematch increments `matchIndex`; profile/version/
attempt each change the seed.

## 8. Pipeline order (per spec §5)

```text
base (flat profile baseHeight)
→ macro feature stamps (basin/ridge/plateau/valley/hill)
→ smoothing (3×3 weighted, profile.smoothingPasses)
→ height clamp (profile.heightRange)
→ iterative slope correction (symmetric neighbor pull, ≤ profile iterations)
→ final smoothing (1 pass)
→ clamp again
→ slope classification (per-cell slope + steep mask)
```

The fallback terrain profile sets `legacySampled: true` and samples the
legacy analytic ground (flat 0 + center bowl + three ramps) onto the same
grid — the known-safe fixed arena shape with the same runtime interface.

## 9. Validation and retry

- Pure `validateArena(arena, validationProfile)` returns structured
  `errors[]/warnings[]/metrics{}` (generationMs, heightMin/Max, maxSlope,
  checksum, featureCount).
- `generateArenaWithRetry` tries attempts `0..retryLimit-1` (retryLimit 8)
  in deterministic order; the first valid candidate wins. If all fail, the
  fixed fallback map is built, validated, and returned with
  `fallbackUsed: true`.
- Determinism is verified by regenerating from the same candidate seed and
  comparing checksums (report sweep + tests; optionally inside validation
  via `checkDeterminism`).

## 10. Deliverables and verification

```text
docs/map-generation/MAP_GENERATION_PHASE_1_PLAN.md   (this file)
docs/map-generation/MAP_GENERATION_PHASE_1_REPORT.md (after implementation)
tests/mapgen.test.ts
scripts/mapgen-report.ts
npm run test:maps   (vitest mapgen suite + sweep report)
```

Gates: `npm run build`, `npm test`, `npm run test:demo`, `npm run test:e2e`,
`npm run test:loop`, `npm run test:maps` — all must pass; the fixed arena
and existing gameplay remain byte-for-byte unchanged (golden Demo must
match without regeneration).
