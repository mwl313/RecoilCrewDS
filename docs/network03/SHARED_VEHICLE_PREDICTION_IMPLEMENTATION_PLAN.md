# Shared Vehicle Prediction — Implementation Plan

Contract: `docs/network03/SHARED_VEHICLE_PREDICTION_AND_GUNNER_RESPONSIVENESS_DESIGN.md`
plus the implementing prompt. Milestones are implemented in order with
focused tests after each; the final commit contains the whole hardening
pass with per-milestone test evidence in the report.

## Milestone 0 — Instrumentation and baseline

- `src/client/netcode/netcodeMetrics.ts`: counters/timers for RTT, input
  rates, snapshot rate/jitter, render delay, action latency, snapshot bytes,
  JSON parse time, snapshot handling, interpolation, world sync, camera/aim
  query, collider candidates, render times, pending queues, corrections,
  predictor-disabled reason.
- F4 overlay (dev/test only) rendered by `DebugOverlay`.
- `NetClient` dev-only latency/jitter simulation via URL params
  (`latency`, `jitter`, `loss`).
- Baseline numbers captured into the report before later milestones.

## Milestone 1 — Typed protocol and true timing

- `src/shared/net/protocol.ts` + `protocolVersion`; server rejects
  mismatched clients with a clear error.
- `src/shared/net/tuning.ts` with simHz/snapshotHz/input rates/held refresh/
  interpolation delay/queue bounds/PIP.
- Server real 30 Hz sim tick (`room.simTick`); snapshot cadence fixed to
  interval subtraction; automated rate test.

## Milestone 2 — Immediate Gunner actions

- Client gunner edge detection (cannon pressed, MG start/stop, ability
  start/release) → immediate `action` message with `actionSeq`.
- Server sanitizes, applies action edges, replies `actionResult` with the
  same `actionSeq`.
- Local predicted presentation (flash/audio/kick/crosshair, optional
  predicted shell) with duplicate suppression on authoritative result.
- Turret reconcile keyed to `lastProcessedGunnerInputSeq` with bounded
  aim-frame replay.

## Milestone 3 — Exact tank impulse events

- `TankImpulseSystem` (SystemContext service): computes exact deltas,
  applies once, increments `impulseSeq`, emits typed `tankImpulse` with
  opSeq/tick/source; `RecoilEffect` delegates.
- Snapshots carry `lastImpulseSeq` + bounded opLog; client predictors apply
  impulses immediately and replay them on reconcile exactly once.

## Milestone 4 — Shared tank prediction

- `src/client/prediction/sharedTankPredictor.ts` generalizes the Driver
  predictor: Driver local frames + Gunner relay frames, both through
  `stepTankKinematics` on the authoritative ground.
- Server relays sanitized accepted Driver input as `driverInputRelay`.
- Both online roles render through the shared predictor; gunner no longer
  anchors to `interp.tank`. Lifecycle resets on start/reconnect/rematch/
  arena rebuild/checksum failure/practice.

## Milestone 5 — Camera and aim performance

- Uniform-grid spatial index for camera/aim colliders; pre-expanded boxes at
  arena construction; merged cliff camera proxies; scratch vector reuse;
  parity + candidate + disposal tests.

## Milestone 6 — Remote interpolation without whole-state allocation

- `RemoteEntityInterpolator` caches prev/current endpoint states and writes
  interpolated values into reusable records; tank comes from the shared
  predictor, turret from the turret predictor; no complete MatchState per
  rendered frame.

## Milestone 7 — PIP and adaptive quality

- Data-driven PIP tuning (12–15 Hz normal, lower under pressure, reduced
  resolution, no bloom/shadows); adaptive quality degrades PIP before the
  main view; PIP uses the predicted shared tank pose.

## Milestone 8 — Server loop and serialization hardening

- Bounded wall-clock fixed-step accumulator with dropped-time/tick-duration/
  drift metrics.
- Broadcast payloads serialized once and sent to both sockets; outbound
  buffered amount tracked.

## Verification

- `npm run test:netcode`, `npm run test:netcode:e2e`, full existing gates,
  latency matrix (localhost/50/100/150 ms + jitter), 15-minute soak with
  synthetic 100 ms RTT, before/after metrics in the report.
