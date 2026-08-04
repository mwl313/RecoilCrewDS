# Animation07 — Implementation Plan

Canonical branch: `combat-rework`. All commits land on this branch only.

## Milestone mapping

| # | Milestone | Primary files | Commit |
|---|-----------|---------------|--------|
| 0 | Audit + baseline | `docs/animation07/ANIMATION07_*` | `animation07: add audit and baseline` |
| 1 | Loaded model assets | `src/client/assets/modelProvider.ts`, `assetService.ts`, `assetInstanceFactory.ts`, `loadedModelAsset.ts` | `animation07: preserve GLB clips and model metadata` |
| 2 | Safe model instances | `src/client/animation/animatedModelInstanceFactory.ts`, `src/client/assets/*`, procedural fixture `tests/animation/proceduralRig.ts` | `animation07: add safe animated model instances` |
| 3 | Schemas | `src/shared/animation/*` | `animation07: add data-driven animation content schemas` |
| 4 | Generated content | `scripts/generate-enemy-animation-content.ts`, `src/generated/enemyAnimationContent.generated.ts`, content dirs | `animation07: generate enemy animation presentation content` |
| 5 | Family templates | `content/enemy-presentation-profiles/*`, `content/enemy-animation-profiles/*`, `content/animation-lod-policies/*`, `content/animation-shadow-policies/*`, `content/assets/project.json` | `animation07: add witch spider and beast profile templates` |
| 6 | Runtime | `src/client/animation/enemyAnimationController.ts`, `enemyAnimationStateResolver.ts`, `enemyAnimationInstance.ts`, `animationClipResolver.ts` | `animation07: add semantic enemy animation controller` |
| 7 | Presentation integration | `entityViewFactory.ts`, `entityViewRegistry.ts`, `networkStatePresenter.ts`, `shared/types.ts`, `shared/content/schemas/enemy.ts` | `animation07: integrate animated enemy presentation` |
| 8 | Action cues | `src/shared/animation/enemyActionCue.ts`, `src/shared/net/horde/*` | `animation07: add authoritative enemy action cues` |
| 9 | LOD + budgets | `src/client/animation/animationLodSelector.ts`, `qualityManager.ts` | `animation07: add enemy animation LOD and mixer budgets` |
| 10 | Far swap + instancing seam | `animationLodSelector.ts`, `entityViewRegistry.ts` | `animation07: add far-model switching and instancing seam` |
| 11 | Material safety | `animatedModelInstanceFactory.ts`, `assetTransformResolver.ts`, `animationCleanup.ts` | `animation07: isolate animated enemy material state` |
| 12 | Cleanup + telemetry | `animationCleanup.ts`, `animationTelemetry.ts`, `entityViewRegistry.ts` | `animation07: harden animation lifecycle cleanup` |
| 13 | Validation CLI | `scripts/validate-enemy-animations.ts` | `animation07: add enemy animation asset validation` |
| 14 | Preview tool | `tools/enemy-animation-preview/` | `animation07: add enemy animation preview tool` |
| 15 | Benchmark | `scripts/benchmark-enemy-animation.ts` | `animation07: add animated enemy benchmark` |
| 16 | Reports + guides | `docs/animation07/ANIMATION07_IMPLEMENTATION_REPORT.md` et al., `docs/guides/*`, `README.md` | `animation07: finalize reports and guides` |

## Content categories (generated, not server ContentPack)

The animation content pipeline is a focused generator invoked by the
presentation-content generator (allowed by the prompt). Runtime lookup is a
generated typed bundle — no second JSON-loading system:

```text
content/enemy-presentation-profiles/  → enemyPresentation.*
content/enemy-animation-profiles/     → enemyAnimation.*
content/animation-lod-policies/       → animationLod.*
content/animation-shadow-policies/    → animationShadow.*
```

Output: `src/generated/enemyAnimationContent.generated.ts` with O(1) maps,
profile id order list (used by horde materialize profile index), and legacy
type→presentation profile mapping generated from `content/enemies/*.json`.

## Runtime seams

```text
AssetService.modelAsset(id)        → LoadedModelAsset (scene + clips + skinned)
AssetService.createModelInstance() → LoadedModelInstance (safe clone)
EnemyPresentationResolver          → profile by presentationProfileId /
                                     legacy presentationId / fallback
EnemyAnimationController           → mixer + actions + role state machine
AnimationLodSelector               → hero/near/mid/far/aggregate + budgets
EntityViewRegistry                 → rig lifecycle + far-record seam
```

## Gates

Every milestone is committed separately. The final gate runs the full command
list from the prompt and records real output in
`ANIMATION07_IMPLEMENTATION_REPORT.md` / `ANIMATION07_PERFORMANCE_REPORT.md`.
