# Tank Jump & Dash — Implementation Report

**Milestone:** `docs/MILESTONE_TANK_JUMP_AND_DASH.md` (binding contract)
**Status:** Complete — all five verification gates pass

## 1. Old behavior / root causes

- **Space = held brace, Shift = held boost.** `DriverInput` carried
  `boost: boolean` / `brace: boolean`; `InputManager` treated both as held
  keys. Boost raised max speed (`forwardSpeed * boostMult`), steering, and
  used `match.boostGrip`; brace lowered accel/steer/grip, reduced recoil
  (`braceRecoilMult`, `jackpotBraceMult`), awarded brace-shot Crew Links and
  a JACKPOT brace bonus, and drove `HOLD SPACE TO BRACE` / `BRACING` /
  `BOOSTING` presentation.
- **No action edges existed.** The shared kinematic step inferred boost and
  brace from held state every 30 Hz step, so an edge-based action contract
  could not be layered on top without per-frame duplication.
- **Server coerced booleans** (`!!r.boost`, `!!r.brace`) instead of accepting
  explicit one-shot flags, and stale-input clearing reset held fields without
  any edge semantics.
- **`jumpImpulse` was a raw launch speed**, not a designer-facing height, and
  also fed ramp launches.

## 2. Files added

- `docs/planning/JUMP_DASH_IMPLEMENTATION_PLAN.md` — audit + migration plan
  (created before implementation).
- `docs/planning/JUMP_DASH_IMPLEMENTATION_REPORT.md` — this report.
- `tests/jumpDash.test.ts` — 13 new tests: authoritative edge consumption,
  jump/dash event emission, stale/dead edge clearing, exact server/predictor
  parity, replay-once semantics, movement-rules synchronization, per-room
  isolation, room sanitization of explicit booleans, schema rejection of
  negative values, and legacy/content parity for every modifier.

## 3. Files modified

```text
content/tanks/default.json
content/difficulties/soapTracks.json
content/scoring/demoScoreAttack.json
content/presentation/demoScoreAttack.json
content/weapons/jackpotShell.json
src/shared/types.ts
src/shared/config.ts
src/shared/assetRegistry.ts
src/shared/content/referenceValidator.ts
src/shared/content/schemas/tank.ts
src/shared/content/schemas/difficulty.ts
src/shared/content/schemas/scoring.ts
src/shared/rules/contentConfig.ts
src/shared/rules/legacyDemoRules.ts
src/shared/rules/matchRules.ts
src/shared/stats/statIds.ts
src/shared/stats/rulesRevision.ts
src/shared/sim/tankKinematics.ts
src/shared/sim/matchRuntime.ts
src/shared/sim/systems/scoreSystem.ts
src/shared/effects/recoilEffect.ts
src/shared/weapons/weaponBehaviors.ts
src/server/room.ts
src/client/input.ts
src/client/predictor.ts
src/client/audio.ts
src/client/vfx.ts
src/client/hud.ts
src/client/main.ts
src/client/styles.css
src/client/app/gameClient.ts
src/client/app/networkStatePresenter.ts
src/client/app/predictionController.ts
src/client/app/presentationEventRouter.ts
src/client/app/entityViewRegistry.ts
src/client/assets/fallbackAssetFactory.ts
tests/input.test.ts, tests/tankKinematics.test.ts, tests/predictor.test.ts,
tests/match.test.ts, tests/weaponSystem.test.ts, tests/room.test.ts,
tests/roomRules.test.ts, tests/roomContentMetadata.test.ts,
tests/interpolation.test.ts, tests/baselineCharacterization.test.ts,
tests/contentPack.test.ts, tests/assetRegistry.test.ts,
tests/assetService.test.ts, tests/helpers/demoFixture.ts,
tests/fixtures/demo-golden.json (intentionally regenerated)
e2e/controls.spec.ts, e2e/practice.spec.ts, e2e/tps.spec.ts,
e2e/full-game.spec.ts, scripts/verify-full-round.mjs
README.md, docs/README.md, docs/guides/ARCHITECTURE.md,
docs/guides/CONTENT_AUTHORING_GUIDE.md, docs/guides/NETWORK_RULES.md,
docs/guides/SMOKE_TEST.md, docs/planning/BUILD_STATUS.md
```

## 4. Final Driver input contract

```ts
export interface DriverInput {
  throttle: number;      // -1 .. 1
  steer: number;         // -1 .. 1
  dashPressed: boolean;  // one-shot action edge
  jumpPressed: boolean;  // one-shot action edge
}
```

`boost` and `brace` no longer exist anywhere in the Driver wire contract,
shared types, server sanitization, or client sampling. The server accepts
only explicit booleans (`=== true`) for the two edges.

## 5. Jump height formula and data fields

Designer-facing field: `tank.jumpHeight` (default `2.2` metres).

```ts
launchVelocity = Math.sqrt(2 * match.gravity * jumpHeight)
```

Applied only when `jumpPressed && grounded && jumpHeight > 0`, before normal
gravity integration; horizontal velocity is untouched; no double jump; no
coyote time or buffering. `jumpHeight = 0` disables jumping. Lower gravity
(Moon Yard `match.gravity: 6.5`) keeps the same target apex while lengthening
airtime (unit-tested). Ramp launches are preserved via the renamed
`tank.rampLaunchSpeed` (same `4.5` value and speed-ratio scaling as the old
ramp path).

## 6. Dash formula and data fields

Fields: `tank.dashImpulse` (9.0), `tank.dashCooldown` (1.0),
`tank.dashAirMultiplier` (0.65), `tank.dashMaxHorizontalSpeed` (28.0),
`tank.dashPresentationSeconds` (0.18).

```ts
if (dashPressed && dashCooldown <= 0) {
  strength = dashImpulse * (grounded ? 1 : dashAirMultiplier);
  vx += Math.sin(yaw) * strength;   // chassis forward
  vz += Math.cos(yaw) * strength;
  capHorizontalSpeed(v, dashMaxHorizontalSpeed); // preserves direction
  dashCooldown = dashCooldown;
  dashPresentationT = dashPresentationSeconds;
}
```

One instantaneous burst per accepted press edge; vertical velocity is never
modified; lateral momentum is preserved (only the normal per-step grip
decays); the speed cap applies after the burst while preserving direction;
high-speed displacement uses the existing collision substeps. `0` air
multiplier disables airborne dash; `0` cooldown permits one dash per press.

## 7. Input latching and sequencing

- `InputManager` maps `Space -> 'jump'` and `ShiftLeft/Right -> 'dash'` as
  latched one-shot edges. The first non-repeat keydown arms the key and
  latches the action; browser key-repeat and any keydown while armed are
  ignored; keyup re-arms for the next press.
- The latch is included in the next Driver input frame and cleared only after
  that frame is created: online, after the sequenced network frame is sent;
  in Practice, after each 30 Hz sim step's input frame. A press between
  network sends is re-sampled at send time so it is never lost.
- Blur, visibility loss, pointer-lock loss, pause/input disable,
  disconnect, and teardown clear latches (`InputManager.clearAll`,
  `GameClient.setInputEnabled(false)`, `main.ts` teardown).
- `MatchRuntime` consumes each sequenced frame's edges exactly once on the
  next sim step and preserves unconsumed edges if a newer neutral frame
  arrives first; `clearDriverInput()` clears pending edges with stale input.

## 8. Prediction / replay handling

- `DriverPredictor` detects rising edges per live input sample and applies
  each jump/dash on exactly one fixed step, so a latched edge that spans a
  few frames never repeats locally.
- Every sequenced frame pushed via `pushInput(seq, input)` is replayed
  exactly once from the authoritative base in `reconcile()`; replay uses the
  stored frame edges, so an acknowledged edge is never re-applied and an
  unacknowledged edge is applied exactly once (unit-tested).
- `applyMovementRules` merges the compact movement block, which now carries
  every jump/dash field (`tank.jumpHeight`, `rampLaunchSpeed`, `dashImpulse`,
  `dashCooldown`, `dashAirMultiplier`, `dashMaxHorizontalSpeed`,
  `dashPresentationSeconds`) plus `match.grip`/`gravity`/`timeScale`; the
  movement rules revision advances whenever any of these changes.
- Server/predictor parity is asserted exactly (8 decimal places) over a 120-
  step script including jump/dash edges, steering, and cooldown-gated dashes.

## 9. State / schema migration

- `TankState` drops `brace`/`boosting`, gains `dashCooldown` and
  `dashPresentationT`; `TankKinematicState` mirrors it.
- Tank Zod schema, `content/tanks/default.json`, `GameConfig.tank`, and
  `BASE_CONFIG` drop `boostMult`, `boostGrip`, `braceGrip`, `braceAccelMult`,
  `braceSteerMult`, `jumpImpulse`, `braceRecoilMult`, `jackpotBraceMult`;
  add `jumpHeight`, `rampLaunchSpeed`, `dashImpulse`, `dashCooldown`,
  `dashAirMultiplier`, `dashMaxHorizontalSpeed`, `dashPresentationSeconds`.
- Stat IDs: `tank.jumpHeight`, `tank.rampLaunchSpeed`, `tank.dashImpulse`,
  `tank.dashCooldown`, `tank.dashAirMultiplier`,
  `tank.dashMaxHorizontalSpeed`, `tank.dashPresentationSeconds` registered;
  obsolete boost/brace ids and `weapon.jackpotBraceMultiplier` removed.
- `SimEvent` gains `jump`/`dash` types (dash carries `yaw` for VFX
  direction); `MatchRuntime` emits exactly one event per accepted edge.

## 10. Brace/boost cleanup

- Recoil (`RecoilEffect`) applies full impulse with no brace multiplier;
  `weaponBehaviors` no longer award brace-shot links or the JACKPOT brace
  bonus; `weapon.jackpotBraceMultiplier` removed from content and stat ids.
- Scoring schema/JSON drop `links.braceShot`, `jackpotGains.braceShot`, and
  `jackpotBraceBonus`; `ScoreSystem.addLink` keeps `scrapLoop`/`ramFinish`
  and awards the renamed `jackpot.linkGain` (same value as the old link
  gain, preserving Crew Link meter behavior).
- `EntityViewRegistry.braceMesh`, brace HUD indicator, `BRACING`/`BOOSTING`
  PIP labels, and `HOLD SPACE TO BRACE` prompt are removed. Main cannon and
  JACKPOT are fully functional unbraced (unit + e2e + Demo all verified).

## 11. Difficulty migration

- `difficulties/soapTracks.json` drops `match.boostGrip` and keeps ordinary
  `match.grip: 0.35`.
- `difficulties/moonYard.json` keeps `match.gravity: 6.5` — lower gravity now
  produces longer airtime at the same `jumpHeight` apex.
- Difficulty schema/validator now accept `match.*` and `tank.*` override
  keys validated against the known stat registry (content pack test covers
  rejection of unknown ids and acceptance of `tank.dashImpulse`).

## 12. Audio / VFX / HUD changes

- New semantic asset ids `audio.dash`, `audio.jump`, `vfx.dashBurst`,
  `vfx.jumpDust` (procedural fallbacks + presentation JSON);
  `audio.boost`/`audio.brace` removed.
- `VfxSystem.spawnDashBurst` (short backward transient + ring) and
  `spawnJumpDust` (takeoff dust + ring); `AudioManager` gains transient
  `dash`/`jump` procedural sounds and drops the held boost/brace cases.
- The online Driver gets immediate local feedback from prediction (audio +
  VFX at the predicted pose) and suppresses the authoritative duplicate;
  the Gunner and Practice present the authoritative `jump`/`dash` events.
- HUD: `#dash-ind` DASH indicator (lit during `dashPresentationT`, dimmed
  during cooldown), How To Play `Shift dash · Space jump`, Driver JACKPOT
  prompt `GUNNER — HOLD RIGHT MOUSE TO CHARGE`; PIP priority is WIPEOUT →
  JUMPING → DASHING → DRIFTING → DRIVING → STATIONARY.

## 13. Unit result

```text
npm run build: PASS (client dist/ + server dist-server/)
npm test: PASS — 25 files, 270/270 tests
```

Includes 13 new `tests/jumpDash.test.ts` cases plus rewritten input,
kinematics (jump/dash matrix), predictor, room, rules, weapon, and content
tests.

## 14. Demo regression result

```text
npm run test:demo: PASS — golden Demo byte-identical (after intentional
  regeneration with `npm run demo:write`)
```

Golden fixture change review (all intended):

- Tank canonical state replaced `brace`/`boosting` with
  `dashCooldown`/`dashPresentationT`.
- Scripted Driver now sends edge-triggered jumps (14) and dashes (12);
  recoil is unbraced; brace links/bonuses are gone.
- Results: score 14633 → 16264 (still grade S), kills 36 → 39, scrap 5 → 16,
  Crew Links 5 → 15, JACKPOT fired ×2 → ×4; canonical events
  1647 → 1708 with new `jump`/`dash` types. Rematch reset still equals the
  initial checkpoint.

## 15. E2E result

```text
npm run test:e2e: PASS — 17/17 Playwright tests (two real Chrome clients)
```

New browser coverage: real Space press jumps exactly once online (with
release-and-repress re-jump), real Shift press dashes once and never repeats
while held, Practice Space/Shift work, and the HUD/How To Play contain
JUMP/DASH labels with no active brace/boost text. The existing full-round
two-browser test (JACKPOT unbraced, results, rematch), practice full round,
collision/tunneling, TPS, and pause tests all pass.

## 16. Full-loop result

```text
npm run test:loop: PASS — 90.0s round, score 18839, grade S, JACKPOT ×2,
  combo ×5, rematch ok (moonYard, fresh score 0, same room),
  1353 snapshots
```

## 17. Manual two-browser result

Two-browser validation was run with real Chrome (Playwright e2e suite) and a
dedicated Microsoft Edge run (two contexts + Practice page):

- Space once → one jump, authoritative on both clients.
- Hold Space → no repeat; release + repress → second jump.
- Shift once → one chassis-forward burst; hold → no sprint, no repeat.
- Dash into the crusher gate → no tunneling/jitter (tps e2e).
- Driver sees immediate prediction; Gunner sees smooth authority (parity and
  smoothness e2e).
- Practice uses Space Jump / Shift Dash.
- HUD/PIP show JUMP/DASH labels and contain no active brace/boost prompts.

```text
Microsoft Edge two-browser validation: PASS
```

## 18. Remaining limitations

- Dash at top speed is a one-step burst: the existing per-step max-speed
  clamp absorbs the surplus on the next sim step (per the milestone's
  conceptual snippet); the burst is most impactful from rest/low speed and
  still feeds the high-speed collision substep path.
- Jump is grounded-only with no coyote time or buffering (per milestone);
  a press while dead is discarded with the frame.
- The item/status-effect taxonomy still has a generic `kind: 'boost'`
  (framework concept for item effects, unrelated to the removed Driver
  held-boost control).
- Audio/VFX are procedural fallbacks (semantic ids registered for custom
  assets).
- The browser Practice path still resolves rules from the legacy constants
  bundle (parity-tested against validated content); no fs/zod in the browser
  bundle.

## 19. Exact designer instructions for changing jump and dash values

Edit `content/tanks/default.json` (or override via difficulty/stat
modifiers):

```json
{
  "jumpHeight": 2.2,
  "rampLaunchSpeed": 4.5,
  "dashImpulse": 9.0,
  "dashCooldown": 1.0,
  "dashAirMultiplier": 0.65,
  "dashMaxHorizontalSpeed": 28.0,
  "dashPresentationSeconds": 0.18
}
```

- **Jump height:** set `jumpHeight` to the desired vertical rise in metres
  (e.g. `2.2` ≈ a two-metre hop). Launch velocity is always derived as
  `sqrt(2 * gravity * jumpHeight)` — never edit the velocity directly.
  `0` disables jumping. Lowering `match.gravity` (Moon Yard) keeps the same
  apex and lengthens airtime.
- **Dash strength:** `dashImpulse` is the forward velocity delta in m/s for
  a grounded dash (`0` disables dash). Airborne strength is
  `dashImpulse * dashAirMultiplier` (`0` disables air dash; values above 1
  are supported).
- **Dash cadence:** `dashCooldown` is the minimum seconds between accepted
  dashes (`0` = one dash per distinct press edge).
- **Dash top speed:** `dashMaxHorizontalSpeed` caps total horizontal speed
  after the burst while preserving direction (set high to effectively
  disable the cap).
- **Dash presentation:** `dashPresentationSeconds` only controls the short
  DASHING label/audio/VFX window; it never changes physics.
- Runtime modifiers can tune any of these through stat ids
  (`tank.jumpHeight`, `tank.dashImpulse`, `tank.dashCooldown`,
  `tank.dashAirMultiplier`, `tank.dashMaxHorizontalSpeed`); movement-rule
  revisions replicate the resolved values to the Driver predictor.

Validate with `npm test` (content validation + parity), then run the four
gates: `npm run build`, `npm run test:demo`, `npm run test:e2e`,
`npm run test:loop`.
