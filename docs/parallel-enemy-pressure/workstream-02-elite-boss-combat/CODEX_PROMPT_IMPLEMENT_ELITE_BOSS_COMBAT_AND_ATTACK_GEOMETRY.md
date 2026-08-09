# Codex Prompt — Elite & Boss Combat Overhaul

Repository:

```text
https://github.com/mwl313/RecoilCrewDS
```

Branch:

```text
feature/elite-boss-combat
```

Binding design:

```text
docs/parallel-enemy-pressure/workstream-02-elite-boss-combat/ELITE_BOSS_COMBAT_AND_ATTACK_GEOMETRY_DESIGN.md
```

## Mission

Implement:

```text
all six Elites gain identity-matched melee + ranged patterns
Elites and Bosses share mixed-pattern behavior
invalid melee preference falls back to valid ranged attack
no out-of-range 0.6× chase slowdown
Elite speed ×2
Boss speed ×3
3D projectile aim
swept tank/world collision
vertical melee overlap
```

Do not touch monster scale, minimap art, horde spawn policy, rarity, chat, or chest beacons.

---

## 1. Audit current main-derived branch

Record SHA and inspect:

```text
content/enemies/*high-detail*.json
content/enemy-gameplay-rosters/quaternius.mainStage.json
src/shared/content/schemas/enemy.ts
src/shared/enemies/enemyBehaviors.ts
src/shared/enemies/enemyBehaviorRegistry.ts
src/shared/enemies/enemySystem.ts
src/shared/enemies/monsterCompat.ts
src/shared/monsters/monsterAttack.ts
src/shared/monsters/engagementGeometry.ts
src/shared/monsters/monsterNormalization.ts
src/shared/projectiles/projectileSystem.ts
src/shared/types.ts
src/shared/sim/systems/systemContext.ts
tests/monsters
tests/enemies
tests/projectiles
tests/horde
```

Verify exact current definitions before editing.

---

## 2. Apply exact speed values

Elites:

```text
Alien    7.2
Cactoro  5.2
Fish     7.6
Ninja    9.2
Demon    6.4
Yeti     5.2
```

Bosses:

```text
Alien    10.2
Cactoro   8.4
Fish     11.4
Ninja    14.4
Demon     9.6
Yeti      8.4
```

Do not silently clamp them back.

---

## 3. Convert Elites to mixed kits

Every featured Elite gets:
- identity melee;
- identity ranged;
- ordered pattern preference;
- shared mixed behavior.

Preserve each Elite's existing power band.

Do not copy Boss raw damage blindly.

Document exact chosen Elite pattern damage/cadence and show that the existing primary attack did not lose effective power.

---

## 4. Refactor boss-only behavior

Prefer a generic:

```text
attack.mixedCue
```

with temporary alias compatibility.

It must emit:
- Elite semantic events for Elite;
- Boss semantic events for Boss.

Do not make Elite shots sound/announce as Boss attacks.

---

## 5. Valid-pattern algorithm

Implement cyclic preferred-pattern selection with scan-forward fallback.

Delete the unavailable-melee `runtime.speed *= 0.6` behavior.

Outside all ranges:
- pursue at full authored speed;
- no fake attack cycle.

---

## 6. Harden movement

At up to 14.4m/s:
- add Elite/Boss movement substeps if required;
- keep obstacle/cliff resolution;
- avoid tank crossing;
- update animation cadence.

Do not globally increase simulation cost for all fodder without evidence.

---

## 7. Fix attack geometry

Implement:
- 3D socket-to-tank-center aim;
- shared tank hurt capsule/ellipsoid;
- swept segment collision;
- earliest tank/world TOI;
- vertical overlap for melee.

Server remains authoritative.

---

## 8. Content generation

Edit source content/schema/generator only.

Run canonical generation.

Do not manually combine generated files.

---

## 9. Tests and browser qualification

Required test cases from the design.

Run:

```bash
npx tsc --noEmit
npm run build
npm test
```

plus focused enemy/projectile/monster/netcode suites.

Manual:
- each of 6 Elite identities;
- each of 6 Boss identities;
- far/close attack selection;
- fleeing tank;
- hills/roofs/jump;
- walls;
- Single Player;
- Driver/Gunner.

---

## 10. Report

Create:

```text
docs/parallel-enemy-pressure/workstream-02-elite-boss-combat/ELITE_BOSS_COMBAT_IMPLEMENTATION_REPORT.md
```

Include:
- SHA;
- exact content table;
- pattern values;
- speed values;
- behavior algorithm;
- movement substep decision;
- attack geometry;
- test output;
- browser observations;
- exclusions.
