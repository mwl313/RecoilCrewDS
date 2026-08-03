# Recoil Crew DS — Tank Jump and Dash Control Migration
## Space = Jump, Left Shift = Edge-Triggered Forward Dash

**Project:** Recoil Crew DS  
**Stack:** TypeScript, Vite, Three.js, authoritative Node.js + WebSocket  
**Document type:** Corrective gameplay and input implementation contract  
**Scope:** Driver controls, shared tank kinematics, data-driven tank stats, prediction, networking, presentation, tests, and documentation  
**Out of scope:** New weapons, new enemies, new objectives, server-rate changes, camera redesign, controller/mobile input

---

# 1. Purpose

Replace the current Driver locomotion actions:

```text
Left Shift → held boost / drift modifier
Space      → held brace
```

with:

```text
Left Shift → one sudden forward dash per press
Space      → one jump per press
```

Final Driver controls:

| Input | Action |
|---|---|
| W / Up | Accelerate |
| S / Down | Reverse or brake |
| A / Left | Steer left |
| D / Right | Steer right |
| Mouse | Independent TPS free-look |
| Left Shift | Forward dash |
| Space | Jump |
| R | Recenter camera |
| Escape | Local pause/menu |

The dash is not a sprint, speed mode, or held boost. It is an instantaneous forward velocity burst.

Jump and dash must use the same deterministic shared kinematics for:

- Authoritative server simulation
- Driver client prediction
- Practice simulation

The current multiplayer authority model must remain unchanged.

---

# 2. Current repository context

The refactored project already has:

- Validated tank JSON definitions and a Zod tank schema
- Shared deterministic `tankKinematics.ts`
- Driver prediction and reconciliation
- Movement-rules revisions
- Authoritative Driver input validation
- Online and Practice control paths
- HUD, PIP, audio, VFX, tests, and deterministic Demo regression

Current relevant fields include:

```text
boostMult
boostGrip
braceGrip
braceAccelMult
braceSteerMult
jumpImpulse
braceRecoilMult
jackpotBraceMult
```

Current `DriverInput` contains:

```ts
interface DriverInput {
  throttle: number;
  steer: number;
  boost: boolean;
  brace: boolean;
}
```

This milestone must migrate the active locomotion contract rather than layer jump and dash on top of held boost and brace.

---

# 3. Non-negotiable behavior

## 3.1 Jump

Space must:

- Trigger only on a press edge.
- Apply one jump.
- Never repeatedly jump while held.
- Require a valid grounded state by default.
- Preserve horizontal velocity.
- Set or raise vertical velocity using the configured jump height.
- Work identically online, in prediction, and in Practice.
- Remain chassis-independent; camera direction does not affect the jump.
- Never fire a Gunner action.
- Never act as brace.

## 3.2 Dash

Left Shift must:

- Trigger only on a press edge.
- Apply one immediate forward burst.
- Use chassis forward, not camera forward.
- Add forward velocity rather than enable a held speed multiplier.
- Never continue accelerating merely because Shift remains held.
- Never repeat until Shift has been released and a new press occurs.
- Respect an authoritative cooldown.
- Work identically online, in prediction, and in Practice.
- Preserve lateral and vertical velocity unless explicitly capped by data.
- Use the same collision/substep path as all other high-speed movement.
- Never tunnel through walls because of the burst.

## 3.3 Removed active behavior

After migration:

- Space does not set `brace`.
- Shift does not set a held `boost` state.
- Holding Shift does not continuously change maximum speed, acceleration, or grip.
- Holding Space does not reduce movement, steering, or recoil.
- The Demo must not show `BRACE`, `BRACING`, `BOOST`, or `BOOSTING` as active Driver controls.
- Brace-dependent JACKPOT prompts and score bonuses must no longer be required for the Demo to work.

Brace may later return as a mode ability, item, equipment action, or separate input. It is not an active Driver control in this milestone.

---

# 4. Data-driven tank parameters

## 4.1 Designer-facing jump height

Replace active use of:

```text
jumpImpulse
```

with:

```text
jumpHeight
```

Example:

```json
{
  "jumpHeight": 2.2
}
```

`jumpHeight` is the approximate vertical rise above level ground in world metres, ignoring ceilings and collisions.

Calculate launch velocity from resolved gravity:

```ts
jumpVelocity = Math.sqrt(2 * gravity * jumpHeight);
```

Benefits:

- Designers tune an understandable height.
- Lower gravity creates longer airtime without unexpectedly changing target height.
- Runtime gravity and jump-height modifiers remain predictable.
- Server and predictor derive exactly the same launch velocity.

Validation:

```text
jumpHeight >= 0
gravity > 0
```

`jumpHeight = 0` disables jumping.

## 4.2 Dash parameters

Add these designer-facing tank fields:

```json
{
  "dashImpulse": 9.0,
  "dashCooldown": 1.0,
  "dashAirMultiplier": 0.65,
  "dashMaxHorizontalSpeed": 28.0,
  "dashPresentationSeconds": 0.18
}
```

### `dashImpulse`

Forward velocity added by a grounded dash, in metres per second of velocity delta.

### `dashCooldown`

Minimum authoritative time between accepted dashes, in seconds. A value of `0` permits one dash per distinct press edge.

### `dashAirMultiplier`

Multiplier applied to `dashImpulse` while airborne.

```text
0 → airborne dash disabled
1 → full-strength airborne dash
```

Values above one may be intentionally supported.

### `dashMaxHorizontalSpeed`

Post-dash horizontal speed cap. Apply the burst first, then cap total horizontal speed while preserving direction. Do not zero lateral momentum before dashing.

### `dashPresentationSeconds`

Short presentation window used for PIP labels, trails, audio, and HUD feedback. This does not control physical force duration; physics is instantaneous.

## 4.3 Runtime stat IDs

Add and register:

```text
tank.jumpHeight
tank.dashImpulse
tank.dashCooldown
tank.dashAirMultiplier
tank.dashMaxHorizontalSpeed
```

`dashPresentationSeconds` may remain presentation configuration.

These values must support the existing stat modifier system. Movement-rule revisions must include every value needed by Driver prediction.

Examples:

```text
Jump upgrade:          tank.jumpHeight × 1.4
Dash upgrade:          tank.dashImpulse + 3
Dash cooldown effect:  tank.dashCooldown × 0.7
```

---

# 5. Tank content migration

Update the actual current equivalents of:

```text
content/tanks/default.json
src/shared/content/schemas/tank.ts
src/shared/rules/contentConfig.ts
src/shared/rules/matchRules.ts
src/shared/stats/statIds.ts
src/shared/stats/rulesRevision.ts
src/shared/config.ts
```

Default values may start near:

```json
{
  "jumpHeight": 2.2,
  "dashImpulse": 9.0,
  "dashCooldown": 1.0,
  "dashAirMultiplier": 0.65,
  "dashMaxHorizontalSpeed": 28.0,
  "dashPresentationSeconds": 0.18
}
```

Codex may tune these during real browser testing but must document final values.

## 5.1 Legacy fields

These are no longer authoritative locomotion controls:

```text
boostMult
boostGrip
braceGrip
braceAccelMult
braceSteerMult
jumpImpulse
```

These recoil values lose active input-driven use:

```text
braceRecoilMult
jackpotBraceMult
```

Preferred migration:

1. Update current JSON and callers.
2. Remove obsolete required schema fields.
3. Remove old runtime use.
4. Remove live HUD/document references.
5. Use a narrow loader migration only if old external content must remain loadable.
6. Do not preserve two active movement models.

---

# 6. Input and network contract

## 6.1 Driver input

Replace:

```ts
boost: boolean;
brace: boolean;
```

with:

```ts
dashPressed: boolean;
jumpPressed: boolean;
```

Recommended final shape:

```ts
export interface DriverInput {
  throttle: number;
  steer: number;
  dashPressed: boolean;
  jumpPressed: boolean;
}
```

These booleans represent actions that occur once for that sequenced input frame. They are not held-state flags.

## 6.2 Input latching

A quick press must not be lost between network sends.

The input layer must:

1. Detect keydown transition.
2. Ignore repeated browser keydown events.
3. Latch the action.
4. Include it in the next Driver input frame.
5. Clear the latch only after that frame is created.
6. Require keyup before another edge can occur.

On blur, pointer loss, pause, visibility loss, disconnect, or teardown, clear movement keys and pending action latches.

## 6.3 Sequencing and replay

Each `PlayerInput.seq` may apply `jumpPressed` and `dashPressed` at most once during:

- Server processing
- Local prediction
- Reconciliation replay
- Practice stepping
- Duplicate/stale input rejection

The shared kinematic step must not infer action edges from held state. The sequenced input already contains the edge.

## 6.4 Server validation

Server sanitization must:

- Accept only explicit booleans.
- Reject stale/duplicate sequences as already designed.
- Never manufacture extra edges.
- Clear pending actions with stale input.
- Preserve throttle/steering validation.

---

# 7. Shared deterministic kinematics

Update the current equivalents of:

```text
src/shared/sim/tankKinematics.ts
src/client/predictor.ts
src/client/app/predictionController.ts
src/shared/sim/match.ts
src/shared/sim/matchRuntime.ts
```

## 7.1 Jump application

Conceptual behavior:

```ts
if (input.jumpPressed && state.grounded && rules.jumpHeight > 0) {
  state.vy = Math.max(
    state.vy,
    Math.sqrt(2 * rules.gravity * rules.jumpHeight),
  );
  state.grounded = false;
}
```

Requirements:

- Apply before normal gravity integration.
- Do not immediately snap back to ground in the same step.
- Avoid slope-triggered repeated jumps.
- Preserve ramp and fall-damage behavior.
- Do not add double jump.
- Do not add coyote time or buffering unless demonstrably needed and made data-driven.

## 7.2 Dash application

Conceptual behavior:

```ts
if (input.dashPressed && state.dashCooldown <= 0) {
  const strength = rules.dashImpulse *
    (state.grounded ? 1 : rules.dashAirMultiplier);

  if (strength > 0) {
    state.vx += Math.sin(state.yaw) * strength;
    state.vz += Math.cos(state.yaw) * strength;
    capHorizontalSpeed(state, rules.dashMaxHorizontalSpeed);
    state.dashCooldown = rules.dashCooldown;
    state.dashPresentationT = rules.dashPresentationSeconds;
  }
}
```

Requirements:

- Use chassis yaw.
- Apply once.
- Preserve lateral momentum.
- Do not modify `vy`.
- Decrement cooldown by simulation time.
- Decrement presentation time separately.
- Continue displacement-based collision substeps.
- Preserve wall sliding.
- Dash may start from rest, forward, reverse, or lateral drift.
- Dashing while reversing still bursts chassis-forward.

## 7.3 State fields

Replace/migrate `boosting` and `brace` with useful state such as:

```ts
dashCooldown: number;
dashPresentationT: number;
```

Existing `grounded` and `vy` describe jumping. A client may derive `jumping = !grounded && vy > 0`.

---

# 8. Prediction and rule synchronization

The Driver predictor must receive and use:

```text
jumpHeight
gravity
dashImpulse
dashCooldown
dashAirMultiplier
dashMaxHorizontalSpeed
```

Requirements:

- Local jump and dash begin immediately.
- Authority accepts the same edge and reaches the same result.
- Reconciliation does not apply an impulse twice.
- Replaying unacknowledged inputs applies each edge once per sequence.
- Runtime modifiers increment movement-rules revision.
- Client applies the correct revision before later prediction.
- Practice uses the same resolved content data, not a separate movement model.

---

# 9. Presentation and active documentation

## 9.1 HUD/tutorial text

Use:

```text
SHIFT — DASH
SPACE — JUMP
```

Remove live text:

```text
SHIFT — BOOST
SPACE — BRACE
HOLD SPACE TO BRACE
```

Update active README, How To Play, Driver HUD, Practice HUD, Smoke Test, controls tables, and contextual prompts. Historical archived reports may remain when clearly historical.

## 9.2 PIP labels

Replace `BOOSTING` and `BRACING` with `DASHING` and `JUMPING`.

Suggested action priority:

```text
WIPEOUT
JUMPING
DASHING
DRIFTING
DRIVING
IDLE
```

Use `dashPresentationT`; do not label the whole cooldown as dashing.

## 9.3 Audio and VFX

Register semantic events:

```text
audio.dash
audio.jump
vfx.dashBurst
vfx.jumpDust
```

Procedural fallbacks are acceptable.

Dash feedback must be a short transient, never a held loop. Jump should include takeoff dust and a short mechanical sound. Physics must not depend on effect duration.

---

# 10. Brace-dependent Demo mechanics

The current Demo historically includes brace-shot links, brace bonuses, recoil reduction, `BRACING`, and `HOLD SPACE TO BRACE`.

After this migration:

- JACKPOT must not require brace.
- No brace prompt is shown.
- Jump does not award brace links or bonuses.
- Space never reduces recoil.
- Active brace-dependent scoring paths are removed or disabled.
- Deterministic Demo fixtures are reviewed and intentionally updated.
- Main cannon and JACKPOT remain fully functional unbraced.

Brace may remain as a future registered mechanic, but no active path should pretend it is still bound.

---

# 11. Difficulty migration

Review existing difficulty overrides, especially:

```text
difficulty.soapTracks
match.boostGrip
difficulty.moonYard
match.gravity
```

Requirements:

- Remove held-boost-specific overrides.
- Soap Tracks modifies ordinary grip/drift values rather than nonexistent boost state.
- Moon Yard continues lowering gravity.
- With `jumpHeight`, Moon Yard creates longer airtime while maintaining approximate target height.
- Difficulties may override jump/dash stats through the runtime stat system.

Suggested override targets:

```text
tank.jumpHeight
tank.dashImpulse
tank.dashCooldown
tank.dashAirMultiplier
tank.dashMaxHorizontalSpeed
tank.normalGrip
tank.gravity
```

---

# 12. Likely affected files

Codex must inspect the current tree. Likely areas include:

```text
content/tanks/default.json
content/difficulties/*.json
content/scoring/demoScoreAttack.json
content/presentation/demoScoreAttack.json

src/shared/types.ts
src/shared/content/schemas/tank.ts
src/shared/rules/contentConfig.ts
src/shared/rules/matchRules.ts
src/shared/stats/statIds.ts
src/shared/stats/rulesRevision.ts
src/shared/sim/tankKinematics.ts
src/shared/sim/match.ts
src/shared/sim/matchRuntime.ts

src/server/room.ts

src/client/input.ts
src/client/app/gameClient.ts
src/client/app/predictionController.ts
src/client/app/hudController.ts
src/client/app/pipRenderer.ts
src/client/app/presentationEventRouter.ts
src/client/hud.ts
src/client/audio.ts
src/client/vfx.ts

tests/input.test.ts
tests/tankKinematics.test.ts
tests/predictor.test.ts
tests/matchRules.test.ts
tests/room.test.ts
tests/demoRegression.test.ts
e2e/controls.spec.ts
e2e/practice.spec.ts
e2e/full-game.spec.ts
```

---

# 13. Required tests

## Input

- One `jumpPressed` per Space press.
- No repeat while held.
- Second edge after release/repress.
- One `dashPressed` per Shift press.
- Browser key-repeat does not duplicate actions.
- Blur/pause/visibility loss clears latches.
- W/A/S/D and Gunner input unchanged.

## Jump

- Grounded jump launches upward.
- Velocity derives from `sqrt(2 * gravity * jumpHeight)`.
- Apex approximates `jumpHeight` within integration tolerance.
- Height zero disables jump.
- No air jump.
- Landing permits later jump.
- Horizontal momentum preserved.
- Gravity modifiers change airtime but preserve approximate target height.
- Server/predictor parity.

## Dash

- One chassis-forward impulse.
- Holding Shift is not sprint behavior.
- Cooldown rejects early repress and accepts later repress.
- Reverse still bursts chassis-forward.
- Lateral and vertical velocity preserved.
- Air multiplier works; zero disables air dash.
- Speed cap works.
- No tunneling or wall oscillation.
- Server/predictor parity.
- Replay does not double-apply.

## Rules/data

- New tank JSON validates.
- `jumpImpulse` is removed or deliberately migrated.
- Runtime modifiers affect jump/dash.
- Movement revision changes.
- Two rooms can use different values.
- Negative values fail clearly.

## Regression

- Driver movement/steering and Gunner controls remain correct.
- Main cannon and JACKPOT work without brace.
- Jump does not receive brace bonuses.
- Results/rematch and Practice work.
- Cameras, interpolation, collision, enemies, pickups, scoring, and assets remain functional.

---

# 14. Manual acceptance

In Chrome and Edge:

1. Space once → one jump.
2. Hold Space → no repeat.
3. Land, release, repress → second jump.
4. Shift once from rest → immediate forward burst.
5. Hold Shift → no sprint and no repeated dash.
6. Release, wait cooldown, repress → second dash.
7. Dash while reversing → chassis-forward burst.
8. Dash while turning/drifting → momentum preserved.
9. Dash into wall → no tunneling/jitter.
10. Jump/dash while looking backward → chassis-relative behavior.
11. Driver sees immediate prediction; Gunner sees smooth authority.
12. No duplicate action after reconciliation.
13. Practice uses Space Jump and Shift Dash.
14. HUD/PIP use JUMP/DASH labels and contain no active brace/boost prompts.

---

# 15. Verification commands

```bash
npm run build
npm test
npm run test:demo
npm run test:e2e
npm run test:loop
```

If the golden Demo fixture changes due to intentional brace removal:

1. Review the diff.
2. Confirm only intended behavior changed.
3. Update through the documented command.
4. Record changed checkpoints and reason.
5. Never regenerate blindly.

---

# 16. Completion gate

This milestone passes only when:

> Space produces one authoritative, predicted, data-driven jump whose approximate height is controlled by `jumpHeight`; Left Shift produces one authoritative, predicted, data-driven chassis-forward dash whose strength and cooldown are configurable; neither repeats while held; held boost and active brace are removed from the Driver control path; collision and reconciliation remain stable; and the full online and Practice Demo continue to work.
