# Combat Contact Rules

## Tank offense

- Normal movement (including high speed) deals **zero** enemy damage.
- Only the accepted Dash damage window damages enemies by contact.
- The window is authoritative: `TankState.dashDamageT` is set by shared
  kinematics when a Dash is accepted (`dashDamageWindowSeconds`, default
  0.2 s) and decrements every step. `dashPresentationT` is cosmetic and
  never grants damage.

## Data

`content/tanks/default.json`:

```json
{
  "contactDamage": 0,
  "dashContactDamage": 12,
  "dashDamageWindowSeconds": 0.2,
  "dashContactKnockback": 0.92,
  "dashContactPerTargetCooldown": 0.25
}
```

`dashContactDamage` is a real tunable value (one dash kills a Scrap Bug;
two dash it a Rammer). Do not use magic `999`.

## Owner

`src/shared/combat/tankContactCombat.ts` runs every sim step after enemy
movement. It checks overlap, the dash window, per-target cooldown, applies
damage with source `dash`, slows the chassis, pops the enemy, and emits
`dashContact` events with score/combo attribution. Gun Towers (immovable)
are not contact targets.

## Enemy offense

Enemy-to-tank contact attacks are unchanged: Scrap Bugs deal their contact
damage to the tank; Rammers use their telegraphed charge; towers shoot.
`attack.contactRam` no longer contains the tank's offensive ram-kill logic.

## Attribution and stats

```text
DamageSource: dash (tank-caused contact); rammer/bug (enemy attacks)
Stats: dashKills / dashScore (replaces ramKills / ramScore)
```

## Tests

```bash
npx vitest run tests/combat05/dashContact.test.ts
```
