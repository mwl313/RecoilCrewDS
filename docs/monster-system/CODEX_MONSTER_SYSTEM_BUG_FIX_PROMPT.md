# Codex Prompt — Fix the Monster-System Integration Bugs

Repository:

```text
https://github.com/mwl313/RecoilCrewDS
```

Target branch:

```text
monster-system
```

Binding documents:

```text
docs/monster-system/RECOIL_CREW_MONSTER_SYSTEM_DESIGN.md
docs/monster-system/MONSTER_CORE_LOOP_INTEGRATION_DESIGN.md
docs/monster-system/MONSTER_SYSTEM_BUG_FIX_SPECIFICATION.md
```

The bug-fix specification is the latest authority for implementation defects and timer behavior.

---

# 1. Objective

Fix the confirmed monster-system bugs without adding improvements or redesigns.

This task is complete only when:

- Melee monsters pursue correctly.
- Generalized monsters render with exact identities in multiplayer.
- Boss and elite scale/collision are correct.
- Monster families stand correctly on terrain.
- Wave compositions preserve every authored entry.
- Farming time pauses during elite waves.
- Phase-local spawn progression works.
- Boss intro is authoritative.
- XP shards are visible, collected, and cleaned up.
- Full Single Player and multiplayer qualification passes.

Do not rebalance the full roster, redesign the HUD, or work on map art.

---

# 2. Repository safety

Before editing:

```bash
git fetch origin
git status --short
git branch --show-current
git rev-parse HEAD
git log --oneline --decorate -20
```

Requirements:

- Work only on `monster-system`.
- Preserve current valid work.
- Do not merge into `main`.
- Keep Demo mode and its golden fixture unchanged.
- Do not import unrelated UI or map changes.
- Inspect and preserve any local worktree changes.

Record the starting SHA in:

```text
docs/monster-system/MONSTER_SYSTEM_BUG_FIX_REPORT.md
```

---

# 3. Audit before editing

Read at minimum:

```text
docs/monster-system/RECOIL_CREW_MONSTER_SYSTEM_DESIGN.md
docs/monster-system/MONSTER_CORE_LOOP_INTEGRATION_DESIGN.md
docs/monster-system/MONSTER_SYSTEM_BUG_FIX_SPECIFICATION.md
docs/monster-system/MONSTER_CORE_LOOP_IMPLEMENTATION_REPORT.md
docs/monster-system/MONSTER_CORE_LOOP_QUALIFICATION_REPORT.md

src/shared/net/horde/hordeProtocol.ts
src/shared/net/horde/hordeReplication.ts
src/client/app/networkStatePresenter.ts
src/client/app/entityViewRegistry.ts
src/client/app/entityViewFactory.ts
src/client/enemies/instancedEnemyRenderer.ts

src/shared/monsters/monsterNormalization.ts
src/generated/monsterDimensions.generated.ts
scripts/generate-monster-dimensions.ts
docs/monsterpack10/source-manifests/monster_catalog.json

src/shared/enemies/enemySystem.ts
src/shared/enemies/enemyBehaviors.ts
src/shared/enemies/enemyRuntimeState.ts
src/shared/enemies/monsterCompat.ts
src/shared/monsters/meleeReservations.ts
src/shared/monsters/monsterSemantics.ts

src/shared/horde/hordeDirector.ts
src/shared/stage/stageDirector.ts
src/shared/stage/stageTypes.ts
content/horde/stageSequenceProduction.json
content/horde/spawnPackProductionWaveCohort.json
content/horde/spawnPackProductionBossEscort.json
content/horde/waveProduction1.json
content/horde/waveProduction2.json
content/horde/bossWaveProduction.json
content/horde/farmingPhase1.json
content/horde/farmingPhase2.json
content/horde/farmingPhase3.json

src/shared/pickups/xpShardSystem.ts
src/shared/progression/progressionSystem.ts
src/client/prediction/remoteInterpolator.ts
src/shared/types.ts
content/xp-pickup-definitions/default.json

tests/
e2e/
```

Confirm each defect before modifying it.

---

# 4. Required phased strategy

```text
Phase 1 — Multiplayer identity and wave composition
Phase 2 — Scale, collision, and grounding
Phase 3 — Movement and behavior ordering
Phase 4 — Timer, phase pacing, and boss intro
Phase 5 — XP presentation and cleanup
Phase 6 — End-to-end qualification
```

Every phase must:

- Build
- Pass focused tests
- End in a focused commit
- Update the bug-fix report
- Leave a clean handoff

Do not skip a live integration phase because a helper unit test passes.

---

# PHASE 1 — Multiplayer identity and wave composition

## 1A. Exact definition identity

Replace legacy-only generalized-monster reconstruction with a generated stable enemy-definition index.

Materialize data must preserve:

```text
entity ID
exact defId index
type
position/yaw
HP/max HP
flags
presentation profile
required ownership/leader data
semantic action state
```

Client reconstruction must retain:

```ts
type: 'monster'
defId: exact enemy definition
presentationProfileId: exact profile
```

Do not manually add all monster slugs to the legacy type switch.

## 1B. Aggregate identity

Update aggregate-sector encoding to retain exact definition identity. No Scrap Bug fallback.

## 1C. Wave entry iteration

Fix opening and reinforcement spawning:

```ts
for (const entry of pack.entries) {
  resolve entry slot
  spawn entry.count of that definition
  preserve formationRole
}
```

Do not sum counts and spawn everything as `entries[0]`.

Boss escorts must preserve the Phase 3 close, ranged, and specialist entries.

## 1D. Tests

Add protocol round trips for:

```text
ordinary
ranged
specialist
elite
boss
aggregate
```

Add exact opening, reinforcement, and escort composition tests.

Update multiplayer browser diagnostics to verify actual rendered definition/profile identity.

## 1E. Commit

```text
monster-fix: preserve monster identity and wave composition
```

---

# PHASE 2 — Scale, collision, and grounding

## 2A. Dimension generation

Correct the generator so it:

- Uses the correct vertical axis.
- Preserves neutral-pose foot/ground offset.
- Generates valid source width, height, and depth.
- Never hardcodes every ground offset to zero.

Regenerate:

```text
src/generated/monsterDimensions.generated.ts
```

## 2B. Central dimensions

Extend `resolveMonsterDimensions()` to provide:

```text
normalization scale
tier scale
final scale
final dimensions
ground offset
collision
spawn clearance
engagement radius
shadow radius
projectile socket
```

## 2C. Render integration

Apply final scale to monster rigs and correct visual Y using the resolved ground offset.

Near/far/aggregate variants must share the same world envelope.

## 2D. Gameplay integration

Use resolved dimensions for:

- `radiusFor`
- Collision
- Spawn clearance
- Reservation diameter
- Stopping distance
- Projectile sockets
- Elite/boss separation

Remove the generalized-monster `0.8` fallback from live production paths.

## 2E. Validation

Create or update a flat-plane gallery.

Assert:

```text
small ordinary ≈ 1.02 m
medium elite ≈ 4.59 m
large boss ≈ 8.50 m
foot contact = 0–0.05 m above plane
```

## 2F. Commit

```text
monster-fix: apply normalized scale collision and grounding
```

---

# PHASE 3 — Movement and behavior

## 3A. Melee locomotion

Replace unconditional sideways movement with:

```text
CHASE
STAGE
RESERVED_APPROACH
ATTACK_HOLD
```

Rules:

```text
far → direct pursuit
near without reservation → radial staging + controlled circling
reserved → approach assigned attack position
inside tolerance → hold and attack
```

Use resolved collision dimensions. Prevent passing through the tank. Do not add bespoke per-monster AI.

## 3B. Ranged hysteresis

Use a reusable hold band:

```text
innerRatio = 0.80
outerRatio = 1.10
```

Approach outside outer range, retreat inside inner range, otherwise hold or strafe.

## 3C. Speed ordering

Apply progression/relic speed modifiers before movement integration.

## 3D. Semantic ordering

Update semantic actions after current-frame movement and attack behavior. Death overrides all.

## 3E. Tests

Use multi-second movement simulations, not one-update assertions.

## 3F. Commit

```text
monster-fix: correct pursuit engagement and action ordering
```

---

# PHASE 4 — Timer, pacing, and boss intro

## 4A. Pause countdown during waves

Set:

```json
"pauseCountdownDuringWave": true
```

Required behavior:

```text
Wave 1 starts at 120
90 seconds of wave time pass
remaining stays 120
leader dies
farming resumes at 120

Wave 2 starts at 60
90 seconds of wave time pass
remaining stays 60
```

## 4B. Phase-local progress

Use active phase-local farming time, excluding elite-wave duration.

Test start/mid/end interpolation for all three phases.

## 4C. Authoritative boss intro

During intro:

```text
no movement
no collision damage
no targeting
no telegraph
no projectile
no attack-cycle progress
```

After the authored duration, spawn or activate boss and escorts exactly once.

## 4D. HUD correctness

Show a frozen timer with an active-wave indication. Preserve `BOSS INCOMING`. Do not redesign the HUD.

## 4E. Commit

```text
monster-fix: pause wave clock and gate boss activation
```

---

# PHASE 5 — XP presentation and cleanup

## 5A. Remote-frame data

Add `xpShards` to the remote-frame contract for multiplayer and Single Player.

## 5B. Renderer

Add a bounded instanced XP-shard renderer.

Minimum visual behavior:

```text
visible above grass
hover/pulse/rotate
visible magnet travel
collection pop
```

## 5C. Collection feedback

On collection:

- Grant XP once.
- Emit pickup event once.
- Trigger VFX/audio once.
- Remove after a short grace.

Connect or replace the unused XP pickup event helper.

## 5D. Cleanup

Remove collected and expired shards. Prevent unbounded authoritative and client state growth.

## 5E. Tests

Test spawn, frame inclusion, visibility, magnet movement, one XP grant, one event, collection removal, expiry removal, and SP/MP agreement.

## 5F. Commit

```text
monster-fix: render collect and clean up xp shards
```

---

# PHASE 6 — Qualification

## 6A. Single Player

Run a full production round and verify:

- Exact identities
- Wave compositions
- Timer pause
- Elite/boss scale
- Ground contact
- XP visibility
- Boss intro
- Victory
- Rematch

## 6B. Multiplayer

Use two clients and verify:

- Exact same selected run
- Exact generalized identities on both clients
- No Scrap Bug fallback
- XP visible to both clients
- Same timer freeze
- Same encounter state
- Correct boss identity and scale
- Victory and rematch

## 6C. Long-wave tests

Keep each elite alive for 90 seconds and verify the frozen timer values.

## 6D. Featured matrix

Every shared featured identity must work as both elite and boss, including model, scale, ground contact, attacks, encounter bar, death, and result behavior.

## 6E. State-growth test

Run a long high-kill session and verify bounded XP and renderer state, no stale rigs, no stale reservations, and no stale boss state.

## 6F. Reports

Update:

```text
docs/monster-system/MONSTER_SYSTEM_BUG_FIX_REPORT.md
docs/monster-system/CORE_LOOP_PHASE_HANDOFF.md
```

Include actual browser screenshots.

## 6G. Commit

```text
monster-fix: qualify corrected production monster loop
```

---

# 5. Required commands

Inspect `package.json` and run exact available equivalents.

At minimum:

```bash
npx tsc --noEmit
npm run generate:content-pack
npm run generate:presentation-content
npm run generate:map-profiles
npm test
npm run build
npm run test:demo
npm run test:horde
npm run test:horde:benchmark
npm run test:netcode
npm run test:progression
npm run validate:enemy-animations
npm run test:monsterpack-import
npm run test:monsterpack-rendering
```

Run production Single Player and multiplayer browser tests. Do not claim a pass unless actually run.

---

# 6. Forbidden shortcuts

Do not:

- Replace generalized monsters with Scrap Bugs.
- Add every monster to a manual legacy switch.
- Use presentation profile as the only gameplay identity.
- Apply one global Y offset.
- Scale only visuals or only collision.
- Let melee enemies circle from spawn distance.
- Let ranged enemies flip direction every update.
- Collapse pack entries to the first definition.
- Continue farming countdown during elite waves.
- Count elite-wave time as farming progress.
- Let the boss simulate during intro.
- Grant XP directly to hide missing pickup rendering.
- Let XP shards accumulate forever.
- Let client visuals grant XP.
- Rebalance all ordinary monsters.
- Add new boss mechanics.
- Redesign the HUD.
- Modify map generation.
- Update the Demo golden to hide regressions.
- Merge into `main`.

---

# 7. Final acceptance checklist

```text
[ ] Exact generalized identity survives multiplayer
[ ] Aggregate identity survives multiplayer
[ ] No generalized monster renders as Scrap Bug

[ ] Wave packs preserve each entry
[ ] Reinforcements preserve each entry
[ ] Boss escorts preserve Phase 3 composition

[ ] Normalized visual scale applied
[ ] Elite ×3 visible
[ ] Boss ×5 visible
[ ] Collision matches scale
[ ] Ground offsets applied
[ ] Flat-plane gallery passes

[ ] Melee fodder chases tank
[ ] Melee staging works near tank
[ ] Reservation owners attack
[ ] Ranged hold band prevents jitter
[ ] Speed debuff changes displacement
[ ] Semantic action timing corrected

[ ] Wave 1 timer freezes at 120
[ ] Wave 2 timer freezes at 60
[ ] Timer resumes exactly
[ ] Long wave does not trigger immediate next wave
[ ] Phase-local ramp works

[ ] Boss intro blocks simulation
[ ] Boss activates once

[ ] XP renders in SP
[ ] XP renders in MP
[ ] XP grants once
[ ] Pickup feedback fires once
[ ] Collected shards removed
[ ] Expired shards removed
[ ] XP state remains bounded

[ ] Full SP round passes
[ ] Full two-client round passes
[ ] Rematch cleanup passes
[ ] Demo regression unchanged
[ ] No improvement work added
[ ] Branch remains unmerged
```

---

# 8. Final response requirements

Report:

1. Starting SHA
2. Final SHA
3. Commits by phase
4. Root cause and fix for every audited defect
5. Multiplayer protocol format
6. Scale/grounding validation
7. Movement simulation results
8. Wave composition results
9. Long-wave timer results
10. Boss intro results
11. XP lifecycle results
12. Single Player qualification
13. Multiplayer qualification
14. Performance/state-growth results
15. Tests actually run
16. Remaining bugs
17. Confirmation improvements were deferred
18. Confirmation Demo unchanged
19. Confirmation branch unmerged
