# Urban City Map Prototypes

These maps are isolated opt-in prototypes. They do not replace or modify the production default map.

## Select the maps

- 200×200: `http://localhost:3022/?map=urban200`
- 400×400: `http://localhost:3022/?map=urban400`
- Aerial QA view: add `&test&nodebug&urbanView=overview`
- Rooftop collision QA spawn: add `&test&nodebug&urbanSpawn=roof`

## Layout and gameplay contract

- Terrain is flat across both maps.
- Streets are generated from a connected authored graph. Straight, cracked-straight, corner, T-junction, and four-way pieces are selected from actual cardinal neighbours, never scattered randomly.
- All buildings come exclusively from the Ultimate Textured Building Pack. Zombie Apocalypse Kit assets are limited to roads and street furniture, so building art is never mixed across packs.
- Imported materials use their original source textures. Runtime rendering does not apply material overrides or tint.
- Every building has an authoritative rectangular wall collider, a flat authoritative roof surface, and a broad ramp matched to its roof height.
- Wall collision is elevation-aware: it blocks tanks and monsters at street level, then releases them once they reach rooftop elevation.
- Road and street-furniture meshes are instanced to keep the 400 m prototype bounded to a small number of draw calls.

## Evidence

- `docs/quality/evidence/urban-city-maps/urban-200-aerial-overview.png`
- `docs/quality/evidence/urban-city-maps/urban-200-driver-view.png`
- `docs/quality/evidence/urban-city-maps/urban-200-rooftop-view.png`
- `docs/quality/evidence/urban-city-maps/urban-400-aerial-overview.png`
- `docs/quality/evidence/urban-city-maps/urban-400-driver-view.png`
- `docs/quality/evidence/urban-city-maps/urban-400-rooftop-view.png`

## Asset provenance

- Ultimate Textured Building Pack — source ZIP supplied in `docs/quality`; selected OBJ models were converted to GLB with their original pack textures embedded.
- Zombie Apocalypse Kit — source ZIP supplied in `docs/quality`; selected self-contained glTF road and street-furniture files are used directly.
- Both supplied packs identify the source author as Quaternius and include a CC0 1.0 Universal public-domain dedication. The preserved license texts are in `docs/quality/licenses/urban-city-maps/`.
