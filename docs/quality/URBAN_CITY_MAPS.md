# Urban City Map Prototypes

The 400×400 city is the production default for player-facing Single Player and multiplayer Main Stage. The 200×200 city remains available as a compact explicit override and QA map. Legacy demo and Truck Hunter fixtures are retained for automated/internal testing and are not exposed by the player UI.

## Select or override the maps

- 200×200: `http://localhost:3022/?map=urban200`
- 400×400: `http://localhost:3022/?map=urban400`
- Aerial QA view: add `&test&nodebug&urbanView=overview`
- Rooftop collision QA spawn: add `&test&nodebug&urbanSpawn=roof`

The active mode's `mapProfileId` supplies the default. An explicit `?map=urban200`, `?map=urban400`, or full `?map=map.*` query overrides that choice for local client QA.

## Layout and gameplay contract

- Terrain is flat across both maps.
- Streets follow a connected but deliberately irregular authored graph: bent arterials, unequal blocks, loops, short side streets, dead ends, parking areas, and open plazas replace the former uniform grid. Straight, cracked-straight, corner, T-junction, and four-way pieces are selected from actual cardinal neighbours, never scattered randomly.
- Building placement is deterministic but non-uniform, with varied setbacks, orientation, footprints, and a skyline ranging from one to six stories. Dense street frontage and selective block-interior infill reduce vacant lots, while probability-gated parcels, plazas, parking pockets, and landmark clearings preserve intentional open space. Taller buildings cluster loosely toward each city core while low-rise districts remain around the perimeter.
- All buildings come exclusively from the Ultimate Textured Building Pack. Zombie Apocalypse Kit assets provide coherent roads plus non-character city dressing such as parked vehicles, traffic furniture, hydrants, trash, and water-tower landmarks, so building art is never mixed across packs. Three green `CommonTree` variants from the Ultimate Nature Pack add consistent deciduous planting in clear verges, pocket parks, courtyards, and vacant lots.
- Imported materials use their original source textures. Runtime rendering does not apply material overrides or tint.
- Every building has an authoritative rectangular wall collider and flat authoritative roof surface. The prototypes intentionally have no rooftop ramps; taller roofs may be unreachable through ordinary driving.
- Wall collision is elevation-aware: it blocks tanks and monsters at street level, then releases them once they reach rooftop elevation.
- Parked vehicles use bespoke bidirectional driveable surfaces matched to each model's width, length, height, and orientation. Their front and rear rise from street level to a short full-height deck; side approaches remain solid, and these surfaces do not reuse the legacy authored ramp list.
- Trees are visual-only decorations with no gameplay or camera collision. Deterministic canopy-clearance checks keep them off roads, roofs, buildings, vehicles, spawn areas, and existing street furniture.
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
- The Ultimate Textured Building Pack and Zombie Apocalypse Kit identify the source author as Quaternius and include a CC0 1.0 Universal public-domain dedication. Their preserved license texts are in `docs/quality/licenses/urban-city-maps/`.
- Ultimate Nature Pack by Quaternius — the three selected `CommonTree` OBJ models were converted to GLB with their original source material colors unchanged. The supplied pack identifies the assets as CC0 1.0 Universal; its license text is preserved alongside the other urban-map licenses.
