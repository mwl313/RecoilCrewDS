# Shared Vehicle Prediction — Code Audit

Audit date: 2026-08-04 · Branch: `map-lab` · Scope: online netcode, tank
prediction, gunner input, camera/aim queries, interpolation, PIP, server
loop.

## 1. Current input send paths

- Driver: `src/client/app/gameClient.ts` `sendInputs()` runs on a fixed
  50 ms timer (`inputSendT = 0.05`). It re-samples input, calls
  `prediction.sendDriver({...})`, then clears input latches.
  `PredictionController.sendDriver()` allocates a `seq` (`inputSeq++`),
  pushes the frame into the local `DriverPredictor` pending queue, and sends
  `{ t: 'input', seq, driver }`.
- Gunner: the same timer sends `{ t: 'input', seq, gunner: { aimYaw,
  aimPitch, primary, secondary, ability } }`. There is no edge/action
  protocol: cannon presses are expressed as `secondary` held-state in the
  periodic frame and can be lost between 50 ms frames.
- Server: `src/server/room.ts` `applyInput()` sanitizes (`sanitizeDriver`,
  `sanitizeGunner`) and calls `room.match.setDriverInput/setGunnerInput`.
  Sequence protection is per-client `client.inputSeq` (last received).
- Practice: `GameClient.stepPractice()` feeds the local `Match` directly at
  30 Hz with per-step sampled frames.

## 2. Driver predictor state and replay rules

- `src/client/predictor.ts` `DriverPredictor`: `pending: QueuedDriverInput[]`
  (cap 64), `predicted`/`display` states, `ground` (arena-bound), movement
  rules via `applyMovementRules()`.
- `reconcile(authoritative, ackSeq)` starts from authority, replays
  `pending.filter(seq > ackSeq).slice(-MAX_REPLAY_INPUTS)` (8 max), computes
  divergence, hard-snaps only on respawn/initial/extreme (>60 m), and
  speed-capped `smooth()` converges the display.
- External impulses do not exist; jump/dash edges are simulated locally via
  `stepTankKinematics` on the same frame they are sampled.
- Wrong-ground fallback: if authority is outside arena bounds the predictor
  disables and the client renders interpolated authority.

## 3. Gunner aim reconciliation

- `PredictionController.reconcileTurret(seq, state)` gates on `seq` (the
  **snapshot sequence**, not a gunner input acknowledgement), stores
  authoritative local turret pose, and blends the gunner's predicted turret
  toward it. There is no queue of unacknowledged gunner aim frames and no
  replay from `lastProcessedGunnerInputSeq`.
- Gunner tank anchor is `interp.tank` (delayed interpolation timeline) in
  `GameClient.loop()`; only the turret is locally predicted.

## 4. Current event order

Per server tick (`RoomManager.tick`): match step → `takeEvents()` → each
event broadcast as `{ t: 'event', event }` to both sockets → snapshot
accumulator check. Events and snapshots are separate messages; there is no
sequence linking an event to the tick that produced it.

## 5. Snapshot cadence

- `room.snapshotT += dt; if (snapshotT >= 1/GAME.snapshotHz) { snapshotT = 0;
  broadcastSnapshot(); }` — the **reset-to-zero bug** (instead of interval
  subtraction) makes the true rate lower than configured 20 Hz (~15 Hz in
  practice).
- `serverTick` is set to `room.snapshotSeq`, i.e. it is the snapshot
  sequence, not a simulation tick.
- Snapshot payload: `state: room.match.state` (the live mutable MatchState
  object), ack fields for driver/gunner input seq, rules revisions,
  movement block (on revision change), arena metadata.

## 6. Server tick loop

- `src/server/index.ts`: `setInterval(() => manager.tick((1000/30)/1000 *
  TIME_SCALE), 1000/30)`. No accumulator, no catch-up bound, no drift
  metric; a blocked event loop permanently loses ticks.

## 7. Recoil mutation/event flow

- `src/shared/effects/recoilEffect.ts` `apply()` mutates `state.tank`
  directly (vx/vz/yawVel/vy/roll), pushes a wire `recoil` event, and emits a
  `recoil.applied` bus event.
- There is no `impulseSeq`, no tick stamp, and no way for a client to know
  whether a received `recoil` event is already reflected in the last
  snapshot. Clients therefore present recoil from the event; the Driver's
  predictor never applies it locally.

## 8. Collider count and query paths

- `src/client/arenaView.ts` builds `Collider[]` (obstacle boxes + ramp/barrel
  shapes + cliff wall proxies via `buildCliffWallChunks`). Dramatic cliff
  maps add a large number of per-segment wall boxes.
- `src/client/tpsCamera.ts` `update(dt, colliders, speedRatio)` scans the
  full collider list per frame; `computeWorldAim()` also scans all colliders
  for the gunner aim ray. `CameraManager.update/computeAim` pass the raw
  array. No spatial index, no pre-expanded boxes (hot path clones boxes and
  calls `expandByScalar`), no scratch-vector reuse.

## 9. Interpolation allocations

- `src/client/app/networkStatePresenter.ts` `getInterpState()` calls
  `interpolateMatchState(a.state, b.state, alpha)` every rendered frame. That
  allocates a complete new `MatchState` plus new enemy/shell arrays and maps.
- `SnapshotBuffer` is fine (bounded, ordered).

## 10. PIP cost

- `src/client/app/pipRenderer.ts`: fixed `pipRate = 3` (every 3rd frame),
  full-resolution viewport render through the shared renderer/composer,
  no bloom/shadows control, uses `state.tank` (latest snapshot, not the
  predicted tank).
- `QualityManager` degrades PIP rate only (3 → 5) in low quality; no
  resolution scale, no independent pipeline.

## 11. Files and tests to change

Server/shared:
- `src/server/index.ts` (fixed-step accumulator, serialized broadcast,
  buffered amount, protocol check)
- `src/server/room.ts` (sim tick, cadence fix, driver relay, gunner
  actions/results, impulse acks/opLog)
- `src/shared/net/protocol.ts` (new), `src/shared/net/tuning.ts` (new)
- `src/shared/sim/matchRuntime.ts` (op log, action edges, impulse seq)
- `src/shared/effects/tankImpulseSystem.ts` (new), `recoilEffect.ts`
  (delegate), `systemContext.ts` (wire impulse system)
- `src/shared/net/interpolation.ts` (keep; add focused remote interpolator
  module)

Client:
- `src/client/net.ts` (latency sim, typed send/recv hooks, metrics)
- `src/client/predictor.ts` → generalized shared predictor
  (`src/client/prediction/sharedTankPredictor.ts`)
- `src/client/app/predictionController.ts` (gunner relay source, turret ack
  replay, impulse queue, action sends)
- `src/client/app/gameClient.ts` (shared render selection, immediate gunner
  actions, local presentation, pip tuning)
- `src/client/app/networkStatePresenter.ts` (allocation-free remote
  interpolation, spatialized camera/aim)
- `src/client/tpsCamera.ts`, `src/client/app/cameraManager.ts` (spatial
  query, scratch reuse)
- `src/client/arenaView.ts` (pre-expanded colliders, cliff proxy merge)
- `src/client/app/pipRenderer.ts`, `qualityManager.ts` (adaptive PIP)
- `src/client/app/debugOverlay.ts` (F4 metrics overlay)
- `src/client/netcode/netcodeMetrics.ts` (new)

Tests:
- New `tests/netcode/` suite; extend `tests/room.test.ts`,
  `tests/interpolation.test.ts`, `tests/predictor*.test.ts`;
  new `e2e/gunner-responsiveness.spec.ts`,
  `e2e/shared-vehicle-prediction.spec.ts`; latency matrix in e2e.
