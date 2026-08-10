# Codex Prompt — 400×400 Arena Boundary Cleanup

Repository:

```text
https://github.com/mwl313/RecoilCrewDS
```

Branch:

```text
feature/final-arena-boundary
```

Binding design:

```text
docs/final-patch-batch/workstream-04-arena-boundary/ARENA_BOUNDARY_CLEANUP_DESIGN.md
```

## Mission

Disable/remove gameplay exterior apron rendering.

Build a clean perimeter from existing `prop.barrier` along authoritative bounds.

---

## 1. Audit

Read:
```text
src/client/app/renderWorld.ts
src/client/environment/visualWorldApron.ts
src/client/arenaView.ts
src/client/assets*
src/shared/sim/arenaWorld.ts
src/shared/sim/tankKinematics.ts
src/shared/mapgen/
content/maps/arena_400_primary.json
content/furniture-sets/primary.json
content/density-profiles/
tests/maps
tests/presentation
```

Record SHA.

Find current authoritative boundary collision.

---

## 2. Disable apron

Production gameplay must create zero apron exterior placements.

Keep tool/debug compatibility only if useful.

Update diagnostics/quality safely.

---

## 3. Add boundary renderer

Recommended:
```text
src/client/environment/arenaBoundaryBarricades.ts
```

Use `prop.barrier`.

Measure AABB.

Instanced multi-mesh-compatible placement.

Four sides + corners.

Terrain align.

---

## 4. Collision/spawn parity

Prove visual barrier and authority agree.

Keep pressure spawns/recovery inside.

Do not shrink arena accidentally.

---

## 5. Edge seam

Use only minimal footing/skirt if needed.

No decorative exterior world.

---

## 6. Tests

Implement the full design matrix.

Run:
```bash
npx tsc --noEmit
npm run build
npm test
```

plus map/presentation/e2e/browser tests.

---

## 7. Report

Create:
```text
docs/final-patch-batch/workstream-04-arena-boundary/ARENA_BOUNDARY_IMPLEMENTATION_REPORT.md
```

Include SHA, asset dimensions, segment count/spacing, collision findings, draw calls, screenshots, tests, and exclusions.
