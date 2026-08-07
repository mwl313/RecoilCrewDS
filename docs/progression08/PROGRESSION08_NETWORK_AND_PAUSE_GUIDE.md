# Progression08 — Network and Pause Guide

## Wire contract

- `PROTOCOL_VERSION = 16` (reward acknowledgement gate and no-deadline relic reveal).
- Client → server: `selectUpgrade { offerId, cardIndex }`.
- Client → server: `acknowledgeRelic { acquisitionSequence }`. Each currently
  connected required player acknowledges independently. Acknowledgement is
  idempotent and never rerolls or reapplies the predetermined result.
- Server → client snapshots carry `matchFlow`, `teamProgression`, per-role
  upgrade/relic readiness, relic stacks/acquisition sequence, `chests`, and
  `xpShards`.
- Reconnect reconstructs the fixed result from `revealStartedAtWallMs`,
  `continueAllowedAtWallMs`, acknowledgement state, and acquisition sequence.
  There is no normal auto-resolve deadline.

## Pause behavior

`MatchFlowState` gates `MatchRuntime.step` during `upgradeSelection`,
`relicOpening`, and `relicSelection`. Gameplay systems do not run and stale
driver/gunner/weapon inputs are cleared. The upgrade selection timeout remains
wall-clock authority and uses the dedicated deterministic auto-pick RNG stream.

## Relic reveal flow

```text
open chest
→ authority predetermines and applies the relic once (acquisitionSequence++)
→ physical chest opens
→ MatchFlowState = relicSelection
→ client presents the fixed reward indefinitely
→ each currently required connected player sends acknowledgeRelic
→ disconnected roles are removed from the required gate
→ advanceProgressionFlow(): queued relics → queued level-ups → playing
```

Relic application happens exactly once before the reveal and survives reconnect.
Terminal clear/gameOver cancels unshown presentation. The legacy
`skipRelicPresentation` message remains accepted only as a compatibility alias;
current clients send `acknowledgeRelic`.
