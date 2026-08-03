# Recoil Crew Map Lab — Implementation Plan

**Binding spec:** `docs/map-lab-tool/RECOIL_CREW_MAP_LAB_DESIGN_DOCUMENT.md`
**Branch:** `map-lab` (from merged main: jump/dash + mapgen Phases 1-3)
**Stack:** TypeScript, Vite, Three.js, Zod (+ Tweakpane in the tool only)

## 1. Current-state audit

### Generation API (all confirmed in the tree)

- `src/shared/mapgen/arenaSession.ts` — `selectArenaSession` (production:
  `generateArenaWithRetry` + props + world), `reconstructArenaSession`
  (exact candidate + checksum gate), `metadataFromArena`, `attachProps`,
  `resolveClientMapBundle` (currently reads the manual
  `LEGACY_MAP_DEFINITIONS` mirror).
- `src/shared/mapgen/retry.ts` — `generateArenaWithRetry`, exported
  `buildArenaCandidate` (exact candidate builder).
- `src/shared/mapgen/generator.ts` — `generateTerrain`, `GeneratedArena`.
- `src/shared/mapgen/validation.ts` / `validation2.ts` — string-error
  reports (`ValidationReport`, `Phase2ValidationResult`).
- `src/shared/mapgen/layout.ts` — `generateMapLayout` (routes → zones →
  gates/spawns → recovery → ramps → furniture).
- `src/shared/mapgen/profiles.ts` — `resolveMapBundle` (server path) +
  manual `LEGACY_MAP_DEFINITIONS` client mirror.
- `src/shared/mapgen/phase2Profiles.ts` — manual
  `LEGACY_MAP_LAYOUT_DEFINITIONS` mirror.

### JSON ↔ client mirror structure

`content/{maps,terrain-profiles,validation-profiles,furniture-sets,
density-profiles,landmarks}/*.json` are validated by `ContentLoader` on the
server. The browser currently consumes hand-copied mirrors
(`LEGACY_MAP_DEFINITIONS`, `LEGACY_MAP_LAYOUT_DEFINITIONS`) — duplicated
state to eliminate.

### DebugOverlay responsibilities

`src/client/app/debugOverlay.ts` currently builds ALL markers itself (height
cloud, corridors, features, zones, spawns/gates, ramps/landings, recovery,
colliders, barrel links, metadata panel). It is game-F3-specific; Map Lab
needs the same visualizations without duplication.

### Object placement data and flow

- `furniture.ts placeFurniture` — ordered placement; currently
  `options.entries.find((e) => e.kind === kind)` picks only the FIRST entry
  per kind (bug for multi-entry kinds); no per-entry `enabled`; no master
  object toggle; no requested/placed/rendered/collider/rejected metrics.
- `compat.ts toArenaProps` — skips crates (`kind === 'crate'` excluded from
  colliders), so crates disappear between generation and world/rendering.
- `arenaView.ts` — hardcoded light poles (`buildLightPoles`), not data.

### Validation issue structure

Validators return string `errors[]/warnings[]`; no stable code/category/
position contract for UI focus.

### Build/test gates

`build`, `test`, `test:demo`, `test:e2e`, `test:loop`, `test:maps`,
`test:maps:sweep` all pass on `map-lab` HEAD (merged main). Map Lab adds
`generate:map-profiles`, `build:maplab`, `test:maplab`, `maplab:apply`.

## 2. Milestone 0 — single source + shared layers

### 0.1 Profile bundle generation

```text
content JSON → scripts/generate-map-profile-bundle.ts →
src/generated/mapProfiles.generated.ts
```

- Script: loads `content/` through the real `ContentLoader` (Zod + reference
  validation), resolves every `MapGenerationBundle` with
  `resolveMapBundle`, canonical-sorts and serializes with
  `canonicalStringify`, writes a TS module with an auto-generated warning
  header, `MAP_PROFILE_SOURCE_HASH` (sha256 of the canonical bundle JSON),
  and `GENERATED_MAP_PROFILES` (plain data only, no functions).
- `resolveClientMapBundle` switches to the generated module; the manual
  `LEGACY_MAP_DEFINITIONS`/`LEGACY_MAP_LAYOUT_DEFINITIONS` mirrors are
  deleted. `phase2Profiles.ts` keeps only the structural types.
- Parity test: generated bundle deep-equals server-resolved bundle for every
  map id. Stale test: recompute the source hash from disk and fail when the
  committed generated file is out of date.

### 0.2 Shared debug layers

New `src/client/map-debug/`:

```text
layerTypes.ts      MapLabLayerRenderer, MapLabRenderContext
layerManager.ts    create/toggle/rebuild/focus/dispose, no leaks
layers/*.ts        height, slope, features, routes (nodes/edges/
                   corridors), zones, spawns, gates, recovery, ramps
                   (ramps/landings/flight), furniture/colliders/
                   decorations, barrel chains, validation issues
```

`debugOverlay.ts` becomes a thin consumer of the shared manager (game F3
overlay unchanged behavior) + metadata panel.

### 0.3 Validation issue contract

`src/shared/mapgen/validationIssues.ts`:

```ts
interface MapValidationIssue {
  id, code, message, severity: "error" | "warning",
  category: "terrain" | "routes" | "spawns" | "furniture" | "ramps" |
            "performance" | "determinism",
  position?, entityId?, layerId?, parameterPaths?
}
```

`validateArena`/`validatePhase2` additionally emit `issues[]` while keeping
the existing string `errors[]/warnings[]` and `.ok` semantics (retry loop
and all current tests unchanged).

### 0.4 Object enabled contract + metrics

- `FurnitureSetDef` gains `objectPlacement.enabled`, `ramps.enabled`,
  `barrel.enabled`, `lightPoles: {enabled, count}`, and per-entry
  `enabled`.
- `placeFurniture` processes ALL entries per kind (no `find()`), honors
  master/category/entry enables, preserves counts, and reports
  `placementMetrics` per kind: requested/placed/rendered/collider/rejected.
- `layout.ts` skips ramps when `ramps.enabled` is false; barrels gated by
  `barrel.enabled` + entry enable; light poles placed as data-driven
  `lightPole` objects.
- `compat.ts toArenaProps` includes crates as colliders; `arenaView.ts`
  renders light poles from data (removes the hardcoded builder).
- Schema/content/mirror updates; Metrics surface on the arena layout.

## 3. Milestone 1 — Map Lab MVP

### 3.1 Separate Vite entry

```text
tools/maplab/{index.html, vite.config.ts, src/}
```

Scripts: `dev:maplab`, `build:maplab` (runs `generate:map-profiles` first),
`test:maplab`. Output `dist-maplab/`; Map Lab + Tweakpane never enter the
game client build.

### 3.2 Generator adapter

`tools/maplab/src/generatorAdapter.ts` — `MapLabGenerateRequest` →
`generateProductionSession` (selectArenaSession with working bundle) and
`generateExactCandidate` (buildArenaCandidate + attachProps + world-less
arena serialization), returning arena + metadata + metrics. Production
checksum parity with the game session is unit-tested.

### 3.3 Web Worker

`tools/maplab/src/worker/mapGeneration.worker.ts` — receives
`MapLabGenerateRequest` (working bundle data), runs generation/validation
via the shared modules (no Three.js), returns serialized arena +
`Float32Array` heightfield samples (Transferable). Request ids; stale
responses ignored. If worker construction fails at runtime, a documented
debounced main-thread adapter fallback is used (same shared generator, no
logic duplication).

### 3.4 State + parameters

- `mapLabState.ts` — `MapLabState` (mode, sourceProfileId, workingBundle,
  fallbackBundle, roomCode, matchIndex, generatorVersion, seeds, camera
  mode, autoRegenerate, layers, selectedIssueId, dirty).
- `parameters/` — descriptor registry (`number|boolean|select|text|range|
  readonly`, path, group, min/max/step, basic/advanced,
  requiresRegeneration, visibleWhen) for map/terrain/validation/route/ramp/
  barrel/furniture/density; a `Terrain Drama` macro control; Raw JSON editor
  for unregistered fields.

### 3.5 UI

- Top toolbar (profile/mode/seeds/regenerate/undo/redo/reset/export).
- Left Tweakpane folders (Basic/Terrain/Routes/Objects/Validation) + Raw
  JSON.
- Center Three.js viewport: OrbitControls + orthographic top-down, Fit Map,
  Focus Issue (enables related layer + moves camera).
- Right panel: PASS/FAIL, category status, issues, metrics, performance,
  logs.
- Bottom drawer: layer toggles, history, Source↔Working JSON diff, draft
  status.

## 4. Milestone 2 — Export/Apply + hardening

- Exports: Profile Bundle (format version + all definitions), Generated
  Arena (seeds/version/attempt/checksum/heightfield/layout/objects/
  validation), Validation Report (metadata + issues + metrics).
- `scripts/apply-maplab-profile.ts` (`npm run maplab:apply -- <file>`):
  format/version check → Zod schema validation → reference checks → ID
  conflict detection → write only with `--overwrite` → manifest update →
  client bundle regeneration → changed-file report; never commits git.
- Object panel with master/category/entry enables + count/spacing/
  clearance/zones/slopeMax/collider/asset/obstacleType and
  requested/placed/rendered/colliders/rejected metrics.
- Docs: `MAP_LAB_USER_GUIDE.md`, `MAP_LAB_ARCHITECTURE.md`,
  `MAP_LAB_IMPLEMENTATION_REPORT.md`; update README, docs README,
  CONTENT_AUTHORING_GUIDE, ARCHITECTURE, BUILD_STATUS.

## 5. Tests and gates

- `tests/maplab/` — single source (parity + stale), generator adapter
  (production/exact/retry/fallback parity, working-bundle immutability),
  parameters (paths, raw JSON, undo/redo/reset, enabled states), shared
  layers (create/toggle/rebuild/focus/dispose), export/apply round-trips +
  rejection + overwrite protection + manifest update.
- `e2e/maplab.spec.ts` — the 12-step Map Lab flow (load profile, generate,
  edit hill height, regenerate, top-down, route toggle, objects off,
  issue focus, export, draft restore after reload).
- Performance: 20 regenerations without scene growth, layer toggles never
  regenerate, stale worker results dropped, Map Lab/Tweakpane absent from
  game chunks, F3 overlay regression.
- Full game regression commands all executed.
