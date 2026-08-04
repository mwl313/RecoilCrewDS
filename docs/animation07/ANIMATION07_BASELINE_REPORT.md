# Animation07 — Baseline Report

Date: 2026-08-05. Branch: `combat-rework` @ `4a140fe`. All commands executed
before any animation07 code changes.

## Results

| Command | Result |
|---------|--------|
| `npx tsc --noEmit` | PASS (exit 0) |
| `npm run generate:presentation-content` | PASS — sourceHash `2edbda9a5715…`, 10 scenes, 1 hud |
| `npm run generate:content-pack` | PASS — sourceHash `370bdcb4eacc…`, 3 modes |
| `npm run generate:map-profiles` | PASS — sourceHash `38c058c9ae5e…`, maps 0–4 |
| `npm run build` | PASS — vite client 2.83 s; esbuild server 195 ms |
| `npm test` | PASS — 74 files / 623 tests |
| `npm run test:demo` | PASS — 90 s deterministic Demo; golden match in 0.13 s |
| `npm run test:coreloop` | PASS — 1 file / 9 tests |
| `npm run test:horde` | PASS — 10 files / 59 tests |
| `npm run test:netcode` | PASS — 6 files / 27 tests |
| `npm run test:presentation` | PASS — 5 files / 37 tests |
| `npm run test:maplab` | PASS — 7 files / 32 tests |
| E2E suites | Not executed at baseline (Playwright browser binaries/server not provisioned in this run); attempted in final gates. |

## Notable baseline observations

- Demo golden hash matches exactly; authoritative simulation is stable.
- `npm test` stderr contains expected warnings only (manifest unknown ids,
  GLB fallback path, predictor boundary logs).
- No animation system exists yet, so there is no animation-specific baseline
  to record; the benchmark milestone will establish those numbers.
