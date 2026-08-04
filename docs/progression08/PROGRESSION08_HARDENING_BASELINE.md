# Progression08 — Hardening Baseline

Captured on `main` at `b9c3c7e` (`progression08: finalize tests and reports`)
before any hardening edits. Machine: Windows, PowerShell, Node via npm
scripts, Playwright Chromium.

## Baseline commands and outputs

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | PASS (exit 0) |
| `npm run generate:presentation-content` | PASS, sourceHash `3361ac6439ba…` |
| `npm run generate:enemy-animation-content` | PASS, sourceHash `5fbae5674c4e…` |
| `npm run generate:content-pack` | PASS, sourceHash `b1beb80d44e5…` |
| `npm run generate:map-profiles` | PASS, sourceHash `38c058c9ae5e…` |
| `npm run validate:progression-content` | PASS |
| `npm run validate:enemy-animations` | PASS, 0 errors / 0 warnings |
| `npm run build` | PASS (client + server) |
| `npm test` | 101 files / 767 tests PASS |
| `npm run test:progression` | 14 files / 67 tests PASS |
| `npm run test:progression:simulation` | PASS (values vary run-to-run; one run: `level=2 xp=2/45 totalXp=22`) |
| `npm run test:demo` | PASS, golden matches `tests/fixtures/demo-golden.json` |
| `npm run test:coreloop` | 1 file / 9 tests PASS |
| `npm run test:horde` | 10 files / 61 tests PASS |
| `npm run test:presentation` | 5 files / 37 tests PASS |
| `npm run test:animation` | 13 files / 75 tests PASS |
| `npm run test:netcode` | 6 files / 27 tests PASS |
| `npm run test:maplab` | 7 files / 32 tests PASS |
| `npm run test:progression:e2e` | 4/4 PASS |
| `npm run test:e2e` | 37/37 PASS |

## Observed baseline state

- Demo golden is byte-identical to the fixture (1647 events, 21 types).
- Charge Shot content and behavior are active in every mode via
  `defaultCapabilities: ["cannon.charge"]`; no Charge Shot files were
  touched by the hardening pass.
- Combat 05 regression suites (`dashContact`, `fallRemoval`,
  `instantTurret`, `chargeStateMachine`, `chargeScaling`, `capabilities`)
  all pass at baseline and after hardening.
- Known pre-existing behavior recorded at baseline: the headless
  progression simulation is not deterministic across runs (observed
  `totalXp=18/22/24/26` across runs of the same committed code) because it
  feeds wall-clock values into `checkProgressionTimeout`. This is a
  documentation/limitation note, not a hardening regression.

## Post-hardening baseline

The same gates after the hardening pass:

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | PASS (exit 0) |
| all generators + validators | PASS |
| `npm run build` | PASS |
| `npm test` | 108 files / 816 tests PASS |
| `npm run test:progression` | 21 files / 116 tests PASS |
| `npm run test:progression:hardening` | 7 files / 49 tests PASS |
| `npm run test:progression:simulation` | PASS |
| `npm run test:demo` | PASS, golden unchanged |
| coreloop / horde / presentation / animation / netcode / maplab | 9 / 61 / 37 / 75 / 27 / 32 tests PASS |
| `npm run test:progression:e2e` | 7/7 PASS |
| `npm run test:e2e` | 40/40 PASS |

See `PROGRESSION08_HARDENING_IMPLEMENTATION_REPORT.md` for the full final
gate log summary.
