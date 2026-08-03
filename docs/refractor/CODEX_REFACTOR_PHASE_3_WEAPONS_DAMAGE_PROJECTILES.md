# Codex Prompt — Refactor Phase 3
## Modular Loadouts, Weapons, Projectiles, Damage, and Recoil

Prerequisite: Phase 2 complete; MatchRules and StatService are authoritative; Demo mode is selected by ID.

Read all authority documents and `REFACTOR_STATUS.md`.

# Shared governance

- Read every refactor authority document before editing.
- Read and update `REFACTOR_STATUS.md`.
- Inspect the current repository; do not assume paths are unchanged.
- Do not rewrite the game or change stacks.
- Preserve server authority, Driver prediction, Gunner prediction, independent TPS cameras, and the complete Demo loop.
- Do not start a later phase.
- Do not delete compatibility code before all callers migrate.
- Do not weaken tests.
- Run all four phase-gate commands.
- Return a truthful completion report.


## Goal

Make current and future weapons data-driven without breaking machine gun, cannon, JACKPOT, recoil, cooldowns, or networking.

## Required work

1. Introduce generic Gunner actions:
   ```text
   primary
   secondary
   ability
   ```
   Keep an additive adapter from `mg`, `cannon`, and `charge`.
2. Map Demo loadout:
   ```text
   primary → weapon.machineGun
   secondary → weapon.mainCannon
   ability → weapon.jackpotShell
   ```
3. Implement:
   - `WeaponDefinition`
   - `WeaponRuntimeState`
   - `WeaponRegistry`
   - `WeaponBehaviorRegistry`
   - `WeaponSystem`
   - `LoadoutDefinition`
   - `LoadoutRuntime`
4. Migrate current weapons to JSON definitions.
5. Add reusable behaviors at minimum:
   - `weapon.hitscan`
   - `weapon.projectile`
   - `weapon.chargeProjectile`
6. Implement:
   - `ProjectileDefinition`
   - `ProjectileBehaviorRegistry`
   - `ProjectileSystem`
7. Implement:
   - `DamageRequest`
   - `DamageResult`
   - `DamageSource`
   - `DamageTags`
   - `DamageSystem`
8. Weapons/projectiles emit damage requests; damage emits applied/killed events.
9. Scoring and drops react to events rather than weapon code directly owning all consequences.
10. Represent recoil as a reusable authoritative effect; preserve brace and JACKPOT interactions.
11. Emit semantic presentation events such as `weapon.fired`, `projectile.impacted`, `damage.applied`, `entity.killed`, and `recoil.applied`.

## Tests

- Loadout resolution
- Generic input mapping
- Cooldown authority
- Duplicate prevention
- Stale input clearing
- Hitscan/projectile/charge behavior
- Damage once
- Kill event once
- Recoil and brace parity
- Current Demo parity
- A test weapon using an existing behavior without editing `MatchRuntime`

## Forbidden

No full arsenal, balance redesign, enemy migration beyond DamageSystem adaptation, or premature removal of old input fields.

## Gate/report

Run all gates. Report input transition, definitions, behaviors, damage/recoil/event flow, adapters, parity, and Phase 4 prerequisites.
