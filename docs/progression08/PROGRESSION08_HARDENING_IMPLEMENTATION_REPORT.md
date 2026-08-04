# Progression08 — Hardening Implementation Report

## 1. Branch and commit base

- Working branch: `main` (fast-forwarded to `origin/main` before work).
- Base commit: `b9c3c7e` `progression08: finalize tests and reports`
  (local == `origin/main`; no user changes present at start beyond the
  prompt/design docs supplied for this task).
- `git status` at start: only the two supplied prompt/design docs untracked.

## 2. Reproduction result for each issue

All eight issues from the hardening design were reproduced against the
baseline checkout with failing tests before any implementation. See
`PROGRESSION08_HARDENING_REPRODUCTION.md` for the 41-failure proof matrix.

Summary:

1. First chest rolled normal rarity (`common`) because the counter was
   incremented before the roll.
2. Demo mode (progression disabled) spawned XP shards/chests and mutated
   telemetry because subscriptions used content presence.
3. Relic presentation lived inside a hidden root; timer/card DOM were
   rebuilt incorrectly and repeated stack acquisitions did not re-present.
4. Leader/elite/boss XP updated team XP directly and never started the
   level-up flow.
5. Chests applied relics without entering `relicSelection`.
6. `RelicRollResult` had no acquisition sequence.
7. VAMPIRE ROUNDS/SAFE HAVEN/PHOENIX CORE/ROADKILL/TWIN SHELL carried
   hardcoded tuning; missing parameters were not validated.
8. No centralized serialized flow advance; stale selections could fight
   terminal state.

## 3. Files changed

Source:

```text
src/shared/progression/progressionTypes.ts
src/shared/progression/progressionSystem.ts
src/shared/progression/treasureChestSystem.ts
src/shared/progression/relicEffectRegistry.ts
src/shared/pickups/xpShardSystem.ts
src/shared/content/schemas/progression.ts
src/shared/content/contentLoader.ts
src/shared/net/protocol.ts
src/server/room.ts
src/shared/sim/matchRuntime.ts
src/shared/sim/match.ts
src/client/progression/progressionOverlay.ts
src/client/app/gameClient.ts
src/client/main.ts
```

Content / scripts / docs:

```text
content/relics/phoenix_core.json          (shockwaveDamage parameter)
package.json                              (test:progression:hardening,
                                          extended progression e2e)
docs/progression08/PROGRESSION08_NETWORK_AND_PAUSE_GUIDE.md
docs/progression08/PROGRESSION08_HARDENING_CODE_AUDIT.md
docs/progression08/PROGRESSION08_HARDENING_BASELINE.md
docs/progression08/PROGRESSION08_HARDENING_REPRODUCTION.md
docs/progression08/PROGRESSION08_HARDENING_IMPLEMENTATION_REPORT.md
```

Tests:

```text
tests/progression08/firstChestIntegration.test.ts        (new, 6 tests)
tests/progression08/progressionDisabledMode.test.ts      (new, 5 tests)
tests/progression08/xpGrantRouting.test.ts               (new, 7 tests)
tests/progression08/relicSelectionFlow.test.ts           (new, 10 tests)
tests/progression08/progressionOverlay.test.ts           (new, 8 tests)
tests/progression08/relicParameterization.test.ts        (new, 8 tests)
tests/progression08/progressionFlowQueue.test.ts         (new, 5 tests)
tests/progression08/networkProtocol.test.ts              (v7 + skipRelic)
tests/interpolation.test.ts                              (state fixture)
tests/horde/hudStage.test.ts                             (state fixture)
tests/combat05/instantTurret.test.ts                     (protocol const)
e2e/progression-first-chest.spec.ts                      (new)
e2e/progression-relic-reveal.spec.ts                     (new)
e2e/progression-disabled-demo.spec.ts                    (new)
```

`src/generated/contentPack.generated.ts` is regenerated from content.

## 4. First-chest fix

`openChest` now:

```text
validate chest + enabled + flow
→ capture isFirstChest before consumption
→ roll rarity with captured first/later state
→ select relic
→ consume chest exactly once
→ increment acquisition sequence
→ apply inventory + telemetry
→ start/serialize the relic reveal
```

`TreasureChestSystem.rollRarityFor(isFirstChest, …)` makes the captured
state explicit. A failed open (missing chest, disabled mode, non-playing
flow, or empty pool) returns `null` and never consumes the chest or the
first-chest status. Tests cover map/enemyDrop/waveClear sources, leader
guaranteed chests, failed opens, and a 30-seed distribution check
(first = E/L only; later opens hit common/rare).

## 5. Disabled-mode guard

- Subscriptions now use `rules.progressionEnabled` (not content presence).
- Defensive guards added to `onEntityKilled`, `onDamageApplied`,
  `onWaveEvent`, `spawnChest`, `openChest`, `addXp`/`grantXp`,
  `spawnXpShard`, `noteMissedShard`, all `notify*` entry points,
  `dispatchTrigger`, damage modifiers, ROADKILL hooks, and TWIN SHELL.
- `XpShardSystem.spawn` refuses to create shards when progression is
  disabled; `spawnChest` returns a detached chest that is never added to
  `state.chests`.
- No `progressionEvent` reward emissions occur in disabled modes, and no
  telemetry mutations occur (verified by
  `progressionDisabledMode.test.ts` and `e2e/progression-disabled-demo.spec.ts`).
- Demo golden remains byte-identical (`npm run test:demo` PASS).

## 6. Unified XP routing

New private authoritative API:

```ts
private grantXp(
  value: number,
  source: ProgressionXpSource,
  position?: { x: number; y: number; z: number },
): void
```

Every XP source routes through it: shard collection (`shard`), wave leader
(`waveLeader`, value = elite reward, unchanged), boss (`boss`), unique
duplicate conversion (`duplicateRelic`), and direct/test rewards
(`direct`). It applies the mode XP multiplier through `TeamExperienceSystem`,
updates telemetry, emits `xpCollected` with the gained value and source,
queues level-ups, and calls the single `advanceProgressionFlow()` so a
selection starts only when legal. Terminal clear/gameOver records XP (when
granted before results) but never opens a selection; a stale selection is
cancelled by the timeout path.

## 7. Relic reveal state

`openChest` now:

```text
predetermine result (rarity + relic + acquisitionSequence)
consume chest
apply inventory + telemetry
activeSelection.kind = relic, relicResult fixed
MatchFlowState = relicSelection (gameplay pauses)
```

The reveal has `revealDeadlineWallMs` (policy timeout, default 10 s),
`resolved`, and `applied` flags. `skipProgressionRelic(acquisitionSequence,
nowMs)` is idempotent: wrong sequence/no active reveal/already resolved are
no-ops; either player may skip; the result is never rerolled. The server
room dispatches the new `skipRelicPresentation` message and the wall-clock
`checkProgressionTimeout` completes the reveal if nobody skips. Snapshots
carry the full reveal (kind, result, sequence, deadline), so reconnect
restores it. Terminal state cancels unshown reveals and never starts a
selection.

## 8. Flow serialization

One central `advanceProgressionFlow(nowMs)`:

```text
terminal → cancel active + pending reveals
active unresolved selection → return (no nesting)
queued relic reveal → begin next reveal
pending level-up → start upgrade selection
otherwise → playing
```

`resolveLevelUp` and `resolveRelicReveal` both resume through it. Chests
cannot open while another flow is active. Multiple level-ups queue
sequentially; multiple chest results queue in `pendingRelicResults`
(defensive; gameplay pause normally prevents same-frame opens). Reward
application remains exactly once.

## 9. Overlay refactor

`ProgressionOverlay` now owns independent retained layers:

```text
progression-overlay
├── progression-selection-layer
├── progression-relic-layer
└── progression-debug-layer (fixed bottom-left, independent)
```

- Hiding the selection layer never hides relic presentation.
- The timer element is rendered once per offer and its text updates every
  frame; card DOM is not rebuilt per frame.
- Relic presentation keys off `acquisitionSequence`, so repeated stackable
  acquisitions and duplicate conversions present again.
- Content labels/descriptions are used when available through a `relicInfo`
  callback (single player has the pack; multiplayer falls back to ids when
  the client lacks definitions).
- Local buttons disable after the local role selects.
- `dispose()` removes every layer.
- No visible overlay exists for progression-disabled state.

## 10. Acquisition sequence

`TeamProgressionState.relicAcquisitionSequence` is a match-scoped monotonic
counter; every resolved chest increments it and every `RelicRollResult`
carries it. Presentation and `skipRelicPresentation` validation key off it.
Snapshots serialize it (reconnect restores the current sequence and reveal);
a new match/rematch resets it via fresh `initialState`.

## 11. Relic parameter audit

- Removed hardcoded tuning: VAMPIRE ROUNDS and SAFE HAVEN now read
  `amountPerStack`; PHOENIX CORE shockwave damage now reads
  `shockwaveDamage` (added `25` to `content/relics/phoenix_core.json` to
  preserve shipped behavior); ROADKILL parameters no longer have
  relic-specific fallback defaults; TWIN SHELL falls back only to the
  generic no-effect value `1`.
- `RELIC_EFFECT_REQUIRED_PARAMETERS` plus `missingRelicEffectParameters()`
  in the progression schema, enforced in `ContentLoader` for every relic
  effect (template parameters merged with relic overrides). Missing
  required parameters fail content validation with the parameter name.
- Fixture tests rebuild a ContentPack with altered parameters and verify
  runtime behavior follows content (heal 5→9 / 15→25, ground pound 10→25,
  phoenix 50%/25→60%/40, roadkill coefficients, twin shell 1.2→1.8).
- All existing shipped values are numerically unchanged.

## 12. Network changes

- `PROTOCOL_VERSION` 6 → 7.
- New client message `skipRelicPresentation { acquisitionSequence }`.
- Server room validates running phase + membership and calls
  `Match.skipProgressionRelic` (idempotent on the authority).
- Snapshots already carried the full `teamProgression` state; the new fields
  (sequence, reveal result/deadline) are serialized automatically.
- Reconnect restores an active reveal; the room timeout resumes play even
  with no input. A disconnected client cannot block progression.

## 13. Unit tests

`npm run test:progression` — 21 files / 116 tests PASS, including:

- first-chest integration (6), disabled mode (5), XP routing (7), relic
  reveal (10), overlay lifecycle (8), parameterization (8), flow queue (5).
- `npm run test:progression:hardening` (new script) — 7 files / 49 tests
  PASS.

Full unit gate: `npm test` — 108 files / 816 tests PASS.

## 14. E2E tests

New specs:

```text
e2e/progression-first-chest.spec.ts      first chest E/L, second normal
e2e/progression-relic-reveal.spec.ts     visible reveal + skip resumes
e2e/progression-disabled-demo.spec.ts    Demo multiplayer stays inert
```

`npm run test:progression:e2e` — 7/7 PASS. `npm run test:e2e` — 40/40 PASS.

## 15. Manual verification

Automated equivalents were used for the listed scenarios:

- Default Demo multiplayer: `progression-disabled-demo.spec.ts` confirms no
  XP, no chests, no overlay, `matchFlow` stays `playing` (plus unit-level
  kill probes in `progressionDisabledMode.test.ts`).
- Single player: `progression-first-chest.spec.ts`,
  `progression-relic-reveal.spec.ts`, `progression-levelup.spec.ts` cover
  first-chest rarity, reveal visibility/skip, and level-up flow.
- Serialization/timeout/reconnect: `relicSelectionFlow.test.ts`,
  `progressionFlowQueue.test.ts`, `networkProtocol.test.ts`, and
  `progression-reconnect.spec.ts`.
- Multiplayer shared reveal with either player skipping and timeout is
  covered by the server-room unit path (`room.ts` dispatch) plus
  `progression-multiplayer-selection.spec.ts`; a browser-driven two-client
  relic-reveal E2E remains a future manual check because the served
  multiplayer mode (Demo) is progression-disabled by design.

## 16. Full regression gates

Final run on the working tree:

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | PASS (exit 0) |
| `npm run generate:presentation-content` | PASS |
| `npm run generate:enemy-animation-content` | PASS |
| `npm run generate:content-pack` | PASS (sourceHash `32ea17ae433e…`) |
| `npm run generate:map-profiles` | PASS |
| `npm run validate:progression-content` | PASS |
| `npm run validate:enemy-animations` | PASS |
| `npm run build` | PASS |
| `npm test` | 108 files / 816 tests PASS |
| `npm run test:progression` | 21 files / 116 tests PASS |
| `npm run test:progression:hardening` | 7 files / 49 tests PASS |
| `npm run test:progression:simulation` | PASS |
| `npm run test:progression:e2e` | 7/7 PASS |
| `npm run test:demo` | PASS, golden matches fixture (1647 events) |
| `npm run test:coreloop` | 1 file / 9 tests PASS |
| `npm run test:horde` | 10 files / 61 tests PASS |
| `npm run test:presentation` | 5 files / 37 tests PASS |
| `npm run test:animation` | 13 files / 75 tests PASS |
| `npm run test:netcode` | 6 files / 27 tests PASS |
| `npm run test:maplab` | 7 files / 32 tests PASS |
| `npm run test:e2e` | 40/40 PASS |

Demo golden was not regenerated and remains byte-identical.

## 17. Charge Shot non-change confirmation

- No Charge Shot source file was modified. `cannon.charge` remains in every
  mode's `defaultCapabilities`; cannon input, charge timing, charge scaling,
  and charge HUD are untouched.
- `git status`/`git diff` shows no changes under any weapon/charge/HUD
  source file. The only Combat 05-area file touched is the generic
  regression test `tests/combat05/instantTurret.test.ts`, which asserts the
  shared protocol constant (updated 6 → 7 because the wire contract gained
  `skipRelicPresentation`). No Combat 05 gameplay behavior changed.
- Combat 05 invariants verified by the existing suites: normal contact
  zero, Dash contact works, ROADKILL relic-gated, no fall damage, no
  Jackpot (all PASS).

## 18. Known limitations

- The headless `test:progression:simulation` is nondeterministic across
  runs in the committed baseline as well (wall-clock values fed to
  `checkProgressionTimeout`); it PASSes but prints varying totals. Not
  introduced by this pass.
- The served multiplayer room mode is Demo (progression-disabled), so a
  full two-browser relic-reveal E2E on a progression-enabled multiplayer
  mode (truckHunter) still requires the documented deployment step of
  serving that mode. The reveal state machine, skip protocol, and timeout
  are covered by unit/integration tests and the server-room handler.
- Client multiplayer relic labels fall back to raw ids when the client does
  not hold a content pack; single player renders content labels.
- Pending level-ups remain recorded in `teamProgression.pendingLevelUps`
  at terminal state (results telemetry), but no new selection is started
  and the reveal queue is cancelled.
