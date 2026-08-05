# Monster Pack 10 — Baseline Report

Captured before any Monster Pack 10 changes, on `models-added`
(`d19c2a1`, Progression08 hardening included).

## Baseline command outputs

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | PASS (exit 0) |
| `npm run generate:presentation-content` | PASS (`3361ac6439ba…`, 10 scenes, 1 hud) |
| `npm run generate:content-pack` | PASS (`32ea17ae433e…`, 3 modes) |
| `npm run generate:map-profiles` | PASS (`38c058c9ae5e…`, 5 maps) |
| `npm run validate:enemy-animations` | PASS, 0 errors / 0 warnings |
| `npm test` | 108 files / 816 tests PASS |
| `npm run test:animation` | 13 files / 75 tests PASS |
| `npm run test:presentation` | 5 files / 37 tests PASS |
| `npm run test:horde` | 10 files / 61 tests PASS |
| `npm run test:demo` | PASS, golden matches fixture (score 14898) |
| `npm run test:horde:benchmark` | PASS (500 enemies: p50 1.031 ms / p95 1.408 ms / p99 1.646 ms; spawn 0.1 ms) |

## Notes

- Working tree had only task-supplied untracked docs before this pass.
- Demo golden is unchanged by Progression08 hardening and remains the
  byte-identical fixture.
- The existing enemy animation preview builds and runs on production
  loaders (`tools/enemy-animation-preview`).
- No Monster Pack 10 files existed before this task.
