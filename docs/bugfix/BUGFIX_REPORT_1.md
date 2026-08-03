# Bug Fix Report #1 — Keyboard and Mouse Controls Do Not Work

**Date:** 2026-08-02
**Status:** Fixed (verified by unit tests and browser probes; full e2e suite pending re-run)
**Report index:** 1

---

## 1. Summary

Real keyboard and mouse input had no effect on the game: the Driver could not
move, the Gunner could not aim or fire, and players were stuck at the spawn
camera (which was misread as being "embedded in an entity"). The root cause
was a broken input pipeline, plus a secondary defect that made pointer lock
unreachable after the online countdown.

---

## 2. Symptoms

- Driver WASD, Shift (boost), and Space (brace) did nothing — online and in
  practice.
- Gunner mouse look, left-click machine gun, and right-click cannon did
  nothing.
- Practice turret aim did not follow the mouse.
- Players could not move and remained fixed at the spawn view.
- Tab (camera swap), R (recenter), and Esc still worked.

---

## 3. Root Cause

Two independent defects in the client input path:

### 3.1 The input bridge between `InputManager` and `Game` was missing

`InputManager` (`src/client/input.ts`) owns the real DOM event listeners and
stores state in its own private sets. `Game` (`src/client/game.ts`) reads
keyboard and mouse state from **its own private `keys`/`mouse`/`mouseDx`/
`mouseDy` fields** via `keyAxis()`, `mouseDown()`, and `addMouse()`.

Nothing ever connected the two:

- `Game.setKey()`, `Game.setMouseButton()`, and `Game.addMouse()` had **zero
  callers** anywhere in the codebase (confirmed by grep over `src/` and over
  the compiled bundle).
- `main.ts` never polls `InputManager.key()`, `InputManager.button()`, or
  `InputManager.consumeMouse()` to forward them into the game.
- `InputManager.consumeMouse()` itself had zero callers.

Result: every frame, `Game` sampled permanently empty input state. The
network/server path was healthy — injecting the same input through the test
hook moved the tank instantly.

### 3.2 Pointer lock could not be re-acquired after the online countdown

`startOnline()` called `input.requestLock()` from the WebSocket `start`
message handler — **not** from a user gesture. Chrome rejects pointer-lock
requests without transient user activation, and no canvas click handler
re-requested the lock afterward. The HUD correctly showed "CLICK TO AIM", but
clicking did nothing. So even with the bridge fixed, mouse look/fire would
remain impossible in a real browser until the player reloaded.

---

## 4. Evidence

Before the fix (live browser probes):

| Scenario | Result |
| --- | --- |
| Practice, hold W for 1.2 s | tank z delta = 0.000 |
| Online Driver, hold W for 1.5 s | tank z delta = 0.000 |
| Online Driver, same input via test hook (bypasses keyboard) | tank z delta = +4.489 |

The practice e2e failed at its real-keyboard movement assertion with the
missing bridge in place.

---

## 5. Fix

### 5.1 Single real input source

- `src/client/game.ts` now accepts an `InputSource` (a minimal interface with
  `key()`, `button()`, `consumeMouse()`) in its constructor and reads input
  directly from it every frame.
- The dead duplicate state (`keys`, `mouse`, `mouseDx`, `mouseDy`) and the
  never-called setters (`setKey`, `setMouseButton`, `addMouse`) were removed,
  along with the unused `lastCannonAt` field.
- `src/client/main.ts` passes the real `InputManager` into `Game` in both
  online and practice modes.

### 5.2 Pointer lock recovery

- `src/client/input.ts`: a canvas mouse-down while unlocked now calls
  `requestLock()` inside the user gesture, then returns without firing a
  weapon button. This makes the first click after countdown/pause acquire the
  lock, matching the HUD's "CLICK TO AIM" prompt.

### 5.3 Regression coverage

- `tests/input.test.ts` (new, 6 tests): semantic key mapping, one-shot
  swap/recenter/escape flags, mouse-delta consumption, locked-only mouse
  buttons, click-to-lock behavior, and key/button clearing on lock loss.
- `e2e/controls.spec.ts` (new, 2 tests): real Driver keyboard input moves the
  shared tank through the authoritative server; real Gunner mouse acquires
  pointer lock, fires the machine gun (server `mgCooldown`), and rotates the
  turret on the authoritative state.
- `e2e/practice.spec.ts` real-keyboard assertion now passes again.

---

## 6. Verification

- `npx tsc --noEmit` — clean.
- `npm test` — **53/53 passed** (47 previous + 6 new input tests).
- Practice keyboard probe — tank moved **+7.23 m** after 1 s of holding W.
- `npx playwright test e2e/controls.spec.ts` — see run result below.

---

## 7. Files Changed

| File | Change |
| --- | --- |
| `src/client/game.ts` | `InputSource` interface; constructor takes input source; reads real input; removed dead state/setters |
| `src/client/main.ts` | Passes `InputManager` into `Game`; test hook gains `setAutoInput()` |
| `src/client/input.ts` | Canvas click re-requests pointer lock inside the gesture |
| `tests/input.test.ts` | New unit tests for the input layer |
| `e2e/controls.spec.ts` | New e2e tests for real keyboard and mouse paths |
| `BUGFIX_REPORT_1.md` | This report |

---

## 8. Notes for Players

- Keyboard controls work immediately after GO.
- Mouse look and weapons require pointer lock: click the game canvas once if
  the "CLICK TO AIM" prompt is visible (online, after the countdown).
- Esc releases the mouse; the pause menu's Resume re-locks on click.
