# Refractor 02 — Project Asset Authoring Guide

The project asset catalog (`content/assets/project.json`) extends the
built-in semantic asset set without weakening built-in fallbacks.

## Built-ins vs project assets

- Built-in ids (`playerTank.chassis`, `enemy.scrapBug`, `audio.ui`, ...)
  always resolve — missing files fall back to registered procedural
  factories.
- Project assets must use a namespace (`custom.*`, `scene.*`,
  `environment.*`, `ui.*`) and cannot accidentally collide with built-ins.
- Explicit built-in replacement uses `replacesBuiltIn`, not a duplicate id.

## Adding a custom GLB scene asset

1. Place the file under `public/assets/models/`.
2. Register it in `content/assets/project.json`:

```json
{
  "id": "scene.menuTank",
  "kind": "model",
  "namespace": "scene",
  "file": "/assets/models/menu-tank.glb",
  "defaultTransform": { "position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1.2, 1.2, 1.2] },
  "materialOverrides": { "roughness": 0.7 },
  "tags": ["menu", "tank", "preview"],
  "optional": false
}
```

3. Reference it from a scene entity or UI node (`"assetId": "scene.menuTank"`).
4. `npm run generate:presentation-content` — unknown asset references fail
   at generation time.

Custom scene assets without a `file` use the catalog-driven placeholder
policy: set `fallbackAssetId` to a registered asset whose prototype should
be cloned (for example `"fallbackAssetId": "playerTank.chassis"`). The
project's own `defaultTransform`/`materialOverrides` still apply. No code
path hardcodes menu assets; project model files are registered before the
preload pass so `AssetService.model(id)` resolves synchronously after
`AssetService.load()`.

## Import-ready metadata

Schemas already support `defaultTransform`, `materialOverrides`, `sockets`,
`collider`, `tags`, `thumbnail`, and `lodRefs` for a future Studio
importer. Runtime support is strongest for models and themes; other kinds
(`image`, `texture`, `audio`, `vfx`, `uiTheme`, `postProcessPreset`) are
schema-forward-compatible.

## Validation

- `isBuiltInAssetId(id)` / `isProjectAssetId(id, catalog)` /
  `assertResolvableAssetId(id, catalog)` in `src/shared/assetCatalog.ts`.
- Manifest entries with valid project ids are accepted by
  `AssetManifestLoader`; unknown ids are still skipped with a warning.
- Missing required gameplay assets keep fallbacks; missing required custom
  scene assets fail presentation-content validation.

## Monster Pack 10 import authoring

- The importer (`scripts/import-monsterpack10.ts`) regenerates
  `content/assets/project.json` by merging native entries with the
  Quaternius catalog; reruns are idempotent and dedupe by asset id.
- Every Quaternius entry uses `optional: true`, a role-class fallback
  (`enemy.scrapBug`/`enemy.rammer`/`enemy.gunTower`/`enemy.witch`), and a
  `/assets/models/enemies/quaternius/<tier>/<file>.glb` path.
- Ownership of generated files is tracked in
  `docs/monsterpack10/generated/IMPORT_OWNERSHIP.json`; stale managed GLBs
  are removed on re-import and unrelated files are never touched.
