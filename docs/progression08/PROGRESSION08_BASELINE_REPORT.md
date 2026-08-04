# Progression08 — Baseline Report

Branch `progression` @ `14e279d` (combat-rework head + progression docs).
All commands executed before progression code changes.

## Results

| Command | Result |
|---|---|
| `npx tsc --noEmit` | PASS (exit 0) |
| `npm run generate:presentation-content` | PASS — 10 scenes, 1 hud |
| `npm run generate:content-pack` | PASS — 3 modes |
| `npm run generate:map-profiles` | PASS — maps 0–4 |
| `npm run build` | PASS — client + server |
| `npm test` | PASS — 87 files / 700 tests |
| `npm run test:demo` | PASS — golden matches |
| `npm run test:coreloop` | PASS — 1 file / 9 tests |
| `npm run test:horde` | PASS — 10 files / 61 tests |
| `npm run test:presentation` | PASS — 5 files / 37 tests |
| `npm run test:netcode` | PASS — 6 files / 27 tests |
| `npm run test:maplab` | PASS — 7 files / 32 tests |
| `npm run test:animation` | PASS — 13 files / 75 tests |
| `npm run validate:enemy-animations` | PASS — 0 errors |
| `npm run test:e2e` | PASS — 33/33 Playwright tests |

No failures existed at baseline; golden data was not modified.
