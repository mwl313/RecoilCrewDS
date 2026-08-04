# Progression08 — Balance Telemetry Guide

`ProgressionSystem.telemetry` records:

- kills per minute, XP per farming second, XP collected/missed per minute
- level-up timestamps, levels per stage
- upgrade pick rates, rarity distribution
- chests per stage, relic distribution
- ROADKILL hits/kills, trigger activations, selection timeouts

`npm run test:progression:simulation` prints a headless 60-second snapshot.
The debug overlay (bottom-left in-game) shows the live stat breakdown,
flow, offer state, relic stacks, and ROADKILL values. Use this data to tune
the level curve and XP values after enemy design is finalized.
