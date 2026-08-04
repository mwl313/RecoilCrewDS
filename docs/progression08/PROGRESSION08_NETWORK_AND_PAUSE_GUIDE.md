# Progression08 — Network and Pause Guide

## Wire contract

- `PROTOCOL_VERSION = 6`.
- Client → server: `selectUpgrade { offerId, cardIndex }`.
- Server → client: snapshots already carry `matchFlow`, `teamProgression`
  (level/XP/pending/offers/ready/relic stacks), `chests`, and `xpShards`.
- Reconnect reconstructs the active selection from the snapshot; selection
  is idempotent per role.

## Pause behavior

`MatchFlowState` gates `MatchRuntime.step`: during
`upgradeSelection`/`relicSelection`, gameplay systems do not run at all.
The 10 s selection timeout uses wall-clock time (server room and Single
Player call `checkProgressionTimeout(nowMs)`), and the auto-pick uses the
dedicated deterministic RNG stream.
