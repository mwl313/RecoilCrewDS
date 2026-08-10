# Arena Boundary Cleanup — Implementation Report

## Status

- Branch: `feature/final-arena-boundary`
- Starting SHA: `4fd9af32605b04d8ff95f7d11bffc4c72885a988`
- Boundary implementation commit: `1db2a95d265cdf63be0fb31e98e38e268c1d891b`
- Binding design: `ARENA_BOUNDARY_CLEANUP_DESIGN.md`
- Production gameplay exterior apron: disabled, zero placements, zero draw calls
- Primary 400×400 boundary: enabled on all four authoritative bounds

## Audit and authoritative boundary

The implementation audit covered the requested render, asset, map-generation,
simulation, content, map-test, and presentation-test paths. No new gameplay
boundary was introduced.

The existing authoritative actor-center boundary is the final clamp performed
after circle/obstacle contact resolution:

- generated arenas clamp X and Z to their explicit rectangular bounds with a
  `0.5 m` inset;
- the legacy/static arena applies the same `0.5 m` inset;
- tank footprint resolution applies the same stable, axis-aware clamp after
  terrain/obstacle contacts;
- an outward velocity component is cancelled at a boundary while tangential
  velocity remains available for sliding.

That value now has one shared name, `ARENA_ACTOR_BOUNDARY_INSET`, in
`src/shared/sim/arenaBounds.ts`. The renderer derives its bounds from the same
`ArenaWorld.bounds`/`half` contract. The barrier's inside face is placed exactly
on the actor-center clamp plane, so the arena remains 400×400 and the gameplay
space was not accidentally shrunk.

## Gameplay apron removal

`RenderWorld` no longer imports or constructs `VisualWorldApron`. Production
diagnostics are fixed to:

```json
{
  "enabled": false,
  "quality": "disabled",
  "instances": 0,
  "drawCalls": 0,
  "castsShadows": false
}
```

Adaptive quality no longer has an apron target. The old quality/debug methods
remain harmless no-ops so older tooling cannot recreate exterior geometry.
The standalone apron implementation remains available only as an unreferenced
tool/debug compatibility module.

## Boundary renderer

The new renderer is `src/client/environment/arenaBoundaryBarricades.ts`.
It loads the existing semantic asset `prop.barrier`, measures its transformed
AABB once per boundary lifecycle, and builds one `InstancedMesh` per source
mesh. It supports multi-mesh assets and either X- or Z-long source orientation.

### Measured asset

| Measurement | Live value |
| --- | ---: |
| AABB X | `-1.0 .. 1.0 m` |
| AABB Y | `-0.05 .. 0.95 m` |
| AABB Z | `-0.16 .. 0.16 m` |
| Segment length | `2.0 m` |
| Height | `1.0 m` |
| Thickness | `0.32 m` |
| Long axis | X |
| Source meshes | 3 |

No new model asset was added. These values come from the AssetService
`prop.barrier` model/fallback used by the running production build.

### Primary placement

The requested overlap is `7.5%`. Segment counts are derived rather than
hard-coded: `ceil(runLength / (segmentLength × (1 - overlap)))`.

| Run | Length | Segments | Uniform spacing | Actual overlap |
| --- | ---: | ---: | ---: | ---: |
| North | 400 m | 217 | 1.843318 m | 7.8341% |
| East | 400 m | 217 | 1.843318 m | 7.8341% |
| South | 400 m | 217 | 1.843318 m | 7.8341% |
| West | 400 m | 217 | 1.843318 m | 7.8341% |
| **Total** | — | **868** | — | — |

Each run covers its complete bound and extends approximately `0.07834 m`
beyond each run endpoint. Adjacent runs overlap at every corner, avoiding a
diagonal opening. The 80×80 fallback arena derives 44 segments per side, or
176 total.

Every final segment center samples `ArenaWorld.groundHeightAt`. The measured
model bottom is normalized onto that height, producing stepped terrain
alignment without adding presentation-only terrain outside the arena.

### Edge seam and render cost

A minimal dark footing is instanced directly below each barrier segment. It is
`0.65 m` tall and only closes the immediate terrain/barrier seam; it does not
extend into a decorative exterior world.

| Batch | Draw calls | Shadows |
| --- | ---: | --- |
| `prop.barrier` source meshes | 3 | off |
| Minimal footing | 1 | off |
| **Boundary total** | **4** | **off** |

A live primary-arena browser sample reported 687 estimated scene draw calls and
103,940 estimated triangles at that instant. Enemy/HUD state makes the scene
totals variable; the boundary contribution remains four draw calls.

## Collision, spawn, and lifecycle parity

- The four barrier inside faces coincide with X/Z `±199.5 m` on the primary
  arena, matching the existing authoritative actor-center clamp.
- Browser probes against all four sides stopped at those planes, removed only
  outward velocity, and retained tangential movement.
- No collider was added and no authoritative bound was moved.
- Primary player/bug spawns, map recovery zones, and generated horde anchors
  remain inside the authoritative bounds.
- Pressure anchors already required a 3 m inset. Complete formations are now
  translated as a group into that same inset so offsets cannot cross a bound;
  formation spacing is preserved.
- Boundary instances are disposed and rebuilt on arena replacement, covering
  Single Player rerolls, multiplayer rematches, and reconnect arena swaps.
- Projectiles retain their existing lifetime/range/terrain behavior; this
  workstream did not invent a projectile boundary collision contract.

## Visual evidence

The Playwright capture uses matching pre-change and post-change tank poses.
The complete evidence set contains nine views in each phase: all four ground
edges, all four corners, and an elevated north-edge view.

| View | Before | After |
| --- | --- | --- |
| North, ground/outward | [before](screenshots/before-north-ground.png) | [after](screenshots/after-north-ground.png) |
| East, ground/outward | [before](screenshots/before-east-ground.png) | [after](screenshots/after-east-ground.png) |
| North-east corner | [before](screenshots/before-north-east-corner.png) | [after](screenshots/after-north-east-corner.png) |
| South-west corner | [before](screenshots/before-south-west-corner.png) | [after](screenshots/after-south-west-corner.png) |
| North, elevated | [before](screenshots/before-north-elevated.png) | [after](screenshots/after-north-elevated.png) |

Additional pairs are available for south ground, west ground, south-east
corner, and north-west corner in `screenshots/`.

Visual QA found a continuous `prop.barrier` perimeter, closed corner seams, a
minimal immediate footing, and sky/fog beyond the perimeter. The matching
before captures show the previous raw terrain edge/void; the after captures
show a deliberate edge without adding buildings, roads, landmarks, or skyline
geometry. Terrain rises obscure parts of the north run from the selected
elevated pose, as expected from terrain-aligned placement; the exact placement
matrix still covers that complete run. Existing fog and sky tuning remained
appropriate after apron removal.

## Verification

All recorded final commands ran from a clean branch worktree at implementation
commit `1db2a95`, with only the ignored local Monster Pack fixture linked for
the repository importer test. Browser tests used the isolated boundary config
and a freshly built server from that same worktree.

| Command / qualification | Result |
| --- | --- |
| `npx tsc --noEmit` | **PASS** |
| `npm run build` | **PASS** — client and server; only the existing Vite chunk-size advisory |
| `npx vitest run tests/presentation/arenaBoundaryBarricades.test.ts tests/tankKinematics.test.ts tests/horde/spawnPlanner.test.ts tests/horde/survivorPressureDirector.test.ts` | **PASS** — 69/69 |
| `npm run test:maps` | **PASS** — 31 map tests plus 64/64 report seeds; deterministic, 0 fallback |
| `npm run test:maplab` | **PASS** — 33/33 |
| `npm run test:presentation` | **PASS** — 68/68 |
| `npx playwright test --config=playwright.boundary.config.ts` | **PASS** — 5/5: edge/corner captures, four collision planes, two active clients, reconnect, rematch/reroll, tactical compatibility, and lobby reconnect |
| Baseline capture (`ARENA_BOUNDARY_CAPTURE_PHASE=before`) | **PASS** — 9 matching viewpoints against starting SHA `4fd9af3` |
| In-app browser, clean production build | **PASS** — Single Player boot and live edge inspection; no errors, only existing animation-fallback warnings |
| `npm test` | **BOUNDARY PASS / BASELINE REPOSITORY FAILURES** — 187 files and 1,469 tests passed; 7 files/tests failed |

The seven full-suite failures were reproduced independently at starting SHA
`4fd9af3` and are outside this workstream:

- predictor pending-queue expectations in `predictor.test.ts`,
  `predictorNetwork.test.ts`, and `jumpDash.test.ts`;
- Double Barrel shell expectation in `combat05/chargeScaling.test.ts`;
- XP shard manager-size expectation in `pickups/xpShardLifecycle.test.ts`;
- the existing demo golden mismatch in `demoRegression.test.ts`;
- the baseline asset-manifest assumption in `baselineCharacterization.test.ts`.

The dedicated browser lifecycle test waits separately for authoritative match
state and renderer readiness. It proves both clients report apron zero and the
same live instanced boundary before disconnect, after active-round rejoin, and
again after a genuine arena-seed reroll.

## Exclusions and worktree isolation

This report claims only the arena-boundary work described above. Final
verification was isolated from the shared checkout, which contains concurrent,
uncommitted localization/settings, Ground Pound/landing, phase-announcement,
enemy/audio, relic, HUD, and content changes. Those changes, their generated
content, and their screenshots are not part of this workstream and were neither
reverted nor reported as boundary implementation work.

No machine-gun balance, localization copy, Ground Pound formula/VFX,
phase-announcement behavior, lobby/chat behavior, chest/relic beacon behavior,
enemy asset import, or decorative exterior world was added here.
