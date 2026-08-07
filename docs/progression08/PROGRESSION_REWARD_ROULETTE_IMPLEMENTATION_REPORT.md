# Progression Reward Roulette — Implementation Report

Date: 2026-08-07  
Branch: `codex/dopamine-ui`  
Starting SHA: `9fe8b8e13f764e6bbf7ed4dca51b02fd17785479`  
Ending base SHA: `9fe8b8e13f764e6bbf7ed4dca51b02fd17785479` (uncommitted working-tree implementation)

## Result

The old rounded DOM modal and short relic toast were replaced by one industrial
reward system shared by Single Player and Multiplayer: `TRIPLE LOCK` upgrades,
`SINGLE PRIZE` relics, pointer-lock-safe controls, explicit relic acknowledgement,
and owned-unique eligibility filtering.

## Input ownership

Before, overlay visibility did not stop camera/driver/gunner polling; users had
to Escape pointer lock to reach the cards and reward inputs could remain live.

After:

```text
playing
→ progressionUpgrade / progressionRelic context
→ retain existing pointer-lock state
→ suppress camera, movement, dash, jump, MG, cannon, and Charge Shot input
→ relative X highlights; click/1-3/arrows/A-D/Enter/Space selects
→ clear held actions, deltas, and edge latches on both client and authority
→ resume gameplay from fresh input only
```

## Architecture

- `RewardRevealDirector`: presentation phases keyed by `offerId` or
  `acquisitionSequence`; reconnect uses authoritative reveal start time.
- `RewardRevealView`: retained semantic DOM containing only fixed authority data.
- `RewardFxLayer`: 36 pooled shard nodes, radial burst, and rarity ring.
- `ProgressionInputContext`: hard context transitions and selector state.
- `ProgressionOverlay`: orchestration compatibility shell; no gameplay authority.
- `progression-reveal.css`: token-driven angular styling, responsive behavior,
  reduced motion, and forced colors. No rebuilt reward UI uses `style.cssText`.

## Timing

Upgrade:

| Time | Phase |
|---:|---|
| 0–100 ms | impact, vignette, radial pulse |
| 70–280 ms | LEVEL UP banner slam |
| 180–420 ms | three housings enter, 35 ms stagger |
| 300–720 ms | generic stat/category reel cycle |
| 720 / 850 / 980 ms | fixed cards lock sequentially |
| 1100 ms | stable selectable state |
| selection +0–280 ms | selected thrust; rejected cards shear/fade; exit or calm peer wait |

Relic:

| Time from reveal start | Phase |
|---:|---|
| 0–760 ms | physical chest handoff / signal |
| 760–1320 ms | single generic relic reel |
| 1320–1480 ms | final lock and rarity payoff |
| 1480–1750 ms | name, description, stack settle |
| 1750 ms onward | indefinite awaiting continue |

Early click/Space/Enter fast-forwards to the fixed result. Continue arms 250 ms
later and needs a subsequent fresh input.

## Authority changes

- Relic state uses `revealStartedAtWallMs` and `continueAllowedAtWallMs`; there
  is no `Infinity`, countdown, or auto deadline.
- Single Player resolves after local acknowledgement.
- Multiplayer snapshots replicate Driver/Gunner readiness independently and
  resolve only after all currently connected required roles are ready.
- Disconnect and room tick paths refresh the required-role gate.
- Stackables remain eligible and increment normally.
- Owned `unique` relics are filtered before candidate selection.
- An exhausted rolled rarity deterministically falls back to remaining eligible
  canonical pool entries, never an owned unique.
- Defensive direct re-add of an owned unique is a no-op with zero XP.

## Qualification

Passing:

- `npx tsc --noEmit`
- presentation/content generation and progression validation
- `npm run build`
- `npm run test:progression` — 30 files, 191 tests
- `npm run test:presentation` — 5 files, 50 tests
- `npm run test:netcode` — 6 files, 33 tests
- First full `npm run test:progression:e2e` — 7/9 scenarios passed, including
  locked number-key level-up, early relic fast-forward/fresh continue,
  first-chest rarity, reconnect, and shared world-chest replication.
- Focused world-chest rerun after targeting the intended full-layer click path
  passed (1/1).
- Reward responsive qualification passed (1/1) and captured upgrade/relic PNGs
  at 1280×720, 1920×1080, 800×720, 560×720, and 390×844.

The full `npm test` run reached 1,264 passing tests and six failures outside this
reward work: three existing predictor replay-count expectations, two importer
tests requiring the absent local Monsterpack ZIP, and one room-rules timeout
under full parallel load.

## Browser temporal evidence

The 1280×720 Playwright run verified pointer lock stays active across a level-up,
`Digit2` resolves without Escape, an early relic Space reveals without dismissing,
and a fresh Space after the arm interval resumes play. The first full pass also
found one unrelated missing urban asset in the Multiplayer smoke test and a
Playwright nested-button hit-test issue; the full relic layer is the intended
click target and its focused rerun passes.

The default Playwright config does not record video, so no video artifact is
claimed. Static artifacts for all five required viewports are stored under the
responsive Playwright test-result directory; human temporal video review remains.

## Performance and limitations

- Cards build once per identity, never per frame.
- Presentation reels never consume gameplay RNG.
- Transform/opacity dominate; no large animated blur or second world render.
- The 36-node shard pool stays below the 48-element target.
- No camera yaw, pitch, or FOV mutation.
- The server still accepts legacy `skipRelicPresentation` as a compatibility
  alias, while current clients send `acknowledgeRelic`.
