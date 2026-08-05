# Monster Pack 10 — Import Plan

## Milestones

```text
M0  Audit + baseline + this planning set            (this commit)
M1  Ignore rules: local-imports/, build/monsterpack10-import/
M2  scripts/import-monsterpack10.ts (dry-run, validate-only, clean-staging)
M3  Copy 90 GLBs → public/assets/models/enemies/quaternius/ with hashes
M4  Archive source manifests/reports/license under docs/monsterpack10/
M5  Deterministic slug → semantic ID map
M6  Register 90 project assets in content/assets/project.json
M7  Stage-selective preloading (optional assets, roster preload API,
    telemetry)
M8  Native hero animation profiles (45)
M9  Native common animation profiles (15)
M10 Hero presentation profiles (45)
M11 Common presentation profiles (15, near/far/aggregate)
M12 Common-far instanced integration + aggregate far-sector rendering
M13 Scale/socket mapping docs + content
M14 enemyArtRoster.quaternius.integrationPreview + preview gallery
M15 validate:monsterpack-import + unit tests
M16 Browser rendering benchmark (test:monsterpack-rendering)
M17 Presentation caps from evidence (PERFORMANCE_REPORT.md)
M18 Documentation + final reports
```

## Key decisions

- Semantic IDs: `custom.enemy.quaternius.<slug>.hero|commonNear|commonFar|
  aggregate`, slug derived from the source catalog slug with deterministic
  camel-case conversion (unique by construction, validated by the importer).
- Fallbacks by role class: common ground/small → `enemy.scrapBug`;
  bruiser/charger → `enemy.rammer`; ranged/static → `enemy.gunTower`;
  large/special/boss → closest safe built-in fallback (`enemy.witch`).
- Preload policy: hero assets are `optional: true`; only the active art
  roster's preload list is eagerly loaded. `AssetService` gains a public
  `preloadModels(ids)` API and stops preloading every optional project
  model.
- Animation: per-model exact clip maps from `animation_profiles.json`,
  generated as native `enemyAnimation.quaternius.<slug>.(hero|common)`
  profiles with `rootMotion: false`; common profiles fall back to available
  clips only.
- Presentation: `enemyPresentation.quaternius.<slug>.hero|common`; common
  profiles wire near/common-far/aggregate asset ids.
- Aggregate: sector records carry the presentation profile; the client
  renders shared aggregate meshes per profile with procedural fallback.
- The ZIP is never committed; `build/monsterpack10-import/` is disposable
  staging; runtime GLBs are committed under `public/assets/models/enemies/
  quaternius/`.

## Commands (to be added)

```json
{
  "import:monsterpack": "tsx scripts/import-monsterpack10.ts",
  "validate:monsterpack-import": "tsx scripts/validate-monsterpack10-import.ts",
  "test:monsterpack-import": "vitest run tests/monsterpack10",
  "test:monsterpack-rendering": "tsx scripts/benchmark-monsterpack10.ts"
}
```
