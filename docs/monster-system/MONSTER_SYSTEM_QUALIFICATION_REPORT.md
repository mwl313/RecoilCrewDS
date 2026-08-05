# Monster System Qualification Report

## Commands actually run (all PASS)

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| `npm run generate:content-pack` | PASS (hash bc2c6076c9b3…) |
| `npm test` | PASS — 132 files / 945 tests (was 915 at baseline) |
| `npm run build` | PASS |
| `npm run test:demo` | PASS — Demo golden byte-identical (legacy path preserved) |
| `npm run validate:enemy-animations` | PASS — 0 errors |
| `npm run test:maps` | PASS — 64 runs, 0 fallback |
| `npx vitest run tests/monsterSystemCore.test.ts tests/monsterRosterValidation.test.ts` | PASS — 30 tests |

## Covered contracts

- Level boundaries 0/14.999/15/60/120/179.999/180 → Lv1/1/2/5/9/12/13.
- HP ×1.20^(n−1), damage ×1.18^(n−1), boss damage fixed, spawn lock frozen.
- XP classes at Lv1/5/9/13 and Single Player ×2.
- Contact-DPS cadence (damagePerHit = scaledDps / rate), one cue per cycle,
  frame-skip safety, death cancel, playback clamp 0.6–2.5.
- Reservation ownership/release (death, range, grace), deterministic
  tie-break, max-slot packing, wider elite arcs.
- 45-definition schema rules: ordinary/elite single attack, boss mixed with
  ranged pattern and no damage scaling, ranged shotCount 1.
- Projectile registration (5–12 m/s, positive life/radius), animation
  Idle/Walk/Attack/Death resolution for all 45, roster/preload resolution.
- Mode parity (identical difficulty; only XP multiplier differs) and
  normalization math.

## Not yet executed in this environment

- Two-client Playwright run and browser visual qualification (no browser
  harness available); `test:monsterpack-rendering` is a browser spec.
- Full 180-second farming + boss round in a live match (the match flow
  integration is the documented compatibility adapter; the phase machine,
  boss level locks, and victory/defeat transitions are unit-tested).
