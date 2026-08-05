# Lobby 09 — Implementation Report

Branch: `lobby-upgrade` (base `0b4f01d`).

## Scope

Lobby V2 only. **Extended Multiplayer was not implemented**: no second
player tank, no combined network controls, no friendly allied cannon
physics, no per-tank progression, no >2 player rooms, no matchmaking, no
spectators, no voice, no persistent accounts. The match remains exactly one
Shared Tank with one Driver and one Gunner.

## What shipped

- Persistent nickname settings (`recoilCrew.playerSettings.v1`), curated
  `BaseNN` pool, deterministic generator, shared client/server validation.
- Content-driven Settings scene + Main Menu `SETTINGS` / `PLAYING AS`.
- Revisioned authoritative lobby state (`lobbyState`) with generic players,
  host identity, seats, ready, eligibility, and bounded chat history.
- `playerId`/`sessionId` identity; display names are presentation metadata;
  duplicates allowed; YOU resolves by `playerId`.
- Authoritative Driver/Gunner seat selection with release-then-request,
  conflict rejection, stale-revision rejection, and Ready invalidation.
- Ready/Unready with countdown start and cancellation (unready, disconnect,
  leave, seat change, eligibility failure).
- Room-local chat (200 code points, burst-4/2s rate limit, 30-message
  history, `textContent` rendering).
- Reconnect restores nickname + seat, keeps Ready false; host migrates after
  grace expiry to the connected lowest-`joinedSequence` player.
- Shared Tank start adapter: chosen seats map to the existing
  `room.driver`/`room.gunner` slots; input routing, match, combat,
  progression, animation, and netcode are untouched.
- Protocol v8 (create/join carry `displayName`; `lobbySelectSeat`,
  `lobbyReadySet`, `lobbyChatSend`; `lobbyState` broadcasts).

## Commands and actual outputs

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| `npm run generate:presentation-content` | PASS (11 scenes) |
| `npm run generate:content-pack` | PASS |
| `npm run generate:map-profiles` | PASS |
| `npm run build` | PASS |
| `npm test` | 129 files / 887 tests PASS |
| `npm run test:lobby` | 11 files / 34 tests PASS |
| `npm run test:lobby:e2e` | 6/6 PASS |
| `npm run test:demo` | PASS, golden unchanged |
| `npm run test:coreloop` | PASS (9) |
| `npm run test:horde` | PASS (61) |
| `npm run test:presentation` | PASS (37) |
| `npm run test:animation` | PASS (75) |
| `npm run test:progression` | PASS (116) |
| `npm run test:netcode` | PASS (27) |
| `npm run test:maplab` | PASS (32) |
| `npm run test:e2e` | 47/47 PASS |

## Regression invariants

- One shared tank, one Driver, one Gunner: unchanged.
- Charge Shot, Dash, ROADKILL, cannon, progression pause/offers, horde,
  Coreloop, Animation 07, and Single Player: unchanged (all suites green;
  Demo golden byte-identical).
- Existing match input/action/snapshot/reconnect/rematch remain functional
  (full E2E 47/47, including the migrated two-browser specs).

## Known limitations

- Seat changes require explicit release before requesting the other seat
  (no swap negotiation, per design).
- Settings is reachable only from the Main Menu; changing the saved nickname
  does not mutate an active room (the room keeps the name used at join).
- Lobby errors (e.g. rate limit) are delivered as server `error` messages;
  the lobby view surfaces authoritative state rather than transient errors.
