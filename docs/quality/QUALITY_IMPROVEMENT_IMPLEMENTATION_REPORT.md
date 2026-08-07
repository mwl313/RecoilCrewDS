# Quality Improvement Implementation Report

## Execution record

- Working branch: `quality-improvement`
- Starting SHA: `f0f4fc1824da5bf4b08f2cfae24e787ba17902ae`
- Ending implementation SHA before documentation closeout: `a28da4a`
- Main was not merged.
- Demo golden was not modified.
- Source import ZIPs and other user-provided untracked files were preserved.

## Prerequisite gate

The focused monster-system, XP, horde timer, replication, and netcode tests passed before milestone implementation. Visual inspection found one remaining prerequisite defect not caught by bounds-only checks: the high-detail Elite Demon skeleton was vertically inverted even though its aggregate bounds were grounded.

The repair changed the deterministic GLB root transform from a negative to positive quarter-turn around X, adjusted grounding translation, regenerated the owned runtime GLB through the importer, and added a semantic bone-order regression (`Head > Hips > feet`). Asset hashes, animation validation, focused tests, and the client build passed. Evidence: [prerequisite-elite-demon-upright.png](evidence/prerequisite-elite-demon-upright.png).

## Phase A — complete

Implemented:

- Replicated `inactive` / `burst` / `recovery` dash state.
- Base-drive and temporary dash velocity separation.
- Chassis-forward capture on the activation edge.
- Smooth acceleration, decay, and recovery curve.
- Early steering lock and limited late steering.
- Authoritative ram gate based on burst state plus valid damage window.
- Shared authority/predictor state and protocol 13 compatibility boundary.
- Axis-specific camera follow, faster downward correction, hard vertical leash, and independent collision release.
- Development diagnostics and automated scenario coverage.
- Frozen legacy Demo compatibility with unchanged golden output.

Detailed tuning and measured traces are in [DASH_AND_CAMERA_TUNING_REPORT.md](DASH_AND_CAMERA_TUNING_REPORT.md).

## Phase B — complete

Implemented:

- Reusable three-way unlit/neutral-PBR/game-lighting monster comparison route.
- Source-faithful low-poly material policy with bounded metallic, roughness and AO interpretation.
- Stronger neutral fill, softer key/fill balance, and fog beyond the meaningful combat/LOD read range.
- Per-mesh material and hierarchy-transform preservation in generic far instancing.
- Render-frame far walk/attack/airborne/death motion with no mixers.
- Reduced-rate mid semantic evaluation separated from render-frame skeletal mixer advancement.
- Semantic role, normalized phase, death lock and cue continuity across model LOD swaps.
- Data-driven common bands centered on near 0–40 m, mid 40–90 m, and far 90 m+ with hysteresis.

Findings, exact lighting/material values, evidence, and acceptance coverage are in [MONSTER_PRESENTATION_AUDIT.md](MONSTER_PRESENTATION_AUDIT.md).

### Source-color fidelity correction

After the original Quaternius GLBs became available, a source-to-runtime comparison exposed a preprocessing defect that the earlier processed-to-processed audit could not detect. Blender's Principled Base Color values were already linear, but pipeline `1.1.0` assigned them through `color_srgb`, applying a second sRGB-to-linear conversion and darkening every vertex-colored model.

The complete pack was regenerated in Blender 5.2 LTS with pipeline `1.1.1-color-fidelity`, which writes the baked values through Blender's linear `Color` property. All 90 runtime variants were re-imported. The importer still applies the established runtime transform repairs for Demon High Detail, Orc, and Mushroom King, and now rejects any pack that does not declare the corrected pipeline version.

The committed 45-model source baseline and validator measure vertex colors in linear space. Corrected hero/source ratios are saturation `0.9771–1.0088`, value `0.9931–1.0081`, and luminance `0.9930–1.0049`. Runtime gallery review confirmed the Elite Demon is upright, grounded, brightly colored, skinned, and animating; its semantic hierarchy and bounds contract also passed all nine elite-alignment tests. Reproduction and acceptance details are in [MONSTER_MODEL_PREPROCESSING_GUIDE.md](MONSTER_MODEL_PREPROCESSING_GUIDE.md).

## Phase C — complete

Implemented:

- Fixed 100/250/500/750 server and renderer population matrices.
- Separate authoritative step, enemy AI, interpolation, compact replication, raw snapshot, CPU frame, GPU frame, draw-call, triangle, mixer, skin, shadow, projectile, XP, memory, and state-growth measurements.
- Automated current-machine browser benchmark with WebGL GPU timer support and committed JSON evidence.
- Per-instance skeleton disposal after the benchmark exposed accumulating GPU bone textures.
- Data-backed production allocation of 40 near, 120 mid and up to 590 animated far within a 750 current-machine total.

Measured results, hardware limitations, lower-tier release gates and raw evidence are in [ENEMY_CAPACITY_BENCHMARK.md](ENEMY_CAPACITY_BENCHMARK.md).

## Phase D — complete

Implemented and evaluated:

- Retained the current production map and its Phase B cohesion improvements as the default.
- Added isolated `urban200Prototype` and `urban400Prototype` map profiles selected only through explicit development query parameters.
- Built connected, authored street graphs with semantically correct road pieces, wide pursuit lanes, open intersections, sparse Quaternius buildings, and instanced road/prop presentation.
- Added elevation-aware authoritative building walls, flat driveable rooftops, broad roof ramps, spawn exclusion, and shared tank/enemy/projectile/camera surface queries.
- Added test-only rolling frame/render submission and visible-scene resource diagnostics for a fair same-build comparison.
- Human-reviewed current, 200 m, and 400 m driver/aerial/rooftop evidence.

On Chrome 151 / RTX 4060 Ti / 1280×720, both current and Urban 200 measured an 8.8 ms p95 frame interval after warm-up. Urban render submission measured 1.7 ms p95 versus 1.4 ms current, with an estimated 95 versus 203 visible-scene draws, 162,517 versus 46,528 visible triangles, and 32 versus 23 textures. The recommendation is **hybridize with urban elements later** while the production default remains unchanged. Full comparison, limitations, provenance, and evidence are in [URBAN_PROTOTYPE_EVALUATION.md](URBAN_PROTOTYPE_EVALUATION.md).

## Architecture and principal files changed

- Shared vehicle authority/prediction: `src/shared/sim/tankKinematics.ts`, match/runtime state, protocol 13, movement content, predictors, authoritative contact combat, and camera controllers.
- Monster presentation: shared material policy, asset loading/instancing, animation controller continuity, distant motion, LOD content, lighting/fog, validation, and preview tooling.
- Capacity evaluation: deterministic server benchmark, 24-scenario GPU browser route, renderer lifecycle cleanup, evidence JSON, and population-budget documentation.
- Urban prototype: map profiles, authored layout generator, selected licensed runtime assets, instanced scene construction, authoritative surface/collision queries, and Map Lab/profile tests.
- Qualification hardening: current-contract E2E assertions and a production guard that prevents delayed title choreography from reopening the menu over a completed mid-round reconnect.

## Commits

| SHA | Subject |
|---|---|
| `b4a174f` | `docs: preserve quality improvement execution prompt` |
| `78e0670` | `fix: restore elite demon upright orientation` |
| `49a3b13` | `feat: add stateful dash and terrain-follow camera` |
| `47b6cae` | `feat: improve monster materials and distant motion` |
| `3231b15` | `perf: benchmark and bound enemy capacity` |
| `28806a2` | `feat: add opt-in urban city prototypes` |
| `013c697` | `quality: evaluate isolated urban visual prototype` |
| `a28da4a` | `fix: preserve reconnect presentation during qualification` |

The documentation closeout commit containing this report follows the ending implementation SHA above.

## Final qualification

All required current commands were available under their listed names and passed:

- `npx tsc --noEmit`
- `npm run generate:content-pack`
- `npm run generate:presentation-content`
- `npm run generate:map-profiles`
- `npm test`: 150 files / 1,144 tests
- `npm run build`: client and server
- `npm run test:demo`: frozen 90-second golden matched
- `npm run test:netcode`: 6 files / 30 tests
- `npm run test:horde`: 12 files / 101 tests
- `npm run test:horde:benchmark`: passed through 750 baseline/combat populations
- `npm run test:progression`: 21 files / 116 tests
- `npm run test:animation`: 15 files / 95 tests
- `npm run test:animation:benchmark`: passed and returned to zero live mixers
- `npm run validate:enemy-animations`: 0 errors, 0 warnings
- `npm run validate:monster-colors`: 45/45 source palettes passed
- `npm run validate:monsterpack-import`: 90/90 hashes and GLBs valid
- `npm run test:monsterpack-import`: 12 files / 39 tests
- `npm run test:monsterpack-rendering`: 1 Playwright browser benchmark passed
- `npm run test:maps`: 31 tests plus 64/64 deterministic report runs
- `npm run test:maplab`: 7 files / 32 tests

The complete 50-case browser suite was qualified post-change in bounded groups after the single all-in-one invocation exceeded its external 20-minute wrapper. Formerly failing/current-contract files passed 16/16; the other 19 files passed 34/34. Coverage included a full Single Player boss/victory/rematch loop, a two-client full round, driver dash prediction, gunner shared prediction, cannon recoil, valley/ridge/wall camera and collision paths, material and near/mid/far galleries, airborne presentation, Elite/Boss readability, progression, reconnect, results, and rematch cleanup. There were no critical console errors; the known sparse-grass normal fallback warning remained noncritical.

## Human visual review and evidence

The committed evidence was viewed directly, not judged only by pixel counts. It includes the upright Elite Demon, dash state, material comparison, distant motion, 100/250/500/750 benchmark, fair current-versus-urban views, six urban driver/aerial/rooftop views, and refreshed Single Player/multiplayer elite/boss/airborne/reconnect screenshots. No video clips were retained by this environment.

## Known limitations and recommendation

- Measurements exist only for Chrome 151 / RTX 4060 Ti / 1280×720; integrated and mid-range hardware remain unverified.
- No two-human urban navigation/congestion/boss soak or long urban horde stuck-rate study was performed.
- The 400 m urban profile is a scale test, not a production proposal.
- Placeholder custom monster families remain procedural; rigid far assets depend on the low-cost motion envelope.
- Browser clips were not produced, though deterministic traces, screenshots, and automated browser checks were retained.
- The attempted monolithic 50-test Playwright command timed out at the external wrapper after 20 minutes; the exact same post-change file set then passed completely as 16 + 34 bounded cases.

Recommendation: retain the stateful dash/camera and three-tier monster presentation, keep the current-machine population ceiling at 750 with 40 near and 120 mid mixers, and **hybridize with urban elements later**. The production map remains unchanged.

The branch remains unmerged and unpushed; `main` was not modified by this milestone.
