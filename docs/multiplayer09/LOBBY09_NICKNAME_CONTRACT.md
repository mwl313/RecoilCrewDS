# Lobby 09 — Nickname Contract

- Format: `<Base><NN>` (e.g. `TurboToad07`); `NN` is exactly two decimal
  digits (`00`–`99`).
- Base pool lives once in `src/shared/lobby/nicknamePool.ts` (54 entries).
- `generateDefaultNickname(randomInt?)` accepts an injected RNG for tests;
  production uses `crypto.getRandomValues` with a `Math.random` fallback.
- Storage key: `recoilCrew.playerSettings.v1`; shape
  `{ version: 1, nickname: string }`.
- First launch generates and persists once; reload reuses; corruption or
  invalid stored names recover with a fresh generated default; storage
  failure falls back to in-memory settings.
- Shared validation (client + server): 1–20 Unicode code points, outer
  whitespace trimmed, internal whitespace collapsed, line breaks and
  control characters rejected, empty-after-normalization rejected.
- Nicknames are presentation metadata only: identity is `playerId` +
  `sessionId`; duplicates are allowed; reconnect restores the server-side
  name, never a client-supplied replacement.
