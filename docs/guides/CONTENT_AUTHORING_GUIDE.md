# Content Authoring Guide

## Movement tuning (arcade aerial)

Tank mobility, weapon recoil, and enemy knockback are content-driven:

- `content/tanks/default.json` — steering, grip, aerial damping,
  gravity/jump/ramp/dash, visual air pitch/roll limits, landing grace,
  and the shared horizontal speed cap.
- `content/weapons/*.json` — recoil magnitudes, vertical scale, ground
  launch threshold, splash knockback curve (keep
  `splashTankKnockbackMultiplier` at 0).
- `content/enemies/*.json` — optional `knockback` block
  (immovable/resistance/drag/gravity/fall damage).
- `content/tanks/default.json` — `rig` block: turret/barrel pivots, muzzle
  local, aim pivot, camera anchor, forward axis, and optional socket
  bindings (see TANK_RIG_AND_WEAPON_SOCKET_GUIDE.md).

Every value flows through Zod schemas → `MatchRules` → the movement rules
block; content and legacy paths are parity-tested. After changing values,
run `npm test` (includes `tests/movement/`), and only regenerate the Demo
golden (`npm run demo:write`) when the deterministic output intentionally
changes.

All gameplay content lives in `content/` as ordinary JSON. The server
validates it with Zod at startup and fails loudly on invalid packs.

## Workflow

1. Add or edit JSON under the matching category folder.
2. Add the file path to `content/manifest.json` under `pack.files`.
3. Run `npm test` (content validation + parity) and the four gates.
4. `npm run server` logs the new pack hash.

### Mode session policy (Single Player vs Multiplayer)

Each mode carries a validated `session` policy:

```json
{
  "kind": "singlePlayer",
  "networkRequired": false,
  "controlScheme": "combinedDriverAndGunner",
  "showRoleIdentity": false,
  "showPeerStatus": false,
  "allowRoleSwap": false,
  "resultsFlow": "localRestart"
}
```

`mode.singlePlayerScoreAttack` is the Single Player seam; `mode.demoScoreAttack`
is the explicit multiplayer policy. Contradictory combinations are rejected
by `modeSessionPolicySchema`. After editing modes/tanks, run
`npm run generate:content-pack` (the stale-file test fails otherwise).

### Cannon charge and contact combat

- `content/tanks/default.json` — `contactDamage` (0), `dashContactDamage`,
  `dashDamageWindowSeconds`, `dashContactKnockback`,
  `dashContactPerTargetCooldown`.
- `content/weapons/mainCannon.json` — `charge` profile (capabilityId,
  tapMaxSeconds, fullChargeSeconds, full multipliers) plus resolvable
  `weapon.charge*` stat ids.
- `content/items/relicCannonCharge.json` — grants `cannon.charge`.
- `content/scoring/demoScoreAttack.json` — `dashScore`, `comboGains`,
  `finalChaos`.

See `docs/guides/CANNON_CHARGE_AUTHORING_GUIDE.md` and
`docs/guides/COMBAT_CONTACT_RULES.md`.

### Map generation profiles

Map/terrain/validation/furniture/density/landmark JSON is resolved into a
client-safe bundle by a single pipeline:

```bash
npm run generate:map-profiles
```

This writes `src/generated/mapProfiles.generated.ts` (plain data, format
version 1, sha256 source hash). The server resolves from the validated JSON
directly; the browser/Practice/Map Lab use the generated module. After any
map-content edit, run the generator — the stale-file test fails otherwise.

### Furniture enabled switches and metrics

Furniture sets support master/category/entry toggles:

| Field | Meaning |
| --- | --- |
| `objectPlacement.enabled` | Master switch for all object placement (terrain/routes/zones/spawns/gates/recovery stay). |
| `ramps.enabled` | Category switch for ramps. |
| `barrel.enabled` | Category switch for barrels. |
| `entries[].enabled` | Per-entry switch; counts are preserved when disabled. |
| `lightPoles.enabled` / `lightPoles.count` | Data-driven light poles (no hardcoded builder). |

Placement metrics (`requested / placed / rendered / colliders / rejected`
per kind) are part of the generated layout and are visible in Map Lab.

### Applying a Map Lab profile bundle

The browser never writes repo files. Apply an exported profile bundle with:

```bash
npm run maplab:apply -- ./downloads/profile.json
npm run maplab:apply -- ./downloads/profile.json --overwrite
```

The CLI validates format/version, Zod schemas, references, and id
conflicts; writes content files; updates `content/manifest.json`;
regenerates the client bundle; and prints changed files. It never creates a
git commit. `--overwrite` is required when an id already exists.

For one-click apply from Map Lab, run `npm run maplab:apply-server` and use
the **Apply to Game** / **Save as New Profile** buttons (localhost only).

### Choosing which map the game loads

Modes may declare an optional `mapProfileId`:

```json
{
  "id": "mode.demoScoreAttack",
  "mapProfileId": "map.arena400Primary"
}
```

The server loads that map for online rooms; the client regenerates the same
id; Practice follows the same default. Omitting the field falls back to
`map.arena400Primary`. "Save as New Profile" in Map Lab writes a new map
definition and updates this field automatically.

### Dramatic terrain and cliff profiles

Terrain profiles may declare purpose-split `slopeRules`
(`driveableMax`, `riskyMax`, `blockedMin`, `cliffMin`, `spawnMax`,
`recoveryMax`, `landingMax`, `maxStepUp`) and cliff features
(`cliffPlateau`, `escarpment`) with `edgeWidth`, `edgeRoughness`,
`accessCount`, `accessWidth`, `accessMaxSlope`, `safetyBuffer`,
`boundaryClearance`, and `spawnClearance`. Only required traversal must be
driveable; optional terrain may be steep, blocked, or cliff-like. See
[DRAMATIC_TERRAIN_PROFILE_AUTHORING.md](DRAMATIC_TERRAIN_PROFILE_AUTHORING.md)
for tuning, validation semantics, and safe promotion.

### Scenes, HUD, and presentation assets (Refractor 02)

Screens and the gameplay HUD are content-driven:

```text
content/scenes/*.json       non-gameplay + hybrid scenes
content/hud/gameplay.json   gameplay HUD document (HudViewModel bindings)
content/scene-flows/*.json  flow state → scene mapping
content/themes/*.json       role/base theme tokens
content/assets/*.json       built-in list + project asset catalog
```

Run `npm run generate:presentation-content` after edits (also part of
`npm run build`). See `docs/refractor02/SCENE_AUTHORING_GUIDE.md`,
`HUD_AUTHORING_GUIDE.md`, and `PROJECT_ASSET_AUTHORING_GUIDE.md`.

## Rules

- IDs are semantic and dot-namespaced (`weapon.mainCannon`,
  `enemy.rammer`, `mode.demoScoreAttack`).
- Numeric constraints are enforced by schemas (positive/finite/int/
  probability ranges).
- References (`dropTableId`, `projectileId`, behavior ids, stat ids) are
  cross-validated with file + JSON-path errors.
- Definitions are frozen at load; never mutate them at runtime.
- Behaviors are TypeScript primitives registered in a registry; JSON
  selects them and supplies parameters. No executable JSON scripting.
- Client presentation ids must be known semantic asset ids.

## Category cheat sheet

| Folder | Contents |
| --- | --- |
| `modes/` | mode selection: objective, loadout, spawn director, scoring, results |
| `objectives/` | objective kind, duration, optional completion rule |
| `tanks/` | tank movement/integrity stats |
| `loadouts/` | primary/secondary/ability weapon ids + turret |
| `weapons/` | behaviorId, fireMode, cooldown, statBlock, projectileId, presentation |
| `projectiles/` | shell motion properties |
| `enemies/` | composed behavior list, hp/radius/score, dropTableId |
| `drop-tables/` | deterministic drops (fixed offsets or scatter) |
| `pickups/` | scrap life/magnet |
| `items/`, `status-effects/` | stat modifiers (add/multiply/override, stacking, duration) |
| `spawn-directors/` | pacing, schedules, truck timing, final chaos |
| `scoring/`, `results/` | score/combo/JACKPOT rules, grades/titles |
| `difficulties/` | match.* / tank.* stat overrides |
| `presentation/` | models, VFX, audio, themes, icons, camera impulses |

## Tank movement tuning (jump and dash)

`content/tanks/*.json` drives Driver locomotion. Designer-facing fields:

| Field | Meaning |
| --- | --- |
| `jumpHeight` | Approximate vertical rise in world metres for a grounded jump; `0` disables jumping. Launch velocity is always `sqrt(2 * gravity * jumpHeight)`. |
| `rampLaunchSpeed` | Launch speed used when leaving a ramp at speed (preserved legacy ramp behavior). |
| `dashImpulse` | Forward velocity delta (m/s) added by a grounded dash. |
| `dashCooldown` | Minimum authoritative seconds between accepted dashes; `0` allows one dash per press edge. |
| `dashAirMultiplier` | Multiplier applied to `dashImpulse` while airborne (`0` disables air dash). |
| `dashMaxHorizontalSpeed` | Post-dash horizontal speed cap; the burst is applied first, then total horizontal speed is capped while preserving direction. |
| `dashPresentationSeconds` | Short PIP/audio/VFX presentation window after a dash; physics is instantaneous. |

Runtime stat IDs (`tank.jumpHeight`, `tank.dashImpulse`,
`tank.dashCooldown`, `tank.dashAirMultiplier`,
`tank.dashMaxHorizontalSpeed`, `tank.dashPresentationSeconds`) support
add/multiply/override modifiers, and every movement-critical value is
replicated in the movement rules block.

Difficulty overrides may target `match.*` or `tank.*` stat ids:

```json
{ "overrides": { "match.gravity": 6.5, "tank.jumpHeight": 2.8 } }
```

Soap Tracks overrides ordinary `match.grip`; there is no held-boost stat
anymore.
