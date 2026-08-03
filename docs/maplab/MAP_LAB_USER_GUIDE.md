# Recoil Crew Map Lab — User Guide

Map Lab is a **separate browser tool** for exploring the production map
generator: reproduce the exact arena the game would generate for a room,
edit map/terrain/validation/route/furniture parameters, inspect every
generation layer, focus validation issues, and export a profile bundle that
can be safely applied to `content/` with a CLI.

It reuses the real production pipeline (`src/shared/mapgen/*` and the
validated `content/` JSON). There is no simplified or duplicated generator.

## Running

```bash
npm install
npm run dev:maplab        # dev server on http://localhost:5180
# or
npm run build:maplab      # production build to dist-maplab/
npx vite preview --config tools/maplab/vite.config.ts --port 8098
```

`build:maplab` first runs `npm run generate:map-profiles`, so the generated
client bundle is always in sync with `content/`.

## Layout

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ Toolbar: profile · mode · room/match/version · seeds · regenerate · undo/│
│ redo/reset · exports · camera (3D / Top Down / Fit)                     │
├──────────────┬──────────────────────────────────────┬───────────────────┤
│ Left panel   │ Center viewport (Three.js)          │ Right panel       │
│ BASIC        │ orbit / top-down, layers, issue     │ PASS/FAIL         │
│ TERRAIN      │ focus, terrain + props              │ issues            │
│ ROUTES       │                                      │ metrics           │
│ OBJECTS      │                                      │ logs              │
│ VALIDATION   │                                      │                   │
│ ADVANCED JSON│                                      │                   │
├──────────────┴──────────────────────────────────────┴───────────────────┤
│ Bottom drawer: layer toggles · history · Source→Working diff · draft     │
└─────────────────────────────────────────────────────────────────────────┘
```

## Workflow

### 1. Load a profile and generate

1. Pick a profile (`map.arena400Primary` or `map.fallbackLegacy`) in the
   toolbar.
2. Choose **Production** (same retry/fallback flow as a real match) or
   **Exact Candidate** (rebuild one specific candidate from
   base/candidate seed + attempt).
3. Set the room code, match index, and generator version — these drive the
   seed exactly like the game.
4. Click **Regenerate** (or leave **Auto** on). The right panel shows
   PASS/FAIL, issues, and metrics (attempt, fallback, checksum, generation
   time, height range, max slope, routes, spawns/gates/recovery, ramps,
   objects, and per-kind requested/placed/collider/rejected counts).

The checksum shown is the same `arenaChecksum` the server sends and the
client verifies before gameplay.

### 2. Edit parameters

The left panel is built from a descriptor registry — every registered field
appears under **BASIC / TERRAIN / ROUTES / OBJECTS / VALIDATION**. Changes
go into the **Working bundle** (a deep clone); the frozen source bundle is
never mutated.

- **Terrain Drama** is a macro that scales all feature heights/depths.
- Number/boolean/select/readonly fields are bound with Tweakpane.
- Unregistered or new fields can be edited with the **ADVANCED JSON**
  editor: choose a section (`map`, `terrainProfile`, ...), edit the JSON,
  and click **Apply JSON**.
- **Undo / Redo** revert working-bundle changes; **Reset** restores the
  source profile; **Reset Section** restores one section.
- The bottom **HISTORY / DIFF** drawer shows the exact Source→Working
  changes.

Changes auto-regenerate after a 300 ms debounce when **Auto** is on.
Layer toggles never regenerate the map.

### 3. Inspect layers

The bottom drawer lists every shared layer:

```text
terrain · heightHeatmap · slopeHeatmap · features · routeNodes · routeEdges
· routeCorridors · zones · spawns · gates · recovery · ramps ·
flightCorridors · landings · furniture · colliders · decorations ·
barrelChains · validationErrors · validationWarnings
```

These are the same layer implementations used by the game's F3 debug
overlay (`?debug=1`).

### 4. Focus validation issues

When validation fails (or warns), click an issue in the right panel. Map Lab
activates the related layer and moves the camera to the issue position.

### 5. Export

Three separate export buttons:

| Button | Content |
| --- | --- |
| **Export Profile** | One `profile-bundle` JSON: format version + all definitions (map, terrain, validation, furniture set, density, landmarks) for the selected map. |
| **Export Arena** | One `generated-arena` JSON: seeds, version, attempt, checksum, heightfield samples, layout, objects, validation, generation time. |
| **Export Validation** | One `validation-report` JSON: metadata, issues, metrics, phase-2 summary. |

### 6. Drafts

The working state auto-saves to `localStorage` (`maplab:draft:v1`) a few
seconds after changes. Reloading restores it; if the source content
fingerprint changed, Map Lab warns that the draft may not match the current
content.

## Applying an exported profile to the game

Profile bundles are applied with the CLI (the browser never writes repo
files):

```bash
npm run maplab:apply -- ./downloads/profile.json
# existing ids need explicit overwrite:
npm run maplab:apply -- ./downloads/profile.json --overwrite
```

The CLI validates format/version, runs the real Zod schemas, checks
cross-references and id conflicts, writes content files, updates
`content/manifest.json`, regenerates the client-safe bundle, prints changed
files, and never creates a git commit. Then run `npm test` /
`npm run test:maps` to verify before committing.

## Troubleshooting

- **Worker log says "main-thread fallback"**: worker construction failed in
  this browser; generation still uses the same shared code, debounced on
  the main thread.
- **Draft warning on load**: content changed since the draft was saved;
  use **Reset** to start from the current source.
- **No issues but FAIL**: check the METRICS panel — a validation metric
  (height bounds, slope, feature spacing, determinism, generation time)
  may have failed.
