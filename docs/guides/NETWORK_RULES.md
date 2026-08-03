# Network Rules

One JSON WebSocket at `/ws`.

## Client → server

| `t` | Payload |
| --- | --- |
| `create` / `join` / `rejoin` | code/session for join/rejoin |
| `ready` | `ready` |
| `input` | `seq`, `driver {throttle,steer,dashPressed,jumpPressed}` or `gunner {aimYaw, aimPitch, primary, secondary, ability}` |
| `rematch` | `modifier` |
| `leave`, `ping` | — |

## Server → client

`created`, `joined`, `lobby`, `peer`, `countdown`, `start` (with content
metadata and arena metadata), `snapshot`, `event`, `results`, `error`,
`pong`.

### Arena synchronization (Phase 3)

`start`, every `snapshot`, and `joined`/`rejoin` carry arena metadata:

```text
mapProfileId, arenaBaseSeed, arenaCandidateSeed, arenaAttempt,
arenaGeneratorVersion, arenaChecksum, arenaFallbackUsed
```

The client reconstructs the arena from the seed/attempt/version (never from
a map blob), verifies `arenaChecksum` against its regenerated heightfield,
and refuses to start on mismatch. Rematch increments the room match index
(new seed → new map); reconnect keeps the same metadata.

## Snapshot envelope

```text
seq, serverTime, serverTick, lastProcessedDriverInputSeq,
lastProcessedGunnerInputSeq, state, rulesRevision,
movementRulesRevision, movement (on change)
```

`movement` is a compact resolved block (tank + grip/gravity/timeScale,
including jump/dash stats).
The Driver predictor applies it when `movementRulesRevision` advances, so
prediction and authority share the same movement-critical stats. Input
sequences are monotonic per role; stale/out-of-order inputs are ignored and
stale input is cleared after 1.5 s. `dashPressed` / `jumpPressed` are
one-shot edges: the server accepts only explicit booleans and consumes each
sequenced edge exactly once, so holding a key never repeats the action.
Clients can never author content: all definitions load server-side from
validated files.
