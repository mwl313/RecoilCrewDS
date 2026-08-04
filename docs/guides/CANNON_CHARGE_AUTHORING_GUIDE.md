# Cannon Charge Authoring Guide

Charge Shot is a relic-gated modifier of `weapon.mainCannon`, not a separate
weapon. Author it through content, never gameplay code.

## Capability ID

`cannon.charge` gates the hold/release behavior. Every mode currently grants
it by default through `mode.defaultCapabilities`, so the charge shot is ON
out of the box. You can also grant it through any item with:

```json
{ "grantsCapabilities": ["cannon.charge"] }
```

Example: `content/items/relicCannonCharge.json`. `WeaponSystem` only checks
`ctx.capabilities.has('cannon.charge')`. To make a mode charge-free, omit
`defaultCapabilities` from its JSON.

## Tap threshold and full charge time

In `content/weapons/mainCannon.json`:

```json
"charge": {
  "capabilityId": "cannon.charge",
  "tapMaxSeconds": 0.16,
  "fullChargeSeconds": 1.0
}
```

Release at or below `tapMaxSeconds` fires a normal shell. Ratio:

```text
clamp((heldSeconds - tapMaxSeconds) / (fullChargeSeconds - tapMaxSeconds), 0, 1)
```

## Linear scaling and multipliers

Combat values are resolvable stats (`weapon.charge*` stat ids) with content
fallbacks from the `charge` block. Effective value:

```text
lerp(resolvedBase, resolvedBase * fullMultiplier, chargeRatio)
```

Default full multipliers: damage 5.0, splash radius 2.647, recoil
1.619, knockback max 1.5, min 1.667, vertical 1.6, visual scale 1.8.

## Cannon modifier inheritance

Because charge scales the *resolved* cannon value, any difficulty/item
modifier that changes cannon damage, radius, recoil, knockback, speed,
gravity, life, cooldown, or burst automatically affects charged shots.
Every burst shell inherits the release ratio.

## VFX/audio IDs

```text
audio.cannonChargeStart / cannonChargeLoop / cannonChargeFull / cannonChargeRelease
vfx.cannonCharge / vfx.cannonMuzzleCharged / vfx.cannonImpactCharged
```

Full charge may reuse the old Jackpot aesthetic after the semantic rename.

## HUD preview

`content/hud/gameplay.json` `crosshair-charge` + `crosshair-charge-fill`
(vertical progressBar, `gunner.chargeMax` denominator). Preview states
`gunner` and `singlePlayer` exercise unlocked/held/full values.

## Testing partial charge

```bash
npx vitest run tests/combat05/chargeStateMachine.test.ts tests/combat05/chargeScaling.test.ts
```

## Burst behavior

Double Barrel (burst 2) fires both shells from one release with the same
charge ratio and combat payload (`slot.state.burstChargeRatio`).
