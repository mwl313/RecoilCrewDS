# Lobby 09 — Implementation Plan

## Milestones

```text
M0  Audit + planning docs + baseline
M1  Shared nickname pool/validation (src/shared/lobby/)
M2  Persistent player settings (src/client/settings/)
M3  Settings scene + Main Menu identity + flow/actions
M4  Generic revisioned lobby state (server)
M5  Create/Join carry displayName; playerId identity
M6  Unified Lobby V2 client view
M7  Authoritative Driver/Gunner seat selection
M8  Ready/Unready + countdown + cancellation
M9  Room-local chat (bounded, rate-limited)
M10 Reconnect restoration + host migration
M11 Shared Tank start adapter (seat → driver/gunner slots)
M12 Tests + E2E + reports
```

## Key decisions

- Protocol bumps to **v8** atomically across client/server/tests.
- `lobbyState` (revisioned full state + bounded chat history) becomes the
  authoritative broadcast; legacy `lobby` ready-boolean messages are
  removed from the server after the client migrates.
- `room.driver`/`room.gunner` remain the match-slot fields; Lobby V2 keeps
  them in sync with seats so `startMatch`/input routing stay untouched.
- The Lobby V2 view is a code-owned client view (mounted by `Hud`) that
  preserves the legacy DOM hooks (`#screen-ready`, `#create-ready`,
  `#ready-go`) so existing two-browser specs keep passing; Settings and
  Main Menu remain content-driven scenes.
- Nicknames: shared pool + generator + validator; identity is always
  `playerId`/`sessionId`; duplicates allowed.
- Seat suggestion: creator → Driver, joiner → Gunner (changeable before
  Ready; no automatic permanent assignment).
- Chat: token bucket (burst 4, refill 1 per 2 s), 200 code points, 30
  retained messages, rendered with `textContent`.
- Extended Multiplayer (multi-tank, combined network controls, friendly
  cannon, per-tank progression, >2 players) is **not implemented**.

## Commands (to be added)

```json
{
  "test:lobby": "vitest run tests/lobby09",
  "test:lobby:e2e": "playwright test e2e/lobby-nickname-settings.spec.ts e2e/lobby-seat-ready.spec.ts e2e/lobby-chat.spec.ts e2e/lobby-reconnect.spec.ts"
}
```
