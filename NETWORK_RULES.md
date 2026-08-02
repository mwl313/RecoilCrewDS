# Network Rules

One JSON WebSocket at `/ws`.

## Client → server

| `t` | Payload |
| --- | --- |
| `create` / `join` / `rejoin` | code/session for join/rejoin |
| `ready` | `ready` |
| `input` | `seq`, `driver {throttle,steer,boost,brace}` or `gunner {aimYaw, aimPitch, primary, secondary, ability}` |
| `rematch` | `modifier` |
| `leave`, `ping` | — |

## Server → client

`created`, `joined`, `lobby`, `peer`, `countdown`, `start` (with content
metadata), `snapshot`, `event`, `results`, `error`, `pong`.

## Snapshot envelope

```text
seq, serverTime, serverTick, lastProcessedDriverInputSeq,
lastProcessedGunnerInputSeq, state, rulesRevision,
movementRulesRevision, movement (on change)
```

`movement` is a compact resolved block (tank + grip/gravity/timeScale).
The Driver predictor applies it when `movementRulesRevision` advances, so
prediction and authority share the same movement-critical stats. Input
sequences are monotonic per role; stale/out-of-order inputs are ignored and
stale input is cleared after 1.5 s. Clients can never author content: all
definitions load server-side from validated files.
