# Relic Chest World Integration Handoff

## Branch and commits

Continue on `relic-addition`. Do not merge Main as part of this handoff.

- Baseline: `88bd3807e855f81d3f7486c52a715c5acd6c9700`
- Core authority/content/tests: `50582e5`
- Renderer, reveal, HUD, and browser qualification: `29d7ad5`

## What is ready

- Generated production Main Stage sessions start with ten deterministic chest states and one discovery placement.
- Periodic and class-aware enemy/leader chest sources use the same lifecycle.
- Proximity opening, pause, physical open, one-time acquisition, reveal, skip, minimum open life, and animated despawn are authoritative.
- Both clients reconstruct the same state, including reconnect.
- The renderer preserves chest materials and owns/disposes only instance presentation resources.
- The HUD rail is persistent, ordered, stack-aware, responsive, and ready to replace fallbacks with real icon files by `iconId`.
- Protocol is version 14.

## High-value files

- `content/relic-chest-spawn-policies/mainStage.json`
- `src/shared/progression/relicChestSpawnDirector.ts`
- `src/shared/progression/progressionSystem.ts`
- `src/shared/progression/progressionTypes.ts`
- `src/client/relics/relicChestWorldRenderer.ts`
- `src/client/progression/relicInventoryRail.ts`
- `src/client/progression/progressionOverlay.ts`
- `tests/progression08/relicChestWorldIntegration.test.ts`
- `e2e/progression-world-chest.spec.ts`
- `e2e/progression-world-chest-multiplayer.spec.ts`

## Verification commands

```bash
npx tsc --noEmit
npm run generate:content-pack
npm run generate:presentation-content
npm run build
npm run test:demo
npm run test:progression
npm run test:netcode
npm run test:horde
npx playwright test e2e/progression-world-chest.spec.ts
npx playwright test e2e/progression-world-chest-multiplayer.spec.ts
```

Expected focused results at handoff: progression 130/130, netcode 33/33, horde 101/101, Demo golden unchanged, and both new browser cases passing.

## Follow-up checklist

1. Add final relic icon files to the presentation asset catalog using existing `iconId` values; do not change relic IDs.
2. Tune only the content policy after telemetry playtests. The provisional 28 m spacing and drop rates are intentionally data-driven.
3. If triple-choice relic rewards are enabled later, add selection validation/UI around the existing candidate array; do not change current automatic-single behavior until then.
4. Repair the unrelated multiplayer urban asset preload for `environment.urban.zombie.streetStraight`, then rerun the whole progression E2E group.
5. Resolve the baseline driver-predictor pending-count assertions and supply the external Monster Pack ZIP before expecting aggregate `npm test` to be entirely green.

## Working-tree caution

Several user-provided documentation/source-pack paths were already untracked and were deliberately not included in the implementation commits:

```text
CODEX_RECOIL_CREW_QUALITY_IMPROVEMENT_PROMPT.md
docs/README_RELIC_CHEST_SOURCE_PACK.md
docs/RecoilCrew_RelicWorldIntegration/
docs/docs/
docs/public/
```

Preserve or commit those separately according to the user’s documentation plan. The generated map-profile and presentation files may appear modified only because local generators touched line endings; their Git blobs have no content diff and they were not staged.
