# Elite & Boss Combat Overhaul — Implementation Report

## Source and audit

- Branch: `feature/elite-boss-combat`
- Audited main-derived SHA: `2e80f3916e06deccfa915e56f3087acf51ead218`
- Binding design: `ELITE_BOSS_COMBAT_AND_ATTACK_GEOMETRY_DESIGN.md`
- Canonical generated content hash after the implementation: `f2aa6f9766b776f6e675334cdba77c7ba7f4306e42a27ddb51c3c8785c49d2ff`

Before editing, the audit covered the 12 high-detail enemy definitions, the production gameplay roster, enemy schema/behavior registry/system and compatibility path, monster attack/engagement/normalization path, projectile system, shared simulation/types/context, and the monster/enemy/projectile/horde tests named in the prompt.

The audited baseline had four native Elites plus two cross-role Elites. Alien, Fish, Ninja, and Demon were melee-only; Cactoro and Yeti were ranged-only. All six Bosses already used ordered mixed patterns through `attack.bossCue`. Ordinary melee used horizontal range only, projectile aim discarded target height, enemy projectile collision sampled only the end position, and an unusable preferred melee pattern reduced pursuit speed to 60%.

## Authored content

All featured Elites and Bosses now use `attack.type = mixed`, `selection.mode = orderedCycle`, an identity melee pattern followed by an identity ranged pattern, and `attack.mixedCue`. `attack.bossCue` remains registered as a temporary compatibility alias.

### Exact speeds

| Identity | Elite speed (m/s) | Boss speed (m/s) |
| --- | ---: | ---: |
| Alien | 7.2 | 10.2 |
| Cactoro | 5.2 | 8.4 |
| Fish | 7.6 | 11.4 |
| Ninja | 9.2 | 14.4 |
| Demon | 6.4 | 9.6 |
| Yeti | 5.2 | 8.4 |

These are exact authored values. The runtime does not clamp them back.

### Elite patterns and power preservation

For former contact-DPS primaries, mixed melee `damage × rate` equals the old authored `contactDps`. Former ranged primaries retain their exact damage and cadence. Thus no existing primary loses effective power.

| Identity | Melee: damage @ rate, range | Ranged: damage @ rate, range, projectile, telegraph | Existing primary comparison |
| --- | --- | --- | --- |
| Alien | punch: 5.555555555555555 @ 1.8/s, 2.5m | spit: 10 @ 1/s, 40m, `enemySpitShot`, 1.0s | 5.555… × 1.8 = prior 10 contact DPS |
| Cactoro | slam: 8 @ 0.9/s, 2.5m | needle: 16 @ 0.45/s, 40m, `enemySpitShot`, 1.0s | ranged primary remains 16 @ 0.45/s |
| Fish | bite: 6 @ 2/s, 2.5m | bubble: 12 @ 1/s, 38m, `enemyBoneShot`, 0.9s | 6 × 2 = prior 12 contact DPS |
| Ninja | slash: 5 @ 2.2/s, 2.5m | shuriken: 11 @ 1/s, 36m, `enemyBoneShot`, 0.9s | 5 × 2.2 = prior 11 contact DPS |
| Demon | punch: 5.7894736842105265 @ 1.9/s, 2.5m | fireball: 11 @ 1/s, 40m, `enemyFireball`, 1.0s | 5.789… × 1.9 = prior 11 contact DPS |
| Yeti | heavyStrike: 10 @ 0.75/s, 2.5m | iceBolt: 15 @ 0.5/s, 38m, `enemyIceBolt`, 1.0s | ranged primary remains 15 @ 0.5/s |

The added secondary DPS values stay in the same Elite band: Alien 10, Cactoro 7.2, Fish 12, Ninja 11, Demon 11, and Yeti 7.5.

### Boss patterns

Boss pattern damage/cadence was preserved; only the requested speed and shared behavior ID changed.

| Identity | Melee: damage @ rate, range | Ranged: damage @ rate, range, projectile, telegraph |
| --- | --- | --- |
| Alien | punch: 28 @ 0.9/s, 4m | spit: 20 @ 0.45/s, 40m, `enemySpitShot`, 1.0s |
| Cactoro | slam: 26 @ 0.8/s, 4m | needle: 24 @ 0.4/s, 40m, `enemySpitShot`, 1.1s |
| Fish | bite: 30 @ 0.9/s, 4m | bubble: 18 @ 0.5/s, 38m, `enemyBoneShot`, 0.9s |
| Ninja | slash: 26 @ 1/s, 4m | shuriken: 18 @ 0.5/s, 36m, `enemyBoneShot`, 0.9s |
| Demon | punch: 30 @ 0.8/s, 4m | fireball: 22 @ 0.4/s, 40m, `enemyFireball`, 1.0s |
| Yeti | heavyStrike: 34 @ 0.6/s, 4m | iceBolt: 26 @ 0.3/s, 40m, `enemyIceBolt`, 1.2s |

Ranged colors are identity-matched between each Elite/Boss pair. Elite mixed damage continues to use the spawn-time level damage multiplier; Boss damage retains its fixed authored exception.

## Behavior algorithm

At the start of a new cycle, the runtime begins at the ordered preferred-pattern index and scans forward cyclically at most once through the pattern list. The first currently usable pattern wins. This makes an out-of-range preferred melee fall forward to ranged, while an unavailable ranged preference can fall forward to melee.

An already active telegraph/fire cycle completes consistently. If no pattern is usable, no attack phase or cooldown is created and movement continues at full authored speed. The former unavailable-melee `runtime.speed *= 0.6` branch is removed. Movement is held only while an in-range melee pattern is actually executing.

The shared cue emits `enemyTelegraph` / `enemyFire` and enemy projectile semantics for Elites, and `bossTelegraph` / `bossFire` and boss semantics for Bosses. Elite attacks therefore do not announce or sound like Boss attacks.

## Movement hardening

Movement substeps apply only to Elites and Bosses. A high-tier movement update is divided so no substep exceeds 0.55m; ordinary fodder retains the previous single-step cost. Every substep preserves terrain/cliff validation and world-circle collision, and the step stops at the first invalid world result. A swept horizontal tank-circle test prevents a fast Elite/Boss from crossing through the tank between endpoints.

Animation cadence uses actual high-tier displacement over elapsed time rather than the intended velocity, so collision stops and substepping do not produce false locomotion speed. Focused 30Hz tests cover the 14.4m/s Ninja Boss, walls, corners, a narrow alley, cliffs, and tank crossing.

## Attack geometry

- A shared tank hurt volume defines a vertical capsule with 0.6m radius and a centerline from `tank.y + 0.55m` to `tank.y + 1.55m`.
- Enemy projectile direction is normalized in three dimensions from the attack socket to the hurt-volume center.
- Enemy projectiles test the entire previous-to-proposed segment against the expanded tank capsule, obstacle AABBs, and sampled/binary-refined terrain.
- The earliest tank/world time of impact wins; world wins exact ties. Tank damage remains server/simulation authoritative.
- Melee start and impact revalidation require horizontal range and vertical overlap with the shared hurt volume, preventing attacks through floors, roofs, and jump separation.

## Content generation

The source table and schema were edited, then the roster generator and canonical content-pack generation were run. High-detail output was generated; files were not manually combined. The generated pack validates 51 monster definitions, including all six Elite and six Boss roles.

## Verification

| Command/suite | Result |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS; client and server bundles built (Vite large-chunk advisory only) |
| Monster/enemy/projectile focused suite | PASS: 8 files, 108 tests |
| New mixed-combat suite | PASS: 23 tests |
| New projectile-geometry suite | PASS: 4 tests |
| `npm run test:horde` | PASS: 13 files, 110 tests |
| `npm run test:netcode` | PASS: 7 files, 44 tests |
| Updated core-loop/projectile-color contracts | PASS: 2 files, 6 tests |
| `npm test -- --reporter=dot` | Repository-wide result: 183 files passed, 6 failed; 1433 tests passed, 7 failed |

The seven full-suite failures are outside this workstream: three existing Driver predictor pending-queue expectations, two MonsterPack importer cases requiring the absent local proprietary ZIP, the demo golden fixture, and a baseline assertion that the concurrently modified asset manifest must be empty. The dedicated netcode suite passes when run independently. No Elite/Boss combat, movement, or projectile geometry test failed.

The identity suite explicitly covers all six Elite and six Boss definitions, far/close selection, cyclic fallback, no-cycle/full-speed behavior outside all ranges, tier-correct semantic events, 3D aim, vertical melee rejection, and the shared Single Player/multiplayer authoritative behavior path. Projectile tests cover a fleeing/crossing tank, airborne separation, tunneling, wall-before-tank, and tank-before-wall. Movement tests cover walls, corners, narrow passages, cliffs, and tank crossing.

## Browser observations

The built application was exercised in the in-app browser against the authoritative main-stage server:

- Single Player entered a live production-mode run and rendered the gameplay HUD, tank integrity, stage timer, tactical panel, terrain, and active enemy pressure without a startup or render error.
- A second browser client joined a six-character room as Gunner while the first remained Driver. Both clients showed the correct seat assignments, readied successfully, entered the same match lifecycle, and displayed the same terminal state.
- An accelerated server clock was used to shorten phase reach. With idle inputs it caused the shared chassis to be destroyed before a useful Elite/Boss visual pass, so it is not claimed as evidence for all 12 live identity encounters. Those identity, range, fleeing, height, wall, and authority cases are instead covered deterministically by the focused simulation suites above. A complete hands-on balance/feel pass for every identity remains a human playtest item.

## Exclusions and workspace isolation

This workstream does not change monster scale, minimap art, horde spawn policy, rarity, chat, or chest beacons. The shared worktree contained concurrent changes for deployment, tank assets, tactical-map, reward-feedback, progression, and other workstreams; they were preserved and are not part of this implementation.
