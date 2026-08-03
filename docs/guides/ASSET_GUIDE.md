# Asset Replacement Guide

Refractor 02 adds a project asset catalog on top of the built-in semantic
ids. See `docs/refractor02/PROJECT_ASSET_AUTHORING_GUIDE.md` for registering
custom models and scene assets. Built-in required assets always keep their
procedural fallbacks; project assets use namespaces and may replace a
built-in only through an explicit `replacesBuiltIn` field.

Every visual, effect, UI theme, and audio event is referenced by a **semantic
asset ID**. Gameplay code never references model child names, file paths, or
mesh names — it asks the registry for an ID, so you can replace art without
touching gameplay, networking, or physics.

## Required asset IDs

```text
playerTank.chassis      playerTank.turret       playerTank.barrel
enemy.scrapBug          enemy.rammer            enemy.gunTower
enemy.lootTruck
pickup.normalScrap      pickup.heavyScrap       pickup.jackpotScrap
prop.explosiveBarrel    prop.barrier            prop.tire
prop.container          arena.ramp              arena.factory
vfx.machineGunMuzzle    vfx.cannonMuzzle        vfx.cannonImpact
vfx.enemyDeath          vfx.scrapPickup         vfx.jackpot
ui.driverTheme          ui.gunnerTheme
audio.engine … audio.music (see registry)
```

`src/shared/assetRegistry.ts` validates every ID and enforces that a fallback
exists for all of them. The client builds on this with `AssetService.load()`
(awaited before game construction): manifest entries register model files
and transform/socket/material metadata; models are cached as prototypes and
cloned per instance. VFX, audio, themes, icons, and camera impulses resolve
through the bundled presentation definition
(`content/presentation/demoScoreAttack.json`).

## How replacement works

The client loads an optional manifest at **`public/assets/manifest.json`**
(served as `/assets/manifest.json`). Example:

Model entries support optional `transform` (`position`, `rotation`,
`scale`, `socket`) and `materials` (`match`, `color`, `emissive`,
`emissiveIntensity`) metadata applied to every cloned instance. GLB load
failures fall back to the registered procedural factory with a console
warning; unknown semantic ids are skipped.

```json
{
  "assets": [
    { "id": "enemy.rammer", "category": "model", "file": "/assets/models/rammer.glb" },
    { "id": "playerTank.chassis", "category": "model", "file": "/assets/models/tank.glb" },
    { "id": "vfx.cannonImpact", "category": "vfx", "color": 16748288, "size": 0.8, "count": 60 },
    { "id": "ui.driverTheme", "category": "ui", "primary": "#00ffcc", "accent": "#aaffee" }
  ]
}
```

Files are relative to the site root (put them in `public/assets/...`). If a
model fails to load or the manifest is missing, the generated low-poly
fallback is used automatically — the game never breaks.

## Generated map props (Phase 3)

Generated arenas reference the same semantic ids through the asset service:
large obstacles (`prop.container`, `prop.barrier`, `prop.tire`,
`prop.scrapPile` via `obstacleType`), barrels (`prop.explosiveBarrel`),
crates (`prop.container`), ramps (`arena.ramp`), and decorations (`prop.tire`,
`prop.container`). Authoritative colliders render as individual semantic
meshes; client-only decorations are instanced (`InstancedMesh`) per asset
id with deterministic transforms. Terrain is a chunked heightfield mesh
(shared material, stable world/4 UVs) — not an asset id — so custom ground
textures replace the material, not the authoritative data.

## Model conventions

- **Format:** glTF binary (`.glb`), one scene per asset ID.
- **Orientation:** forward = **+Z**; up = **+Y**.
- **Scale:** metres. Tank ~3 m long; Scrap Bug ~1 m; Rammer ~2.4 m;
  Gun Tower ~3 m; Loot Truck ~4.4 m; pickups ~0.3–0.5 m.
- **Stable wrappers:** gameplay code attaches the model to project-owned
  roots (`chassis`, `turret` at pivot `y≈1.15`, `barrel` with muzzle around
  local `(0, 0.75, 2.9)`). Replacing the mesh cannot break logic.
- **Special child name (optional):** a Gun Tower model may name its rotating
  head object `towerHead`; otherwise the head rotates with the whole model.
- **Materials:** any `MeshStandardMaterial` is tinted for hit flashes; emissive
  materials are used for warning lights. Shadows are enabled on meshes.

## Where generated fallbacks live

`src/client/assets.ts` — `buildTankChassis()`, `buildScrapBug()`,
`buildRammer()`, `buildGunTower()`, `buildLootTruck()`, `buildPickup()`,
`buildBarrelProp()`, `buildBarrier()`, `buildTireStack()`,
`buildContainer()`, `buildRamp()`, `buildFactory()`.

## UI themes

`ui.driverTheme` / `ui.gunnerTheme` supply role colors; the HUD applies them
as CSS custom properties (`--role`, `--role-soft`). Override colors via the
manifest or `src/client/styles.css`.

## VFX

`vfx.*` entries are particle specs (`color`, `size`, `life`, `count`,
`speed`, `gravity`). Override any field in the manifest.

## Audio

All `audio.*` events are procedural Web Audio synthesis
(`src/client/audio.ts`, `AudioManager.play(name)`). The registry maps every
event name to a synth descriptor, so gameplay calls `audio.play('cannon')`
and never a file path. To use custom audio files, extend
`AudioManager.play()` to check a file lookup for the named event and play it
through an `AudioBufferSourceNode`.
