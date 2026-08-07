# Monster Presentation Audit

## Milestone record

- Branch: `quality-improvement`
- Starting SHA: `f0f4fc1824da5bf4b08f2cfae24e787ba17902ae`
- Ending implementation SHA at final qualification: `a28da4a`
- Browser/device: Chrome 151, Windows, 1280×720, NVIDIA GeForce RTX 4060 Ti through ANGLE D3D11.
- Recommendation: retain the shared material/lighting policy and three-tier motion system; do not add blanket emissive, unlit materials, or skeletal far hordes.

## Scope and evidence

Phase B audited the production monster pipeline and the common near/mid/far presentation paths. The reusable comparison route is:

```text
npm run dev:animation-preview
http://127.0.0.1:5191/?materialDebug=1
```

It renders one source GLB three times with the same camera, pose and framing:

1. Unlit/base color
2. Neutral PBR
3. Production game lighting

Evidence:

- [phase-b-material-comparison.png](evidence/phase-b-material-comparison.png)
- [phase-b-far-tier-motion.png](evidence/phase-b-far-tier-motion.png)

The debug route exposes its exact audit and lighting values as `window.__monsterMaterialDebug` and in the visible diagnostics panel.

## Color-pipeline findings

The required audit order produced the following result.

| Stage | Finding | Resolution |
| --- | --- | --- |
| Source base color/texture | The original GLBs use multiple material base colors. Pipeline `1.1.0` baked those already-linear colors through Blender's `color_srgb` setter, applying a second conversion and reducing median luminance to about 17% of the original. The earlier audit compared processed GLBs without the originals and incorrectly described their colors as intact. | Pipeline `1.1.1-color-fidelity` writes through the linear `color` accessor. All 45 hero palettes now retain 99.30–100.49% source luminance and are protected by an original-source baseline gate. |
| Texture color space | Representative monsters have no base-color texture. The shared policy now explicitly marks any base-color/emissive texture as sRGB for custom-loader safety. | `SRGBColorSpace` for color data only. |
| Renderer output | Production already used sRGB output. | Retained. |
| Tone mapping | Production already used ACES Filmic. | Retained. |
| Exposure | 1.08 left low-poly color faces overly subdued under PBR. | Raised moderately to 1.18. |
| Hemisphere/ambient fill | Ground fill `#3b3f45` at 0.85 was the largest common darkening source. | Stronger neutral envelope: sky `#fff5e8`, ground `#87918d`, intensity 1.45. |
| Directional light | Warm key at 1.9 produced a bright-facing/dark-facing split. | Softer key `#ffddad` at 1.35. |
| Shadow strength | Hero shadow policy is retained; common near/mid/far shadows remain reduced or disabled. | No blanket shadow expansion. |
| Fog | Fog started at 100 m and became opaque at 150 m, directly on the provisional far boundary. | Moved to 115–190 m; the 0–90 m combat read range stays clear. |
| Material tint | Instanced fodder multiplied source materials by pastel per-instance tints. Generic far instancing reused the first material for every mesh. | Removed the global tint multiplier; white instance color is now neutral. Preserve every mesh's original material. |
| Vertex colors | Present and enabled on audited Quaternius sources. | Preserved; never replaced or disabled. |
| Roughness/metallic/AO | Audited sources were metalness 0 and roughness about 0.72. AO intensity defaulted to 1.0. | Shared bounds: metalness ≤ 0.08, roughness ≥ 0.68, AO intensity ≤ 0.5. |

No source texture or vertex color is manually brightened. The Blender bake now preserves the original linear palette, while the runtime correction remains a common, auditable presentation policy.

## Material acceptance

- Source colors remain recognizable in unlit, neutral, and game-lit views.
- Bright colors are no longer multiplied by a non-white instance tint.
- Neutral fill makes shadow-facing monster surfaces readable without removing the directional key.
- Elite/boss silhouettes retain hero shadows and are not fogged inside normal combat distance.
- Fog begins 25 m beyond the initial mid/far boundary and remains gradual to 190 m.
- Tank/environment lighting remains in the same warm-key/cool-fill family.

## Distant animation and LOD findings

Two structural defects caused the observed low-quality distance presentation:

1. Mid-tier mixers were advanced only when the 12 Hz semantic timer fired. The whole skeleton therefore moved in visible time steps.
2. Far rigid representations had no display-frame motion. The generic instancing adapter also flattened child transforms and replaced all source materials with material zero.

The corrected tier behavior is:

| Tier | Distance policy | Semantic work | Display-frame work | Shadows |
| --- | --- | --- | --- | --- |
| Near | Enter below 36 m, leave after 42 m | Full action resolution | Full skeletal mixer | Profile-controlled |
| Mid | Approx. 40–90 m with hysteresis | 12 Hz semantic action selection | Skeletal mixer advances every render frame | Disabled for common hordes |
| Far | Enter beyond 92 m; promote below 86 m | Authoritative state/cue retained | Deterministic mixer-free walk bob/sway, attack pulse, airborne pose, and death envelope every render frame | Disabled |

Values remain data-driven in `content/animation-lod-policies/defaultHorde.json`.

### Transition continuity

Every individual rig now owns a stable `motionRoot`. Model swaps happen inside that envelope, so position, yaw and authoritative airborne height do not snap. Before demotion, the skeletal controller captures:

- semantic role
- normalized animation phase
- death lock
- last action-cue sequence

The far motion representation consumes that continuity record, advances it, and returns it when promoted. Near↔mid retains the same model/controller and therefore preserves its mixer phase directly.

### Far instancing fidelity

The generic far adapter now:

- preserves each source mesh's own material or material array;
- composes each source mesh's hierarchy-local transform into its instance matrix;
- retains source color, vertex-color, texture, roughness, and metalness state;
- adds deterministic per-enemy render-frame motion without allocating skeletons;
- exposes attack, airborne and death states through the same bounded instance path.

The preview evidence shows 100 far Mushnub instances at five draw calls and zero mixers. Distinct deterministic phases prevent synchronized mechanical motion.

## Automated acceptance coverage

The Phase B tests explicitly cover:

- far locomotion changes continuously and never freezes into a bind/T-pose presentation;
- smooth render-frame far motion between sparse authoritative snapshots;
- visible far attack and retained far death envelope;
- airborne state and phase retained through far reconstruction;
- reduced-rate mid semantic sync with render-rate mixer advance;
- controller semantic role/phase capture and restore;
- near↔mid and mid↔far continuity of role, phase, position and yaw;
- source color/vertex/flat-shading preservation under bounded PBR policy;
- distinct multi-mesh materials and hierarchy transforms in far instancing.

Qualification at completion of this phase:

```text
npx tsc --noEmit
PASS

npx vitest run tests/animation tests/horde/instancedEnemyRenderer.test.ts tests/animationPreview.test.ts
16 files, 101 tests passed

npm run build:animation-preview
PASS

npm run build:client
PASS
```

Final qualification also passed `npm run validate:enemy-animations` (73 presentation profiles, 70 animation profiles, 0 errors/warnings), the 11-file / 38-test Monster Pack import suite, the real browser Monster Pack rendering benchmark, the 15-file / 95-test animation suite, and all 50 repository E2E cases across bounded groups. Human review covered the unlit/neutral/production comparison, far-motion gallery, upright Elite Demon, ordinary/elite/boss screenshots, airborne reconstruction, and refreshed boss/reconnect evidence.

Known asset limitations remain explicit: placeholder custom Beast/Spider/Witch families use procedural fallbacks, many far Quaternius assets are rigid by design and depend on the mixer-free motion envelope, and no second physical GPU class was available for visual/performance verification.
