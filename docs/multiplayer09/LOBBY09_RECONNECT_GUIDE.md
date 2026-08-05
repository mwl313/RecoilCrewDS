# Lobby 09 — Reconnect Guide

- Disconnect marks the player `connected=false`, `reconnecting=true`,
  reserves the seat, clears Ready, and cancels any countdown.
- Rejoin by `sessionId` restores `playerId`, `displayName`, and seat; Ready
  stays false; the full `lobbyState` + chat history are resent.
- Grace expiry removes the player, frees the seat, clears Ready, cancels
  countdown, and migrates Host to the connected player with the lowest
  `joinedSequence`.
- During an active match, reconnect semantics are unchanged (existing
  mid-round rejoin path).
