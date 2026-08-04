# Progression08 — Relic Trigger Guide

Triggers (content-driven through `relicEffect.*` templates):

```text
passive (stat projection) · onCannonFire · onHit(MG/cannon) · onKill(cannon)
onDashHit · onLand · onAir · onWaveClear · onWipeout · contact (roadkill)
```

Handlers register in `RelicEffectRegistry`; relics reference them by
template id with parameters. To add a new behavior:

1. Add the effect type to `RELIC_EFFECT_TYPES`.
2. Register a handler in `createRelicEffectRegistry`.
3. Add a template file and point a relic at it.

Purge never fires kill triggers. Death-mark explosions use `cannon`
attribution only so they cannot chain from relic sources.
