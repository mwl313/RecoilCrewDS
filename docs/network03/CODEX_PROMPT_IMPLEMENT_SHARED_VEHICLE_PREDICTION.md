# Codex Prompt — Implement Shared Vehicle Prediction and Gunner Responsiveness

Repository:

```text
mwl313/RecoilCrewDS
branch: map-lab
```

Target documentation:

```text
docs/network03/SHARED_VEHICLE_PREDICTION_AND_GUNNER_RESPONSIVENESS_DESIGN.md
docs/network03/SHARED_VEHICLE_PREDICTION_IMPLEMENTATION_PLAN.md
```

Treat both documents as the binding implementation contract.

---

# Mission

Fix the current online asymmetry where:

- Driver tank movement is locally predicted and responsive.
- Gunner tank movement is rendered from a delayed interpolation timeline.
- Gunner weapon feedback waits for periodic input send and server return.
- Tank recoil movement arrives later than flash/audio/shake.
- Gunner turret reconcile ignores Gunner input acknowledgement.
- Gunner camera/aim queries perform expensive full collider scans.
- Dramatic cliff maps greatly increase camera collider count.
- Whole MatchState interpolation allocates every rendered frame.
- Requested 20 Hz snapshots currently run at approximately 15 Hz.

Implement the release-grade architecture:

> Both players locally predict the shared tank, the Gunner immediately predicts local weapon presentation, exact server impulses update both predictors, remote entities remain interpolated, and the server remains authoritative.

---

# Read first

Inspect the latest actual repository before editing.

At minimum:

```text
package.json

src/server/index.ts
src/server/room.ts

src/shared/config.ts
src/shared/types.ts
src/shared/net/interpolation.ts
src/shared/stats/rulesRevision.ts
src/shared/sim/tankKinematics.ts
src/shared/sim/groundQuery.ts
src/shared/sim/arenaWorld.ts
src/shared/sim/match.ts
src/shared/sim/systems/systemContext.ts
src/shared/effects/recoilEffect.ts
src/shared/weapons/
src/shared/projectiles/

src/client/main.ts
src/client/net.ts
src/client/input.ts
src/client/predictor.ts
src/client/tpsCamera.ts
src/client/arenaView.ts

src/client/app/gameClient.ts
src/client/app/networkStatePresenter.ts
src/client/app/predictionController.ts
src/client/app/presentationEventRouter.ts
src/client/app/cameraManager.ts
src/client/app/pipRenderer.ts
src/client/app/qualityManager.ts
src/client/app/debugOverlay.ts

tests/interpolation.test.ts
tests/room.test.ts
tests/
e2e/
```

Create first:

```text
docs/network03/SHARED_VEHICLE_PREDICTION_CODE_AUDIT.md
```

Record:

- Exact current input send paths
- Current Driver predictor state and replay rules
- Current Gunner aim reconciliation
- Current event order
- Current snapshot cadence
- Current server tick loop
- Current recoil mutation/event flow
- Current collider count and query paths
- Current interpolation allocations
- Current PIP cost
- Exact files and tests to change

Then implement. Do not stop after the audit.

---

# Non-negotiable constraints

Preserve:

- Authoritative Node WebSocket server
- Shared deterministic tank kinematics
- Driver prediction behavior
- Practice parity
- Generated arena/checksum gate
- MovementRulesBlock synchronization
- Role ownership
- Room lifecycle
- Reconnect
- Rematch
- Current three-circle tank collision
- Current dramatic terrain and cliff traversal
- Current data-driven content architecture
- Refractor 02 presentation architecture
- Existing semantic VFX/audio IDs

Do not:

- Switch to peer-to-peer authority
- Trust raw Driver input at the Gunner
- Trust client weapon acceptance
- Predict damage, kills, score, or impacts
- Remove interpolation from remote entities
- Increase snapshot rate as the only fix
- Add a second movement simulation implementation
- Add a Gunner-only fake movement model
- Add a general physics engine
- Use arbitrary `Record<string, unknown>` for new core protocol messages
- Hide divergence with excessive smoothing
- Apply recoil both from event and snapshot
- Rebuild full MatchState every rendered frame in the final architecture
- Keep per-frame global collider scans in the final architecture
- Claim performance improvement without measurements
- Rewrite unrelated scene/HUD systems

---

# Required milestone order

```text
Milestone 0 — Instrumentation and baseline
Milestone 1 — Typed protocol and true timing
Milestone 2 — Immediate Gunner actions and ack-based turret prediction
Milestone 3 — Exact sequenced tank impulses
Milestone 4 — Shared tank prediction for Driver and Gunner
Milestone 5 — Spatial camera/aim queries and merged cliff proxies
Milestone 6 — Allocation-free remote entity interpolation
Milestone 7 — PIP and adaptive quality
Milestone 8 — Server loop and serialization hardening
```

Run focused tests after every milestone.

Do not combine Milestones 2–6 into an unreviewable one-shot patch.

---

# Milestone 0 — Instrumentation

Add a focused netcode metrics service and F4 overlay.

Measure:

```text
RTT
actual input rates
actual snapshot rate/jitter
render delay
action latency
snapshot bytes
JSON parse time
snapshot handling time
interpolation time
world sync time
camera query time
aim query time
collider candidates/tests
main render time
PIP render time
pending input/action/impulse counts
tank correction
turret correction
predictor disabled reason
```

Add development-only latency/jitter simulation.

Capture before measurements in the implementation report.

---

# Milestone 1 — Typed protocol and timing

## Protocol

Create or extend a shared protocol module with typed messages for:

```text
snapshot
Driver input relay
Gunner action
Gunner action result
tank impulse
network timing block
```

Add `protocolVersion`.

Reject mismatched client/server protocol clearly.

## Simulation tick

Track real 30 Hz simulation tick.

Do not use snapshot sequence as server tick.

## Snapshot cadence

Fix:

```ts
snapshotT = 0
```

to interval subtraction.

Add an automated rate test proving true 20 Hz output over simulated time.

## Net tuning

Create typed shared tuning for:

```text
simHz
snapshotHz
Driver input Hz
Gunner aim Hz
held refresh Hz
remote interpolation delay
queue bounds
PIP rates
```

No scattered magic numbers.

---

# Milestone 2 — Immediate Gunner actions

## Input edges

Add explicit action edges/state transitions:

```text
cannon pressed
MG start
MG stop
ability start
ability release
```

Very short cannon clicks must not be lost between 50 ms send frames.

## Immediate send

Discrete Gunner actions bypass the periodic input timer.

Aim remains periodic/configurable.

Held-state refresh remains periodic for recovery.

## Action sequence

Add monotonically increasing `actionSeq`.

Server returns accepted/rejected result with the same sequence.

## Local predicted presentation

On action input, immediately play:

```text
muzzle flash
weapon audio
camera kick
crosshair response
optional predicted shell/tracer
```

Do not apply damage locally.

## Duplicate suppression

When authoritative event/result with matching action sequence arrives:

- Confirm local presentation.
- Suppress duplicate flash/audio.
- Merge predicted shell if implemented.
- Remove/fade prediction if rejected.

## Turret acknowledgement

Use:

```text
lastProcessedGunnerInputSeq
```

Queue newer local aim frames and replay them after authority.

Do not reconcile using snapshot sequence alone.

Add min/max turret pitch to movement rules if required for exact parity.

---

# Milestone 3 — Exact tank impulse events

Create:

```text
src/shared/effects/tankImpulseSystem.ts
```

following the existing `SystemContext` service pattern.

`RecoilEffect` delegates to it.

The system:

1. Computes exact applied deltas.
2. Applies them once to authority.
3. Increments `impulseSeq`.
4. Emits typed `tankImpulse`.
5. Preserves semantic event bus behavior.

The event includes:

```text
impulseSeq
simulationTick
source
sourceActionSeq
deltaVx/Vy/Vz
deltaYawVel
deltaRoll
```

Add impulse acknowledgement to snapshots.

Extend existing Driver prediction to apply external impulses immediately and exactly once.

Do not wait for snapshot correction.

---

# Milestone 4 — SharedTankPredictor

Generalize the current Driver predictor.

Recommended module:

```text
src/client/prediction/sharedTankPredictor.ts
```

It must use `stepTankKinematics()` and the authoritative `GroundQuery`.

## Driver source

- Local input sampled every frame
- Existing immediate prediction preserved
- Periodic sequenced network send
- Snapshot ack/replay

## Gunner source

The server relays only sanitized accepted Driver input:

```text
driverInputRelay
```

The Gunner predictor queues and simulates those accepted frames.

Do not relay raw client input directly.

## Reconcile

Start from authority, then replay unacknowledged operations in server order:

```text
Driver input frames
tank impulses
```

Use:

```text
Driver input ack
Driver relay ack
tank impulse ack
simulation tick
```

All queues must be bounded.

## Render selection

Both online roles use:

```text
SharedTankPredictor.renderTank(...)
```

The Gunner must no longer use `interp.tank` as its camera anchor under normal operation.

Buffered interpolation remains for remote entities.

## Lifecycle

Reset safely on:

```text
start
reconnect
rematch
arena rebuild
checksum failure
Practice start/stop
```

---

# Milestone 5 — Camera and aim performance

## Spatial index

Add a uniform grid/spatial hash for camera and aim colliders.

## Pre-expanded boxes

Store pre-expanded camera bounds at arena construction.

Remove all hot-path:

```ts
box.clone().expandByScalar(...)
```

## Cliff collider merge

Keep visual cliff segments.

Merge contiguous segments into a much smaller set of camera collision proxies.

Report raw and merged counts.

## Scratch objects

Reuse high-frequency vectors and ray temporaries.

## Tests

Prove:

- Camera collision parity
- Aim hit parity
- Query tests only nearby candidates
- Arena rebuild disposes index
- No collider-count growth over rematches

---

# Milestone 6 — Remote interpolation without whole-state allocation

Keep `SnapshotBuffer`.

Replace per-frame `interpolateMatchState()` use with a focused remote interpolator.

At snapshot receipt:

- Cache previous/current remote entity states.
- Build ID lookup only when endpoints change.

At render:

- Write interpolated positions directly to entity views or reusable records.
- Use latest snapshot for discrete state.
- Use SharedTankPredictor for tank.
- Use TurretPredictor for local turret.

No complete new MatchState per rendered frame.

Preserve existing interpolation tests and add allocation-sensitive regression tests where practical.

---

# Milestone 7 — PIP

Change PIP to data-driven network/performance tuning:

```text
12–15 Hz normal
lower under pressure
reduced fixed resolution
no bloom
reduced shadows or no shadows
```

Adaptive quality must degrade PIP before damaging the main view.

Use predicted shared tank where the PIP view requires current tank pose.

---

# Milestone 8 — Server robustness

Replace direct fixed `setInterval` stepping with a bounded wall-clock fixed-step accumulator.

Preserve deterministic fixed dt.

Add:

```text
maximum catch-up steps
dropped-time metric
tick duration metric
event-loop drift metric
```

Serialize identical room broadcasts once and send the same serialized payload to both sockets.

Track outbound buffered amount.

Do not add binary/delta snapshots unless profiling after this milestone shows they are necessary.

---

# Required tests

## Unit

```text
typed protocol parsing
protocol mismatch
snapshot rate
simulation tick
Driver relay sanitize/order
Gunner action edge/sequence
Gunner action duplicate/reject
turret ack replay
tank impulse exact-once
shared predictor parity
relay gap handling
jump/dash edge exact-once
reconnect reset
arena reset
camera spatial index
cliff proxy merge
PIP rate
fixed-step accumulator
```

## Integration

```text
Driver input → server relay → Gunner predictor
Gunner action → server result → duplicate suppression
weapon recoil → exact impulse → both predictors
snapshot → acknowledgements → replay
```

## E2E

Run two browser clients under:

```text
localhost
50 ms RTT
100 ms RTT
150 ms RTT
jitter/burst delivery
```

Verify:

- Driver movement same-frame.
- Gunner aim same-frame.
- Gunner firing same-frame.
- Gunner camera follows shared tank without 100 ms historical delay.
- Recoil reaches both clients together.
- No duplicate shot presentation.
- No turret pullback.
- No repeated jump/dash.
- Dramatic cliff map maintains target FPS.
- Reconnect/rematch/Practice work.

## Long run

At least 15 minutes:

- Sustained MG
- Repeated cannon
- Driving/jumping/dashing
- Dramatic cliff map
- PIP active
- Synthetic 100 ms RTT

Verify no unbounded queues, memory growth, or increasing correction.

---

# Performance gates

Record before and after.

Target:

```text
local action presentation p95:
  <= one rendered frame

camera + aim query p95:
  < 1 ms on target dramatic map

snapshot receive:
  actual 20 Hz

predictor queues:
  bounded with no growth

main view:
  target 60 FPS
  p95 frame time < 20 ms on representative machine
```

If target hardware differs, document the machine and measured threshold.

---

# Required build/test commands

Run and report actual output:

```bash
npm run generate:presentation-content
npm run generate:map-profiles
npm run build
npm test
npm run test:demo
npm run test:e2e
npm run test:loop
npm run test:maps
npm run test:maps:sweep
npm run build:maplab
npm run test:maplab
npm run build:presentation-preview
npm run test:presentation
```

Add:

```json
{
  "test:netcode": "vitest run tests/netcode",
  "test:netcode:e2e": "playwright test e2e/gunner-responsiveness.spec.ts e2e/shared-vehicle-prediction.spec.ts"
}
```

Run both new commands.

---

# Documentation

Create:

```text
docs/network03/SHARED_VEHICLE_PREDICTION_CODE_AUDIT.md
docs/network03/SHARED_VEHICLE_PREDICTION_IMPLEMENTATION_REPORT.md
docs/network03/NETCODE_TEST_AND_TUNING_GUIDE.md
```

Update:

```text
docs/guides/ARCHITECTURE.md
docs/guides/NETWORK_RULES.md
docs/guides/SMOKE_TEST.md
docs/planning/BUILD_STATUS.md
```

The implementation report must contain actual metrics and executed command results.

---

# Completion gate

Complete only when:

1. Both roles use shared local tank prediction.
2. Gunner tank/camera no longer uses the delayed interpolation timeline.
3. Accepted Driver input is relayed by the server.
4. Gunner discrete actions are sent immediately.
5. Gunner local shot feedback is same-frame.
6. Gunner acknowledgement drives turret reconcile.
7. Exact recoil impulses update both predictors.
8. No impulse or presentation is applied twice.
9. True snapshot cadence matches configuration.
10. Remote entities remain smoothly interpolated.
11. Camera/aim queries are spatialized.
12. Cliff camera proxies are merged.
13. No per-frame global collider scans remain.
14. No whole-MatchState allocation remains in the render loop.
15. PIP cannot starve the main view.
16. Diagnostics expose real latency, rates, corrections, and query costs.
17. Server authority is unchanged.
18. Practice, reconnect, rematch, generated maps, and checksums remain correct.
19. All required tests pass.
20. Before/after measurements demonstrate the improvement.

Final invariant:

> Driver and Gunner both receive immediate local control over their part of one shared predicted tank, while the server alone decides authoritative gameplay outcomes.
