# Monster System Schema Mapping

Binding design concepts → repository schema/registry mapping.

| Design concept | Repository target |
| --- | --- |
| General enemy definition | New `type: 'monster'` variant in `enemySchema` (same `enemies` registry, strangler-safe) |
| Tier (`fodder/specialist/elite/boss`) | `enemy.monster.tier` enum |
| Size class (`small/medium/large`) | `enemy.monster.sizeClass` enum |
| Attack union (melee/ranged/mixed) | `enemy.monster.attack` discriminated union |
| Level curve | New `enemyLevelCurves` registry + `content/enemy-level-curves/main_stage.json` |
| XP rewards | New `enemyXpRewards` registry + `content/enemy-xp-rewards/main_stage.json` |
| Melee engagement | New `meleeEngagementProfiles` registry + `content/melee-engagement-profiles/default.json` |
| Projectiles | Extend `projectileSchema.kind` with `enemy`; add `content/projectiles/enemy_*.json` |
| Presentation profile | Existing `enemyPresentationProfiles` (`enemyPresentation.quaternius.*`) |
| Animation profile | Existing `enemyAnimationProfiles` (`enemyAnimation.quaternius.*`) |
| Art roster | Existing `enemyArtRosters`; add `quaternius.mainStage` |
| Normalized dimensions | Generated module `src/generated/monsterDimensions.generated.ts` from `docs/monsterpack10/source-manifests/monster_catalog.json` |
| Match phases | New shared `monsterPhase` module (FARMING/BOSS_INTRO/BOSS_ACTIVE/RESULTS) |

## Adaptations

- Design example ids use `enemy.quaternius.<slug>`; the repository convention
  is `enemy.<slug>` for legacy and `enemy.quaternius.<slug>` for the pack —
  the general definitions use `enemy.quaternius.<slug>` (and
  `<slug>-high-detail` for elites/bosses where the pack file differs).
- The exact ordinary-roster stat table referenced by the design
  (`08-몬스터-레벨링-성장곡선.md`, `09-몬스터-카테고리.md`) is not present in
  the repository; the 45 definitions are authored from the design examples,
  the monster catalog classifications, and deterministic tuning rules, and
  are flagged in `MONSTER_SYSTEM_CONTENT_REPORT.md` for replacement with the
  canonical table values.
- Existing `progression.mainStage.enemyXpRewards` (base values only) is kept
  as the legacy adapter; the new `enemyXpRewards.mainStage` carries the
  design's per-level formula.
