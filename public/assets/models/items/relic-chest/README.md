# Relic Chest Runtime Asset

The generated articulated runtime asset is:

```text
relic-chest.glb
```

It is registered as `custom.item.relicChest`. Rebuild it from the CC0 source with:

```powershell
blender --background --python scripts/relic-chest/export_relic_chest.py
```

The export contains `RelicChest`, `Base`, `Lid`, `GlowOrigin`, and `RewardAnchor` nodes. Source `.blend`, `.fbx`, `.obj`, and `.mtl` files remain under `docs/relics/source` rather than this public runtime directory.
