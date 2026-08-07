# Ultimate Monster Pack — Horde Ready

A standalone, reproducible Blender processing workspace for the 45 verified Quaternius Ultimate Monsters GLBs.
The original source directory remains read-only; all generated assets and evidence live beneath this folder.

## Delivered library

- 45 normalized, skinned hero variants
- 15 one-material skinned common-near variants
- 15 one-material rigid common-far variants
- 15 very-low-poly rigid aggregate variants
- 90 / 90 generated variants pass machine validation
- 0 / 90 variants have recorded visual acceptance
- 45 source models catalogued across four broad rig families

## Important files

- `manifests/monster_catalog.json`: source measurements, classifications, semantic animation maps, and runtime records
- `manifests/runtime_variants.json`: output hashes, measured complexity, validation, review, and performance guidance
- `reports/FINAL_DELIVERY_REPORT.md`: complete accepted/rejected/hash handoff
- `previews/monster_pack_horde_ready_overview.blend`: human-review overview scene
- `scripts/run_pipeline.ps1`: resumable batch runner

## Re-run

From `C:\Users\임민우\Desktop\Assets`:

```powershell
.\Ultimate monster pack - Horde Ready\scripts\run_pipeline.ps1 -Mode validate
.\Ultimate monster pack - Horde Ready\scripts\run_pipeline.ps1 -Mode render-previews
```

Verified source: `C:\Users\임민우\Desktop\Assets\Ultimate monster pack`
Output root: `C:\Users\임민우\Desktop\Recoil Crew DS-quality-improvement\build\monsterpack10-import\Ultimate monster pack - Horde Ready`
