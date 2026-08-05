# Monster System Implementation Plan

Milestones (each with tests before moving on):

1. **M0 — Audit/plan**: this doc set + baseline report. Commit:
   `monster-system: add audit baseline and implementation plan`.
2. **M1 — Schemas**: `monster` enemy variant, attack union, level-curve,
   XP-reward, melee-engagement, projectile `enemy` kind; registries,
   validation, manifest, generated content. Commit:
   `monster-system: add generalized enemy schemas`.
3. **M2 — Difficulty/XP/spawn locks**: `monsterDifficulty` (level formula,
   ×1.20 HP, ×1.18 damage, boss exception, XP by class × level, SP ×2),
   spawn-lock record, tests. Commit:
   `monster-system: add level scaling xp and spawn locks`.
4. **M3 — Attack timing**: `monsterAttack` cycle/cue runtime, one event per
   cycle, death cancel, tests. Commit:
   `monster-system: add attack timing and melee reservations` (with M5).
5. **M5 — Melee reservations**: deterministic arc reservation manager,
   release rules, tie-break, tests.
6. **M6 — Projectiles**: `enemy` projectile kind + behavior (5–12 m/s, one
   shot, telegraph, terrain/obstacle/tank collision), projectile content,
   tests. Commit: `monster-system: add slow enemy projectiles`.
7. **M4/M8 — Normalization + presentation**: generated dimension module from
   monster catalog, tier scales 1/3/5, hero/common near/far/aggregate wiring,
   tests. Commit: `monster-system: add normalization and presentation wiring`.
8. **M7 — Boss phase**: phase machine, Lv13 boss/escorts, ordered cycle,
   victory/defeat, tests. Commit: `monster-system: add boss phase`.
9. **M9 — Roster**: 39 ordinary + 4 elite + 2 boss definitions, projectile
   content, production roster, waves composition, tests. Commit:
   `monster-system: add production roster and waves`.
10. **M10/M11 — Validation, telemetry, qualification, reports**: validation
    tests, telemetry counters, full gate run, reports, commit:
    `monster-system: add validation telemetry and qualification`.

## Compatibility strategy

Strangler migration: legacy `scrapBug/rammer/gunTower/lootTruck` remain
unchanged and byte-identical; `type: 'monster'` is additive; the generalized
runtime is exercised through focused tests first, then activated in a
production roster without touching the Demo golden path.
