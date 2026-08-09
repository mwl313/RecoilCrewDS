# Integrity Reward and Tactical Nub — Implementation Report

## Scope and revision

- Branch: `codex/next-feature-bugfix`
- Starting `origin/main` SHA: `f026e5a204dfcc8f90c40364218198f80047e6e6`
- Ending base SHA: `f026e5a204dfcc8f90c40364218198f80047e6e6` (working-tree implementation; not committed by this task)
- Implemented the binding integrity-reward, integrity-copy, semantic-minimap, and tactical-nub requirements.
- No chat UI, chat input, Enter-key behavior, network message, or protocol version change was added.

## Files changed

Authority and shared presentation:

- `src/shared/progression/maxIntegrityRewardRepair.ts`
- `src/shared/progression/progressionSystem.ts`
- `src/shared/presentation/relicDescriptionPresentation.ts`

Client integration and tactical UI:

- `src/client/app/gameClient.ts`
- `src/client/progression/relicInventoryRail.ts`
- `src/client/relics/relicChestWorldRenderer.ts`
- `src/client/tactical/miniMapRenderer.ts`
- `src/client/tactical/tacticalDrawer.ts`
- `src/client/ui/tactical.css`

Tests and qualification:

- `tests/progression08/integrityRewardRepair.test.ts`
- `tests/presentation/relicDescriptionPresentation.test.ts`
- `tests/progression08/relicInventoryRail.test.ts`
- `tests/gameplayReadabilityTacticalEnvironment.test.ts`
- `tests/tacticalDrawer.test.ts`
- `e2e/gameplay-readability-tactical.spec.ts`

Binding source documents added from the supplied package:

- `docs/quality/INTEGRITY_REWARD_AND_TACTICAL_NUB_DESIGN.md`
- `docs/quality/CODEX_PROMPT_IMPLEMENT_INTEGRITY_REWARD_AND_TACTICAL_NUB.md`

## Max-integrity reward repair

`repairForMaxIntegrityGain(tank, maxBefore, maxAfter)` returns `maxBefore`, `maxAfter`, non-negative `gained`, and the amount actually `repaired`.

- A live tank receives exactly `maxAfter - maxBefore`, clamped to the new maximum.
- Existing missing integrity is preserved; this is not a full heal and does not preserve an HP percentage.
- `deadT > 0` prevents repair, so the mechanic cannot revive a dead tank.
- Equal before/after maxima are inert.
- A maximum decrease clamps current integrity and reports no repair.

### Upgrade integration

`ProgressionSystem.resolveLevelUp()` samples resolved max integrity once before applying all cards and once after all accepted cards. It calls the helper once for the complete accepted selection transaction. Multiple max-integrity effects in one card/role-separated resolution therefore produce one aggregate repair using the final resolved stat delta.

### Relic integration

`ProgressionSystem.resolveChestOffer()` captures the prior stack and resolved maximum, performs `RelicInventory.add()`, reprojects relic stats, and calls the helper only when `stackCount` increased. The repair is outside `RelicStatProjector`.

Idempotency follows from the transaction boundary:

- projector refreshes do not call the helper;
- damage lookups do not call the helper;
- reconnect/state reconstruction does not call the helper;
- rejected/defensive unique acquisitions do not increase the stack and cannot repair;
- each successful HEARTY TANK stack repairs only its newly resolved max gain.

## Integrity display copy

Existing upgrade cards and tactical rows continue through `statPresentation.ts` and the single `combatDisplayUnits.ts` ×10 helper. HUD current-integrity text already uses `formatCombatDisplayValue`; bar ratios remain internal.

`presentRelicDescription()` reads structured relic effects and resolved template parameters. It never parses authored prose or regex-replaces numbers.

Supported absolute-integrity mappings:

- `statFlat` targeting `tank.maxIntegrity`: `20` → `Max integrity +200.`
- `cannonKillHeal`: `5` → `Cannon kills restore 50 integrity.`
- `waveClearHeal`: `15` → `Wave clear restores 150 integrity.`
- structured generic `heal.amount`: formatted through the same combat-display helper

Percentage and unrelated/compound descriptions fall back to authored content. In particular, PHOENIX CORE remains `50% integrity`; percentages, seconds, distances, stacks, XP, and cooldowns are not scaled.

The same presented description now feeds the relic reveal and the relic inventory rail tooltip/accessibility label. Stack-count updates also refresh the rail label without altering the per-stack effect amount.

## Semantic minimap threats

`miniMapEnemyThreatClass()` uses `normalizedEnemyClass(enemy)` as its primary source:

- semantic `boss` → boss;
- semantic `elite` → elite;
- semantic wave leader → elite;
- other known semantic classes → ordinary;
- ownership priority is consulted only for metadata-free legacy fallback.

Marker hierarchy is exposed through a pure, testable style helper and drawn in the existing Canvas 2D pass:

| Threat | Shape | Size | Fill | Outline/ring |
| --- | --- | ---: | --- | --- |
| Ordinary | circle | radius 2.5 px | `#d55347` | none |
| Elite | diamond | half-size 6 px | `#b56cff` | dark 1.75 px |
| Boss | diamond | half-size 9 px | `#ff304d` | dark 2 px + pale 12 px ring |

Relic chests remain amber 7 px diamonds, visually separate from violet elites and crimson ringed bosses. No marker DOM, labels, health bars, animation, or second render pass was added.

## Restored 3D chest beacon

The unopened-chest beacon from commit `f429087` is restored in the current authoritative world renderer. Each spawning or closed chest carries a rotating gold octahedron, horizontal ring, and vertical stem named under `TreasureChestBeacon`. The beacon hides as soon as opening begins, stays hidden through reveal/open/despawn, follows the chest's spawn transform, and disposes its owned geometry and materials when the chest visual is removed.

## Tactical drawer shell and nub

The drawer root is now a transform shell containing:

- `.tactical-drawer__panel`, which owns the clipped background, border, shadow, and hidden overflow;
- `.tactical-drawer__nub`, a visual-only attached MAP/TAB latch with `aria-hidden="true"` and `pointer-events: none`.

Shared CSS variables define drawer width, safe gutter, and nub width. The shell keeps opacity `1` and translates from `-(gutter + drawer width)` to `0`, leaving the nub exactly at the left viewport edge while closed and attached to the panel's outer edge while open. Panel and nub use one parent transform; there is no independent movement, bounce, pulse, scale, click target, or pointer-lock change.

The nub uses a matte near-black angular body, 1 px structure, clipped corners, Barlow Condensed labels, a mechanical chevron, and a 3 px role accent: cyan for Driver, red/orange for Gunner, amber for Single Player/neutral. Reduced-motion mode retains the existing near-instant transition.

## Qualification

### Passing

- Focused implementation and chest-renderer tests: 18/18 passed across six files.
- Tactical unit tests: 7/7 passed.
- Production build: `npm run build` passed, including presentation/content generation and server bundle.
- Tactical Playwright E2E: 1/1 passed.
  - closed panel is offscreen while nub remains at X=0;
  - root opacity is 1;
  - nub is noninteractive and aria-hidden;
  - open nub edge equals panel edge;
  - gameplay time and pointer lock continue;
  - progression still closes/reopens the drawer correctly;
  - responsive bounds pass at 1280×720, 1920×1080, 800×720, and 560×720.
- Production world-chest Playwright E2E: 1/1 passed after correcting its stale 650 ms assertion to the current content-authoritative 400 ms open duration.

Captured responsive screenshots:

- `test-results/gameplay-readability-tacti-1415a-a-intelligence-responsively/tactical-1280x720.png`
- `test-results/gameplay-readability-tacti-1415a-a-intelligence-responsively/tactical-1920x1080.png`
- `test-results/gameplay-readability-tacti-1415a-a-intelligence-responsively/tactical-800x720.png`
- `test-results/gameplay-readability-tacti-1415a-a-intelligence-responsively/tactical-560x720.png`

### Existing/out-of-scope repository failures observed

`npx tsc --noEmit` remains non-green on current main because of existing procedural-audio typing errors in `presentationEventRouter.ts` and `tests/audio/proceduralSimulationEvents.test.ts`. No type error points to a file changed by this implementation.

`npm run test:progression` reports 207/208 passing. The remaining existing hardening assertion expects a projected magnet radius of `7.5`, while current content/rules resolve `15`; it reproduces in isolation and does not execute this patch's reward transaction code.

`npm test` reports 10 unrelated failures: stale asset/golden fixtures, prediction pending-queue expectations, a room-rules timeout, a charge-scaling fixture, two tests requiring an absent local Monster Pack ZIP, and the same magnet-radius assertion. All new and directly affected tests pass.

## Final invariant

A successful max-integrity reward repairs exactly the new capacity once without reviving a dead tank; every current absolute integrity description uses the existing ×10 presentation boundary; elite and boss map threats are semantically distinct; and the persistent MAP/TAB nub is one noninteractive mechanical assembly with the tactical drawer.
