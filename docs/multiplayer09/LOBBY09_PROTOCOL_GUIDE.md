# Lobby 09 — Protocol Guide

`PROTOCOL_VERSION = 8`.

## Client → server

```text
create            { displayName }
join              { code, displayName }
rejoin            { code, sessionId }
lobbySelectSeat   { seat: "driver"|"gunner"|null, lobbyRevision }
lobbyReadySet     { ready, lobbyRevision }
lobbyChatSend     { text }
ready             { ready }  (legacy alias for lobbyReadySet)
```

## Server → client

```text
created/joined     carry sessionId, playerId, displayName, seat,
                   hostPlayerId, lobby, chat
lobbyState         { lobby, chat } — revisioned full state after every
                   accepted mutation
countdown          { n } presentation compatibility
start              unchanged
error              { code, message }
```

`lobby.players[]` never contains `sessionId`. The client identifies itself
with `playerId`.

## Start eligibility

Requires two connected players, one Driver, one Gunner, both Ready, valid
content. Reasons: `waiting_for_player`, `invalid_seats`, `player_not_ready`,
`player_disconnected`, `content_unavailable`, `eligible`.
