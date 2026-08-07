# Relic Chest Asset Report

## Result

Recoil Crew now has one articulated, cataloged relic chest asset and a reusable opening presentation foundation. The runtime always uses the Closed source mesh; it does not swap between Closed and Open models. Relic gameplay, spawning, selection, inventory, balancing, networking, and UI are intentionally outside this change.

- Asset ID: `custom.item.relicChest`
- Runtime GLB: `public/assets/models/items/relic-chest/relic-chest.glb`
- Runtime controller: `src/client/relics/relicChestPresentation.ts`
- QA tool: `npm run dev:relic-chest-preview`
- Deterministic Blender export: `scripts/relic-chest/export_relic_chest.py`
- Open duration: 0.65 seconds
- Final lid rotation: −55.791075° around local X

## Source and license

- Pack: **Ultimate RPG Items Pack - Aug 2019**
- Closed source: `Chest_Closed.blend` (also audited against the supplied FBX and OBJ/MTL)
- Open reference: `Chest_Open.blend` (also audited against the supplied FBX and OBJ/MTL)
- License: CC0 1.0; the supplied `License.txt` is retained with the source package.
- `Chest_Ingots` and `Gold_Ingots` were excluded from the prepared source set and from the final GLB.

The source hashes and exact repository paths are recorded in `docs/relics/SOURCE_MANIFEST.md`.

## Source audit

Both source blends contain one identity-transformed mesh object and three material slots: `DarkMetal`, `Wood`, and `Metal`.

| Property | Closed | Open |
|---|---:|---:|
| Mesh objects | 1 | 1 |
| Disconnected islands | 37 | 37 |
| Vertices | 1,141 | 1,125 |
| Edges | 1,957 | 1,926 |
| Polygons | 859 | 844 |
| UV layers | 0 | 0 |
| Vertex-color layers | 0 | 0 |
| Connected image textures | 0 | 0 |

Closed bounds in Blender coordinates are approximately `(-0.474783, -0.411885, -0.003263)` to `(0.474783, 0.411885, 0.815277)`. Open bounds are approximately `(-0.475391, -0.433321, -0.001234)` to `(0.474174, 0.562925, 1.146206)`.

Closed and Open do **not** have identical topology. Open has 16 fewer vertices, 31 fewer edges, and 15 fewer polygons, all concentrated in the main lid shell (Closed: 92 vertices / 91 polygons; Open: 76 vertices / 76 polygons). Because of this discrepancy, the final asset preserves the complete Closed geometry and uses Open only to solve the intended rigid pose.

The old blend material graphs contain two Material Output nodes. The legacy diffuse output is active even though the source-exact values are stored on the Principled node. Blender's glTF exporter otherwise emits named but default-white materials. The deterministic exporter rebuilds only the derived output graphs from those exact Principled values, then verifies them in the GLB.

## Island separation

Connectivity was computed directly from the Closed mesh edge graph. Components are deterministic because they are discovered from the lowest unvisited source vertex index.

### Lid — components 0–22 (23 islands)

- Component 0: complete dark-metal outer lid shell/frame, including the rear moving hinge-side structure.
- Components 1–7 and 9–15: fourteen curved/front/rear/side wood-panel islands.
- Components 8, 16, and 17: three dark-metal longitudinal bands.
- Components 18–22: five metal center ornaments/studs.

### Base — components 23–36 (14 islands)

- Component 23: stationary dark-metal base frame and cavity structure.
- Components 24–35: twelve wood-panel islands across the four sides.
- Component 36: front stationary lock/latch body.

This partition keeps every visible band, stud, side panel, and trim piece attached to the lid. The front lock body remains stationary with the base, matching both supplied poses.

## Hinge calculation

Rigid correspondences were computed between matching Closed and Open islands. The Open base carries a small source-export translation of approximately:

```text
baseOffset = (-0.000608, -0.021436, +0.002029)
```

Matching lid islands share one transform:

```text
rotation = Rx(-55.791075°)
raw translation = (-0.000608, -0.202578, +0.530948)
translation after removing baseOffset = (0, -0.181142, +0.528919)
```

For a hinge point `h`, the rigid rotation satisfies `t = h − R h`. Solving the Y/Z terms and choosing the centered point on the X-parallel hinge axis gives:

```text
h = (0, 0.4090001629865654, 0.4355505736912692)
```

Matched rigid-island residuals were at floating-point noise (approximately `1e-16`). The exported `Lid` origin is placed at this rear axis. In glTF Y-up coordinates its translation is approximately `(0, 0.43555057, -0.40900016)`.

## Exported artifact

```text
RelicChest
├── Base                 (mesh; 3 material primitives)
│   ├── GlowOrigin       (0, 0.405, -0.015 in glTF coordinates)
│   └── RewardAnchor     (0, 0.385, -0.015 in glTF coordinates)
└── Lid                  (mesh; 3 material primitives; rear-hinge origin)
```

The GLB is 87,680 bytes and contains two mesh objects, six primitives, three materials, and no animation clip, image, texture, skin, camera, light, relic, or ingot payload. The lid remains independently transformable at runtime. `RewardAnchor` is reserved for a future spawned/rising relic but no relic object or gameplay exists yet.

## Material and color-space preservation

The GLB contains the exact source Principled values:

| Material | Base color factor | Metallic | Roughness | Emissive |
|---|---|---:|---:|---|
| `DarkMetal` | `(0.063058123, 0.051667687, 0.094623081, 1)` | 0 | 0.5 | none |
| `Metal` | `(0.076989748, 0.068326123, 0.114932992, 1)` | 0 | 0.5 | none |
| `Wood` | `(0.201892614, 0.103979163, 0.079289556, 1)` | 0 | 0.5 | none |

No material override, global tint, saturation change, blanket emissive, or texture pixel operation is applied. The source contains no UV layers and no connected texture nodes; both MTL files likewise contain no `map_*` references. An orphan `Texture.png` Blender data-block is unconnected and points at no valid source dependency, so it is correctly absent from the GLB. Consequently, color-texture sRGB and non-color texture settings are not applicable for this asset. Runtime diagnostics state this explicitly rather than claiming a nonexistent texture was preserved.

## Runtime opening and gold presentation

`RelicChestPresentation` discovers `Base`, `Lid`, `GlowOrigin`, and `RewardAnchor` by name and fails clearly if any are absent. It exposes:

- `setOpenProgress(progress)` for deterministic scrubbing;
- `open()` and `close()` for a 0.65-second state transition advanced by `update(deltaSeconds)`;
- `reset()` for the exact authored closed pose;
- `setRaysVisible(visible)` for QA and presentation control.

One clamped `openProgress` value drives everything. The lid uses monotonic smootherstep easing:

```text
lidProgress = p³ × (p × (6p − 15) + 10)
lidRotation = closedRotation + radians(-55.791075) × lidProgress
```

Glow reveal uses a faster response without its own timer:

```text
glowProgress = 1 − (1 − p)^1.45
```

| Diagnostic | Closed (`p=0`) | Fully open (`p=1`) |
|---|---:|---:|
| Ray opacity | 0.002 | 0.520 |
| Ray width | 0.0015 | 0.240 |
| Ray spread | 0.001 | 0.950 |
| Ray length | 0.025 | 1.750 |

Eighteen deterministic ray directions use crossed soft planes so the light remains volumetric from changing camera angles. Their final directions cover the full 360° upper hemisphere at varied elevations, creating a dense holy burst rather than an upward-only fan. The feathered interior radial core is deliberately sized below the cavity rim, keeping the solid interior illumination contained within the chest rather than spilling across its exterior panels. The directional shafts remain a distinct reveal layer.

A second, independent `RelicChestPulsingAura` sprite surrounds the chest with a soft gold halo. It uses a generated radial alpha texture and a smooth 1.8-second cosine/smootherstep loop, fading between 0.03 and 0.576 opacity without changing any source material. This maximum is 20% brighter than the previous 0.48 tuning. The aura is intentionally rendered as a soft overlay so the pulse reads across the opaque chest silhouette; ray/core layers remain depth-tested and depth-write-disabled. The former seam-leak plane has been removed entirely. Closed-state rays now start at nearly zero opacity and dimensions, preventing ray clipping through the closed shell, while their fully-open maximum values are unchanged. Origins blend continuously back toward the cavity while directions fan outward as the lid opens. The controller changes no scene light, camera exposure, global tone mapping, or chest material.

## QA preview

Run:

```powershell
npm run dev:relic-chest-preview
```

The tool provides an `openProgress` slider, Play Open, Play Close, Reset, rays toggle, neutral lighting, game lighting, live motion/VFX diagnostics, source material names, material count, texture/color-space status, and explicit no-tint/no-emissive checks. It is a standalone development tool and is not production UI.

## Visual evidence

| Label | Evidence | Review result |
|---|---|---|
| A | [`A-source-closed.png`](evidence/A-source-closed.png) | Supplied source reference |
| B | [`B-runtime-closed.png`](evidence/B-runtime-closed.png) | Closed geometry/material identity retained; faint leakage visible |
| C | [`C-runtime-half-open.png`](evidence/C-runtime-half-open.png) | Continuous 50% hinge and VFX response |
| D | [`D-runtime-fully-open.png`](evidence/D-runtime-fully-open.png) | Solved final pose with restrained full rays |
| E | [`E-runtime-open-rays-off.png`](evidence/E-runtime-open-rays-off.png) | Clean articulated geometry and empty cavity |
| F | [`F-runtime-open-rays-on.png`](evidence/F-runtime-open-rays-on.png) | Final local gold presentation |

The supplied Open reference is [`Chest_Open_reference.png`](source/ultimate-rpg-items/reference/Chest_Open_reference.png).

Human rendered-image review passed:

- Source wood hue/saturation and purple-metal identity remain recognizable; the GLB factors are exact.
- The runtime Closed silhouette and all major panel/trim assignments match the source.
- The lid follows the rear hinge and closely reproduces the Open reference.
- No metal bands, studs, side panels, or trim detach during opening.
- Closed leakage is faint; width, spread, length, and intensity increase continuously.
- The much brighter full-open burst fills the upper hemisphere while the chest's outer silhouette remains readable; the radial core has soft edges.
- Rays-off reveals no ingots or other contents.
- No blanket chest glow, global exposure change, or obvious rectangular transparency edge is visible.

## Automated verification

The focused Vitest suite validates:

- runtime GLB loading through Three.js `GLTFLoader`;
- required node hierarchy and separate Base/Lid meshes;
- absence of ingot names and extra meshes;
- exact source material count, names, base colors, metallic, roughness, and absent emissive;
- absent texture payload matching the texture-free source;
- catalog registration and sockets without material overrides;
- finite closed/open states, clamping, monotonic opening, reverse closing, shared progress, exact reset, and finite transforms/material uniforms;
- no mutation of source chest material color or emissive values.

Validation commands:

```powershell
npm run generate:presentation-content
npx tsc --noEmit
npm run test:relic-chest
npm run build:relic-chest-preview
```

## Known limitations

- Exact vertex-for-vertex reproduction of `Chest_Open` is impossible because its primary lid shell deletes 16 vertices and 15 polygons relative to Closed. The derived asset intentionally keeps the complete Closed mesh and reproduces the common rigid pose instead of deleting or distorting source geometry.
- The source is material-color-only. There are no source texture maps or UV layers to preserve or color-space-convert.
- Rays are authored as local stylized planes rather than volumetric scattering; this keeps the effect deterministic, inexpensive, and self-contained.
- `RewardAnchor` is only a future integration point. No relic, chest interaction, spawning rule, gameplay state, or multiplayer synchronization is implemented here.
