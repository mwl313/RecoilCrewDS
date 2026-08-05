# Lobby 09 — Protocol Contract

Protocol version: **8** (bumped for lobby V2 wire changes).

## Client → server

```ts
{ t: "create"; displayName: string }
{ t: "join"; code: string; displayName: string }
{ t: "rejoin"; code: string; sessionId: string }
{ t: "lobbySelectSeat"; seat: "driver" | "gunner" | null; lobbyRevision: number }
{ t: "lobbyReadySet"; ready: boolean; lobbyRevision: number }
{ t: "lobbyChatSend"; text: string }
{ t: "leave" }
```

`create`/`join` without a valid `displayName` fall back to a server-generated
default (`BaseNN` from the shared pool).

## Server → client

```ts
{ t: "created"; code; sessionId; playerId; displayName; seat; hostPlayerId; lobbyState }
{ t: "joined"; code; sessionId; playerId; displayName; seat; hostPlayerId; lobbyState }
{ t: "lobbyState"; lobby: ClientLobbyState; chat: LobbyChatMessage[] }
{ t: "countdown"; n: number }
{ t: "start"; ... }   // unchanged
{ t: "error"; code; message }
```

`lobbyState`:

```ts
{
  revision: number;
  roomCode: string;
  phase: "lobby" | "countdown";
  hostPlayerId: string;
  players: Array<{
    playerId: string;
    displayName: string;
    connected: boolean;
    reconnecting: boolean;
    seat: "driver" | "gunner" | null;
    ready: boolean;
  }>;
  settings: { gameplayType: "sharedTank"; modeId: string };
  countdownEndsAtWallMs: number | null;
  startEligibility: { eligible: boolean; reason: string };
}
```

`sessionId` is never included in player lists. The client identifies itself
with `playerId` only.
