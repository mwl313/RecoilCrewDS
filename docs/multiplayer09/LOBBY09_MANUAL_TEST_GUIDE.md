# Lobby 09 — Manual Test Guide

Run `npm run dev:server` + `npm run dev:client` (or `npm run build` +
`npm start`), open two browser windows, and verify:

1. First launch generates a `BaseNN` nickname; reload reuses it.
2. Main Menu shows `PLAYING AS`; Settings Randomize/Save/Cancel behave.
3. Create and Join show the unified lobby with both names and YOU only on
   the local card.
4. Seat conflicts are rejected; release-then-request switches seats; seat
   changes clear Ready.
5. Both Ready → countdown; Unready/disconnect cancels it.
6. Chat exchanges render as plain text; rapid sends are rate-limited.
7. Disconnect + rejoin restores nickname/seat with Ready false.
8. Countdown completes into the Shared Tank match: selected Driver moves,
   selected Gunner aims/fires; Charge Shot, progression, results, and
   rematch behave exactly as before.

Automated equivalents: `npm run test:lobby` and `npm run test:lobby:e2e`.
