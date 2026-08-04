# Single Player Mode Guide

Single Player replaced Practice as a first-class content mode. It runs the
same deterministic simulation as multiplayer but is fully local: no room, no
server round-trip, no role identity.

## What changed

- Main menu: **SINGLE PLAYER** (action `app.startSinglePlayer`).
- One player controls everything: WASD/Shift/Space drive, mouse aims, LMB MG,
  RMB cannon/JACKPOT.
- No DRIVER/GUNNER chip, no connection dot, no ping, no Practice tag.
- Tab/Q no longer swap roles (the input has no swap mapping at all).
- Results show **PLAY AGAIN** (fresh local match, new seed) and **MAIN MENU**.
- A network disconnect never interrupts a local match.

## Session model

`GameSessionContext`:

```ts
{
  kind: 'multiplayer' | 'singlePlayer',
  networked: boolean,
  localControl: 'assignedRole' | 'combined',
  rulesModeId: string,
}
```

`GameClient.startSinglePlayer(pack, world)` builds the match through the
same `ContentPack → MatchRules → MatchRuntime` pipeline as the server, with
`mode.singlePlayerScoreAttack`.

## Content hooks

The mode file `content/modes/singlePlayerScoreAttack.json` is the divergence
seam:

```json
{
  "id": "mode.singlePlayerScoreAttack",
  "session": {
    "kind": "singlePlayer",
    "networkRequired": false,
    "controlScheme": "combinedDriverAndGunner",
    "showRoleIdentity": false,
    "showPeerStatus": false,
    "allowRoleSwap": false,
    "resultsFlow": "localRestart"
  }
}
```

To tune Single Player separately from multiplayer, point its tank, loadout,
spawn director, scoring, or results at different content ids. The schema
rejects contradictory policies (e.g. singlePlayer + networkRequired).

## HUD behavior

The gameplay HUD binds visibility to the projected session:

```text
session.showRoleIdentity  → role chip
session.showPeerStatus    → connection dot + ping
crosshairVisible          → singlePlayer OR gunner
```

Single Player uses `theme.singlePlayer` (neutral mint accent) instead of a
Driver/Gunner role theme.

## Restart flow

`app.restartSinglePlayer` → `onRestartSinglePlayer` → a new local match with
the next map seed. It never waits for a partner and never opens the rematch
voting UI.

## Verification

```bash
npm run test:maps:sweep        # seeds remain healthy
npx playwright test e2e/singlePlayer.spec.ts
```

The e2e spec plays a full round, asserts no role/peer UI, presses Tab/Q with
no effect, reaches results, clicks PLAY AGAIN, and verifies a fresh match id.
