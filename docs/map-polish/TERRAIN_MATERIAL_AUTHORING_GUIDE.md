# Terrain Material Authoring Guide

Terrain appearance is data-driven. A map selects a terrain-material profile,
and the profile selects either a PBR texture set or a deterministic procedural
fallback. Adding a new ground material requires no changes to `ArenaView`,
`terrainMesh`, or `TerrainMaterialFactory`.

## Architecture

```text
map JSON
  └─ terrainMaterialProfileId ──► content/terrain-material-profiles/<name>.json
                                    └─ kind: pbrTextureSet
                                         └─ semantic texture asset ids
                                              └─ content/assets/project.json
                                                   └─ public/assets/textures/...
```

The generated client bundle (`src/generated/*`) carries the resolved profile so
the client never reads content JSON at runtime.

## Adding a new material (dirt example)

### 1. Add texture files

Place runtime files under `public/assets/textures/environment/`:

```text
public/assets/textures/environment/dirt/
├── dirt_basecolor_2k.webp
├── dirt_normal_gl_2k.png
├── dirt_roughness_2k.png
└── SOURCE.md        (optional license/source record)
```

Keep the authoritative heightfield as the only terrain-shape source. Do not
ship displacement maps.

### 2. Register semantic texture assets

In `content/assets/project.json`, add:

```json
{
  "id": "texture.environment.dirt.baseColor",
  "kind": "texture",
  "namespace": "environment",
  "file": "/assets/textures/environment/dirt/dirt_basecolor_2k.webp"
}
```

Repeat for `dirt.normal`, `dirt.roughness`, and any optional maps. Semantic IDs
resolve through `AssetService.assetUrl()`; `ArenaView` never sees physical paths.

### 3. Add a terrain-material profile

Create `content/terrain-material-profiles/dirt.json`:

```json
{
  "id": "terrainMaterial.dirt",
  "label": "Dirt",
  "kind": "pbrTextureSet",
  "baseColorAssetId": "texture.environment.dirt.baseColor",
  "normalAssetId": "texture.environment.dirt.normal",
  "roughnessAssetId": "texture.environment.dirt.roughness",
  "tileSizeMeters": 10,
  "tint": "#ffffff",
  "normalScale": [0.5, 0.5],
  "roughness": 1,
  "metalness": 0,
  "anisotropy": 4,
  "fallbackColor": "#6b573f"
}
```

Rules:

- `id` must start with `terrainMaterial.`.
- `tileSizeMeters` controls how many world metres one texture tile covers.
- `tint` and `fallbackColor` are six-digit hex colors.
- `normalScale` values are finite and non-negative.
- `roughness`/`metalness` are 0..1.
- `anisotropy` is an integer >= 1.
- `fallbackColor` is shown while the base color loads or if it fails.

### 4. Point a map at the profile

Edit the map JSON (`content/maps/*.json`):

```json
{
  "id": "map.rocketJumpHighlands",
  "terrainMaterialProfileId": "terrainMaterial.dirt"
}
```

Every production map must select an explicit profile. There is no implicit
default.

### 5. Regenerate content

```bash
npm run generate:presentation-content
npm run generate:map-profiles
npm run generate:content-pack
```

Then run `npx tsc --noEmit` and the content/schema tests.

## Procedural fallback profiles

If no texture assets are available (or as a deliberate placeholder), use
`kind: "proceduralFallback"`:

```json
{
  "id": "terrainMaterial.legacyProcedural",
  "kind": "proceduralFallback",
  "tileSizeMeters": 8,
  "baseColor": "#8a7a55",
  "gridColor": "#493d29",
  "patchColor": "#785f37",
  "roughness": 0.92,
  "metalness": 0.02
}
```

Procedural generation is deterministic (no `Math.random`), cached, and tiled by
`tileSizeMeters`.

## UV and tiling model

- Terrain geometry stores world-metre UVs (`uv = worldX, worldZ`).
- The factory sets `texture.repeat = 1 / tileSizeMeters` on every loaded map.
- LOD swaps reuse the same world-space UVs, so texture alignment is stable.
- The legacy 0..1 ground plane receives `repeat = planeSize / tileSizeMeters`
  through the factory's `repeatOverride` option.

## Not in this task

The current system intentionally does not support terrain blending, slope
blending, splat maps, triplanar mapping, or shader-driven vegetation masks.
The `mask` asset is registered for future work but is not used by the launch
material. Adding those later should build on this profile system without
changing terrain geometry.
