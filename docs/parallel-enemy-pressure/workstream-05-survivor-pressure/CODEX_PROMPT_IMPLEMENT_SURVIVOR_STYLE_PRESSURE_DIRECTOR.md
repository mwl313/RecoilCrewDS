# Codex Prompt — Survivor-Style Pressure Director V1

Repository:

```text
https://github.com/mwl313/RecoilCrewDS
```

Branch:

```text
feature/survivor-pressure-director
```

Binding design:

```text
docs/parallel-enemy-pressure/workstream-05-survivor-pressure/SURVIVOR_STYLE_PRESSURE_DIRECTOR_DESIGN.md
```

## Mission

Implement survivor-style pressure while preserving Recoil Crew authority:

```text
nearby-pressure targets
moving ordinary aggregate sectors
invisible reward-free far recycling
eight angular spawn sectors
multi-anchor pack splits
staggered atomic subgroups
reinforcement pack rotation
persistent Elite/Boss recovery
reward-suppressed maintenance summons
```

Ordinary HP does not need preservation through abstraction.

Elite/Boss state must be preserved.

Do not modify attack patterns, speed values, physical scale, minimap art, rarity/UI feedback, chat, or chest beacons.

---

## 1. Audit

Read:

```text
src/shared/horde/hordeDirector.ts
src/shared/horde/spawnPlanner.ts
src/shared/horde/hordeSectors.ts
src/shared/horde/waveController.ts
src/shared/horde/populationManager.ts
src/shared/horde/spawnOwnership.ts
src/shared/enemies/enemyClassification.ts
src/shared/enemies/enemySystem.ts
src/shared/navigation/
src/shared/progression/progressionSystem.ts
src/shared/damage/
src/shared/net/horde/
content/horde/
tests/horde/
scripts/benchmark-enemies.ts
```

Record SHA and current baseline metrics.

---

## 2. Keep ordinary and persistent layers explicit

Ordinary:
- may aggregate/recycle;
- no HP preservation;
- no reward during abstraction.

Persistent:
- Elite/Boss never aggregate/recycle;
- preserve full state.

Use semantic classification.

---

## 3. Add nearby pressure

Implement phase/wave nearby targets and telemetry.

Do not raise hard cap by default.

---

## 4. Move sectors

At 1.5–2Hz:
- flow/direct blend;
- coarse validation;
- stuck recovery.

Keep network sector contract typed and compatible with tactical consumer.

---

## 5. Recycling

Implement bounded 4–8 ordinary/sec only when nearby deficit + global full + far/offscreen conditions hold.

No reward/death hooks.

---

## 6. Multi-anchor atomic plan

Add angular sectors and underfilled-direction scoring.

Reserve whole pack.

Split/stagger 6–8 entity packs.

Replan/refund later subgroup safely.

---

## 7. Rotate reinforcement packs

Stop hardcoding index zero.

Use deterministic selection.

---

## 8. Persistent recovery

Route refresh first; off-camera same-entity re-entry last.

Preserve every state field listed in design.

---

## 9. Maintenance summons

Implement Elite/Boss floors/caps/intervals.

Tag reward suppression centrally.

Spawn around player interception routes.

Purge on leader death.

---

## 10. Tests and benchmarks

Implement full design matrix.

Run:

```bash
npx tsc --noEmit
npm run build
npm test
```

plus horde/netcode/progression suites and enemy benchmarks.

Manual:
- Phase 1/2/3;
- Wave 1/2;
- Boss;
- sustained fleeing;
- fast clear;
- slow clear;
- Single Player;
- Driver/Gunner;
- rematch/reconnect.

---

## 11. Report

Create:

```text
docs/parallel-enemy-pressure/workstream-05-survivor-pressure/SURVIVOR_PRESSURE_DIRECTOR_IMPLEMENTATION_REPORT.md
```

Include:
- SHA;
- architecture;
- targets;
- sector movement;
- recycling;
- multi-anchor behavior;
- summons;
- reward suppression;
- telemetry;
- benchmarks;
- two-client soak;
- exclusions.
