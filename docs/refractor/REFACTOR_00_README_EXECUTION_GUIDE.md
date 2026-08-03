# Recoil Crew DS — Modular Data-Driven Refactor Pack
## Execution Guide

**Stack:** TypeScript, Vite, Three.js, authoritative Node.js + `ws`  
**Goal:** Convert the working score-attack prototype into a reusable split-control tank framework without breaking the current Demo mode.

## Why this is staged

This migration crosses authoritative simulation, game modes, runtime stats, weapons, enemies, items, JSON content, assets, presentation, replication, and prediction. Do not run it as one enormous prompt.

Use the phase prompts sequentially. Every phase must:

1. Start from a passing repository.
2. Change one architectural boundary.
3. Preserve the current Demo.
4. Run the complete regression gate.
5. Update `REFACTOR_STATUS.md`.
6. Stop before the next phase.

## Authority documents

Read before every phase:

```text
REFACTOR_01_PHILOSOPHY_AND_TARGET_ARCHITECTURE.md
REFACTOR_02_DATA_DRIVEN_CONTENT_AND_STATS_SPEC.md
REFACTOR_03_NON_BREAKING_MIGRATION_PLAN.md
REFACTOR_04_ACCEPTANCE_AND_REGRESSION_MATRIX.md
```

Copy `REFACTOR_STATUS_TEMPLATE.md` to `REFACTOR_STATUS.md` and maintain it.

## Phase prompts

Run in order:

```text
CODEX_REFACTOR_PHASE_0_BASELINE_AUDIT.md
CODEX_REFACTOR_PHASE_1_CORE_CONTENT_RUNTIME.md
CODEX_REFACTOR_PHASE_2_STATS_AND_DEMO_MODE.md
CODEX_REFACTOR_PHASE_3_WEAPONS_DAMAGE_PROJECTILES.md
CODEX_REFACTOR_PHASE_4_ENEMIES_ITEMS_OBJECTIVES.md
CODEX_REFACTOR_PHASE_5_CLIENT_PRESENTATION_ASSETS.md
CODEX_REFACTOR_PHASE_6_PROOF_CONTENT_FINAL_CLEANUP.md
```

## Universal phase gate

```bash
npm run build
npm test
npm run test:e2e
npm run test:loop
```

Passing fewer required tests than the prior phase is not acceptable unless a test was deliberately replaced by stronger equivalent coverage and the reason is documented.

## Must remain working throughout

- Create/join room and ready flow
- Driver and Gunner roles
- Driver prediction and reconciliation
- Gunner aim and turret prediction
- Independent TPS cameras
- Authoritative recoil and weapons
- Current enemies, scrap, combo, JACKPOT
- Wipeout/respawn
- 90-second Demo
- Results/rematch
- Practice
- PIP
- Browser deployment

## Refactor rules

- Do not rewrite from scratch or change stacks.
- Extract behavior before redesigning it.
- Use temporary compatibility adapters with a removal phase.
- Keep server authority and local camera ownership.
- JSON defines content and composition.
- TypeScript defines reusable algorithms and behavior primitives.
- Do not build arbitrary scripting, a full ECS, microservices, or speculative plugin infrastructure.
- Invalid authoritative content must fail loudly.
- Visual assets may use documented fallbacks.

## Intended result

The repository becomes a reusable split-control tank framework. The current game remains included as:

```text
mode.demoScoreAttack
```

It is the default Demo and permanent regression fixture, not the architecture itself.
