# Quality Improvement Phase Handoff

## Branch and safety

- Branch: `quality-improvement`
- Base: `f0f4fc1824da5bf4b08f2cfae24e787ba17902ae`
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

## Next work

1. Build the urban environment as a separate prototype/profile using the preserved source ZIPs; do not replace the current map.
2. Run the complete final command matrix and update this handoff with commit SHAs and measured results.

## Known observations

- Browser evidence at 5050 recorded a production dash at 125 km/h against a normal maximum of 64.8 km/h.
- The deterministic valley test observed 0.731 m maximum vertical lag with a 2.0 m leash.
- Full-suite qualification passed after the roadkill/importer contract updates: 148 files / 1,126 tests.
