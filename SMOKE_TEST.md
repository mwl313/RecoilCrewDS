# Manual Smoke Test

Run the production server, then follow this checklist. Each item should
complete without console errors.

```bash
npm install && npm run build && npm run server
```

## 1. Two local browser tabs

1. Open `http://localhost:8080` in Chrome and Edge (or two Chrome windows).
2. Player A: **CREATE CREW** → a six-character code appears and role shows
   **DRIVER**.
3. Player B: **JOIN CREW** → type the code (uppercase auto-applied) → role
   shows **GUNNER**.
4. Both press **READY** → countdown 3-2-1-GO → both enter the same tank.

## 2. Two separate networks

Deploy per `DEPLOYMENT.md`, or expose port 8080 temporarily. Player A creates
the crew on their machine; Player B joins from another network with the code.
The flow must be identical — no IP knowledge or router configuration.

## 3. Practice

Main menu → **PRACTICE**. Drive with WASD, aim with the mouse, fire MG (LMB)
and cannon (RMB). **Tab** swaps Driver/Gunner views. Esc opens the pause menu.

## 4. Pointer lock

## 5. Refactor validation (automated)

Run `npm test` and `npm run test:demo`; the deterministic golden Demo must
be byte-identical. `tests/proofContent.test.ts` validates the alternate
mode (truck-escape completion), the Rapid Cannon proof weapon, the
composed Test Hound enemy, and the Overdrive Cannon item; room rules
isolation, invalid-content failure, and custom-asset replacement
(manifest GLB via injected loader) are covered by the unit suites.

After GO, click the canvas → cursor locks. Mouse look is immediate for both
roles. Esc unlocks and opens the pause menu; Resume re-locks.

Direction check: mouse right looks right, mouse up looks up (both roles).
The pause overlay neutralizes gameplay input; blur/refocus never leaves a
stuck key.

## 5. Driver controls

- W accelerates, S reverses, A/D steer (chassis-relative).
- A turns left and D turns right even while reversing (strength may reduce,
  direction never flips).
- Shift boosts and drifts; Space deploys braces (stabilizers appear).
- R recenters the camera behind the chassis.
- Driving feels immediate (local prediction) and settles smoothly to the
  server state; the tank no longer visibly steps at snapshot rate.
- Boost and recoil do not push the tank through walls; the nose never sinks
  into obstacles; the camera never clips the tank, floor, walls, or corners.

## 6. Gunner controls

- Mouse aims; crosshair is center-screen; the turret follows instantly.
- While the Driver turns the chassis, the turret keeps the aimed world point.
- LMB fires the machine gun with tracers; RMB fires the cannon.
- Cannon recoil visibly shoves/spins the shared tank within 10 seconds.

## 7. PIP

Bottom-right shows the partner role feed (`DRIVER FEED` / `GUNNER FEED`) with
an action label (BRACING, CHARGING, DRIVING…). The connection dot stays green;
close one tab and it turns red (reconnect within 10 s by refreshing with the
same session — the retry path offers Practice).

## 8. First pickup

Kill a Scrap Bug (Gunner), drive through its scrap (Driver) → pickup chime,
green burst, score and JACKPOT meter rise.

## 9. Loot Truck

At ~42 s the Loot Truck appears with a gold marker and siren. Destroy it for a
shower of JACKPOT scrap. If it escapes, the meter still reaches JACKPOT via
assistance pacing.

## 10. JACKPOT

At ~55–70 s the meter reaches full. Driver sees **HOLD SPACE TO BRACE**;
Gunner sees **HOLD RIGHT MOUSE TO CHARGE**. A charged shot produces a huge
flash, massive recoil, chain detonations, and a scrap shower.

## 11. Wipeout

Stand still near Rammers/towers to reach 0 integrity: dramatic explosion,
3-second respawn, 2-second shield, score penalty, combo reset — the round
continues and never ends early.

## 12. Results and rematch

At 90 s both clients show results (score, best combo, JACKPOT count, grade,
humorous title). Pick a modifier on both sides → countdown → fresh round in
the same room with the modifier applied.

## 13. Disconnect

Kill the server during a round → both clients show the connection screen with
**RETRY**, **PRACTICE**, and **MAIN MENU**. Restart the server, click RETRY,
and the crew rejoins (session-based reconnect during the grace window).

## 14. Room-code copy

The Copy button is disabled until a real code exists. Clicking it copies via
the Clipboard API and shows success/error feedback; if the API is blocked the
code is selected in a textarea fallback so it can still be copied manually.

## Automated equivalents

- `npm test` — 97 unit/integration tests.
- `npm run test:e2e` — two real Chrome clients play a complete round and
  rematch, plus dedicated TPS/controls/collision/copy browser tests.
- `npm run test:loop` — two headless WebSocket clients play a complete
  90-second round and rematch.
