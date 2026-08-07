# Monster Model Preprocessing Guide

This is the required color, transform, animation, and validation contract for
the Quaternius Ultimate Monsters pipeline. It is intentionally precise enough
for a non-multimodal agent to execute without judging screenshots alone.

## Canonical inputs

- Original archive: `docs/quality/Ultimate Monsters Bundle-glb.zip`
- Expected archive size: `5,305,396` bytes
- Expected SHA-256: `634a64b3642f019b3e711a6817a2085ec256308ee4ce2485e254f41bf0d8ce95`
- Expected source files: 45 GLBs
- Original files are read-only. Never normalize, resave, or overwrite them.
- Source-file hashes in `docs/monsterpack10/source-manifests/runtime_variants.json`
  must match before processing.

The standalone Blender delivery is `Ultimate monster pack - Horde Ready.zip`.
Its pipeline version `1.1.0` contained a color-space bug. Do not reuse its
prebuilt GLBs without the correction below.

Before regeneration, patch `scripts/pipeline_core.py` inside the extracted
standalone delivery:

```python
PIPELINE_VERSION = "1.1.1-color-fidelity"
```

Then change the vertex-color write in `bake_materials_to_vertex_colors()` from
`datum.color_srgb = color` to `datum.color = color`. Those two edits are the
complete color-fidelity pipeline delta; do not alter geometry or transforms as
part of this repair.

## Color-space contract

glTF material base colors and `COLOR_0` vertex colors are interpreted in
linear space. Blender's Principled BSDF `Base Color.default_value` and
`Material.diffuse_color` Python values are already scene-linear.

When material slots are baked to a `BYTE_COLOR` corner attribute, assign the
linear source value through the linear accessor:

```python
color = material_base_color(source_material)
datum.color = color
```

Never assign that value directly to `datum.color_srgb`. Doing so treats an
already-linear value as sRGB and converts it to linear a second time, producing
the dark, muddy assets from pipeline `1.1.0`. If `color_srgb` must be used for a
different Blender version, explicitly convert the linear source value to sRGB
first and prove the round trip numerically.

The shared output material must remain neutral white. Runtime code may adjust
bounded PBR interpretation, hit flash, and lighting, but it must not use a
non-white blanket tint to compensate for an incorrect asset bake.

## Required source-color gate

Run:

```text
npm run validate:monster-colors
```

The gate compares all 45 runtime hero GLBs with the verified linear-space
source baseline in `MONSTER_COLOR_FIDELITY_BASELINE.json`.

Per model, the accepted processed/source ratios are:

| Signal | Minimum | Maximum |
| --- | ---: | ---: |
| Mean saturation | 0.95 | 1.05 |
| Mean HSV value | 0.97 | 1.03 |
| Mean linear luminance | 0.97 | 1.03 |

The corrected 90-variant batch measured:

| Signal | Observed minimum | Observed maximum |
| --- | ---: | ---: |
| Saturation | 0.9771 | 1.0088 |
| HSV value | 0.9931 | 1.0081 |
| Linear luminance | 0.9930 | 1.0049 |

The baseline may only be regenerated from the verified original 45-GLB source
directory:

```text
npm run generate:monster-color-baseline -- --source <verified-original-folder>
```

For the supplied standalone delivery, run the corrected full batch and
finalizer from PowerShell with explicit paths:

```text
& <blender.exe> --background --factory-startup --python <horde-ready-folder>/scripts/pipeline.py -- --mode process-all --source <verified-original-folder> --output <horde-ready-folder>
python <horde-ready-folder>/scripts/finalize_delivery.py --source <verified-original-folder> --output <horde-ready-folder>
npm run import:monsterpack
```

The importer requires every runtime record to declare
`pipelineVersion: "1.1.1-color-fidelity"`; an untouched `1.1.0` delivery is a
hard failure even when its internal hashes are self-consistent.

## Geometry and transform contract

- World up: `+Y`.
- Model forward: `+Z`.
- Units: metres.
- Export root must be identity unless a documented runtime repair applies.
- Bounds normalization changes scale/placement only; it must not bake an
  arbitrary mesh rotation into the skeleton.
- `socketshadow` or `socket.shadow` must remain at the semantic ground point.
- The neutral/Idle pose must have plausible nonempty bounds and a horizontally
  centred shadow socket.
- Hero/common-near outputs remain skinned and animated.
- Common-far/aggregate outputs remain rigid representative-pose proxies.
- No camera or light may be embedded in a runtime GLB.
- No animation may drive the project-owned gameplay root.

The importer deliberately applies runtime-only transform repairs after the
Blender export for:

- High-detail Demon: `+90°` X correction plus recenter/grounding.
- Orc hero: bind-translation recenter/grounding.
- Mushroom King hero: recenter/grounding.

Regenerating the pack must not remove or pre-apply these corrections without
also removing/updating the corresponding importer repair and its tests.

## Elite Demon invariant

The former Elite Demon bug produced grounded aggregate bounds while the
humanoid skeleton itself was upside down. Bounds alone are not sufficient.

After applying the end of the Idle clip in Three.js, all of these must hold:

```text
Head world Y > Hips world Y
Hips world Y > FootL world Y
Hips world Y > FootR world Y
```

Also require the standard shadow-socket grounding and horizontal-centering
checks. These invariants are automated by
`tests/animation/eliteAssetAlignment.test.ts`.

## Required qualification

Run all of the following after a batch rebuild and import:

```text
npm run validate:monster-colors
npm run validate:monsterpack-import
npm run validate:enemy-animations
npm run test:monsterpack-import
npx vitest run tests/animation/eliteAssetAlignment.test.ts
npm run test:monsterpack-rendering
npm run build:client
```

Visual review must use matching camera, pose, background, renderer output color
space, tone mapping, exposure, and lights for original-versus-processed views.
Review at least one bright common, one dark common, one multi-material hero,
the high-detail Demon, and every exceptional runtime-repair model. A contact
sheet is supporting evidence, not a substitute for the numerical and semantic
gates above.
