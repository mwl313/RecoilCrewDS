# Monster Core-Loop Integration — Implementation Report

Branch: `monster-system` (unmerged; never merge into `main`).

## Starting/final SHA

- Phase A start: `1f62372` (reviewed implementation-report head).
- Final head: `f0f48eb` (`monster-core-loop: connect presentation preload and encounter HUD`).

## Commits by phase

| Phase | Commit | Scope |
| --- | --- | --- |
| A | `4ecfe58` | production roster selection and featured identities |
| B | `9755605`, `c750dba`, `2a869f4`, `614b1a0`, `4a9a1bc` | stage timeline, selected-slot resolution, production horde packs/waves, slot plan, defeat/victory |
| C | `211f07f`, `fb1b459`, `7591cc0`, `c1bc68e`, `946c980` | melee reservations, XP bundles, telegraphs/projectile allegiance, deterministic RNG, normalization cache |
| D | `2513257`, `f0f48eb` | semantic actions + death lock, presentation preload, encounter HUD, production mode activation |

## Production modes/content

- `mode.mainStage` (multiplayer) and `mode.singlePlayerMainStage` (single
  player): `map.rocketJumpHighlands`, progression enabled, production horde
  director, tank-destruction defeat (no respawn), boss-death victory.
- Multiplayer keeps assigned roles/network/rematch vote; Single Player keeps
  combined controls and ×2 XP. Enemy difficulty is identical across modes.
- The live server pins `mode.mainStage`; fixture/test servers keep Demo via
  room content metadata.
- Demo (`mode.demoScoreAttack`, `objective.highScore`,
  `spawn.director.demoScoreAttack`) is byte-identical and the golden
  regression still passes.

## Gameplay roster schema

`enemyGameplayRosters` / `enemyGameplayRoster.quaternius.mainStage`:

- 39 ordinary candidates (`closeFodder` / `rangedFodder` / `specialist`)
  with per-phase weights.
- `ordinaryMix`: close 0.50 / ranged 0.30 / specialist 0.20.
- `featuredWaves`: wave 1 eliteCount 1, wave 2 eliteCount 1;
  `maximumSupportedEliteCountPerWave: 2`; two elites requires JSON only.
- `bossEscortCount`: [4, 6].
- Six shared featured identities: alien, cactoro, fish, ninja, demon, yeti.

## Phase weights and selection

`src/shared/monsters/monsterRunSelection.ts`:

- Named PRNG streams (`monsterRoster.phase1/2/3`, `monsterRoster.eliteWave1/2`,
  `monsterRoster.boss`); never `Math.random()`.
- Exactly three slots per phase; no within-phase duplicate; no consecutive
  ordinary repeat; Phase 1 identities may return in Phase 3.
- Elite identities are unique across waves; the boss is selected from
  remaining identities and never matches an elite.
- Selection is derived from `hash32('monster-run', matchId)`, so SP and MP
  compute the identical run for the same match id without a wire exchange.

## Cross-role definitions

Six identities × elite/boss roles (12 definitions), centralized in
`scripts/generate-monster-roster.ts`:

- Elite: tier `elite`, tierScale 3, one melee or ranged attack, HP/damage
  level-scaled, `rewardClass: elite`.
- Boss: tier `boss`, tierScale 5, ordered multi-pattern `mixed` attack with
  at least one ranged pattern, HP level-scaled, damage fixed
  (`levelScaling.damage: false`), `rewardClass: boss`.

## Horde/match flow

- `horde.mainStage.production`: `enforceStage: true`, production stage
  sequence (`pauseCountdownDuringWave: false`), selected-slot packs/waves,
  production boss wave (no legacy boss).
- Timeline: wave 1 at 60 s, wave 2 at 120 s, boss wave at 180 s; boss intro
  is a 4-second presentation window; victory only on boss death; defeat on
  tank destruction with no respawn; elite death never ends the match.
- StageDirector honors `pauseCountdownDuringWave`; Demo behavior unchanged.
- Rematch resets run selection, phases, waves, reservations, cues,
  projectiles, progression, and RNG streams (fresh `MatchRuntime`).

## Reservation/XP/telegraph/projectiles/RNG

- Match-scoped `MeleeReservationManager` updates before attack behaviors;
  only reservation owners may deal melee damage; release on death/range/
  displacement/reset.
- Spawn-locked XP awarded once (`xpAwarded` guard), SP ×2 baked into the
  spawn lock, deterministic value-preserving shard bundles.
- Ranged attacks telegraph before the normalized cue; exactly one slow
  projectile per accepted attack; enemy projectiles ignore enemies.
- All authoritative monster randomness uses named match-scoped streams.

## Presentation/normalization/preload/HUD

- Semantic action controller (`Idle/Walk/Attack/Death`) with stable
  sequences and death lock; monsters write compact `enemy.semantic.*` cues;
  horde replication carries cues once per sequence change; the client
  resolver maps them to roles. Animation never decides gameplay.
- Normalization cache: target heights 1.02/1.53/1.70 m, tier scales 1/3/5,
  normalized projectile sockets; no per-spawn bounds scan.
- Selected-asset preload: exactly the run's near/far/aggregate assets; SP
  awaits before starting; MP preloads on `start` and on first production
  snapshot (reconnect). No startup preload of all optional monsters.
- HUD: `TIME UNTIL NEW WAVE` (sim-time countdown to 60/120/180), `BOSS
  INCOMING`, monster level, wave warnings, one elite bar (two stacked when
  configured), one boss bar, no fodder overhead bars; bars clear on death/
  results/rematch.

## Known limitations

- Multiplayer preload starts at `start` (after the server countdown has
  already begun); a full asset-ready handshake gating the countdown is the
  remaining follow-up if load time matters.
- Reconnecting clients receive only subsequent cue changes; an attack in
  progress may not show its cue until the next change.
- A wave that outlives the next countdown threshold defers that wave until
  the active wave clears; the HUD countdown keeps running.
- Interactive browser qualification and a real two-client run were not
  executed in this environment (no browser harness); see the qualification
  report for what was and was not verified.

## Demo unchanged

Confirmed: Demo content files untouched, golden regression PASS,
`stageViewForMatch` omits the monster block for Demo, session policy for
Demo modes is intact.

## Branch-unmerged confirmation

`monster-system` has not been merged into `main` and must not be.
