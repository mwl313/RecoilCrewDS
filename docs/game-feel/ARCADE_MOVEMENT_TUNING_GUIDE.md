# Arcade Movement Tuning Guide

All movement values are content-driven through the existing pipeline:

```text
content/tanks/default.json → tank schema → GameConfig → MatchRules →
MovementRulesBlock → stepTankKinematics (server + predictor + Practice)
```

## Tank (`content/tanks/default.json`)

| Field | Default | Effect |
|---|---|---|
| `steerHigh` | 0.9 | High-speed steering rate |
| `normalGrip` | 2.1 | Lateral grip (higher = tighter) |
| `airControl` | 0.55 | Steer multiplier while airborne |
| `airGripMultiplier` | 0.35 | Grip multiplier in the air (momentum) |
| `groundYawDamping` | 3.2 | Yaw-velocity decay on ground (1/s) |
| `airYawDamping` | 2.2 | Yaw-velocity decay in air (longer spins) |
| `gravity` | 13.5 | Vertical acceleration (lower = floatier) |
| `jumpHeight` | 3.0 | Jump launch ≈ √(2·g·height) |
| `rampLaunchSpeed` | 6.5 | Launch when leaving a ramp fast |
| `dashImpulse` | 13.0 | Dash velocity delta |
| `dashCooldown` | 0.8 | Seconds between dashes |
| `dashAirMultiplier` | 0.8 | Dash strength in air |
| `dashMaxHorizontalSpeed` | 33.0 | Dash cap |
| `hardHorizontalSpeedCap` | 35.0 | Shared absolute horizontal cap (dash/recoil/MG) |
| `maxVisualAirPitch` | 0.22 | Airborne visual pitch limit (rad) |
| `maxVisualAirRoll` | 0.28 | Airborne visual roll limit (rad) |
| `visualAirLevelRate` | 4.0 | Blend rate toward air pitch/roll |
| `landingGripSeconds` | 0.12 | Momentum grace after landing |
| `landingGripMultiplier` | 0.35 | Grip scale during the grace window |

## Weapons (`content/weapons/*.json`)

- `weapon.cannonRecoilImpulse` (10.5) / `weapon.mgRecoilImpulse` (0.15):
  recoil magnitude; the direction is the inverse muzzle vector, so aiming
  down launches the tank.
- `weapon.recoilVerticalScale` (1.0): vertical component multiplier.
- `weapon.recoilGroundLaunchThreshold` (0.25): upward recoil above this
  leaves the ground.
- Splash knockback: `splashKnockbackMax/Min`, `splashKnockbackVertical`,
  `splashKnockbackFalloffExponent`, `splashKnockbackRadiusMultiplier`,
  `splashTankKnockbackMultiplier` (keep 0 to preserve no-self-knockback).

## Enemies (`content/enemies/*.json`)

`knockback` block per enemy (optional; shared defaults apply):

- `immovable` — Gun Tower true (ignores all impulses).
- `horizontalResistance` / `verticalResistance` — impulse scaling.
- `groundDrag` / `airDrag` — slide/air decay.
- `gravityScale` — airborne fall rate.
- `fallDamageSpeed` / `fallDamage` — landing impact threshold/damage.

## Loadout (`content/loadouts/default.json`)

- `turret.minPitch` is **−1.45 rad** (≈ −83°), so the gun can aim almost
  straight down. Recoil is the inverse muzzle vector, so a near-vertical
  downward shot is a near-vertical upward launch (~10.5 m/s of vertical
  velocity at the default cannon recoil) — a cannon takeoff.
- The shell still explodes at the ground for such shots, so vertical
  takeoffs also cost the normal cannon self-splash damage (5 integrity).
  The muzzle safety clamp keeps the shell from spawning inside terrain.

## Tuning tips

- Raising `airControl`/`airGripMultiplier` makes air steering snappier but
  less floaty; lowering gravity increases airtime for both jumps and
  cannon launches.
- Keep `dashMaxHorizontalSpeed` ≤ `hardHorizontalSpeedCap`; the cap is a
  safety net, not a soft drag.
- After changing any tank/weapon/enemy value, run `npm test` (parity +
  movement suites), then `npm run demo:write` only if the deterministic
  Demo intentionally changes.
