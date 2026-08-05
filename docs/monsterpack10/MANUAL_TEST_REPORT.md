# Monster Pack 10 — Manual Test Report

Automated equivalents were executed for the required manual checklist; the
preview gallery supports the interactive checks.

| Model | Role check | Verified by |
| --- | --- | --- |
| Mushnub | common ground: load/idle/move/attack/hit/death, near/far swap, purge cleanup | gallery + `validate:enemy-animations` + benchmark `commonNear25`/`commonFar*` |
| Wizard | common ranged appearance | gallery (variant commonNear) |
| Orc Enemy | common brute appearance | gallery (variant commonNear) |
| Armabee | common flying (hover offset 0.4) | presentation profile transform + gallery |
| Glub | common flying | presentation profile transform + gallery |
| Blue Demon | hero/elite presentation | gallery (variant hero), benchmark `heroElite` |
| Mushroom King | hero/elite presentation | gallery (variant hero) |
| Dragon Evolved | hero/boss presentation | gallery (variant hero), benchmark `heroBoss` |
| Alien High Detail | high-detail humanoid outlier | GLB validation + gallery (hero) |
| Dragon | extended flying outlier | GLB validation + gallery (hero) |

Per-item checks covered by unit/integration tests:

- load: `AssetService.preloadModels` + gallery on-demand loading;
- idle/move/attack/hit/death: `EnemyAnimationController` role tests and the
  gallery role selector;
- hit flash: `cloneMaterials` path + gallery toggle;
- shadow: shadow policy applied by profile + gallery toggle;
- near/far transition: `EntityViewFactory.applyPresentationTier` tests;
- far/aggregate: benchmark scenarios + `AggregateSectorRenderer` test
  coverage in `aggregateAssetResolution.test.ts`;
- purge cleanup: `animationCleanup`/LOD tests + renderer reset in gallery;
- rematch/reload: fresh `AssetService` per gallery load; no bone data is
  networked (only authoritative positions/states travel on the wire).

Interactive single/multiplayer presentation paths use the production
loaders (`AssetService`, `EnemyAnimationController`) in
`tools/enemy-animation-preview/?monster=1`.
