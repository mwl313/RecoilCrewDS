# Map Generation Phase 3 — Implementation Plan

**Specification:** `docs/design/01-맵-디자인.md` (binding, §14, 16–17)
**Prerequisites:** Phases 1–2 complete (traversal validation passes, fixed
fallback playable)
**Branch:** `map-creation`

## 1. Audit

### Room lifecycle / match index

- `src/server/room.ts`: `Room` has no match index; `startMatch` creates
  `new Match(room.code + '-' + now, modifier, pack)`. Rematch reuses the
  same room but always rerolls only via `now()` in the match id — no
  deterministic map seed today. Reconnect sends `joined` with
  `phase: room.phase` but the client always shows the ready screen.

### Arena usage in the sim (must become match-scoped)

- `tankKinematics.ts` — `ARENA.ramps`, `groundHeightAt`, `groundNormalAt`,
  `resolveCircleContacts`, `ARENA.half` boundary clamp.
- `matchRuntime.ts` — `ARENA.barrels`, `ARENA.spawnPoints`,
  `groundHeightAt`, `nearestSpawn`, `ARENA.obstacles` (hard-hit lookup).
- `enemySystem.ts` — `ARENA.bugSpawns`, `groundHeightAt`.
- `enemyBehaviors.ts` — `obstacleAt`, `resolveCircle`, `groundHeightAt`,
  `ARENA.truckRoute`.
- `spawnDirectorRuntime.ts` — `ARENA.towerSpots`, `ARENA.truckRoute`,
  `groundHeightAt`.
- `pickupSystem.ts` / `projectileSystem.ts` — `groundHeightAt`,
  `ARENA.obstacles`.
- All of these import the module-level static `ARENA`; there is no arena
  instance parameter anywhere.

### Client arena rendering / queries

- `arenaView.ts` builds ground/ramps/obstacles/barrels from static `ARENA`
  (80×80 flat plane + bowl).
- `cameras.ts` / `tpsCamera.ts` call static `groundHeightAt` for eye
  clamping (3 classes).
- `renderWorld.ts` creates `ArenaView(assets)` unconditionally; fog already
  exists at 60–150, shadows far 90.
- `gameClient.ts` registers barrel meshes from `ARENA.barrels`; the
  presenter consumes `world.arena.colliders`.
- Asset service: semantic ids (`prop.container`, `prop.barrier`,
  `prop.tire`, `prop.explosiveBarrel`, `arena.ramp`, `arena.factory`) with
  GLB overrides or procedural fallbacks.

### Practice

- `main.ts startPractice()` → `new Match('practice-' + Date.now(), 'none')`
  on the legacy path; no map metadata, no checksum, no generated terrain.

### Content metadata / snapshots

- `start` carries pack metadata; snapshots carry rules revisions; there is
  no arena metadata anywhere on the wire.

### Loading/error UI

- Error screen exists (`screen-error`, RETRY/PRACTICE/MAIN MENU) and is
  reused for connection loss; no map-mismatch path.

### Quality/fog/shadows

- `qualityManager` toggles pixel ratio, shadows, bloom, PIP rate; fog is
  hardcoded in `renderWorld`.

## 2. Architecture

### Shared: match-scoped arena world

New `src/shared/sim/arenaWorld.ts`:

```ts
interface ArenaWorld {
  metadata: ArenaMetadata | null;
  groundHeightAt / groundNormalAt / obstacleAt / resolveCircleContacts /
    rampAt / nearestSpawn;
  half: number;
  obstacles / barrels / ramps / spawnPoints / bugSpawns / towerSpots /
    truckRoute;
  heightfield?: Heightfield;
  arena?: GeneratedArena;
}
```

- `createStaticArenaWorld()` — delegates to the current `arena.ts`
  module functions (byte-identical legacy path used by the Demo golden
  fixture and pack-less servers).
- `createGeneratedArenaWorld(arena)` — `createArenaQueries` + props
  (`toArenaProps`, or the static prop set when `fallbackUsed`).
- `MatchRuntime`/`Match` accept an optional world; all sim systems read
  `ctx.world` instead of importing `ARENA`. Two rooms carry independent
  worlds (no global current arena).

### Shared: arena session (selection + reconstruction)

New `src/shared/mapgen/arenaSession.ts`:

```ts
interface ArenaMetadata {
  mapProfileId, arenaBaseSeed, arenaCandidateSeed, arenaAttempt,
  arenaGeneratorVersion, arenaChecksum, arenaFallbackUsed
}
interface ArenaSessionResult { arena, world, metadata, generationMs }
selectArenaSession({roomCode, matchIndex, bundle, fallbackBundle})  // server + Practice
reconstructArenaSession(metadata, bundle, fallbackBundle)           // client
```

- `arenaChecksum` = post-carve heightfield checksum (the authoritative
  ground). Reconstruction regenerates the exact candidate (same seed,
  attempt, fallback flag — never re-runs retry) and compares checksums.
- Client-safe path uses `LEGACY_MAP_DEFINITIONS` +
  `LEGACY_MAP_LAYOUT_DEFINITIONS` (no fs/zod in the browser).
- Practice uses a deterministic local seed (`PRACTICE` room code +
  incrementing practice match index) through the exact same pipeline.

### Server

- `Room.matchIndex` starts 0, increments on each new match (rematch → +1 →
  new seed → new map).
- `startMatch`: `selectArenaSession({roomCode: room.code, matchIndex,
  bundle})`; `new Match(..., pack, session.world)`; metadata attached to
  `start`, every snapshot, and `joined` (reconnect).
- No pack → static legacy path (metadata absent), unchanged behavior.

### Client

- `main.ts` keeps `arenaSession`; on `start`/first snapshot with metadata:
  `reconstructArenaSession` → checksum gate → build world; mismatch shows
  the error screen and blocks gameplay.
- Reconnect: same session (game alive) verifies checksum and resumes; a
  fresh page initializes the game from snapshot metadata (no `start`
  message arrives on mid-round rejoin).
- Rematch: new session → `GameClient.applyArenaSession` rebuilds terrain +
  props (disposes the old view), resets prediction/presenter.
- `renderWorld` builds `ArenaView(assets, world)`; `gameClient` registers
  barrels from `world.barrels`; camera ground queries route through a
  client-side `groundQuery` setter (presentation-only indirection).

## 3. Terrain rendering / LOD / culling / fog

- Chunked terrain: 4×4 chunks (25 cells each, 26×26 verts) from the
  authoritative heightfield; vertex Y and normals match
  `groundHeightAt`/`groundNormalAt` (bilinear-consistent); stable UVs
  (world / 4); shared material.
- LOD: each chunk owns full-res and half-res geometries; chunks beyond
  ~150 m from the camera swap to half-res; `frustumCulled` per chunk.
- Props: colliders as individual semantic meshes; decorations via
  `InstancedMesh`; shared materials; `dispose()` removes groups and
  per-mesh geometries (no scene growth across rematches).
- Fog: near 100 / far 150 (presentation constant), visual only; shadow
  distance tightened to ~120 m.
- Rendering never mutates the heightfield (read-only Float32Array +
  cloned geometry).
- Static-legacy worlds (no heightfield) keep the existing flat-ground view.

## 4. Debug overlay

Dev/test only (`?debug=1`, F3 toggle): HTML panel with seed/profile/version/
attempt/checksum/generation ms/fallback + validation warnings; THREE
markers for height heatmap, macro features, corridors, zones, spawns/gates,
ramps/landings, recovery, collider bounds, and barrel clusters. `?seed=`
forces a deterministic seed in dev/test mode only.

## 5. Tests

- Unit: session determinism, metadata fields, checksum match/mismatch,
  version/profile mismatch, two rooms different maps, rematch reroll,
  reconnect same metadata, fallback metadata, world query parity, no
  global arena (per-match worlds).
- Playwright: generated-map join (metadata + terrain present), mismatch →
  error screen, reconnect mid-round (same seed/checksum), rematch reroll
  (seed changes, scene counts stable), practice same pipeline.

## 6. Verification gates

```bash
npm run build
npm test
npm run test:demo
npm run test:e2e
npm run test:loop
npm run test:maps
npm run test:maps:sweep
```

The Demo golden must remain byte-identical (static world default); the
fixed map remains the fallback.
