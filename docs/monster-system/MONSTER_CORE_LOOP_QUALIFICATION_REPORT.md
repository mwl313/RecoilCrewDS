# Monster Core-Loop Integration — Qualification Report

Branch: `monster-system`. All results below were actually run in this
workspace (see the live browser qualification section for the production
SP and two-client runs; only a human visual pass over screenshots remains).

## Automated selection matrix

`tests/monsterRunSelection.test.ts` + `tests/monsterCoreLoopQualification.test.ts`

- Same seed reproduces the same run; different seeds vary.
- Exactly three slots per phase; no within-phase duplicates; all IDs resolve.
- 40 seeds: no ordinary identity repeats in consecutive phases.
- 500 seeds: Phase 1 identity returns in Phase 3 (rule allows it).
- 40 seeds: elite identities unique; boss never matches an elite.
- One-elite default (`[1, 1]`); two-elite JSON config produces two stacked
  elite bars (three unique elites + distinct boss).
- Zero-weight candidates never selected; insufficient featured pool rejected
  at schema time.
- SP and MP resolve the identical slot plan for the same match id
  (`qual-42`); a different match id gives a different seed/run.

## Cross-role qualification

All six featured identities validated as both elite and boss (12 role
definitions):

- Elite: tier `elite`, tierScale 3.0, single melee or ranged attack (never
  `mixed`), HP/damage scaling on, `rewardClass: elite`.
- Boss: tier `boss`, tierScale 5.0, `mixed` with ≥2 patterns and ≥1 ranged
  pattern, HP scaling on, damage scaling off, `rewardClass: boss`.

## Full Single Player qualification (headless)

`scripts/monster-coreloop-qualify.ts`, fixed match id `qualify-fixed-seed`,
`mode.singlePlayerMainStage`. A deterministic simulated player kills each
wave leader (elite) as it appears and applies 220 DPS to the boss.

Outcome: **victory** (`matchFlow: clear`), results phase at 190.2 s.

| Event | Sim time | Monster level |
| --- | --- | --- |
| Wave 1 (elite) | 60 s | 5 |
| Wave 2 (elite) | 120 s | 9 |
| Boss wave | 180 s | 13 |
| Boss alive | 180 s | 13 |
| Boss dead (220 DPS) | 190.2 s | 13 |

Level boundaries (formula check): 0→Lv1, 15→Lv2, 60→Lv5, 120→Lv9,
180→Lv13 (matches `enemyLevelCurve.mainStage`).

Kills: 3 (2 elites + boss). Spawn-locked SP XP: elite 384 total
(Lv5 elite 160 + Lv9 elite 224), boss 300. No XP is recalculated at death;
the award-once guard was exercised.

The headless run qualifies the authoritative match flow, wave cadence,
spawn-level locking, boss defeat victory, and result transition. It does
not qualify player input, aiming, or browser rendering.

## Performance

`npm run test:horde:benchmark` (ms per simulation tick, stationary):

| Enemies | p50 | p95 | p99 |
| --- | --- | --- | --- |
| 25 | 0.066 | 0.248 | 0.529 |
| 100 | 0.173 | 0.234 | 0.271 |
| 300 | 0.565 | 0.849 | 0.896 |
| 500 | 0.976 | 1.235 | 1.446 |

`npm run test:animation:benchmark`:

- 100 near common mixers: controller p50 0.023 ms.
- 50 near + 100 mid mixers: p50 0.052 ms.
- 200 far rigid instances (no mixer): 0.012 ms.
- LOD selection (300 enemies): p50 0.034 ms.
- Restart/rematch cycles (10×50): p50 1.392 ms, live mixers 0, owned
  material clones 0 after cleanup — rematch cleanup is clean.

## Regression gates actually run

- `npx tsc --noEmit` — PASS
- `npm run generate:presentation-content` — PASS
- `npm run generate:content-pack` — PASS
- `npm run generate:map-profiles` — PASS
- `npm test` — PASS (135 files / 988 tests)
- `npm run build` — PASS
- `npm run test:demo` — PASS (golden unchanged)
- `npx vitest run tests/coreloop06 tests/horde tests/progression08 tests/netcode` — PASS
- `npm run test:horde:benchmark` — PASS
- `npm run test:animation:benchmark` — PASS
- `npx playwright test e2e/monster-coreloop-singleplayer.spec.ts` — PASS
- `npx playwright test e2e/monster-coreloop-multiplayer.spec.ts` — PASS
- `npx playwright test e2e/singlePlayer.spec.ts e2e/progression-disabled-demo.spec.ts e2e/monsterpack10-rendering.spec.ts` — PASS

## Live browser qualification (production servers, Google Chrome)

`e2e/monster-coreloop-singleplayer.spec.ts` (3.0 min, PASS):

- Production SP boots, awaits selected-asset preload, and shows
  `TIME UNTIL NEW WAVE` / `LV 1`.
- Wave 1 and wave 2 elite encounter bars appear with labels/HP; the single
  active elite is promoted to the primary bar after the earlier encounter
  dies (projector fix).
- `BOSS INCOMING` at ~180 s, boss bar visible, boss death → victory screen
  (grade D / "Boss Slayer" at 0 score), and `PLAY AGAIN` starts a fresh
  match with a cleared HUD.

`e2e/monster-coreloop-multiplayer.spec.ts` (3.2 min, PASS):

- Both clients receive the identical authoritative `runConfig` before the
  countdown; the room waits for `assetReady` from both (verified live on
  port 8096).
- Both clients report the same selected run (phases, elites, boss).
- Wave 1 elite encounter bars agree (same label and `HP / MAX`).
- Boss intro and boss encounter bars agree across clients; boss death →
  results on both; a rematch vote re-runs the preload gate and both clients
  enter a fresh match with cleared encounter bars.

Screenshots for both runs are saved under
`docs/monster-system/qualification-screenshots/` (10 PNGs). Pixel checks
confirm non-blank, varied rendered frames; a human visual pass over the
screenshots is the final remaining item.

Demo regression specs still pass on the 8099 demo server (single-player
round, progression-disabled multiplayer, monsterpack rendering benchmark).

## Remaining manual items

- Human visual review of the captured screenshots (scale, sockets, HUD
  bars, boss presentation) — screenshots are ready in
  `docs/monster-system/qualification-screenshots/`.
- Visual inspection of normalized scale, sockets, encounter bars, and
  performance in the browser.

These items require the running game/browser and are the immediate next
steps for Phase E completion.
