# Quality Improvement Implementation Report

## Execution record

- Working branch: `quality-improvement`
- Starting SHA: `f0f4fc1824da5bf4b08f2cfae24e787ba17902ae`
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

## Qualification notes

- The full suite initially reported one legitimate test update needed for the new authoritative dash gate (`roadkill.test.ts` now supplies `dashState = 'burst'`).
- A monster importer dry-run assertion assumed ignored staging existed while the implementation explicitly returns an empty plan when it does not; the assertion now validates both documented states without writing staging.
- A cannon charge test failed once in the first fully parallel run and passed immediately in isolation. The complete rerun then passed all 148 files / 1,126 tests, so no production change was made for the transient failure.

## Remaining phases

- Phase B: monster color/material/LOD presentation audit and improvements.
- Phase C: repeatable enemy-capacity benchmark, budgets, and recommendations.
- Phase D: current-map cohesion pass plus separate urban-apocalypse prototype and comparison.
- Final: complete required command matrix, browser evidence, reports, focused commits, and branch handoff.
