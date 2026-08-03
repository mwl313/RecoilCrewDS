# Tank Jump & Dash Migration — Implementation Plan

**Milestone:** `docs/MILESTONE_TANK_JUMP_AND_DASH.md` (binding contract)
**Stack:** TypeScript, Vite, Three.js, authoritative Node + WebSocket
**Status:** In progress

## 1. Audit of current behavior and exact locations

### DriverInput and key mapping

- `src/shared/types.ts` — `DriverInput { throttle, steer, boost, brace }`.
- `src/client/input.ts` — `keyMap`: `ShiftLeft/ShiftRight -> 'boost'`,
  `Space -> 'brace'`; held-key semantics (`keys` set); movement keys never
  cleared per action frame. Latches exist only for `swap/recenter/escape`.
- `src/client/app/gameClient.ts` — `sampleDriverInput()` maps
  `keyDown('boost')` / `keyDown('brace')`; called multiple times per frame
  (practice step, prediction sample, network send).
- `src/server/room.ts` — `sanitizeDriver()` coerces `!!r.boost` / `!!r.brace`
  (truthy coercion, not explicit booleans).

### Shared tank kinematics

- `src/shared/sim/tankKinematics.ts` — `stepTankKinematics()`:
  - `boosting = inp.boost && throttle>0.05 && grounded`; `bracing = inp.brace && grounded`.
  - Boost raises `maxSpeed` (`forwardSpeed*boostMult`), adds steering x1.3,
    swaps grip to `match.boostGrip`; brace lowers accel (`braceAccelMult`),
    steering (`braceSteerMult`), grip (`braceGrip`).
  - Ramp launch uses `jumpImpulse` scaled by speed ratio.
  - Drift label = `boosting && |steer| > 0.4`.
- `src/shared/sim/matchRuntime.ts` — initial tank state carries
  `brace/boosting`; no per-frame edge consumption; `clearDriverInput()`
  resets both fields.

### Data-driven content

- `content/tanks/default.json` — `boostMult, boostGrip, braceGrip,
  braceAccelMult, braceSteerMult, jumpImpulse, braceRecoilMult,
  jackpotBraceMult`.
- `src/shared/content/schemas/tank.ts` — Zod fields mirroring the JSON.
- `src/shared/config.ts` — `GameConfig.tank` + `BASE_CONFIG` (same fields),
  `MatchConfig.boostGrip`, `MODIFIER_OVERRIDES.soapTracks.boostGrip`.
- `src/shared/rules/contentConfig.ts` — content -> legacy projection for all
  of the above (`legacyGameConfigFromContent`, `legacyMatchConfigFromContent`).
- `src/shared/rules/legacyDemoRules.ts` — client-safe bundle mirrors the same
  values (parity-tested against the content path).
- `src/shared/stats/statIds.ts` — `TANK_STAT_IDS` includes
  `tank.boostMult/boostGrip/braceGrip/braceAccelMult/braceSteerMult/
  jumpImpulse/braceRecoilMult/jackpotBraceMult`; `MATCH_STAT_IDS` includes
  `match.boostGrip`; `MOVEMENT_STAT_IDS` includes `match.boostGrip`.
- `src/shared/stats/rulesRevision.ts` — movement block carries
  `match.boostGrip`.
- `src/shared/rules/matchRules.ts` — `movementBlock()` resolves
  `match.boostGrip`; `fromLegacyConfig` converts every
  `MODIFIER_OVERRIDES` number into a `match.*` stat modifier.
- `content/difficulties/soapTracks.json` — `match.boostGrip` override.
- `src/shared/content/schemas/difficulty.ts` — overrides restricted to
  `match.*` keys; `src/shared/content/referenceValidator.ts` enforces it.

### Brace-dependent scoring / recoil / JACKPOT

- `src/shared/effects/recoilEffect.ts` — applies `braceRecoilMult` while
  `t.brace`.
- `src/shared/weapons/weaponBehaviors.ts` — cannon adds `braceShot` Crew
  Link while braced; JACKPOT applies `weapon.jackpotBraceMultiplier` while
  braced and awards `jackpotBraceBonus` + `braceShot` link.
- `src/shared/sim/systems/scoreSystem.ts` — `addLink('braceShot')`,
  `scoring.links.braceShot`, `jackpot.braceShotGain`.
- `content/scoring/demoScoreAttack.json` — `jackpotGains.braceShot`,
  `links.braceShot`, `jackpotBraceBonus`.
- `src/shared/content/schemas/scoring.ts` — schema fields for the above.
- `src/shared/assetRegistry.ts`, `content/presentation/demoScoreAttack.json`,
  `src/client/assets/fallbackAssetFactory.ts`, `src/client/audio.ts` —
  `audio.boost` / `audio.brace` semantic ids and procedural sounds.

### HUD / PIP / presentation

- `src/client/hud.ts` — How To Play text (`Shift boost & drift`, `Space
  brace`, "Brace before big shots"), `#brace-ind` BRACE indicator,
  `HOLD SPACE TO BRACE` prompt, PIP `BRACING`/`BOOSTING` labels.
- `src/client/app/networkStatePresenter.ts` — brace mesh visibility,
  boosting exhaust VFX, `audio.setEngine(speed, boost)`.
- `src/client/app/entityViewRegistry.ts` — braceMesh group.
- `src/client/app/presentationEventRouter.ts` — no jump/dash events.
- `src/client/vfx.ts`, `src/client/audio.ts` — no dash/jump semantics.

### Prediction / reconciliation

- `src/client/predictor.ts` — `DriverPredictor` steps shared kinematics at
  fixed 30 Hz; `applyMovementRules()` merges the movement block; replay in
  `reconcile()` steps each pending sequenced input exactly once.
- `src/client/app/predictionController.ts` — wires `BASE_CONFIG` +
  movement block, merges predicted pose into `renderTank`.
- `src/shared/stats/rulesRevision.ts` + `src/server/room.ts` —
  `movementRulesRevision` replicated with a compact block on change.

### Practice

- `src/client/app/gameClient.ts` — `stepPractice()` builds the local
  `Match`, feeds `sampleDriverInput()` and mouse actions, steps 30 Hz,
  routes events to HUD/router.

### Tests / regression

- `tests/input.test.ts` — held-key mapping (`brace`), one-shot flags.
- `tests/tankKinematics.test.ts` — boost collision/tunneling cases.
- `tests/predictor.test.ts`, `tests/baselineCharacterization.test.ts`,
  `tests/roomRules.test.ts` — `boost/brace` fields everywhere.
- `tests/room.test.ts` — sanitized driver fields, full-round scripted play.
- `tests/match.test.ts`, `tests/weaponSystem.test.ts` — brace recoil tests.
- `tests/helpers/demoFixture.ts` + `tests/fixtures/demo-golden.json` —
  canonical tank `brace/boosting` fields, scripted `boost/brace` input.
- `e2e/controls.spec.ts`, `e2e/tps.spec.ts`, `e2e/full-game.spec.ts`,
  `e2e/practice.spec.ts`, `scripts/verify-full-round.mjs` — boost/brace wire
  fields.

## 2. Migration design

### 2.1 Final Driver input contract

```ts
export interface DriverInput {
  throttle: number;      // -1..1
  steer: number;         // -1..1
  dashPressed: boolean;  // one-shot edge
  jumpPressed: boolean;  // one-shot edge
}
```

Edges are latched in `InputManager` on the first non-repeat keydown, included
in the next Driver input frame, then cleared once that frame is created.
Holding never repeats; keyup re-arms. Blur, visibility loss, pointer-lock
loss, pause, disconnect, and teardown clear latches.

### 2.2 Server edge consumption

`MatchRuntime.setDriverInput()` stores the frame plus its pending edges;
the next `stepTank()` consumes the pending edges exactly once. Subsequent
sim steps with no new frame see `dashPressed=false, jumpPressed=false`.
Stale-input clearing resets the pending edges.

### 2.3 Shared kinematics

`stepTankKinematics()`:

- Decrement `dashCooldown` and `dashPresentationT` by `dt`.
- Jump: `input.jumpPressed && grounded && rules.jumpHeight > 0` →
  `vy = max(vy, sqrt(2 * match.gravity * jumpHeight))`, `grounded = false`,
  skip same-step re-grounding.
- Movement: ordinary throttle/steer/grip only (no boost/brace branches).
- Dash: `input.dashPressed && dashCooldown <= 0` →
  `vx += sin(yaw) * strength`, `vz += cos(yaw) * strength` where
  `strength = dashImpulse * (grounded ? 1 : dashAirMultiplier)`;
  cap horizontal speed at `dashMaxHorizontalSpeed` preserving direction;
  set `dashCooldown` and `dashPresentationT`.
- Ramp launch preserved via renamed `rampLaunchSpeed` (same value/behavior
  as the old `jumpImpulse` ramp path; jumps themselves use `jumpHeight`).
- Callbacks `onJump`/`onDash` emit authoritative `jump`/`dash` events.

### 2.4 Tank state / data migration

`TankState` drops `brace`/`boosting`, gains `dashCooldown` and
`dashPresentationT`. Tank schema/JSON/config drop
`boostMult, boostGrip, braceGrip, braceAccelMult, braceSteerMult,
jumpImpulse, braceRecoilMult, jackpotBraceMult`; add
`jumpHeight, rampLaunchSpeed, dashImpulse, dashCooldown, dashAirMultiplier,
dashMaxHorizontalSpeed, dashPresentationSeconds`.

Stat IDs: add `tank.jumpHeight`, `tank.rampLaunchSpeed`, `tank.dashImpulse`,
`tank.dashCooldown`, `tank.dashAirMultiplier`,
`tank.dashMaxHorizontalSpeed`, `tank.dashPresentationSeconds`; remove all
obsolete boost/brace ids including `match.boostGrip` and
`weapon.jackpotBraceMultiplier`. Movement block drops `boostGrip`.

### 2.5 Difficulty migration

- `soapTracks.json`: drop `match.boostGrip`; keep `match.grip` (ordinary
  grip).
- `moonYard.json`: keeps `match.gravity` (lower gravity, same jump target
  height via `sqrt(2gh)`).
- Difficulty schema/validator now allow `match.*` and `tank.*` override keys
  (validated against the known stat registry) so future packs can tune
  `tank.jumpHeight`, `tank.dashImpulse`, `tank.dashCooldown`, etc.

### 2.6 Brace/boost cleanup

- Recoil is unbraced full-strength (`RecoilEffect` drops the multiplier).
- Cannon/JACKPOT no longer add brace links or the JACKPOT brace bonus;
  `weapon.jackpotBraceMultiplier` removed.
- Scoring schema/JSON drop `links.braceShot`, `jackpotGains.braceShot`,
  `jackpotBraceBonus`; `ScoreSystem.addLink` keeps scrapLoop/ramFinish.
- HUD/PIP remove BRACE/BOOST text; PIP uses
  WIPEOUT → JUMPING → DASHING → DRIFTING → DRIVING → STATIONARY.

### 2.7 Prediction / replay

- `DriverPredictor` tracks rising edges of `dashPressed`/`jumpPressed` per
  live input sample so a latched edge is applied once locally; queued
  sequenced frames replay each edge exactly once from authority.
- Movement block now carries every movement-critical value including the
  jump/dash fields, and `applyMovementRules` merges them.

### 2.8 Presentation

- Semantic ids `audio.dash`, `audio.jump`, `vfx.dashBurst`,
  `vfx.jumpDust` added; `audio.boost`/`audio.brace` removed.
- Server emits `jump`/`dash` events; PresentationEventRouter handles them
  for the Gunner/Practice; the online Driver triggers immediate local
  feedback from the predictor and suppresses the routed duplicate.

## 3. Test plan (failure-reproducing first)

- Input: one edge per press, no repeat while held, re-press after release,
  blur/visibility/pause clears latches, movement keys unchanged.
- Jump: grounded launch, `sqrt(2*g*h)` velocity, apex ≈ `jumpHeight`,
  `jumpHeight=0` disables, no air jump, landing re-arms, momentum
  preserved, gravity changes airtime not height.
- Dash: chassis-forward burst, no sprint while held, cooldown, reverse
  burst, lateral/vertical preservation, air multiplier (0 disables), speed
  cap, no tunneling, replay does not double-apply.
- Rules/data: new JSON validates, obsolete fields fail clearly, runtime
  modifiers move revisions, per-room isolation, two rooms different values.
- Regression: existing movement/steering/Gunner tests, JACKPOT unbraced,
  Demo fixture intentionally regenerated, e2e + full-loop updated to the
  new contract.

## 4. Golden Demo fixture

The Demo behavior intentionally changes (no boost/brace; jump/dash edges;
different tank state fields; unbraced recoil; no brace links/bonus). After
implementation, review the diff, then regenerate with `npm run demo:write`
and record checkpoints + reason in the implementation report.

## 5. Verification commands

```bash
npm run build
npm test
npm run test:demo
npm run test:e2e
npm run test:loop
```
