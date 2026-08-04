# Progression08 — Network and Pause Guide

## Wire contract

- `PROTOCOL_VERSION = 7` (hardening added `skipRelicPresentation`).
- Client → server: `selectUpgrade { offerId, cardIndex }`.
- Client → server: `skipRelicPresentation { acquisitionSequence }` — either
  player may acknowledge/skip the shared relic reveal. It is idempotent:
  duplicate messages are no-ops and the predetermined result is never
  rerolled or re-applied. A server-side wall-clock deadline always completes
  the reveal if nobody skips.
- Server → client: snapshots already carry `matchFlow`, `teamProgression`
  (level/XP/pending/offers/ready/relic stacks/acquisition sequence/active
  relic reveal), `chests`, and `xpShards`.
- Reconnect reconstructs the active selection from the snapshot; selection
  is idempotent per role. An active relic reveal restores with its fixed
  result, its deadline, and its acquisition sequence; the room timeout then
  resumes play even with no input.

## Pause behavior

`MatchFlowState` gates `MatchRuntime.step`: during
`upgradeSelection`/`relicSelection`, gameplay systems do not run at all.
The 10 s selection timeout uses wall-clock time (server room and Single
Player call `checkProgressionTimeout(nowMs)`), and the auto-pick uses the
dedicated deterministic RNG stream.

## Relic reveal flow

```text
open chest
→ authority predetermines the relic result (acquisitionSequence++)
→ chest consumed exactly once
→ MatchFlowState = relicSelection
→ gameplay pauses; client shows the reveal from the snapshot
→ skipRelicPresentation (either player) or the reveal deadline completes it
→ advanceProgressionFlow() resumes: queued relic reveals → queued
  level-ups → playing
```

Relic application happens at chest-open time on the authority (the reveal is
presentation of an already-applied, already-recorded result), so it happens
exactly once and survives reconnect. Terminal clear/gameOver cancels any
unshown reveal and never starts a new selection.
