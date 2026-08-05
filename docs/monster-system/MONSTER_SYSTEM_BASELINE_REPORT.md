# Monster System Baseline Report

Branch: `monster-system` @ `6c26676e9911a3cf8f04e96b5baa8653918ffb71`
(created from the reviewed map-materials head; environment-object experiment
absent).

## Environment

- Node: 24 (per runtime output), npm scripts from `package.json`.
- Working tree clean at baseline apart from line-ending normalization on two
  generated files (content identical).

## Commands and results

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| `npm run generate:presentation-content` | PASS (sourceHash db6513a779f3…) |
| `npm run generate:content-pack` | PASS (sourceHash 547266eb48e4…) |
| `npm run generate:map-profiles` | PASS (maps 0–5) |
| `npm test` | PASS — 130 files / 915 tests |
| `npm run build` | PASS (client + server) |
| `npm run test:demo` | PASS — 90 s Demo golden matches |
| `npm run test:coreloop` | PASS — 9 tests |
| `npm run test:horde` | PASS — 61 tests |
| `npm run test:horde:benchmark` | PASS — 25–500 enemy scenarios |
| `npm run test:netcode` | PASS — 27 tests |
| `npm run test:progression` | PASS — 116 tests |
| `npm run validate:enemy-animations` | PASS — 73 presentation / 70 animation profiles, 0 errors |
| `npm run test:monsterpack-import` | PASS — 37 tests |

`npm run test:monsterpack-rendering` (Playwright) was not run in this
environment; it is an E2E browser spec.

## Baseline observations

- Legacy enemy system: 4 enemy types, behavior-primitive composition, LOD
  tiers 0–3, horde sectors presentation-only.
- Progression: SP ×2 already active via `progressionMode.singlePlayer`;
  enemy XP currently class-base only (no per-level scaling).
- Match flow: single 90-second round → results (Demo); no boss phase.
- Projectiles: `cannon`/`tower` only.
- Monster Pack 10: 45 models × hero/common-near/common-far/aggregate assets,
  animation/presentation profiles, integration-preview roster, validation
  tooling — all reusable.
