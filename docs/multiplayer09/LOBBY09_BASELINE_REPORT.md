# Lobby 09 — Baseline Report

Captured on `lobby-upgrade` before implementation (base `0b4f01d`).

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| `npm run generate:presentation-content` | PASS |
| `npm run generate:content-pack` | PASS |
| `npm run generate:map-profiles` | PASS |
| `npm run build` | PASS |
| `npm test` | 118 files / 853 tests PASS |
| `npm run test:demo` | PASS, golden unchanged |
| `npm run test:coreloop` | PASS (9) |
| `npm run test:horde` | PASS (61) |
| `npm run test:presentation` | PASS (37) |
| `npm run test:animation` | PASS (75) |
| `npm run test:progression` | PASS (116) |
| `npm run test:netcode` | PASS (27) |
| `npm run test:maplab` | PASS (32) |
| `npm run test:e2e` | 41/41 PASS |

Protocol version at baseline: 7. Demo golden byte-identical.
