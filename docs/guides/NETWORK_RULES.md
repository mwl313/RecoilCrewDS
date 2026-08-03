# Network Rules

One JSON WebSocket at `/ws`.

Every client message carries `protocol` (currently `2`); the server rejects
mismatched builds with `error.protocol` and closes the socket.

## Client → server

| `t` | Payload |
| --- | --- |
| `create` / `join` / `rejoin` | code/session for join/rejoin |
| `ready` | `ready` |
| `input` | `seq`, `driver {throttle,steer,dashPressed,jumpPressed}` or `gunner {aimYaw, aimPitch, primary, secondary, ability}` |
| `action` | `actionSeq`, `action` (`cannonPressed`, `mgStart`, `mgStop`, `abilityStart`, `abilityRelease`) — immediate discrete Gunner edge |
| `rematch` | `modifier` |
| `leave`, `ping` | — |

## Server → client

`created`, `joined`, `lobby`, `peer`, `countdown`, `start` (with content
metadata and arena metadata), `snapshot`, `event`, `driverInputRelay`,
`tankImpulse`, `actionResult`, `results`, `error`, `pong`.

### Gunner responsiveness (network03)

- Discrete Gunner actions bypass the 50 ms periodic timer and are answered
  immediately with `actionResult` carrying the same `actionSeq`
  (`accepted` + `reason`). Clients retransmit unacknowledged actions with
  the same sequence (server dedupes).
- The server relays only sanitized accepted Driver input to the Gunner as
  `driverInputRelay` (`seq` + normalized jump/dash edges), so the Gunner
  predicts the shared tank without trusting raw Driver input.
- Exact tank impulses (recoil etc.) are broadcast as `tankImpulse` with
  `impulseSeq`, `opSeq`, `simulationTick`, `source`, `sourceActionSeq`, and
  exact velocity/angular deltas. Both clients apply each impulse exactly
  once and never re-derive it from the snapshot.

### Shared prediction (network03)

Both online roles run the same shared tank predictor on the authoritative
ground: Driver from local sampled input, Gunner from server relays. On
every snapshot both replay unacknowledged operations (driver input frames +
impulses) in unified `opSeq` order. The Gunner camera uses the predicted
shared tank, not the delayed interpolation timeline.

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

### Dramatic terrain (generator v2)

`ARENA_GENERATOR_VERSION = 2`. `arenaChecksum` now covers the heightfield
**plus** per-cell terrain flags (driveable/risky/blocked/cliff/protected)
and cliff edge geometry, so any terrain-class or cliff change breaks the
checksum gate. Old active matches fail the version gate instead of
reconstructing different terrain. The client rebuilds the same flags and
edges from the shared generator; there is still no map blob on the wire.

## Snapshot envelope

```text
seq, serverTime, serverTick (real 30 Hz sim tick), lastProcessedDriverInputSeq,
lastProcessedGunnerInputSeq, lastImpulseSeq, opLog, state, rulesRevision,
movementRulesRevision, movement (on change), tickDurationMs, droppedTimeMs,
driftMs, outboundBuffered
```

`movement` is a compact resolved block (tank + grip/gravity/timeScale,
including jump/dash stats) plus `weapon {cannonCooldown, jackpotChargeTime}`
for HUD denominators. Snapshots are emitted at a true 20 Hz via interval
subtraction; the server steps at a fixed 30 Hz with a bounded accumulator.
The Driver predictor applies it when `movementRulesRevision` advances, so
prediction and authority share the same movement-critical stats. Input
sequences are monotonic per role; stale/out-of-order inputs are ignored and
stale input is cleared after 1.5 s. `dashPressed` / `jumpPressed` are
one-shot edges: the server accepts only explicit booleans and consumes each
sequenced edge exactly once, so holding a key never repeats the action.
Clients can never author content: all definitions load server-side from
validated files.
