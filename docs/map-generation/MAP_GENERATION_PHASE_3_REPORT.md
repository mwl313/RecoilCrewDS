# Map Generation Phase 3 — Report

**Specification:** `docs/design/01-맵-디자인.md` (binding, §14, 16–17)
**Branch:** `map-creation` · **Status:** Complete
**Prerequisites met:** Phases 1–2 complete; generated arenas pass traversal
validation; fixed fallback remains playable.

## 1. Files added

```text
src/shared/sim/arenaWorld.ts        match-scoped ArenaWorld (static +
                                    generated constructors)
src/shared/sim/groundQuery.ts       GroundQuery + STATIC_GROUND_QUERY
src/shared/mapgen/arenaSession.ts   ArenaMetadata, selectArenaSession,
                                    reconstructArenaSession (checksum gate),
                                    client-safe bundle resolution
src/client/groundQuery.ts           client-only presentation ground setter
src/client/app/debugOverlay.ts      F3/`?debug=1` mapgen overlay
e2e/mapgen.spec.ts                  4 Playwright tests (join/mismatch/
                                    reconnect/rematch)
tests/mapgenPhase3.test.ts          15 unit tests
docs/map-generation/MAP_GENERATION_PHASE_3_PLAN.md
docs/map-generation/MAP_GENERATION_PHASE_3_REPORT.md   (this file)
```

## 2. Files modified

```text
src/shared/sim/match.ts             Match accepts an ArenaWorld
src/shared/sim/matchRuntime.ts      world-scoped barrels/spawns/ground/
                                    obstacles; fromContentPackWithWorld
src/shared/sim/tankKinematics.ts    GroundQuery parameter (default static)
src/shared/sim/systems/systemContext.ts  ctx.world
src/shared/enemies/enemySystem.ts, enemyBehaviors.ts
src/shared/spawning/spawnDirectorRuntime.ts  world towerSpots/truckRoute +
                                    empty-array guards (RNG parity kept)
src/shared/pickups/pickupSystem.ts, src/shared/projectiles/projectileSystem.ts
src/shared/mapgen/retry.ts          exported buildArenaCandidate
src/shared/mapgen/index.ts          Phase 3 exports
src/server/room.ts                  matchIndex, arenaSession, arena metadata
                                    on start/snapshot/joined
src/client/arenaView.ts             chunked terrain + LOD + instanced props
                                    + dispose
src/client/app/renderWorld.ts       world-aware ArenaView, fog 100-150,
                                    shadow far 120, rebuildArena
src/client/app/gameClient.ts        world injection, applyArenaSession,
                                    presenter colliders getter
src/client/app/networkStatePresenter.ts  dynamic collider source
src/client/cameras.ts, tpsCamera.ts client ground indirection
src/client/main.ts                  session reconstruction, checksum gate,
                                    reconnect/resume, practice reroll, hooks
e2e/tps.spec.ts, e2e/full-game.spec.ts   map-generic collision test; truck
                                    expectation removed (truck excluded)
```

## 3. Server arena selection

- `Room.matchIndex` (0-based) increments per match; rematch → +1 → new
  base seed → new map. Reconnect reuses the same index/seed/checksum.
- `startMatch` calls `selectArenaSessionFromPack` (map bundle
  `map.arena400Primary`, deterministic retry + fallback) and builds the
  `Match` on `session.world`; pack-less servers keep the legacy static
  world (no metadata), unchanged.
- Required metadata is published on `start`, every snapshot, and `joined`
  (rejoin): `mapProfileId`, `arenaBaseSeed`, `arenaCandidateSeed`,
  `arenaAttempt`, `arenaGeneratorVersion`, `arenaChecksum`,
  `arenaFallbackUsed`. No global current arena — each room/match carries its
  own world (two-room isolation unit-tested).

## 4. Client reconstruction + checksum gate

- `reconstructArenaSession(metadata, ...)` regenerates the exact candidate
  (same seed, attempt, fallback flag — never re-runs retry), validates it,
  and compares the post-carve heightfield checksum.
- `main.ts` runs the gate on `start`, on rejoin (`joined` phase running/
  results), and on the first snapshot; mismatches (checksum/version/
  profile/validation) show the error screen, disable input, and set a
  sticky `mapGateFailed` flag so later snapshots can never bypass the gate.
- Practice uses the exact same pipeline with the client-safe legacy bundle
  mirror and a deterministic local seed (`PRACTICE` + incrementing practice
  match index → reroll per practice round).

## 5. Terrain rendering / LOD / culling / fog

- `ArenaView` builds 4×4 chunks (25 cells, 26×26 verts) whose vertex Y and
  normals come directly from the authoritative heightfield; bilinear query
  agreement is unit- and browser-tested (tank ground vs `groundHeightAt`).
- Each chunk owns full-res and half-res geometries; chunks beyond 150 m
  swap to half-res (hysteresis at 130 m); per-chunk frustum culling.
- Shared terrain material; stable UVs (world/4); rendering never mutates
  the heightfield.
- Fog near 100 / far 150 (visual only); shadow camera far tightened to
  120 m.
- Props: colliders as individual semantic meshes (custom GLB or fallback),
  decorations as `InstancedMesh` per asset; `dispose()` removes groups and
  releases geometries/materials — scene counts stay flat across rematches
  (browser-verified).

## 6. Debug overlay

`?debug=1` (or test mode) + F3 toggles an HTML panel (seed, candidate,
attempt, version, checksum, generation ms, fallback, height/slope,
warnings) and THREE markers for height heatmap, macro features, corridors,
zones, spawns/gates, ramps/landings, recovery, collider bounds, and barrel
clusters. `?seed=` forces the Practice seed (dev/test only).

## 7. Rematch / reconnect / Practice

- Rematch: `matchIndex + 1` → new seed → new map; clients rebuild the arena
  view and reset prediction/presenter (no scene growth).
- Reconnect: same match keeps the same metadata; a fresh page re-initializes
  the game from snapshot metadata when no `start` arrives; checksums must
  match.
- Practice: same generator/validation/queries as the server, seeded
  locally, rerolled per round, fallback available.

## 8. Test results (all run)

```text
npm run build:        PASS
npm test:             PASS — 28 files, 328/328 (15 new Phase 3 unit tests)
npm run test:demo:    PASS — golden Demo byte-identical (unchanged)
npm run test:e2e:     PASS — 21/21 (4 new mapgen Playwright tests)
npm run test:loop:    PASS — generated arena round (score 20330, grade S,
  JACKPOT ×3, rematch moonYard), LOOP_EXIT=0
npm run test:maps:    PASS — 25 Phase 1 tests + 64-seed report
npm run test:maps:sweep: PASS — 1000/1000, 0 fallbacks, determinism PASS
```

Phase 3 tests cover: session determinism/metadata, checksum/version/
profile rejection, fallback metadata + fixed props, two-room isolation,
rematch reroll, reconnect same map, generated/static world query parity,
match-on-generated-world, server start/snapshot/joined metadata, and the
browser matrix (generated join, mismatch error screen, reconnect, rematch
scene stability).

## 9. Manual browser checks

Performed through the Playwright suite (two real Chrome contexts) plus the
existing control/practice/tps/full-game specs on generated maps:
Space jump / Shift dash work; prediction is smooth; cannon recoil visible;
JACKPOT fires unbraced; results/rematch flow; pause/blur input clearing;
wall collision stops the tank without tunneling; HUD/PIP labels unchanged.
The debug overlay renders with metadata when `?debug=1`.

## 10. Limitations

- Generated maps have no Loot Truck (truck routes remain excluded per spec)
  and no Gun Towers (no tower bases generated yet); JACKPOT pacing and
  enemies still function (loop verified). These are Phase 4 content topics.
- Client-only ground indirection (`src/client/groundQuery.ts`) is
  presentation-only; the authoritative sim threads the match-scoped world
  explicitly.
- Terrain LOD is a two-level geometry swap (no streaming); fog is a fixed
  presentation range.
- `?seed=` forcing applies to Practice only (dev/test), never to the
  authoritative server path.

## 11. Phase 4 prerequisites

- Generated spawn/gate/recovery queries wired into gameplay requests
  (`findRegions`) for future zone effects and tower/truck reintroduction.
- Optional biome expansion (new landmark/furniture/density JSON) and
  terrain texture variation by zone tag.
- Profiling pass for the 400×400 renderer (shadow distance, LOD distance,
  decoration density tied to quality settings).
