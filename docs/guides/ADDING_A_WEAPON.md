# Adding a Weapon

Ordinary weapons are JSON + a registered behavior. No `MatchRuntime` edit.

```json
{
  "id": "weapon.myCannon",
  "behaviorId": "weapon.projectile",
  "fireMode": "semi",
  "cooldownSeconds": 1.0,
  "statBlock": {
    "weapon.cannonDamage": 10,
    "weapon.cannonRadius": 3,
    "weapon.cannonSpeed": 50,
    "weapon.cannonGravity": 5,
    "weapon.cannonLife": 2,
    "weapon.cannonRecoilImpulse": 5,
    "weapon.cannonRecoilSpin": 1.2,
    "weapon.burst": 1,
    "weapon.burstSpacing": 0.12,
    "weapon.splashInnerRatio": 0.45,
    "weapon.splashInnerMultiplier": 1,
    "weapon.splashOuterMultiplier": 0.65
  },
  "projectileId": "projectile.cannonShell",
  "presentation": { "muzzleVfxId": "vfx.cannonMuzzle", "fireAudioId": "audio.cannon" }
}
```

Behaviors available: `weapon.hitscan` (auto MG), `weapon.projectile`
(semi cannon), `weapon.chargeProjectile` (JACKPOT). Assign the weapon in a
loadout (`primary`/`secondary`/`ability`) and select that loadout from a
mode. Novel behavior families need a small TypeScript primitive registered
in `WeaponBehaviorRegistry`.
