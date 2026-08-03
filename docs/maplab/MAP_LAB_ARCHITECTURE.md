# Recoil Crew Map Lab — Architecture

## Goals and constraints

Map Lab is a **separate Vite application** under `tools/maplab/`. It must:

- reproduce the production map generator exactly (same content, seeds,
  retries, fallback, validation, checksums);
- edit a deep-cloned **working bundle** without mutating frozen source
  definitions;
- never ship inside the normal player bundle (`dist/` has no Map Lab or
  Tweakpane code);
- keep the browser UI unable to write repository files (all writes go
  through `scripts/apply-maplab-profile.ts`).

## Single source of truth

```text
content JSON
  → scripts/generate-map-profile-bundle.ts  (npm run generate:map-profiles)
  → src/generated/mapProfiles.generated.ts   (plain data, no functions)
```

- The script loads `content/` through the real `ContentLoader` (Zod +
  reference validation), resolves every map with `resolveMapBundle`,
  canonical-sorts and serializes, and writes a module with
  `MAP_PROFILE_BUNDLE_FORMAT = 1`, a sha256 `MAP_PROFILE_SOURCE_HASH`, and
  `GENERATED_MAP_PROFILES` plus `DEFAULT_MAP_PROFILE_ID` (resolved from the
  active mode's optional `mapProfileId`, fallback `map.arena400Primary`).
- The **server** still resolves from validated JSON; the **client**,
  Practice, reconstruction, and Map Lab consume the generated module via
  `resolveClientMapBundle`. Server selection, Practice, and the generated
  module all share one resolution: `resolveDefaultMapProfileId(pack)`.
- The manual `LEGACY_MAP_DEFINITIONS` / `LEGACY_MAP_LAYOUT_DEFINITIONS`
  mirrors were deleted. A parity test deep-equals generated and
  server-resolved bundles; a stale test recomputes the source hash from
  disk and fails when the committed generated file is out of date.

## Shared debug layers

`src/client/map-debug/` implements the layer system used by both the game
F3 overlay (`src/client/app/debugOverlay.ts`) and Map Lab:

- `layerTypes.ts` — `MapLabLayerRenderer` (id, group, default visibility,
  `setContext`, `setVisible`, `focus`, `dispose`) and `MapLabRenderContext`
  (arena, world, world-coordinate converters).
- `layerManager.ts` — registration, visibility, rebuild, focus, dispose;
  renders never mutate authoritative arena data.
- `layers/` — height/slope heatmaps, features, routes (nodes/edges/
  corridors), zones, spawns, gates, recovery, ramps/landings/flight,
  furniture/colliders/decorations, barrel chains, validation
  errors/warnings, terrain.
- `terrainMesh.ts` — shared chunked terrain builder used by `ArenaView` and
  Map Lab, with LOD updates and disposal.

The game overlay and Map Lab register the same default layer set, so
visualizations cannot drift.

### Terrain classes and cliffs

Generated arenas carry a per-cell `terrainFlags` bitmask, `cliffFeatures`,
`cliffMasks`, `cliffEdges`, and `accessCorridors` (all serialized through
the worker and included in `computeArenaChecksum`). Map Lab's parameter
registry exposes `slopeRules` and cliff feature controls; the shared layer
set visualizes driveable/risky/blocked masks, cliff top/bottom/walls,
protected traversal, safety buffers, access routes, and terrain cost. The
viewport renders vertical wall quads from authoritative edge segments.
Exact Candidate keeps invalid arenas for inspection (`generationSucceeded`
vs `validationPassed`), and production fallback shows a per-attempt
diagnostic banner.

## Validation issue contract

`src/shared/mapgen/validationIssues.ts` converts the existing string
`errors[]/warnings[]` (produced by the unchanged validators) into stable UI
issues:

```ts
interface MapValidationIssue {
  id: string;                 // issue.0, issue.1, ...
  code: string;               // stable slug from the validator message
  message: string;
  severity: "error" | "warning";
  category: "terrain" | "routes" | "spawns" | "furniture" | "ramps" |
            "performance" | "determinism";
  position?: { x; y; z };
  entityId?: string;
  layerId?: string;
  parameterPaths?: string[];
}
```

Validators themselves are unchanged (retry/fallback semantics preserved).

## Object enabled contract

`content/furniture-sets/*.json` and the furniture schema now support:

- `objectPlacement.enabled` — master objects switch;
- `ramps.enabled` and `barrel.enabled` — category switches;
- per-entry `enabled` — individual entry switch;
- `lightPoles: { enabled, count }` — data-driven light poles.

`placeFurniture` processes **all** entries per kind (no first-match
`find()`), honors master/category/entry enables, preserves counts, and
returns per-kind `placementMetrics`:
`requested / placed / rendered / colliders / rejected`.

`compat.ts` no longer drops crates between generation and world/rendering,
and `arenaView.ts` renders light poles from data instead of a hardcoded
builder.

## Map Lab application structure

```text
tools/maplab/
├── index.html
├── vite.config.ts          # alias @app -> repo src; outDir dist-maplab
└── src/
    ├── main.ts             # app shell, regeneration, draft, test hook
    ├── mapLabState.ts      # MapLabState + draft persistence
    ├── generatorAdapter.ts # production / exactCandidate adapter
    ├── workerClient.ts     # worker with main-thread fallback
    ├── worker/
    │   └── mapGeneration.worker.ts
    ├── history/historyStore.ts
    ├── io/export.ts        # profile / arena / validation exports
    ├── panels/ui.ts        # DOM + Tweakpane view layer
    ├── parameters/         # descriptor registry + per-section descriptors
    └── rendering/viewport.ts # Three.js scene, cameras, shared layers
```

### Generator adapter

`generatorAdapter.ts` is the only generation entry point for the UI:

- **Production**: `selectArenaSession({ roomCode, matchIndex, bundle,
  fallbackBundle, generatorVersion })` — the exact production path used by
  the server, including deterministic retry and fallback.
- **Exact Candidate**: `buildArenaCandidate` + `attachProps` +
  `metadataFromArena` — the same candidate builder used by
  reconstruction/tests.

Arena payloads are structured-clone-safe; the heightfield `Float32Array`
is transferred from the worker.

### Worker

`mapGeneration.worker.ts` runs generation/validation in a worker (no
Three.js). `workerClient.ts` assigns request ids and the app drops any
result whose request id is stale, so a slow old generation can never
overwrite the latest map. If worker construction fails, a documented
debounced main-thread adapter executes the **same shared generator** (no
algorithm duplication).

### State, parameters, UI

- `MapLabState` is the source of truth; Tweakpane is a view/controller.
- The parameter registry emits descriptors (`path`, `label`, `group`,
  `type`, `min/max/step`, `unit`, `description`, `basic/advanced`,
  `requiresRegeneration`, `visibleWhen`) for map, terrain, validation,
  route, ramp, barrel, furniture, and density fields. Unregistered fields
  are editable via the raw JSON editor.
- The viewport renders chunked terrain from the authoritative heightfield
  plus the shared layers; OrbitControls (3D) and an orthographic top-down
  camera preserve the current focus target. Issue clicks enable the related
  layer and focus the camera.
- Regeneration is debounced 300 ms; every rebuild disposes the previous
  Three.js resources; layer toggles never regenerate.
- History is a bounded undo/redo store over the working bundle; drafts
  persist to `localStorage` with the source fingerprint.

## Export and apply

Exports (`io/export.ts`):

- `profile-bundle` — format version, source profile id, all definitions;
- `generated-arena` — metadata, heightfield samples, layout, objects,
  validation, generation time;
- `validation-report` — metadata, issues, metrics.

`scripts/apply-maplab-profile.ts` (`npm run maplab:apply -- <file>`):

1. format/version check (`kind: "profile-bundle"`, `formatVersion: 1`);
2. real Zod schema validation for every section;
3. bundle-internal and pack cross-reference validation;
4. id conflict detection; existing files are only overwritten with
   `--overwrite`;
5. content file writes + `content/manifest.json` update;
6. client-safe bundle regeneration (`generate:map-profiles`);
7. changed-file report; **no git commit**.

The browser never has filesystem access; all application is CLI-driven.

### Local apply helper (one-click apply)

`scripts/maplab-apply-server.ts` (`npm run maplab:apply-server`) is a
localhost-only HTTP helper (127.0.0.1:5181) that runs the same validated
apply pipeline on behalf of the browser:

- `POST / { kind: 'validate', bundle }` — schema/reference validation only;
- `POST / { kind: 'apply', bundle, overwrite }` — full-bundle apply
  (used by **Apply to Game**);
- `POST / { kind: 'apply', bundle, overwrite: false, onlyMap: true,
  setModeMapProfile: true }` — writes only the new map definition and
  points the active mode's `mapProfileId` at it (used by
  **Save as New Profile**).

It honors `MAPLAB_CONTENT_ROOT` / `MAPLAB_APPLY_PORT` (tests) and
`MAP_PROFILES_OUT` (generated-bundle output override). If the helper is not
running, the buttons fall back to downloading the bundle and printing the
equivalent CLI command.

## Build/test separation

- `npm run build` (game) never imports `tools/maplab` or `tweakpane`; a
  unit test scans `dist/assets/*.js` for `MapLabApp` / `tweakpane` /
  `maplab-` markers.
- `npm run build:maplab` runs `generate:map-profiles` first and emits
  `dist-maplab/`.
- `e2e/maplab.spec.ts` drives the built Map Lab preview (port 8098) next to
  the game server (port 8099).
