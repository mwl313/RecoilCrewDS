# Recoil Crew — Shared Vehicle Prediction and Gunner Responsiveness Design
## Crisp Driver and Gunner controls with server authority, minimal latency, and lower client frame cost

**Repository:** `mwl313/RecoilCrewDS`  
**Branch reviewed:** `map-lab`  
**Target repository path:** `docs/network03/SHARED_VEHICLE_PREDICTION_AND_GUNNER_RESPONSIVENESS_DESIGN.md`

---

# 1. Executive summary

The current online architecture gives the Driver a responsive locally predicted tank, but the Gunner sees that same tank through delayed snapshot interpolation.

Current behavior:

```text
Driver
local Driver input
→ DriverPredictor
→ immediate tank pose
→ authoritative reconcile

Gunner
remote snapshot
→ ~100 ms interpolation buffer
→ interpolated tank pose
→ camera follows historical tank
```

The Gunner predicts turret rotation, but not the moving platform, weapon action timing, or recoil movement.

This creates four user-visible problems:

1. The Gunner’s camera and tank motion lag behind the Driver.
2. Gunner weapon feedback waits for the next 20 Hz input send and server response.
3. Recoil sound/shake and recoil movement occur at different times.
4. Gunner rendering has more CPU and allocation work than Driver rendering.

The release-grade solution is:

> Treat the tank as a shared locally relevant object for both occupants.

Both clients predict the same shared tank with the existing deterministic `stepTankKinematics()` implementation. The server remains authoritative.

```text
Driver local input
→ immediate Driver prediction
→ server sanitizes and accepts input
→ server relays accepted Driver input to Gunner
→ Gunner predicts the shared tank

Gunner local action
→ immediate local weapon presentation
→ immediate sequenced action packet
→ server validates and simulates
→ exact recoil impulse event to both clients

Snapshots
→ authoritative correction for both predictors
→ delayed interpolation only for remote entities
```

This removes the Gunner’s deliberate 100 ms vehicle delay without weakening server authority.

---

# 2. Current architecture diagnosis

## 2.1 Driver and Gunner use different tank presentation paths

The Driver path merges a predicted tank over the interpolated state.

The Gunner path renders:

```ts
renderTank = interp.tank;
```

The interpolation clock starts approximately 100 ms behind server time.

Therefore the Driver’s camera follows a current local estimate, while the Gunner’s camera follows historical authority.

## 2.2 Gunner input is sampled every 50 ms

The client sends ordinary input every:

```text
0.05 seconds
```

Cannon, MG, and ability inputs are sampled as held mouse states.

Unlike Driver jump and dash:

- Fire actions are not edge-latched.
- Cannon action is not sent immediately.
- Short clicks can be delayed and potentially missed.
- Local feedback does not begin at mouse-down.

## 2.3 Recoil movement waits for snapshots

The server changes authoritative tank velocity through `RecoilEffect` and emits a `recoil` event.

The client presentation router handles `shot` events for:

- Flash
- Sound
- Camera shake

It does not apply recoil movement from the `recoil` event.

The tank’s visible recoil therefore arrives later through an interpolated snapshot.

## 2.4 Gunner acknowledgements are unused

Snapshots contain:

```text
lastProcessedGunnerInputSeq
```

The client receives the value but turret reconciliation uses snapshot sequence instead.

Newer unacknowledged local aim can repeatedly be pulled toward an older authoritative aim.

## 2.5 The requested 20 Hz snapshot stream runs at approximately 15 Hz

The simulation ticks at 30 Hz.

The snapshot accumulator is reset to zero when it crosses a 50 ms target. At a 33.3 ms simulation step, it crosses the threshold every second tick:

```text
66.7 ms per snapshot
≈ 15 Hz
```

## 2.6 Gunner rendering performs extra collision work

Every frame:

```text
Driver:
camera collision query

Gunner:
camera collision query
+ aim ray query
```

Both scan the full collider array.

Camera collision also clones and expands every collider box each frame.

Every generated cliff-edge segment is currently added as a separate camera collider, which can create a large collider array on dramatic maps.

## 2.7 Full MatchState interpolation allocates every rendered frame

`interpolateMatchState()` constructs:

- Maps
- Arrays
- New tank/turret objects
- New enemy objects
- New shell objects
- A new MatchState

This is repeated at the display frame rate rather than snapshot rate.

---

# 3. Product goals

## Responsiveness

At a 60 Hz display:

```text
Driver movement response:        same frame
Gunner aim response:             same frame
Gunner local shot feedback:      same frame
Gunner shared-tank response:     one accepted-input relay interval
Authoritative recoil response:   immediate event arrival
Remote world motion:             smooth buffered interpolation
```

## Correctness

- Server remains authoritative.
- Clients cannot choose accepted movement, cooldowns, hits, or damage.
- Driver and Gunner use the same shared kinematics.
- Reconciliation handles packet delay and stale input safely.
- Arena checksum and movement-rule revisions remain authoritative.
- Reconnect and rematch rebuild predictor state correctly.

## Performance

- No full collider scan for every Gunner query.
- No per-collider `Box3.clone()` in the frame loop.
- No complete interpolated `MatchState` allocation every frame.
- Main view takes priority over PIP.
- Performance can be measured through built-in diagnostics.

---

# 4. Governing design rules

## 4.1 One shared movement implementation

Do not create a Gunner-only approximation of tank physics.

Use:

```text
stepTankKinematics()
```

for:

- Server authority
- Driver local prediction
- Gunner shared-tank prediction
- Practice

## 4.2 Server-relayed accepted Driver input

The Gunner must predict only input accepted and sanitized by the server.

Do not relay raw peer-to-peer Driver input.

```text
Driver sends
→ server validates sequence and sanitizes values
→ server stores authoritative input
→ server relays normalized frame to Gunner
```

## 4.3 Local prediction never decides outcomes

Allowed local prediction:

- Tank presentation
- Turret presentation
- Muzzle flash
- Weapon audio
- Camera kick
- Crosshair response
- Cosmetic predicted tracer/shell

Authoritative only:

- Weapon acceptance
- Cooldowns
- Damage
- Hits
- Kills
- Score
- Enemy reactions
- Projectile impact
- Match results

## 4.4 Remote entities retain interpolation

Do not remove the interpolation buffer globally.

Use buffered interpolation for:

- Enemies
- Pickups
- Truck
- Remote projectiles
- Other non-local world entities

Do not use it for the shared tank carrying the local camera.

## 4.5 Data-driven network tuning

Network tuning must live in a typed shared config rather than scattered magic numbers.

Recommended:

```ts
export interface NetcodeTuning {
  protocolVersion: number;

  simHz: number;
  snapshotHz: number;

  driverInputHz: number;
  gunnerAimHz: number;
  heldStateRefreshHz: number;

  remoteInterpolationDelay: number;
  maxSharedTankExtrapolation: number;

  maxPendingDriverInputs: number;
  maxPendingGunnerInputs: number;
  maxPendingImpulses: number;

  pipTargetHz: number;
  pipLowTargetHz: number;
}
```

The server broadcasts a resolved timing block so diagnostics and clients know the authoritative rates.

This belongs in network/runtime configuration, not map or weapon content.

---

# 5. Target architecture

```text
                           ┌───────────────────────────────┐
                           │ Authoritative server          │
                           │                               │
Driver local input ───────►│ sanitize + sequence          │
                           │ set Driver input              │
                           │ relay accepted input ───────────────┐
                           │                               │      │
Gunner action ────────────►│ validate cooldown/action     │      │
                           │ simulate weapon + recoil      │      │
                           │ emit action result            │      │
                           │ emit exact impulse            │      │
                           │ snapshots + acknowledgements  │      │
                           └───────────────────────────────┘      │
                                  │                   │           │
                                  ▼                   ▼           ▼
                         Driver client          Gunner client
                         SharedTankPredictor    SharedTankPredictor
                         local Driver input     relayed Driver input
                         exact impulses         exact impulses
                         authority reconcile    authority reconcile

                         local camera           local camera
                         local jump/dash FX     local aim and shot FX
```

---

# 6. Network protocol additions

Place shared protocol types in a focused module such as:

```text
src/shared/net/protocol.ts
```

or extend an existing protocol module if one exists.

Do not continue passing untyped `Record<string, unknown>` through core gameplay code.

## 6.1 Accepted Driver input relay

```ts
export interface DriverInputRelayMessage {
  t: "driverInputRelay";

  roomInputSeq: number;
  clientInputSeq: number;
  serverTick: number;

  input: DriverInput;
}
```

Semantics:

- `clientInputSeq`: original accepted Driver sequence.
- `roomInputSeq`: room-scoped strictly increasing relay sequence.
- `serverTick`: authoritative simulation tick at acceptance.
- `input`: sanitized input applied by the server.

Send to Gunner only.

Optional future batching:

```ts
export interface DriverInputRelayBatchMessage {
  t: "driverInputRelayBatch";
  frames: DriverInputRelayMessage[];
}
```

Start with one frame per accepted Driver input unless profiling demonstrates a need to batch.

## 6.2 Immediate Gunner action message

Separate continuous aim from discrete actions.

```ts
export type GunnerActionKind =
  | "cannon"
  | "mgStart"
  | "mgStop"
  | "abilityStart"
  | "abilityRelease";

export interface GunnerActionMessage {
  t: "gunnerAction";

  inputSeq: number;
  actionSeq: number;
  action: GunnerActionKind;

  aimYaw: number;
  aimPitch: number;
}
```

Send immediately on the relevant input edge.

The ordinary Gunner input frame continues to provide:

- Desired aim
- Held-state refresh
- Recovery from missed local UI state

## 6.3 Action result/acknowledgement

```ts
export interface GunnerActionResultEvent {
  type: "gunnerActionResult";

  actionSeq: number;
  inputSeq: number;
  accepted: boolean;

  kind: GunnerActionKind;
  reason?: "cooldown" | "dead" | "wrongPhase" | "notReady";
  authoritativeEntityId?: number;
}
```

The local Gunner uses it to:

- Suppress duplicate authoritative presentation
- Remove rejected predicted shell/tracer
- Correct local cooldown presentation
- Record action latency

## 6.4 Exact tank impulse event

```ts
export interface TankImpulseEvent {
  type: "tankImpulse";

  impulseSeq: number;
  serverTick: number;

  source: "cannon" | "mg" | "jackpot" | "collision" | "other";
  sourceActionSeq?: number;

  deltaVx: number;
  deltaVy: number;
  deltaVz: number;
  deltaYawVel: number;
  deltaRoll: number;
}
```

The event contains the exact authoritative deltas after rules, caps, and random spin are applied.

Do not ask clients to regenerate random recoil.

## 6.5 Snapshot acknowledgement fields

Extend snapshot state with:

```text
lastProcessedDriverInputSeq
lastProcessedGunnerInputSeq
lastProcessedDriverRelaySeq
lastProcessedTankImpulseSeq
simulationTick
```

Use actual simulation tick, not snapshot sequence.

---

# 7. SharedTankPredictor

Generalize the existing `DriverPredictor`.

Recommended module:

```text
src/client/prediction/sharedTankPredictor.ts
```

or rename the existing predictor if repository migration cost is lower.

## 7.1 Responsibilities

- Hold predicted authoritative-equivalent tank state.
- Hold smoothed display tank state.
- Simulate fixed 30 Hz movement.
- Consume Driver input frames from either:
  - local Driver sampling, or
  - server-relayed accepted Driver input.
- Apply exact external tank impulses.
- Reconcile against snapshots.
- Replay unacknowledged movement inputs and impulses.
- Expose diagnostics.

## 7.2 Role-independent predictor API

```ts
export class SharedTankPredictor {
  setGround(query: GroundQuery): void;
  applyMovementRules(block: MovementRulesBlock, revision: number): void;

  resetFromAuthority(tank: TankState, ack: PredictorAck): void;

  pushDriverInput(frame: PredictedDriverInputFrame): void;
  pushTankImpulse(event: TankImpulseEvent): void;

  sampleLocalDriver(input: DriverInput, dt: number): void;
  advanceRelayedDriver(dt: number): void;

  reconcile(tank: TankState, ack: PredictorAck): void;
  smooth(dt: number): void;

  renderTank(base: TankState): TankState;
}
```

## 7.3 Driver path

The Driver:

1. Samples input every frame.
2. Predicts fixed steps immediately.
3. Sends input at configured rate.
4. Queues sequenced input.
5. Reconciles against snapshot acknowledgement.

Preserve existing local jump/dash feedback behavior.

## 7.4 Gunner path

The Gunner:

1. Receives accepted Driver input relay.
2. Queues relay by sequence.
3. Simulates it at fixed movement steps.
4. Applies exact tank impulses.
5. Uses predicted tank as camera anchor.
6. Reconciles against authority.

The Gunner does not invent Driver input before relay arrival.

## 7.5 Relay gaps

If a relay sequence gap is detected:

- Do not reuse an old edge-triggered action.
- Continue the latest continuous throttle/steer state for a bounded period.
- Request/await authoritative snapshot correction.
- Track the gap in diagnostics.
- Never replay jump or dash twice.

WebSocket ordering normally prevents gaps, but the predictor must remain bounded and testable.

## 7.6 Reconciliation ordering

Use:

```text
authoritative tank snapshot
→ discard acknowledged Driver input/relay frames
→ discard acknowledged tank impulses
→ replay unacknowledged accepted Driver frames
→ replay unacknowledged exact impulses in authoritative order
→ update predicted
→ smooth display residual
```

Impulse and input ordering must use server tick/order metadata.

## 7.7 Local tank selection

`NetworkStatePresenter` should use:

```ts
const renderTank = sharedTankPredictor.renderTank(interpolatedRemoteState.tank);
```

for both online roles.

Only fallback to interpolated authority when:

- Wrong arena/ground
- Predictor version mismatch
- Corrupt relay sequence
- Extreme divergence
- Explicit debug disable

---

# 8. Gunner aim prediction and acknowledgement

## 8.1 Pending aim frames

Track Gunner aim frames by input sequence.

```ts
interface PendingGunnerAim {
  inputSeq: number;
  desiredYawLocal: number;
  desiredPitch: number;
}
```

## 8.2 Snapshot reconcile

Use:

```text
lastProcessedGunnerInputSeq
```

Algorithm:

1. Start from authoritative turret state.
2. Discard acknowledged Gunner aim frames.
3. Replay newer desired aim frames using authoritative turret rates.
4. Compare with current predicted turret.
5. Smooth only residual error.
6. Hard snap only for extreme divergence or reset.

Do not reconcile predicted turret with snapshot sequence alone.

## 8.3 Turret rate source

Continue using `MovementRulesBlock.turret`.

Add min/max pitch to the replicated turret block if not already present.

Remove hardcoded clamps that can diverge from the authoritative loadout.

---

# 9. Immediate local Gunner feedback

Create a focused module:

```text
src/client/prediction/gunnerActionPredictor.ts
```

Responsibilities:

- Generate `actionSeq`.
- Edge-latch cannon and ability.
- Detect MG start/stop.
- Play local predicted presentation.
- Track pending actions.
- Match authoritative result/event.
- Suppress duplicates.
- Roll back/reconcile rejected cosmetics.

## 9.1 Predicted cannon presentation

Same-frame local:

- Muzzle flash
- Cannon audio
- Camera impulse
- Crosshair kick
- Optional predicted shell visual

Do not locally apply damage or score.

## 9.2 Predicted MG presentation

- Immediate audio start
- Immediate muzzle flash/tracer cadence
- Local cadence driven by resolved weapon rate
- Authoritative hits remain server-owned
- Stop immediately on mouse release

Avoid playing duplicate authoritative MG shot audio on the originating client.

## 9.3 Predicted shell merge

Optional but recommended for the crispest cannon:

```text
local predicted shell
→ action result includes authoritative shell ID
→ bind the visual to authoritative shell
→ blend any small positional difference
```

If rejected:

```text
fade/remove predicted shell
→ subtle dry-fire feedback if desired
```

---

# 10. Exact recoil and external impulses

## 10.1 Authoritative impulse source

Refactor recoil so one authoritative operation:

1. Calculates exact deltas.
2. Applies deltas to `TankState`.
3. Increments `impulseSeq`.
4. Emits `tankImpulse`.
5. Emits semantic gameplay bus event.

Follow the existing `SystemContext` effect-service pattern.

Recommended:

```text
src/shared/effects/tankImpulseSystem.ts
```

`RecoilEffect` becomes a weapon-facing adapter.

## 10.2 Both clients apply the impulse immediately

Driver and Gunner call:

```ts
sharedTankPredictor.pushTankImpulse(event);
```

The next snapshot acknowledges the impulse sequence.

This prevents recoil movement from waiting for the interpolation buffer.

## 10.3 Local provisional recoil

The Gunner may play immediate cosmetic recoil on click.

Do not apply a guessed physical tank velocity unless the implementation has a deterministic local weapon rule and a reconciliation plan.

The safest first release:

```text
same-frame camera/visual kick
+
exact tank movement on authoritative impulse event
```

This yields crisp firing while retaining exact shared movement.

After measurement, provisional physical recoil may be added with action-sequence replacement.

---

# 11. Snapshot and server timing

## 11.1 Fix actual snapshot rate

Replace:

```ts
snapshotT = 0;
```

with:

```ts
snapshotT -= snapshotInterval;
```

Use a bounded loop if necessary.

Add a test proving the requested rate over several simulated seconds.

## 11.2 Simulation tick

Track a real room/match simulation tick:

```ts
room.simulationTick++;
```

Send that tick in:

- Driver relay
- Tank impulse
- Snapshot
- Critical action events

## 11.3 Server fixed-step loop

Replace direct fixed `setInterval` stepping with a wall-clock accumulator:

```text
elapsed wall time
→ bounded accumulator
→ run zero or more fixed 30 Hz steps
→ cap catch-up steps
→ record dropped time
```

Do not allow an unbounded catch-up spiral.

## 11.4 Broadcast serialization

Allow the transport to send a pre-serialized string.

For identical room broadcasts:

```text
JSON.stringify once
→ send same payload to both sockets
```

This is a server CPU optimization, not a protocol semantic change.

---

# 12. Rendering and collision-query performance

## 12.1 CameraQueryIndex

Add a client-only spatial index:

```text
src/client/collision/cameraQueryIndex.ts
```

A uniform grid is sufficient.

It indexes camera/aim colliders by world X/Z cell.

APIs:

```ts
querySegment(start, end, radius, out): readonly CameraCollider[];
raycast(origin, direction, maxDistance): CameraRayHit | null;
```

## 12.2 Pre-expanded camera bounds

At arena construction:

```ts
interface CameraCollider {
  box: THREE.Box3;
  cameraBox: THREE.Box3;
  type: string;
}
```

Do not clone and expand in `TpsCameraController.update()`.

## 12.3 Merge cliff colliders

Create visual cliff geometry from all segments as today, but create collision proxies from merged contiguous runs.

Merge by:

- Feature ID
- Similar direction
- Grid adjacency
- Similar top/bottom range

A long wall should produce a few proxies.

Add metrics:

```text
raw cliff edge count
merged cliff collider count
merge ratio
```

## 12.4 Scratch-vector reuse

The frame loop currently allocates many `Vector3` and `Box3` objects.

Use module/class scratch vectors for:

- Camera forward/right
- Anchor/desired eye
- Aim direction
- Tank position
- Ray calculations

Do not optimize one-time setup allocations prematurely.

## 12.5 Separate local tank from remote interpolation

Replace whole-state interpolation in the render loop with:

```text
latest discrete MatchState
+ remote entity interpolation cache
+ SharedTankPredictor render state
+ TurretPredictor render state
```

Recommended modules:

```text
RemoteEntityInterpolator
SnapshotTimeline
SharedTankPredictor
TurretPredictor
```

`RemoteEntityInterpolator` writes directly into entity views or reusable render records.

Do not allocate a complete new `MatchState` each frame.

## 12.6 PIP quality

PIP defaults:

```text
target 12–15 Hz
fixed reduced resolution
no bloom
no shadows where feasible
```

Adaptive quality order:

1. Reduce PIP rate.
2. Reduce PIP resolution.
3. Disable PIP temporarily.
4. Only then reduce the main-view quality further.

---

# 13. Instrumentation

Extend or add a focused F4 netcode overlay rather than overloading the map-generation F3 panel.

Recommended:

```text
src/client/app/netcodeDebugOverlay.ts
```

Display:

```text
role
FPS average / p95 frame time
RTT

actual Driver send Hz
actual Gunner aim send Hz
action send latency
actual snapshot receive Hz
snapshot interval jitter
render time behind authority

last Driver input seq / ack
last Gunner input seq / ack
last Driver relay seq / ack
last tank impulse seq / ack

pending Driver inputs
pending Gunner aims
pending actions
pending impulses

tank correction distance
tank correction yaw
turret correction angle
predictor disabled reason

snapshot bytes
parse time
interpolation time
world sync time
camera query time
aim query time
candidate collider count
tested collider count
PIP render time
```

Add aggregate metrics APIs; do not wire the overlay by reading private fields through unsafe casts.

## Artificial conditions

Add development-only network simulation:

```text
latency
jitter
server processing stall
client message delay
```

Because WebSocket is ordered/reliable, do not pretend arbitrary packet loss behaves like UDP loss.

Delay and burst delivery are more representative.

---

# 14. Module boundaries

Recommended final client structure:

```text
src/client/
├── app/
│   ├── gameClient.ts
│   ├── networkStatePresenter.ts
│   ├── presentationEventRouter.ts
│   ├── netcodeDebugOverlay.ts
│   └── ...
├── prediction/
│   ├── sharedTankPredictor.ts
│   ├── turretPredictor.ts
│   ├── gunnerActionPredictor.ts
│   └── predictionTypes.ts
├── collision/
│   ├── cameraQueryIndex.ts
│   └── cliffColliderMerge.ts
└── net.ts
```

Recommended shared/server structure:

```text
src/shared/net/
├── protocol.ts
├── interpolation.ts
├── netcodeConfig.ts
└── netcodeStats.ts

src/shared/effects/
├── recoilEffect.ts
└── tankImpulseSystem.ts

src/server/
├── index.ts
├── room.ts
└── fixedStepClock.ts
```

Adapt names to repository conventions.

---

# 15. Migration strategy

## Stage A — Instrument and fix timing defects

- Add netcode statistics.
- Fix true snapshot cadence.
- Add real simulation tick.
- Measure current recoil latency and collider cost.
- Preserve behavior otherwise.

## Stage B — Immediate Gunner action feedback

- Edge-latch Gunner actions.
- Send discrete actions immediately.
- Add action sequences/results.
- Predict local cosmetic feedback.
- Suppress authoritative duplicates.
- Use Gunner input acknowledgements for turret reconcile.

This stage should make shooting feel responsive before shared tank prediction is complete.

## Stage C — Exact tank impulse events

- Add `TankImpulseSystem`.
- Emit exact sequenced impulses.
- Apply them to Driver predictor immediately.
- Apply them to Gunner shared presentation immediately.
- Acknowledge through snapshots.

## Stage D — Shared vehicle prediction

- Generalize DriverPredictor.
- Relay accepted Driver input.
- Run predictor for Gunner.
- Use predicted tank for both local cameras.
- Preserve remote interpolation.
- Test cliffs, collisions, dash, jump, recoil, and reconnect.

## Stage E — Frame-performance refactor

- Spatial camera/aim index.
- Merge cliff collision proxies.
- Pre-expanded boxes.
- Scratch vectors.
- Direct remote entity interpolation.
- PIP quality changes.

## Stage F — Server robustness

- Wall-clock fixed-step accumulator.
- Serialize broadcasts once.
- Add load and jitter testing.
- Consider compact/delta snapshots only after profiling.

---

# 16. Testing requirements

## 16.1 Protocol tests

- Driver relay contains sanitized accepted input.
- Stale Driver input is not relayed.
- Relay sequence monotonic.
- Gunner action sequence monotonic.
- Duplicate Gunner action rejected.
- Action result matches action sequence.
- Tank impulse sequence monotonic.
- Snapshot acknowledgement fields correct.

## 16.2 Shared predictor tests

- Driver local prediction parity.
- Gunner relayed prediction parity.
- Same input/ground/rules produce same tank state.
- Jump/dash edges applied exactly once.
- Relay gap does not repeat an edge.
- External impulses ordered correctly.
- Snapshot reconcile discards acknowledged frames.
- Unacknowledged frames replay.
- Extreme divergence fallback.
- Arena/rematch reset.
- Wrong-ground disable.

## 16.3 Gunner turret/action tests

- Use `lastProcessedGunnerInputSeq`.
- Newer aim survives stale snapshot.
- Cannon click action sent immediately.
- MG start/stop sent immediately.
- Very short click is not lost.
- Local flash/audio only once.
- Rejected action removes predicted presentation.
- Predicted shell merges with authority.

## 16.4 Timing tests

- 30 Hz simulation produces true 20 Hz snapshots over time.
- Server tick monotonic.
- Fixed-step accumulator bounded.
- No unbounded catch-up.
- Event ordering stable.

## 16.5 Performance tests

- No `Box3.clone()` in hot camera query.
- Query index tests only nearby candidates.
- Merged cliff colliders reduce count.
- Repeated interpolation does not allocate complete MatchState.
- PIP respects configured rate.
- Repeated rematch/rebuild releases query resources.

## 16.6 E2E scenarios

Run two real browser clients.

### Localhost

- Driver movement feels immediate.
- Gunner camera follows the tank without historical delay.
- Cannon flash/sound/shake happen on click.
- Recoil movement reaches both clients together.
- MG sustained fire remains smooth.
- No visible turret rollback.
- Dramatic cliff map maintains FPS.

### Simulated 50/100/150 ms RTT

- Driver remains responsive.
- Gunner aim remains responsive.
- Gunner weapon presentation remains immediate.
- Shared tank prediction remains stable.
- Correction remains bounded.
- No repeated jump/dash/recoil.
- No duplicated shot presentation.

### Lifecycle

- Reconnect
- Rematch
- Practice
- Map reroll
- Checksum gate
- Role-specific PIP
- Results and return to menu

---

# 17. Acceptance metrics

Recommended release gates on a representative desktop:

## Responsiveness

```text
local input-to-presentation:
  p95 < 1 rendered frame

Gunner action send:
  immediate, not gated by periodic input timer

localhost authoritative cannon action round trip:
  measured and displayed

shared tank correction:
  p95 < 0.35 m under 100 ms RTT
  no repeated visible snap
```

Exact correction thresholds may be tuned after instrumentation.

## Frame performance

```text
main client:
  60 FPS target
  p95 frame time < 20 ms

camera + aim query:
  p95 < 1 ms combined on target dramatic map

no repeated major GC spikes caused by interpolation/camera queries
```

## Network

```text
actual snapshot rate:
  20 Hz ± bounded scheduler jitter

relay and impulse queues:
  bounded
  no growth over a 15-minute run
```

---

# 18. Completion criteria

The milestone is complete only when:

1. Both roles render the shared tank through local prediction.
2. Gunner camera no longer follows the 100 ms delayed tank timeline.
3. Accepted Driver input is relayed by the server to the Gunner.
4. Gunner fire actions are edge-latched and sent immediately.
5. Gunner local weapon presentation occurs in the same rendered frame.
6. Action sequences suppress duplicate authoritative effects.
7. Gunner turret reconciliation uses Gunner input acknowledgements.
8. Recoil is delivered as an exact sequenced impulse.
9. Driver and Gunner apply recoil without waiting for a snapshot.
10. Snapshots run at the configured actual rate.
11. Remote entities remain buffered and smooth.
12. Camera and aim queries use a spatial index.
13. Cliff camera collision proxies are merged.
14. No per-collider box clone occurs in the frame loop.
15. Full MatchState is not reconstructed every rendered frame.
16. PIP cannot starve the main view.
17. Netcode diagnostics expose the relevant timing and correction metrics.
18. Practice, reconnect, rematch, generated maps, and checksum gates still work.
19. Server remains authoritative for all outcomes.
20. Required unit, integration, E2E, and long-run tests pass.

Final invariant:

> Both players occupy one shared locally predicted vehicle; only the server decides what actually happened.
