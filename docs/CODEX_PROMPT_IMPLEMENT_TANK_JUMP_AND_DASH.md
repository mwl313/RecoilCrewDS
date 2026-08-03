# Codex Prompt — Implement Data-Driven Tank Jump and Edge-Triggered Dash

Read first:

```text
MILESTONE_TANK_JUMP_AND_DASH.md
README.md
docs/README.md
docs/guides/ARCHITECTURE.md
docs/guides/CONTENT_AUTHORING_GUIDE.md
docs/guides/NETWORK_RULES.md
docs/guides/SMOKE_TEST.md
docs/refractor/REFACTOR_STATUS.md
docs/refractor/REFACTOR_REPORT.md
```

Treat `MILESTONE_TANK_JUMP_AND_DASH.md` as the binding implementation contract.

This is an existing refactored TypeScript/Three.js/Node WebSocket game.

Do not change stacks, rewrite the game, or redesign cameras, weapons, enemies, objectives, assets, or networking.

Implement the migration completely and verify it.

---

# Goal

Change Driver controls to:

```text
Space      → edge-triggered Jump
Left Shift → edge-triggered chassis-forward Dash
```

The dash is an instantaneous burst, not a held sprint or boost.

Both actions must be:

- Server-authoritative
- Locally predicted for the Driver
- Deterministic through shared kinematics
- Reconciliation-safe
- Functional in Practice
- Data-driven through tank JSON and runtime stats
- Covered by unit, browser, Demo-regression, and full-loop tests

---

# Required first step

Inspect every relevant current file before editing.

Create:

```text
docs/planning/JUMP_DASH_IMPLEMENTATION_PLAN.md
```

Identify exact current locations for:

- `DriverInput`
- Shift/Space mapping
- Input edge/latch handling
- Serialization and server sanitization
- Shared tank kinematics
- Grounding and vertical velocity
- Prediction/replay
- Movement rules block
- Tank schema/JSON
- Runtime stat IDs
- Difficulty overrides
- Tank/PIP state fields
- HUD/control strings
- Brace-dependent recoil/scoring/JACKPOT logic
- Audio/VFX
- Unit/E2E/Demo regression coverage

Then implement immediately. Do not stop after the audit.

---

# Mandatory architecture

## Input

Replace active fields:

```ts
boost: boolean;
brace: boolean;
```

with:

```ts
dashPressed: boolean;
jumpPressed: boolean;
```

These are sequenced one-shot action edges.

Latch quick key presses until the next Driver input frame is generated. Holding must not repeat. Clear latches on blur, visibility loss, pause, disconnect, input disable, and teardown.

## Jump

Use designer-facing `jumpHeight`, not active `jumpImpulse`.

Derive launch velocity identically on server and predictor:

```ts
Math.sqrt(2 * gravity * jumpHeight)
```

Jump only while grounded by default, preserve horizontal momentum, and do not add double jump.

## Dash

Use data fields:

```text
dashImpulse
dashCooldown
dashAirMultiplier
dashMaxHorizontalSpeed
dashPresentationSeconds
```

On one accepted edge:

```text
horizontal velocity += chassisForward × resolvedDashStrength
cap horizontal speed if configured
start cooldown
start short presentation timer
```

Do not create a held boost state. Do not alter vertical velocity or discard lateral momentum. Continue using high-speed collision substeps.

## Prediction

Each input sequence applies its dash/jump edge once. Replaying unacknowledged inputs must not duplicate impulses. Synchronize every movement-critical value through movement-rule revisions.

## Brace removal

There is no active brace input after this patch.

Remove/disable:

- Brace movement changes
- Input-driven recoil reduction
- Brace HUD/PIP labels
- `HOLD SPACE TO BRACE`
- Brace-shot/JACKPOT brace bonuses in active Demo behavior

Do not reinterpret Jump as Brace. Main cannon and JACKPOT remain usable.

## Data migration

Update the tank schema and `content/tanks/default.json`.

Prefer a clean migration from obsolete active fields because no third-party content-pack compatibility requirement is documented. Do not leave two active movement models.

Update difficulty overrides that refer to held boost. Add runtime stat IDs for jump/dash.

---

# Implementation order

## 1. Failure-reproducing tests

Add/update tests showing the old Space/Shift behavior and absence of action edges.

## 2. Schema and content

Update tank schema, default JSON, content projection, match rules, stat IDs, movement rules, and difficulties. Validate all content.

## 3. Input/network

Implement latched edges. Update shared types, client generation, WebSocket messages, server sanitization, stale-input clearing, Practice, and tests.

## 4. Shared kinematics

Implement deterministic jump and dash. Update state fields and collision handling.

## 5. Prediction/reconciliation

Update Driver predictor and movement-rule synchronization. Test replay and acknowledgement behavior.

## 6. Dependency cleanup

Remove active brace/boost dependencies from recoil, JACKPOT, Crew Link/scoring, HUD/PIP, prompts, and action labels while preserving unrelated gameplay.

## 7. Presentation

Add semantic jump/dash audio and VFX fallbacks. Update active control text and docs.

## 8. Regression

Run the complete suite and perform two-browser validation.

---

# Required coverage

Implement the complete matrix from the specification, including:

```text
one edge per press
no repeat while held
grounded jump
height derived from gravity and jumpHeight
no air jump
dash impulse and cooldown
air multiplier
speed cap
chassis-forward direction
momentum preservation
no tunneling
server/predictor parity
replay does not double-apply
movement-rules revision
different per-room values
Practice
online controls
brace no longer active
full Demo/results/rematch
```

---

# Commands

Run and report actual results:

```bash
npm run build
npm test
npm run test:demo
npm run test:e2e
npm run test:loop
```

Do not claim success unless a command was run.

If the golden Demo fixture changes intentionally, review and document the exact reason before updating it.

---

# Documentation

Create:

```text
docs/planning/JUMP_DASH_IMPLEMENTATION_PLAN.md
docs/planning/JUMP_DASH_IMPLEMENTATION_REPORT.md
```

Update:

```text
docs/README.md
docs/guides/CONTENT_AUTHORING_GUIDE.md
docs/guides/NETWORK_RULES.md
docs/guides/SMOKE_TEST.md
docs/guides/ARCHITECTURE.md
docs/planning/BUILD_STATUS.md
```

Historical archived design documents may remain unchanged when clearly historical.

---

# Forbidden shortcuts

Do not:

- Keep Shift as a multiplier and merely rename it Dash.
- Apply dash every frame while held.
- Implement jump only on client or only on server.
- Hardcode jump/dash strength in kinematics.
- Use camera forward for dash.
- Replay an edge multiple times.
- Let Jump trigger brace bonuses.
- Preserve hidden recoil reduction on Space.
- Remove prediction to avoid replay bugs.
- Reduce collision quality.
- Regenerate golden fixtures without review.
- Replace the Demo with a smaller test scene.

---

# Completion report

Return:

1. Old behavior/root causes
2. Files added
3. Files modified
4. Final Driver input contract
5. Jump-height formula and data fields
6. Dash formula and data fields
7. Input latching and sequencing
8. Prediction/replay handling
9. State/schema migration
10. Brace/boost cleanup
11. Difficulty migration
12. Audio/VFX/HUD changes
13. Unit result
14. Demo regression result
15. E2E result
16. Full-loop result
17. Manual two-browser result
18. Remaining limitations
19. Exact designer instructions for changing jump and dash values
