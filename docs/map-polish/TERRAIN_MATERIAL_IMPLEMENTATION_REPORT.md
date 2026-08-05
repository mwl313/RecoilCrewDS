# Terrain Material Implementation Report

## Summary

`map-movement-polish` now renders terrain through a data-driven terrain-material
system. The procedural `groundTexture()` CanvasTexture in `ArenaView` was
replaced by `TerrainMaterialFactory`, which resolves validated content profiles
into `THREE.MeshStandardMaterial` instances with optional PBR texture sets.
Rocket-Jump Highlands uses the Sparse Grass PBR set; all other maps explicitly
select the legacy procedural fallback.

Presentation-only change. Terrain height samples, physics, crest launching,
collision, navigation, checksums, furniture, and map seeds are unchanged.

## Texture files installed

```text
public/assets/textures/environment/sparse-grass/
├── sparse_grass_basecolor_2k.webp
├── sparse_grass_normal_gl_2k.png
├── sparse_grass_roughness_2k.png
├── sparse_grass_mask_1k.png
├── material.json
├── README.md          (preserved from the texture pack)
└── SOURCE.md          (source/license record)
```

The files were already present in the workspace; no archive was found and
nothing was duplicated or re-extracted.

## New schema and content category

- `src/shared/content/schemas/terrainMaterialProfile.ts` defines a
  discriminated union:
  - `pbrTextureSet` — base/normal/roughness semantic asset IDs, tile size,
    tint, normal scale, roughness/metalness, anisotropy, fallback color.
  - `proceduralFallback` — deterministic canvas colors, tile size,
    roughness/metalness.
- Registered as `terrainMaterialProfiles` in `CONTENT_CATEGORIES`,
  `CategoryRegistries`, content loader, pack manifest, and the reference
  validator.
- Profiles live in `content/terrain-material-profiles/`:
  - `terrainMaterial.sparseGrass` (PBR, 10 m tiles)
  - `terrainMaterial.legacyProcedural` (8 m tiles)

## Map selection

- `mapSchema` requires `terrainMaterialProfileId` (`^terrainMaterial\.`).
- `MapDefinitionDef`, `MapGenerationBundle`, and `GeneratedArena` carry the
  resolved profile.
- `map.rocketJumpHighlands` → `terrainMaterial.sparseGrass`.
- All other maps (`arena400Primary`, `cliffArena`, `dramaticHighlands`,
  `fallbackLegacy`, `megaBonkHighlands`) → `terrainMaterial.legacyProcedural`.
- `ArenaView` reads `world.arena.terrainMaterialProfile` and falls back to the
  legacy procedural profile only if an arena somehow lacks one.

## UV / tile-size architecture

- `terrainMesh.ts` writes world-metre UVs (`uv.x = worldX`, `uv.y = worldZ`).
- The factory tiles every loaded texture with
  `repeat = 1 / profile.tileSizeMeters` (10 m tiles → `(0.1, 0.1)`).
- Full and half LOD chunks share world positions, so LOD swaps preserve texture
  alignment.
- The legacy ground plane (0..1 UVs) gets
  `repeat = planeWidth/tileSize, planeDepth/tileSize` through the factory's
  `repeatOverride` option, including when PBR textures load asynchronously.

## Texture loading, caching, and disposal

- `TerrainMaterialFactory` resolves semantic IDs via
  `AssetService.assetUrl()`; no physical paths exist in `ArenaView`.
- Base color loads in `SRGBColorSpace`; normal and roughness stay linear.
- All maps use `RepeatWrapping`; anisotropy comes from the profile.
- Textures are cached per asset ID; repeated `create()` calls reuse instances.
- A material is created synchronously with the fallback color; loaded textures
  attach through callbacks and mark the material for update.
- Missing optional maps log one warning and preserve a valid material; a
  missing base color preserves `fallbackColor`.
- `dispose()` releases each owned texture exactly once and ignores late
  asynchronous callbacks.
- The texture loader is injectable (`TextureLoaderLike`) for deterministic
  unit tests without network requests.

## Fallback behavior

Missing or failed base-color loads render `fallbackColor` (`#7d7655`) instead
of black. Missing normal/roughness maps render with the profile roughness and
no normal detail. The `legacyProcedural` profile keeps the old canvas look and
is deterministic (no `Math.random`).

## Tests and commands actually run

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| `npm run generate:presentation-content` | PASS |
| `npm run generate:map-profiles` | PASS |
| `npm run generate:content-pack` | PASS |
| `npm test` | PASS — 130 files, 915 tests |
| `npx vitest run tests/terrainMaterial.test.ts` | PASS — 12 tests |
| `npx vitest run tests/mapgen.test.ts tests/tankKinematics.test.ts` | PASS — 72 tests |
| `npm run test:maps` | PASS — 64 runs, 0 fallback |
| `npm run test:maps:sweep` | PASS — 1050 runs, 9 fallback (pre-existing cliff maps), determinism recheck PASS |
| `npm run build` | PASS (client + server) |
| `npm run test:demo` | PASS — 90 s demo golden matches |

New tests in `tests/terrainMaterial.test.ts` cover schema/content validation,
map resolution, missing-reference rejection, generated-bundle resolution,
world-metre UVs, LOD UV agreement, texture color spaces, tiling/tint/normal
scale, optional-map failure, base-color fallback, cache reuse, and single
disposal.

## Manual visual verification

No browser or Map Lab visual check was performed in this environment. Fixed
seed screenshots and an in-game drive-through should be recorded before
merging. Recommended seeds to check: 1, 42, 20260802 (Rocket-Jump Highlands),
plus a fallback-map run with the sparse-grass base-color path intentionally
broken in a development build.

## Remaining limitations

- `texture.repeat` is texture-level state; the factory's `repeatOverride` is
  only safe when an overridden texture is not shared with a material that needs
  the profile default (currently true: legacy planes and generated terrain use
  different profiles and never coexist in one `ArenaView`).
- No browser screenshots were captured in this session.
- The sparse-grass `mask` is registered but unused, by design.
- No terrain blending, splat maps, triplanar mapping, or custom shaders.

## Branch status

- Branch: `map-movement-polish`
- `map-overhaul` was not merged or imported.
- The branch remains unmerged; commits are ready for review.
