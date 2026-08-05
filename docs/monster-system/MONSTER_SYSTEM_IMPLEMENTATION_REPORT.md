# Monster System Implementation Report

1. **SHAs/branch**: started `6c26676` → `monster-system` head `1f62372`
   (commits `28954ee` audit/plan, `767a4b5` schemas, `e9c1724` difficulty/
   spawn locks/attack timing/reservations, `1f62372` roster/projectiles/
   normalization).
2. **Files**: see per-commit summaries; content (45 enemies, 7 projectiles,
   curves/XP/engagement/roster), `src/shared/monsters/*`, enemy behavior
   primitives, projectile `enemy` kind, MatchRules registry wiring,
   `monsterCompat` adapter, generator script, tests, docs.
3. **Compatibility migration**: strangler pattern — legacy
   `scrapBug/rammer/gunTower/lootTruck` untouched (Demo golden byte-identical);
   `type: 'monster'` is additive; `monsterCompat` adapts legacy consumers;
   removal condition documented in the adapter.
4. **Schemas/content**: validated `monster` enemy variant, attack union,
   enemy level curve, XP rewards, melee engagement, `enemy` projectiles.
5. **Roster**: 39 ordinary + 4 elites + 2 bosses; production roster +
   preserved preview roster.
6. **Curves/XP**: 15 s Lv1–13, ×1.20 HP, ×1.18 damage, boss exception,
   per-level XP, SP ×2.
7. **Spawn locking**: `EnemyState.monster` stores spawn level, multipliers,
   max HP, resolved XP, scaled contact DPS/projectile damage.
8. **Attack timing**: authoritative cycle + one normalized cue (0.55 default),
   frame-skip safe, death cancel, playback clamp.
9. **Contact DPS**: `damagePerHit = scaledDps / rate`.
10. **Reservations**: deterministic arc manager (distance → ownership →
    threat → id), release on death/range/grace/phase reset.
11. **Projectiles**: one slow 5–12 m/s enemy projectile per ranged attack,
    terrain/obstacle/tank collision, spawn-level damage, no hitscan.
12. **Boss phase**: FARMING→BOSS_INTRO→BOSS_ACTIVE→RESULTS phase machine,
    Lv13 locks, ordered patterns, victory/defeat transitions.
13. **Animation policy**: Idle/Walk/Attack/Death semantic mapping validated
    for all 45; common-near skinned, common-far rigid, aggregate instanced,
    hero for specialist/elite/boss.
14. **Normalization**: 1.02/1.53/1.70 targets, tier scales 1/3/5, derived
    collision/engagement/shadow dimensions.
15. **Near/far/aggregate**: existing Monster Pack 10 pipeline reused; no
    mixers for rigid far/aggregate.
16. **Networking/determinism**: shared authoritative modules, no
    `Math.random()` in monster simulation; presentation cues remain compact.
17. **Telemetry/debug**: content/telemetry hooks retained from the pack
    pipeline; development overlays listed as follow-up.
18. **Commands**: listed in `MONSTER_SYSTEM_QUALIFICATION_REPORT.md` — all
    run, all PASS (945 tests).
19. **SP/two-client**: not browser-verified (no harness); unit-level mode
    parity tested.
20. **Full-round seed/boss TTK**: not measured in a live match (phase
    integration is the documented next step).
21. **Performance**: horde benchmark baseline unchanged; monster modules are
    O(enemies) per step.
22. **Rematch cleanup**: existing enemy/impulse cleanup paths preserved and
    covered by monsterpack10 cleanup tests.
23. **Known limitations**: canonical ordinary stat table absent from repo
    (values are archetype-derived, single-table in generator); live match
    flow still uses the legacy 90-second adapter; per-model normalized
    dimension cache not yet generated.
24. **Tuning-only follow-ups**: canonical stat merge, live phase activation,
    generated dimension cache, browser qualification.
25. **Environment props excluded**: branch base `6c26676` has no environment
    objects; no env code was imported.
26. **Branch**: `monster-system`, unmerged; `map-overhaul` and
    `map-movement-polish` untouched.
