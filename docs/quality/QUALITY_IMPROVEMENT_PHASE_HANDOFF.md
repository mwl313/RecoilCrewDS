# Quality Improvement Phase Handoff

## Branch and safety

- Branch: `quality-improvement`
- Base: `f0f4fc1824da5bf4b08f2cfae24e787ba17902ae`
- Ending implementation SHA: `a28da4a`
- Do not merge to `main` as part of this milestone.
- Preserve the two untracked source-pack ZIPs in `docs/quality/`.
- Do not modify `tests/fixtures/demo-golden.json`.

## Completed

### Prerequisite repair

- Elite Demon semantic upright transform repaired and committed.
- Asset import hashes and animation contracts validated.
- Visual evidence stored under `docs/quality/evidence/`.

### Phase A

- Production/content dash is a temporary authoritative state with separate temporary velocity.
- Protocol is 13; older clients must reload.
- Both multiplayer roles receive the same movement rules and replicated state; Driver and Gunner prediction use the shared kinematics implementation.
- Legacy Phase-0 Demo explicitly selects `legacyImpulse`; content matches select `stateful`.
- Camera follow target, smoothed pivot, and collision boom are independent.
- Phase A tuning and evidence are documented in `DASH_AND_CAMERA_TUNING_REPORT.md`.

### Phase B

- Monster source colors remain untouched; a shared PBR interpretation policy constrains metalness, roughness, AO and color-space assignment.
- Production lighting now uses stronger neutral fill and fog starts beyond the provisional far-LOD boundary.
- Mid semantic selection is reduced-rate while skeletal mixers advance every render frame.
- Far representation is mixer-free but visibly animated for locomotion, attack, airborne and death states.
- LOD swaps preserve semantic role, normalized phase, death lock, cue sequence, position and yaw.
- Generic far instancing preserves multi-material assets and source child transforms.
- Audit and visual evidence are documented in `MONSTER_PRESENTATION_AUDIT.md`.

### Phase C

- The committed server harness separates simulation, AI, interpolation, replication, projectile/XP, memory and state growth.
- The committed browser route runs 24 rendering scenarios and records real GPU timer results when supported.
- Current-machine production allocation: 40 near + 120 mid + 590 far, total 750.
- Raw full-state JSON is not a viable high-population transport; compact tiered horde replication is mandatory.
- Per-instance skeleton GPU resources are now disposed, and every benchmark scenario returns renderer textures to zero after cleanup.
- Hardware caveat and lower-class release gates are documented in `ENEMY_CAPACITY_BENCHMARK.md`.

### Phase D

- The production map remains the default; urban profiles are opt-in development/test routes only.
- The 200 m candidate and 400 m scale test use connected authored roads, sparse source-faithful buildings, instanced roads/props, broad roof ramps, and elevation-aware authoritative collision.
- Current and Urban 200 both measured 8.8 ms p95 frame interval on the available Chrome 151 / RTX 4060 Ti / 1280×720 setup after warm-up.
- Urban 200 traded higher triangle/texture cost for a lower visible-scene draw estimate and clearer dash lanes, spawn avenues, combat ranges, and multiplayer landmarks.
- Human-reviewed driver, aerial, rooftop, and fair-comparison evidence is committed under `docs/quality/evidence/`.
- Recommendation: **hybridize with urban elements later**; do not replace the production map in this milestone.

## Final qualification and handoff

- TypeScript, all generators, the full 150-file / 1,144-test suite, client/server build, Demo golden, netcode, horde, progression, animation, Monster Pack import/rendering, maps, and Map Lab all passed.
- All 50 Playwright E2E scenarios passed post-change in bounded groups (16 focused/current-contract cases plus 34 remaining cases). The single monolithic invocation exceeded its external 20-minute wrapper and is not counted as a pass.
- Full production Single Player and two-client multiplayer loops reached boss victory, results, reconnect, and clean rematch.
- Qualification exposed and fixed a title-transition race that could reopen the menu over a successful mid-boss reconnect.
- Refreshed monster-system qualification screenshots and quality evidence were human-reviewed.
- No listed qualification command was unavailable or renamed.
- The Demo golden remains unchanged.
- The branch is ready for review but must remain separate until the user explicitly chooses to merge it.

## Known observations

- Browser evidence at 5050 recorded a production dash at 125 km/h against a normal maximum of 64.8 km/h.
- The deterministic valley test observed 0.731 m maximum vertical lag with a 2.0 m leash.
- Final full-suite qualification: 150 files / 1,144 tests.
- Final server 750 baseline step p50/p95/p99: 2.270/3.794/4.465 ms; compact replication 19.3 KB/s.
- One-machine renderer recommendation: 40 near + 120 mid + 590 far, maximum 750.
