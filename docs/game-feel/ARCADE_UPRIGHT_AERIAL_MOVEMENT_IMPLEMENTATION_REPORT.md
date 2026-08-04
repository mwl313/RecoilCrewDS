# Arcade Upright Aerial Movement — Implementation Report

Date: 2026-08-04 · Branch: `arcade-aerial-movement` (local; not pushed) ·
Contract: `ARCADE_UPRIGHT_AERIAL_MOVEMENT_DESIGN.md` · Plan:
`ARCADE_UPRIGHT_AERIAL_MOVEMENT_IMPLEMENTATION_PLAN.md`

## 1. What changed

### M1 — Data-driven values

- Tank schema/content/config/projection/stat IDs gained:
  `airGripMultiplier`, `groundYawDamping`, `airYawDamping`,
  `hardHorizontalSpeedCap`, `maxVisualAirPitch`, `maxVisualAirRoll`,
  `visualAirLevelRate`, `landingGripSeconds`, `landingGripMultiplier`.
- Target values: steerHigh 0.90, normalGrip 2.10, airControl 0.55,
  gravity 13.50, jumpHeight 3.00, rampLaunchSpeed 6.50, dashImpulse 13.00,
  dashCooldown 0.80, dashAirMultiplier 0.80, dashMaxHorizontalSpeed 33.00,
  hard cap 35.00, cannon recoil 10.50, MG recoil 0.15.
- Loadout turret `minPitch` **−1.45 rad** (≈ −83° near-vertical);
  `minPitch`/`maxPitch` replicate through `MovementRulesBlock.turret` and
  the client aim clamps read the resolved limits (no hardcoded −0.4).
  A near-vertical downward shot produces a near-vertical upward recoil
  (~10.5 m/s launch) — a cannon takeoff; the shell still explodes at the
  ground for such shots, costing the normal 5 self-splash damage.
  The Gunner camera pitch floor was lowered to −77° (Driver unchanged at
  −35°) so a mouse can reach the near-vertical aim range.
- Content and legacy (`MatchRules.fromContentPack` vs `fromLegacyConfig`)
  parity asserted by the existing equality tests plus new movement tests.

### M2 — Upright aerial handling

- `stepTankKinematics`:
  - Yaw-velocity damping is data-driven per state
    (`groundYawDamping` 3.2 / `airYawDamping` 2.2).
  - Grip is separated in the air (`matchGrip × airGripMultiplier` 0.35).
  - Landing sets `landingGripT = landingGripSeconds` (0.12 s) and grip is
    multiplied by `landingGripMultiplier` (0.35) during the window.
  - Airborne visual pitch (from vertical velocity) and roll (from steering
    + yaw velocity) are clamped to ±0.22/±0.28 rad and blend at
    `visualAirLevelRate`; on landing they blend back to terrain normal /
    ground steering roll. Collision stays strictly yaw-only; the tank can
    never invert.
- `landingGripT` flows through `TankState`, `TankKinematicState`, initial
  state, respawn, predictor conversion, and snapshots.

### M3 — Shared three-dimensional tank impulse system

- `TankImpulseSystem.apply(spec)` is now the sole external impulse entry:
  normalized 3D direction × magnitude × `verticalScale`, plus yaw/roll
  impulses, an optional ground-`launchThreshold`, and the shared
  `hardHorizontalSpeedCap` (horizontal only; vertical never capped).
- `RecoilEffect` is a thin weapon adapter that delegates to the impulse
  system; the legacy fixed airborne lift was removed.
- Weapon behaviors (MG, cannon, JACKPOT) pass the full inverse muzzle
  vector, so aiming down produces upward recoil and vice versa; muzzle
  origin is clamped above terrain for downward shots.
- Ground launch: upward recoil above the threshold leaves the tank
  airborne (`grounded = false`) — jump + downward cannon reaches
  ~4–6 m of combined traversal.

### M4 — Impulse prediction and reconciliation

- Already in place from network03 and verified: typed `tankImpulse` wire
  events carry exact deltas (`impulseSeq`, `opSeq`, `sourceId`, `kind`);
  snapshots acknowledge the impulse sequence; `SharedTankPredictor`
  applies impulses immediately and replays unacknowledged impulses +
  driver inputs in op order; Practice uses the same authoritative systems.
- New movement tests cover impulse dedupe, replay ordering, and practice
  parity via the shared code path.

### M5 — Enemy radial splash knockback

- Enemy schema/content: shared `knockback` response block (immovable,
  horizontal/vertical resistance, ground/air drag, gravity scale, fall
  damage); Gun Tower is immovable; Scrap Bug strong, Rammer medium, Loot
  Truck low.
- `EnemyState` carries `impulseVx/Vy/Vz`, `impulseGrounded`,
  `lastImpulseSource/T`.
- `EnemyImpulseController` owns impulse motion: ground/air drag, gravity,
  upward cliff guard, downward cliff falls, landing, fall damage with
  source attribution, arena bounds.
- `RadialImpulseEffect` applies distance-falloff impulses; cannon/JACKPOT
  `ProjectileSystem.explode()` delegates knockback (damage stays
  separate); tank splash knockback stays zero by content.
- `movement.integrate` defers to impulse motion while an enemy is airborne.

### M6 — Presentation and docs

- How To scene updated (data-driven): air steering, jump + downward cannon
  launch, MG micro-thrust; no flips promised; no "boost/brace" copy.
- This report + `ARCADE_MOVEMENT_TUNING_GUIDE.md`; architecture/network/
  smoke/content/build-status docs updated.

## 2. Intentional Demo golden change

`npm run demo:write` regenerated `tests/fixtures/demo-golden.json` because
the movement contract intentionally changes gravity (16 → 13.5), jump
(2.2 → 3.0), dash (9 → 13), ramp launch (4.5 → 6.5), and recoil
(7.2/0.07 → 10.5/0.15). Events rose 1708 → 1723, score 16264 → 15343
(same grade S, JACKPOT ×4). The change is intentional and documented.

## 3. Command results (all executed)

- `npm run generate:presentation-content` / `generate:map-profiles` — PASS
- `npm run build` — PASS
- `npm test` — 481/481 (51 files, incl. 17 new `tests/movement/`)
- `npm run test:demo` — PASS against the regenerated golden
- `npm run test:e2e` — 31/31 (2 new arcade specs, 1 flicker regression)
- `npm run test:loop` — PASS (1803 snapshots/round, JACKPOT ×2)
- `npm run test:maps` — PASS (64/64, 0 fallback)
- `npm run test:maps:sweep` — PASS (350/profile)
- `npm run test:maplab` — 32/32; `build:maplab` PASS
- `npm run test:presentation` — 37/37; `build:presentation-preview` PASS

## 4. Remaining limitations

- Airborne visual pitch/roll are presentation values driven by vertical
  velocity/steering (no manual aerial pitch/roll input — deferred).
- CTRL handbrake slide, tank self-splash knockback, and full flips remain
  explicitly deferred per the design.
- Enemy impulse motion is linear-drag based (no navmesh); towers ignore all
  impulses by design.
