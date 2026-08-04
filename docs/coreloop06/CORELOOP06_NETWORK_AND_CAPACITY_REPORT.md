# Core Loop 06 — Network and Capacity Report

## Protocol

`PROTOCOL_VERSION` was deliberately bumped **3 → 4** (Combat 05 action protocol unchanged). Snapshots may now carry:

- `horde` — typed replication block:
  - `materialize` `[id, typeIndex, xq, zq, yawq, hpq, maxHpq, flags]`
  - `despawn` / `death` id arrays
  - `near` / `mid` / `far` deltas `[id, xq, zq, yawq, hpq, flags]`
  - `sectors` `[sectorId, typeIndex, count, xq, zq, flowDxq, flowDzq, classIndex, waveId, threatq]`
  - `wave` (waveId, state, leaderId, leaderHp, leaderMaxHp)
- `stage` — phase, farmingTimeRemaining, waveId, leader HP for the HUD.

Quantization: position 0.1 m, yaw 0.001 rad, HP 0.25.

## Tiered rates (from `horde.replicationPolicy.main`)

- Near (tier 0): 15 Hz deltas
- Mid (tier 1): 8 Hz
- Far (tier 2/3): 2 Hz, change-driven (latest state coalesced)
- Sectors: change-driven

Snapshots run at the configured 20 Hz; per-enemy `nextAt` rate limiting plus frame-phase gating prevents resending unchanged records. Critical events (spawn, death, purge, leader death) are never delayed by backpressure; obsolete far transforms coalesce by design.

## Client reconstruction

`HordeReplicationClient` materializes, updates, marks dead, and purges enemies into a persistent map; the presenter interpolates between snapshot pairs exactly as before. `hordeClient.reset()` clears population when the server returns to full-state mode (e.g., reconnect to a legacy match).

## Metrics

`HordeReplicationTracker.stats` reports `enemyBytes` (serialized block size), `serializeMs`, and `deltaQueue` (records emitted this snapshot). Debug overlay and `netcodeMetrics` surface snapshot bytes/parse/rendering.

## Capacity

Selected engineering cap (measured, pending final soak):

- hardEntityCap 300 (fully active)
- ambient soft 80 entities / 100 threat
- wave soft 100 entities / 120 threat
- elite+boss reserve 16, technical reserve 8
- aggregateVisualCap 500 (sector/perceived)
- maximumStoredBudget 40 (spawn points)

Evidence: 500-enemy legacy full-rate tick p50 ≈ 0.96 ms after M5; LOD + sectors add headroom. Final release cap requires the two-client soak and client frame budget; the 15-minute stability run is pending.

## Backpressure strategy

1. Preserve critical events (leader death, tank damage, enemy death).
2. Coalesce obsolete far transforms.
3. Reduce far update frequency under load (policy-driven).
4. Never delay leader death or tank damage.

Delta queues are bounded per enemy (single pending record), and the client map is capped by server population caps.
