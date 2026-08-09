# Tactical Threat-Map Polish V1 — Implementation Report

## Audit baseline

- Branch: `feature/tactical-threat-map`
- Starting SHA: `2e80f3916e06deccfa915e56f3087acf51ead218`
- Binding design: `TACTICAL_THREAT_MAP_POLISH_DESIGN.md`
- Audited: `tacticalDrawer.ts`, `miniMapRenderer.ts`, `gameClient.ts`, shared enemy classification, horde sectors and replication protocol, tactical CSS, tactical tests, and horde tests.
- `tests/quality` is not present in this checkout; the existing quality/readability coverage is in `tests/gameplayReadabilityTacticalEnvironment.test.ts` and `e2e/gameplay-readability-tactical.spec.ts`.

## Implementation

### Semantic threat classification

`miniMapEnemyThreatClass()` uses `normalizedEnemyClass()` first:

1. normalized Boss -> Boss;
2. normalized Elite -> Elite;
3. non-Boss wave leader (`isWaveLeader()`) -> Elite;
4. other semantically classified enemies -> ordinary;
5. ownership priority is consulted only for metadata-free legacy compatibility.

The same classifier and Canvas renderer are used for Single Player and Multiplayer.

### Exact marker treatments

| Threat | Shape | Fill | Outline/ring | Size |
| --- | --- | --- | --- | --- |
| Ordinary | circle | `#d55347` | `#2a0e0c`, `0.75px` | radius `2.5px` |
| Elite | diamond | `#b56cff` | `#220b2e`, `1.75px` | half-size `6px` |
| Boss | angular hex glyph | `#ff304d` | `#28060d`, `2px`; outer `rgba(241,238,227,.95)` ring | half-size `9px`; ring radius `12px` |
| Aggregate sector | three dots in broken circle | `#d55347` | `1.5px` broken circle | radius `clamp(7 + 1.25 * sqrt(count), 9, 16)`; dot radius `1.75px` |
| Sector count | `×N`, only when `count > 8` | `#f2f0df` | `#101416`, `2.5px` text edge | `10px` Barlow Condensed |
| Player | vehicle-facing notched arrow | `#59e391` | `#101416`, `2.5px` | tip `10.5px`, half-width `7.5px`, base `8px` |

Boss and sector markers are static. No pulse was added, so reduced-motion users receive the same fully readable presentation without animation.

The existing amber chest marker remains unchanged: `#ffb31a` fill, `#211602` outline, rotated `7px` square.

Enemy and sector glyphs are clipped by data eligibility rather than canvas overflow: only alive enemies and positive-count sectors inside authoritative playable bounds are drawn. The slightly enlarged green player arrow remains north-up and uses chassis yaw.

### Aggregate-sector contract

`TacticalDrawer.update()` now receives one typed frame object:

```ts
interface TacticalDrawerFrame {
  state: MatchState;
  tank: Pick<TankState, 'x' | 'z' | 'yaw'> | null;
  role: Role | 'single';
  sectors: readonly AggregateSectorRecord[];
}
```

`GameClient` collects the current aggregate list once per rendered frame and passes the same readonly list to both the 3D aggregate renderer and tactical minimap. Multiplayer uses the latest replicated sector records. Single Player adapts the authoritative `HordeSectorAggregator.sectors` map through a reusable record buffer, avoiding a new array and object set every frame.

When a sector materializes, the authoritative sector map/replicated list removes it; the next tactical frame therefore removes the approximate cluster and draws the materialized individual enemies instead. No individual positions are invented for an aggregate.

## Files changed by this workstream

- `src/client/tactical/miniMapRenderer.ts`
- `src/client/tactical/tacticalDrawer.ts`
- `src/client/app/gameClient.ts`
- `tests/gameplayReadabilityTacticalEnvironment.test.ts`
- `tests/tacticalDrawer.test.ts`
- `e2e/tactical-threat-map.spec.ts`
- `docs/parallel-enemy-pressure/workstream-03-tactical-threat-map/screenshots/*.png`
- this report

## Verification

### Passing

- `npx vitest run tests/gameplayReadabilityTacticalEnvironment.test.ts tests/tacticalDrawer.test.ts` — 2 files, 9 tests passed.
- `npx vite build` — passed (362 modules transformed).
- `npm run build:server` — passed.
- Tactical/browser suite, served with the newly built client and a temporary clean committed-content fixture:
  - `e2e/gameplay-readability-tactical.spec.ts`
  - `e2e/tactical-threat-map.spec.ts`
  - 3 tests passed, including responsive closed/open drawer behavior, complete SP hierarchy + aggregate sector, and a real two-client driver/gunner Multiplayer room.
- In-app browser smoke check — drawer opened with pointer lock retained and the attached MAP/TAB nub aligned to the panel.

### Repository-level blockers outside this workstream

- `npx tsc --noEmit` reaches unrelated errors in `src/client/app/presentationEventRouter.ts` (`ResolvedEnemyAudioProfile` vs `Record<string, unknown>`) and `tests/audio/proceduralSimulationEvents.test.ts` (`tier`/`sizeClass` union access).
- `npm run build` stops during content generation because concurrent out-of-scope schema/content work rejects `enemy.quaternius.alien-high-detail` with `elite/boss monsters require a mixed pattern set`.
- `npm run test:horde` reports 32 passed / 7 failed tests plus 9 failed suites; all horde failures are blocked at that same content-validation error before the sector tests can collect.
- `npm test` also fails on the same current worktree content mismatch plus unrelated existing predictor, relic, importer-fixture, asset-manifest, and golden-regression failures. The focused tactical files remain green.

## Screenshot evidence

- [Single Player — drawer closed/nub](screenshots/single-player-drawer-closed.png)
- [Single Player — drawer open](screenshots/single-player-threat-map-open.png)
- [Ordinary + Elite + Boss + chest + aggregate sector](screenshots/ordinary-elite-boss-chest-and-sector.png)
- [Multiplayer — Driver](screenshots/multiplayer-driver-threat-map-open.png)
- [Multiplayer — Gunner](screenshots/multiplayer-gunner-threat-map-open.png)

## Explicit exclusions preserved

- No tactical drawer structure, slide behavior, TAB/MAP nub, pointer-lock, input, or status-panel redesign.
- No chest-beacon or chest-marker changes.
- No enemy scale, attack, speed, spawn, health-label, or health-bar work.
- No DOM enemy markers, second class-specific canvas, or per-marker DOM allocation.
