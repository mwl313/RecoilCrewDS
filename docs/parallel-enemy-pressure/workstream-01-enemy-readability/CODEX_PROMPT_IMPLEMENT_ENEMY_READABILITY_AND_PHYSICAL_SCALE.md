# Codex Prompt — Enemy Readability & Physical Scale V1

Repository:

```text
https://github.com/mwl313/RecoilCrewDS
```

Branch:

```text
feature/enemy-readability-scale
```

Binding design:

```text
docs/parallel-enemy-pressure/workstream-01-enemy-readability/ENEMY_READABILITY_AND_PHYSICAL_SCALE_DESIGN.md
```

## Mission

Increase ordinary monster readability by enlarging fodder/specialist physical size to approximately:

```text
small   1.20m
medium  1.80m
large   2.00m
```

The enlarged body must drive:
- rendering;
- hitbox;
- collision height;
- spawn clearance;
- melee engagement;
- shadow;
- projectile socket;
- world-UI anchor.

Keep elite and boss final size at their current intended scale.

Add a cheap instanced ground-presence treatment:
- ordinary dark red;
- elite violet;
- boss crimson/pale.

Do not change attacks, speeds, minimap, progression, horde pressure, chat, or chest beacons.

---

## 1. Audit current branch

```bash
git fetch origin --prune
git status --short
git rev-parse HEAD
git rev-parse origin/main
```

Confirm this worktree began from the shared base SHA.

Read at minimum:

```text
src/shared/monsters/monsterNormalization.ts
src/generated/monsterDimensions.generated.ts
scripts/tools that generate monster dimensions
src/client/enemies/
src/client/app/entityViewFactory.ts
src/client/app/entityViewRegistry.ts
src/client/enemies/instancedEnemyRenderer.ts
src/shared/monsters/engagementGeometry.ts
src/shared/monsters/meleeReservations.ts
src/shared/enemies/enemySystem.ts
src/shared/enemies/enemyBehavior*
src/shared/horde/spawnPlanner.ts
content/animation-lod-policies/
tests/animation
tests/monsters
tests/horde
```

Find every consumer of:
```text
resolveMonsterDimensions
collisionRadius
collisionHeight
spawnClearanceRadius
engagementRadius
shadowRadius
projectileSocket
```

---

## 2. Implement tier-aware readability scale

Do not simply change the global base heights if that also enlarges elite/boss final dimensions.

Implement a single authoritative tier-aware policy.

Target ordinary sizes:
```text
fodder/specialist small   ≈1.20
fodder/specialist medium  ≈1.80
fodder/specialist large   ≈2.00
```

Elite/boss:
```text
preserve current final dimensions
```

Update the source generator/math and regenerate.

Never manually patch generated values.

---

## 3. Verify hitbox parity

Prove representative ordinary enemies use the new resolved:
- width/depth;
- collision radius;
- collision height;
- spawn clearance;
- engagement width;
- socket.

Do not add a second visual-only scale in Three.js.

---

## 4. Add ground-presence renderer

Prefer one bounded instanced renderer.

Semantic styles:
```text
ordinary:
dark red soft disc/ring, stable

elite:
violet segmented ring

boss:
crimson ring + restrained pale outer treatment
```

Requirements:
- terrain aligned;
- depth tested;
- depthWrite false;
- no z-fighting;
- distance faded;
- no through-wall overlay;
- no DOM/Sprite per enemy;
- reduced-motion safe;
- reset/dispose cleanly.

Use current semantic enemy classification rather than ownership priority alone.

---

## 5. Preserve art fidelity

Do not:
- recolor source materials globally;
- add blanket emissive;
- raise global exposure/fog;
- flatten multi-material assets;
- add full-screen outlines.

---

## 6. Tests

Add focused tests for:
- exact tier-aware size targets;
- elite/boss unchanged;
- dimension-derived hitboxes;
- socket scaling;
- spawn clearance;
- melee geometry;
- renderer instance bounds;
- semantic ring style;
- reset/dispose.

Run:

```bash
npx tsc --noEmit
npm run build
npm test
```

plus focused monster/animation/horde suites.

Run content generation through the actual repository command.

---

## 7. Browser qualification

Test:
- small/medium/large ordinary monsters;
- elite and boss;
- narrow urban roads;
- 100–200 enemies;
- Single Player;
- Driver and Gunner clients.

Capture before/after screenshots from identical camera positions.

---

## 8. Report

Create:

```text
docs/parallel-enemy-pressure/workstream-01-enemy-readability/ENEMY_READABILITY_IMPLEMENTATION_REPORT.md
```

Include:
- start/end SHA;
- exact final sizes;
- elite/boss preservation proof;
- files changed;
- generated command;
- collision/socket/clearance proof;
- screenshots;
- performance;
- tests;
- exclusions confirmed.
