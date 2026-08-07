# Combat Display Number Scale — Implementation Report

## Repository state

- Branch: `codex/gameplay-readability-tactical-environment`
- Working branch HEAD at start/end: `66cc5ddd35c672b1d68cda564925dac8123ade4c`
- Audited `origin/main` at task start: `db713a64debb1934b1b1af6bf9356b4e3bcde9c0`
- `origin/main` advanced during implementation to `3ac8eeffc14edd5aad354b4eeb07624c57f10c10` (single-player countdown merge).
- The work is intentionally uncommitted, so there is no new ending commit SHA.
- This display-unit pass was layered onto the uncommitted gameplay-readability branch because its `EnemyWorldUiLayer` and tactical drawer are required presentation surfaces. Existing unrelated dirty-tree changes were preserved.

## Canonical display helper

Location: `src/shared/presentation/combatDisplayUnits.ts`

API:

- `COMBAT_DISPLAY_SCALE = 10`
- `toCombatDisplayValue(value)` — rounds after multiplying by 10
- `formatCombatDisplayValue(value)` — full `en-US` grouping, no abbreviation
- `formatCombatDamage(actualHpLoss)` — red popup copy such as `-190`
- `classifyCombatDamageMagnitude(actualHpLoss)`
- `combatDamagePresentationStyle(actualHpLoss)`

No gameplay component contains a new raw `* 10` display conversion. All conversions route through this helper.

## Stat presentation metadata

Location: `src/shared/presentation/statPresentation.ts`

The canonical metadata maps stat ids to:

- human label;
- presentation unit (`combatDamage`, `combatHp`, `percent`, `seconds`, `meters`, `speed`, or `plain`);
- tactical group;
- optional lower-is-better wording.

The reward-card formatter and tactical level-up summary now share this map. Absolute cannon/MG/Dash damage and max-integrity additions use combat display units. Multipliers remain percentages or multiplier products.

## Migrated surfaces

### Floating enemy damage

- `EnemyWorldUiLayer` still receives authoritative actual final HP loss in internal units.
- Only Canvas text formatting converts the value (`19` becomes `-190`).
- Rapid same-enemy MG coalescing still combines internal losses before one final display conversion.
- Normal enemy damage remains red; no critical-hit mechanic or color was added.

### Magnitude-responsive damage animation

Classification uses internal actual HP loss, based on current MG `2`, cannon/Dash `12`, and full-charge `60` baselines:

| Tier | Internal HP loss | Font | Start scale | Rise | Lifetime |
|---|---:|---:|---:|---:|---:|
| LIGHT | `< 4` | 18px | 1.15 | 24px | 600ms |
| STANDARD | `4–11.999…` | 22px | 1.30 | 30px | 700ms |
| HEAVY | `12–35.999…` | 27px | 1.45 | 36px | 760ms |
| MASSIVE | `≥ 36` | 34px | 1.60 | 42px | 860ms |

MASSIVE receives a short red impact glow. Reduced-motion presentation uses a 300ms fade and minimal rise.

### Boss and elite health

- `HudProjector` computes bar ratio directly from authoritative internal `hp / maxHp`.
- Numeric text uses full display values with grouping (`623 / 850` becomes `6,230 / 8,500`).
- View-model numeric fields are explicitly named `displayHp` and `displayMaxHp`.

### Tank integrity

- The live numeric integrity readout uses display units (`100` becomes `1,000`).
- The integrity bar continues to use internal `integrity` and `integrityMax` values.

### Upgrade cards and tactical status

- Absolute combat additions use the shared stat-unit metadata (`+5` cannon damage becomes `+50`; `+40` max integrity becomes `+400`).
- Percentage upgrades are unchanged (`×1.15` is presented as `+15%`).
- Combined tactical rows remain explicit (`+400 · ×1.18`).
- Cooldowns, meters, speed, recoil, knockback, XP, levels, score, and timers are not scaled.

### Relic descriptions

Current relic descriptions are authored static strings, while structured parameters are not provided to the reveal view. They were intentionally left unchanged. Regex replacement would incorrectly scale percentages, radii, cooldowns, and stack counts. A future structured relic-copy projector can safely migrate raw healing/damage parameters.

## Authority and parity confirmation

- No weapon, projectile, enemy HP, tank integrity, upgrade value, relic parameter, difficulty, XP, or score data was changed for this pass.
- `DamageSystem`, snapshots, and network events remain in internal units.
- The same shared final-presentation helpers are used for Single Player, Multiplayer Driver, and Multiplayer Gunner; there is no role-specific scaling.
- Health-bar ratios remain internal.

## Verification

- `npx tsc --noEmit`: pass
- `npm run build`: pass
- Focused combat-display/readability/HUD/progression/network suite: 54/54 pass
- `npm run test:netcode`: 33/33 pass
- `npm run test:horde`: 101/101 pass
- `npm run test:progression`: 201/202 pass; the remaining unrelated relic hardening expectation requires `7.5` while current behavior resolves `15`.
- Full `npm test -- --run`: 9 failures outside this display pass:
  - three existing predictor pending-queue expectations;
  - one existing relic magnet-radius expectation;
  - two missing local Monster Pack ZIP tests;
  - one existing tank-asset manifest expectation;
  - two suite-load timeouts (`roomRules` and `maplab/exportApply`).
- `git diff --check`: pass.

## Browser qualification

Direct in-app browser inspection at `1280×720` confirmed:

- the live HUD visibly renders starting internal integrity `100` as `1,000`;
- the integrity bar remains full from internal values;
- the gameplay scene, sky, tactical layer, and HUD remain visually composed;
- the progression debug overlay remains hidden.

The standalone Playwright runner hung before emitting results in this workspace even with a reduced timeout, so no unverified temporary browser test was retained. The presentation conversion paths are covered by the green focused helper, Canvas pool, HUD projector, reward DOM, tactical status, damage-authority, and protocol tests.
