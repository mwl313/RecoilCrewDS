# Progression08 — Manual Test Guide

Single Player:

1. Start Single Player; kill enemies; confirm XP shards spawn and magnet
   pull works.
2. Reach level-up; confirm pause overlay with 3 cards; pick a card; game
   resumes.
3. Queue multiple level-ups with large XP; confirm sequential roulettes.
4. Open a chest; confirm relic toast/stacks; duplicate a unique relic for
   +250 XP.
5. Restart and confirm full reset.

Multiplayer (requires serving a progression-enabled mode, e.g.
`mode.truckHunter`):

1. Level up; confirm Driver sees only driver cards and Gunner only gunner
   cards; both must pick; READY markers update; resume after both.
2. Let the 10 s timeout auto-pick; confirm deterministic result.
3. Disconnect/reconnect during selection; confirm the offer restores.
4. Rematch and confirm reset.

Combat:

- Confirm zero contact damage without ROADKILL and speed damage with it.
- Confirm Dash still applies Dash-only damage during the window.
- Confirm Charge Shot, instant turret, and no-fall-damage behavior are
  unchanged.
