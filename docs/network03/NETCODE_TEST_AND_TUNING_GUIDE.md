# Netcode Test and Tuning Guide

## Developer diagnostics

- F4 toggles the netcode overlay (`#netcode-debug`): RTT, snapshot
  rate/jitter, input rate, action latency, parse/handle/interp/sync times,
  camera/aim query times, collider candidates, render/PIP times, pending
  queue depths, corrections, and server tick/drift metrics.
- URL params (dev only):
  - `?latency=100` — one-way artificial delay (RTT ≈ 2×).
  - `?jitter=40` — ±40 ms random delay.
  - `?loss=0.05` — 5% artificial message drop (not TCP-realistic).

## Tuning knobs (`src/shared/net/tuning.ts`)

- `simHz` (30) — server fixed step; do not raise without re-running the
  Demo golden and predictor parity tests.
- `snapshotHz` (20) — broadcast cadence (interval subtraction).
- `driverInputHz` / `gunnerAimHz` (20) — periodic frame rates; discrete
  gunner actions bypass these.
- `heldRefreshHz` (4) — held-state recovery refresh.
- `remoteInterpolationDelay` (0.1 s) — render-clock lag for remote entities.
- `queues.*` — bounded predictor/action/aim/op queues; if corrections grow,
  check RTT and queue bounds, not the smoothing constant.
- `pip.*` — PIP rate/scale; quality degrades PIP before the main view.

## Tuning display smoothing

`SharedTankPredictor.smooth()` uses `k = 30` (steady-state lag ≈ v/k).
Raise `k` for tighter tracking (more visible reconcile steps); lower it for
softer corrections. The e2e shared-prediction spec asserts no backward
snaps and an RTT-aware lag bound — keep those green after tuning.

## Running the tests

```bash
npm run test:netcode          # unit suite (protocol, cadence, actions,
                              # impulses, shared predictor, spatial index)
npm run test:netcode:e2e      # responsiveness + shared prediction
NETCODE_LATENCY_MS=100 npm run test:netcode:e2e
NETCODE_LATENCY_MS=150 npm run test:netcode:e2e
NETCODE_LATENCY_MS=100 NETCODE_JITTER_MS=40 npm run test:netcode:e2e
```

## Interpreting metrics

- `snap` ≈ 20 Hz and `server.tick` increasing at 30 Hz: cadence healthy.
- `corr: tank` should stay < ~2 m at low RTT; large spikes indicate a
  missing relay/impulse or a wrong ack.
- `pending: d/i/a/t` should stay bounded (8/8/16/16).
- `cam/aim` query time should be < 1 ms and `coll` candidates far below the
  raw collider count on dramatic maps.
- `server: dur/drop/drift` — tick duration ~0 ms, drops only after event-loop
  stalls; drift is the accumulator remainder.
