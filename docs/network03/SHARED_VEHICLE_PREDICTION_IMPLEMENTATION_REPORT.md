# Shared Vehicle Prediction and Gunner Responsiveness — Implementation Report

Date: 2026-08-04 · Branch: `map-lab` · Audit:
`docs/network03/SHARED_VEHICLE_PREDICTION_CODE_AUDIT.md` · Plan:
`docs/network03/SHARED_VEHICLE_PREDICTION_IMPLEMENTATION_PLAN.md`

## 1. What changed (by milestone)

### M0 — Instrumentation and baseline

- `src/client/netcode/netcodeMetrics.ts`: live metrics for RTT, snapshot
  rate/jitter, input rate, action latency, render delay, snapshot bytes,
  JSON parse, snapshot handling, interpolation, world sync, camera/aim
  query, collider candidates/tests, main/PIP render, pending queues,
  corrections, predictor-disabled reason, and server tick/drift metrics.
- F4 overlay (`#netcode-debug`) toggles the metrics panel (hidden by
  default, dev/test only).
- `NetClient` dev-only latency simulation via URL params: `latency`,
  `jitter`, `loss` (headless e2e matrix).
- Baseline (before): gunner tank anchored to `interp.tank` (~100 ms render
  delay + smoothing ≈ 2.5 m lag at ~12 m/s); snapshot cadence ~15 Hz
  (1353 snapshots / 90 s); camera/aim full collider scans per frame; one
  full `MatchState` allocation per rendered frame; PIP fixed 3-frame rate
  at full resolution.

### M1 — Typed protocol and true timing

- `src/shared/net/protocol.ts`: `PROTOCOL_VERSION = 2`; typed client/server
  messages (`input`, `action`, `actionResult`, `tankImpulse`,
  `driverInputRelay`, `snapshot`, `timing`); server rejects mismatched
  clients with `error.protocol` + close.
- `src/shared/net/tuning.ts`: simHz 30, snapshotHz 20, driverInputHz 20,
  gunnerAimHz 20, heldRefreshHz 4, remoteInterpolationDelay 100 ms, bounded
  queue sizes, PIP rates (12/6 Hz, min resolution 0.6).
- Server real sim tick (`room.simTick`) instead of snapshot seq; snapshot
  accumulator fixed from `snapshotT = 0` to interval subtraction. Unit test
  proves 40 snapshots per 60 ticks (true 20 Hz); soak measured
  1803–1804 snapshots per 90 s round (was 1353).

### M2 — Immediate Gunner actions

- Discrete edges (`cannonPressed`, `mgStart`, `mgStop`, `abilityStart`,
  `abilityRelease`) detected every rendered frame and sent immediately with
  a monotonic `actionSeq` (bypasses the 50 ms periodic timer).
- Server sanitizes, sequence-protects, latches edges across ticks (a very
  short click between sim steps is not lost), returns `actionResult` with
  the same `actionSeq`, and rejects invalid actions (`cooldown`,
  `not_ready`, `unknown_action`, `dead`).
- Local same-frame presentation (cannon flash/audio/kick, MG first-shot
  audio/flash, charge audio) with duplicate suppression: the authoritative
  `shot`/`jackpotFire`/`tankImpulse` events carry `actionSeq`, and the
  router confirms/suppresses the local presentation exactly once.
- Action reliability: unacknowledged actions are retransmitted with the
  same sequence (server dedupes), bounded to 4 tries / 2 s.
- Turret reconcile is now keyed to `lastProcessedGunnerInputSeq`: queued
  aim frames newer than the ack are replayed from authority under the
  authoritative turn rate instead of gating on the snapshot sequence.

### M3 — Exact tank impulses

- `src/shared/effects/tankImpulseSystem.ts` (SystemContext service):
  computes exact deltas, applies once to authority, increments
  `impulseSeq` + unified `opSeq`, records the op, and emits a typed
  `tankImpulse` wire message (`impulseSeq`, `opSeq`, `simulationTick`,
  `source`, `sourceActionSeq`, deltas).
- `RecoilEffect` delegates; cannon/MG/jackpot recoil carries the triggering
  gunner `actionSeq`.
- Snapshots carry `lastImpulseSeq` + a bounded `opLog`; clients apply
  impulses immediately (once) and replay unacked impulses/inputs in server
  op order on reconcile. No impulse is applied twice (unit + e2e verified).

### M4 — Shared tank prediction

- `src/client/prediction/sharedTankPredictor.ts` generalizes the Driver
  predictor: both roles run the same `stepTankKinematics` on the
  authoritative ground.
  - Driver: local sampled input (unchanged behavior).
  - Gunner: server-relayed sanitized accepted Driver input
    (`driverInputRelay`, edges normalized per frame) stepped at 30 Hz every
    rendered frame.
  - Both: reconcile from authority, replay unacked inputs + impulses in op
    order (bounded 8/8), speed-capped smoothing (k=30, steady-state lag
    ≈ 0.4 m at top speed), wrong-ground fallback preserved.
- `GameClient` renders both online roles through `renderTank()`; the Gunner
  no longer anchors the camera to the delayed interpolation timeline.
- Lifecycle resets on start/reconnect/rematch/arena rebuild/practice.

### M5 — Camera and aim performance

- `src/client/cameraCollision.ts`: uniform-grid spatial index over
  pre-expanded collider AABBs (camera radius baked at arena construction);
  queries return only nearby candidates; hot path no longer clones/expands
  boxes.
- Contiguous cliff edge boxes merge into camera proxies: measured across 20
  seeds — `map.dramaticHighlands` 100.6 → 21.3 proxies (79% fewer),
  `map.cliffArena` 104.4 → 23.7 (77% fewer).
- Scratch vectors reused in `tpsCamera.ts`; camera/aim query time and
  candidate counts recorded in metrics.
- Unit tests: candidate reduction, camera-hit parity, baked expansions,
  merge behavior, separated cliffs stay apart.

### M6 — Remote interpolation without whole-state allocation

- `src/client/prediction/remoteInterpolator.ts` replaces per-frame
  `interpolateMatchState()`: endpoint ID maps rebuild only on snapshot-pair
  change; interpolated enemies/shells/truck/turret write into pooled
  records. No complete `MatchState` is allocated per rendered frame.
- Discrete state comes from the latest snapshot reference; the tank comes
  from the shared predictor; the turret from the turret predictor.

### M7 — PIP and adaptive quality

- PIP is data-driven (`NET_TUNING.pip`): 12 Hz normal / 6 Hz degraded,
  minimum 0.6 resolution scale, no bloom (PIP already renders outside the
  composer), reduced shadows in low quality. Quality degrades PIP before the
  main view; PIP uses the predicted shared tank pose.

### M8 — Server loop and serialization

- `src/server/fixedStep.ts`: bounded wall-clock fixed-step accumulator
  (max 5 catch-up steps, drops excess time); tick duration, dropped time,
  and drift metrics broadcast in snapshots and surfaced in the F4 overlay.
- Room broadcasts serialize once and send the identical payload to both
  sockets (`sendText`); outbound `bufferedAmount` tracked per socket.

## 2. Measured results

| Metric | Before | After |
|---|---|---|
| Snapshot rate | ~15 Hz (1353/90 s) | true 20 Hz (1803–1804/90 s) |
| Gunner rendered-tank lag @ ~12 m/s | ~2.5 m (interp + smoothing) | 0.87–1.07 m (localhost), 0.92–0.94 m @ 100/150 ms RTT, ≤1.21 m under jitter |
| Gunner backward snaps | n/a | 0 in all matrix runs |
| Cannon action acceptance (localhost e2e) | periodic-frame dependent | ~70–76 ms via immediate action |
| Cliff camera proxies | 1 box per segment (~100+) | 21–24 merged proxies (77–79% fewer) |
| Camera/aim candidates | all colliders every frame | nearby cells only (< 20 for 101 colliders in test) |
| Interpolation allocation | full MatchState/frame | pooled remote frame, no per-frame allocation |
| PIP | 3-frame fixed, full res | 12 Hz / 6 Hz adaptive, 0.6–0.75 scale |
| Server loop | setInterval, no metrics | fixed-step accumulator, dropped/drift/tick metrics |
| Broadcast | JSON.stringify per socket | serialized once, sent to both |

## 3. Command results (all executed)

- `npx tsc --noEmit` — PASS
- `npm run generate:presentation-content` / `generate:map-profiles` — PASS
- `npm run build` — PASS
- `npm test` — 464/464 (49 files, incl. 27 new netcode tests)
- `npm run test:netcode` — 27/27
- `npm run test:netcode:e2e` — 4/4 at localhost, 50 ms, 100 ms, 150 ms,
  and 100 ms + 40 ms jitter (reconnect run separately at ≤150 ms)
- `npm run test:e2e` — 28/28 (24 existing + 4 new netcode specs)
- `npm run test:demo` — PASS, golden fixture unchanged
- `npm run test:maps` — PASS (64/64, 0 fallback)
- `npm run test:maps:sweep` — PASS (see map report; unchanged)
- `npm run test:loop` — PASS (1804 snapshots/round, JACKPOT ×2)
- `npm run test:maplab` — 32/32; `build:maplab` PASS
- `npm run test:presentation` — 37/37; `build:presentation-preview` PASS
- Soak: `node scripts/verify-soak.mjs 8` — 8/8 full 90 s rounds in 778 s
  (≈13 min) with synthetic activity, rematch each round, ~1803 snapshots
  each, no failures.

## 4. New tests

- `tests/netcode/protocol.test.ts` — version, mismatch, tuning constants.
- `tests/netcode/fixedStep.test.ts` — 30 Hz stepping, bounded catch-up,
  dropped-time, drift.
- `tests/netcode/snapshotCadence.test.ts` — true 20 Hz, real sim tick,
  impulse/op acks in snapshots.
- `tests/netcode/actions.test.ts` — cannon/MG/ability edges, cooldown
  rejection, stale/unknown actions, driver relay edge normalization,
  impulse exact-once at match level.
- `tests/netcode/sharedPredictor.test.ts` — driver/gunner parity, no double
  jump, impulse dedupe, op-ordered replay, reconnect reset, turret ack
  replay without pullback.
- `tests/netcode/spatial.test.ts` — candidate reduction, camera-hit parity,
  baked expansions, cliff proxy merging.
- `e2e/gunner-responsiveness.spec.ts` — immediate cannon/MG edges, exactly
  one recoil impulse per click, acceptance under RTT/jitter.
- `e2e/shared-vehicle-prediction.spec.ts` — gunner camera tracks the shared
  predicted tank without the delayed timeline; reconnect keeps running.

## 5. Remaining limitations

- Action retransmission covers loss/jitter; the latency matrix uses
  latency+jitter (artificial per-message loss is not a TCP WebSocket
  behavior and breaks lobby handshakes in the harness).
- Gunner lag scales with RTT (relayed input is RTT-stale); measured values
  are ~0.9–1.2 m at ≤150 ms synthetic RTT.
- Per-frame remote interpolation still writes pooled records (no
  allocation), but entity-view bookkeeping (`seen` sets) allocates
  occasionally; acceptable within measured frame budgets.
- PIP degradation is FPS-driven (12/6 Hz + scale); network-pressure-driven
  PIP reduction is wired into the same tuning knobs for a follow-up.
