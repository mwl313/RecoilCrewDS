# Lobby 09 — Nickname and Settings Guide

- Storage key: `recoilCrew.playerSettings.v1` (`{ version: 1, nickname }`).
- First launch generates `<Base><NN>` once and persists it; reload reuses;
  corruption/invalid values recover with a fresh default; storage failure
  falls back to in-memory settings.
- Pool: `src/shared/lobby/nicknamePool.ts` (54 bases). Generator:
  `generateDefaultNickname(randomInt?)` — zero-padded two-digit suffix.
- Validation: `validateNickname` in `src/shared/lobby/nicknameValidation.ts`
  (1–20 Unicode code points, trim/collapse whitespace, no control chars).
  Used by the client before SAVE and by the server on create/join.
- Settings flow: RANDOMIZE edits the draft only; SAVE validates + persists +
  updates Main Menu; CANCEL discards the draft.
- The nickname sent with Create/Join is the saved value; the server stores
  it per player. Reconnect restores the server-side name — a client cannot
  rename itself inside an active room.
- Identity is always `playerId` + `sessionId`; nicknames are cosmetic and
  may duplicate.
