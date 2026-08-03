# Refractor 02 — HUD Authoring Guide

The gameplay HUD is a content document (`content/hud/gameplay.json`) bound
to a typed, safe `HudViewModel`. Content never reads `MatchState`; the
`HudProjector` is the only place authoritative state becomes view data.

## View model fields

`role`, `practice`, `pointerLocked`, `connection.{peerConnected,pingMs,fps}`,
`match.{timeRemaining,timeUrgent,score,scoreText,combo,comboHot}`,
`tank.{integrity,integrityMax,integrityLow,speed,grounded,dashReady,
dashActive,dashCooling}`,
`gunner.{jackpot,jackpotMax,jackpotReady,chargeRatio,chargeMax,
cannonCooldown,cooldownRatio}`,
`prompt`, `promptSub`, `crosshairVisible`, `chargeVisible`,
`objective.{visible,screenX,screenY,label}`,
`pip.{visible,roleLabel,status,connected,jackpot}`.

Bindings support targets `text`, `value`, `visible`, `class`, `style`,
`attribute`, and transforms `number`, `integer`, `time`, `percentage`,
`ratio`, `booleanClass`, `roleLabel`, `connectionLabel`.

## Example 1 — new HUD warning from an existing field

Show a warning when the round is nearly over, using the existing
`tank.integrityLow`-style pattern. Add a node to `content/hud/gameplay.json`:

```json
{
  "id": "heat-warning",
  "type": "text",
  "class": "warning hidden",
  "text": "FINAL 5 SECONDS",
  "bindings": [
    { "target": "visible", "source": "match.timeUrgent" }
  ]
}
```

No runtime code change is required — the field already exists in the view
model and the binding path is allowlisted. Every allowlisted HUD path and
every HUD document binding/prop source is verified against the empty view
model by `tests/presentation/hardening.test.ts`, so a stale path fails the
suite instead of silently binding nothing.

## Example 2 — new HUD field requiring a view-model extension

To expose a brand-new value (e.g. `match.enemiesRemaining`):

1. Add the path to `HUD_BINDING_PATHS` in
   `src/shared/presentation/schemas.ts`.
2. Add the field to `HudViewModel` + `emptyHudViewModel()` in
   `src/client/presentation/hudViewModel.ts`.
3. Compute it in `HudProjector.project()` from `MatchState`.
4. Bind it in the HUD document:

```json
{ "id": "enemies", "type": "statText", "text": "0", "bindings": [
  { "target": "text", "source": "match.enemiesRemaining", "transform": "integer" }
] }
```

No monolithic `Hud` edits are needed — the typed projector is the only
runtime extension point.

## Update strategy

- The HUD DOM is built once; bindings are compiled into handles.
- `HudRuntime.apply(vm)` mutates only changed values (cached per binding).
- Repeaters (results stats, modifier chips) re-render only when the list
  signature changes; stale item subtrees are disposed before rebuilding and
  item ids are scoped (`templateId::index`).
- The gameplay pause button fires `app.pause` (same `showPause()` policy as
  Escape); `app.resume` is only used by the pause overlay's resume button.
  Note: while the pointer is locked, the browser routes input to the game
  canvas, so DOM buttons are reachable after the user releases the lock
  (Escape); Escape itself pauses from either state.
- Transient effects (score popups, combo pulses, damage flashes, dash
  bursts) are event-driven through `HudRuntime.dispatch`, never per-frame
  bindings.

## Role themes

`content/themes/driver.json` and `content/themes/gunner.json` supply
`--role`/`--role-soft` CSS variables (and future tokens). `setTheme(role)`
applies the document theme and keeps the current layout.
