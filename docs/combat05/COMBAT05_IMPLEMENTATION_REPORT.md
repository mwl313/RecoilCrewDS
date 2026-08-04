# Combat 05 Implementation Report
## Dash-Only Contact Damage, Instant Turret, No Fall Damage, Relic-Gated Cannon Charge

**Branch:** `combat-rework`  
**Design:** `docs/combat05/COMBAT05_DASH_CHARGE_AND_TURRET_RESPONSIVENESS_DESIGN.md`  
**Audit:** `docs/combat05/COMBAT05_CODE_AUDIT.md`

---

## 1. Audit

The code audit (`COMBAT05_CODE_AUDIT.md`) inventoried tank contact damage,
dash state, fall damage, turret prediction/reconciliation, Gunner action
protocol, and every Jackpot occurrence. All listed items were migrated; the
remaining Jackpot references are historical test-fixture labels and the
deprecated optional `GunnerInput.ability` field retained only for old
fixtures.

## 2. Before/after contact behavior

Before: `attack.contactRam` killed any contacted enemy with damage `999`
when tank speed exceeded 5 m/s, regardless of Dash.

After:

- Normal (slow or fast) tank contact deals 0 enemy damage.
- Only the accepted Dash damage window (`TankState.dashDamageT`, set by
  shared kinematics to `dashDamageWindowSeconds`) damages enemies.
- `TankContactCombat` (src/shared/combat/tankContactCombat.ts) applies
  `dashContactDamage` (12, tunable, not 999), per-target cooldown 0.25 s,
  chassis speed bleed (`dashContactKnockback`), enemy pop, score
  (`scoring.dashScore`), combo contribution, and `dashContact` events.
- Attribution: `dash` source; `ramKills/ramScore` migrated to
  `dashKills/dashScore`. Rammer enemy attacks (`rammer`) are unchanged.

## 3. Turret diagnosis and fix

Diagnosis: local prediction rate-limited yaw/pitch, the server rate-limited
and lerped the same values, snapshot reconcile blended the local turret 50%
back toward authority, and discrete actions carried no click-time aim.

Fix:

- `loadout.turret.responseMode` (`instant` default, `rateLimited` retained).
- Client `PredictionController`: instant sets predicted yaw/pitch to the
  desired mouse target in the same frame; reconcile keeps the newest local
  desired aim (ack only discards frames; hard-correct only invalid/extreme).
- Server `WeaponSystem`: instant applies validated accepted aim directly.
- `GunnerActionMessage` carries `aimYaw/aimPitch`; the server applies
  action-time aim before processing (PROTOCOL_VERSION 3).
- Frame order: consume mouse → solve aim → update predicted turret → write
  rig → reticle → render (already guaranteed by gameplay04 wiring).

## 4. Fall paths removed

- Tank: `fallDamageSpeed`/`fallDamage` deleted from schema/content/config/
  stats/projection/legacy; `onHardFall` callback removed. Landing grip and
  landing physics remain.
- Enemies: knockback `fallDamageSpeed`/`fallDamage` deleted from
  schema/content/legacy; `EnemyImpulseController` lands without HP loss.
- `DamageSource` no longer includes `fall`.

## 5. Jackpot paths removed/migrated

- Deleted: `JackpotSystem`, `SystemContext.jackpot`, `jackpotMeter`,
  `jackpotFired`, `jackpotReady`, `jackpotCooldown`, `chargeT`,
  `GameConfig.jackpot`, `MatchConfig.jackpotGainMult`, all jackpot stat ids,
  `weapon.jackpotShell`, `projectile.jackpotShell`, `pickup.jackpotScrap`,
  the ability loadout slot, `weapon.chargeProjectile`, jackpot damage
  source/kind/events, Jackpot HUD rows, results fields, and
  `audio/vfx/icon/cameraImpulse.jackpot` semantic ids.
- Migrated: final-chaos multiplier → `scoring.finalChaos`; combo gains →
  `scoring.comboGains` (dash/dodge/link); loot-truck drops → heavy scrap;
  results → `chargedCannonShots` / `fullChargeShots`.

## 6. Capability architecture

- `CapabilitySystem` (src/shared/items/capabilitySystem.ts): O(1) `has`,
  source-reference-counted `grant`/`revokeSource`, replicated via
  `MatchState.build.capabilities`.
- `ItemDefinition.grantsCapabilities`; `ItemSystem` grants/revokes by item
  source. `content/items/relicCannonCharge.json` grants `cannon.charge`.
- Modes grant `cannon.charge` by default via `mode.defaultCapabilities`
  (content + legacy), so the charge shot is ON by default. `WeaponSystem`
  checks only `ctx.capabilities.has('cannon.charge')` — no hardcoded relic
  id. Omit `defaultCapabilities` (or revoke) to disable charge.

## 7. Charge state machine

- Actions: `secondaryPressed` / `secondaryReleased` (mg edges unchanged).
- No capability: press fires the normal cannon immediately.
- Capability: press begins a hold; `cannonHoldT` advances each tick; release
  fires once with the computed ratio; taps (≤ `tapMaxSeconds` 0.16 s) fire a
  normal shell; ratio clamps at 1; indefinite full hold never auto-fires.
- Cancellation on death, forced input clear, invalid/duplicate release.
- Single Player drives the same `WeaponSystem` through the same actions.

## 8. Scaling formula

```text
chargeRatio = clamp((heldSeconds - tapMaxSeconds) / (fullChargeSeconds - tapMaxSeconds), 0, 1)
effective = lerp(resolvedBaseCannonValue, resolvedBaseCannonValue * fullMultiplier, chargeRatio)
```

Resolved cannon stats resolve first (StatResolver), then linear charge
interpolation. Full-charge defaults reproduce old Jackpot-like power:
damage 60, splash 9, recoil 17, knockback max 12 / min 2.5 / vertical 4.

## 9. Modifier inheritance tests

- `tests/combat05/chargeScaling.test.ts`: ratio 0/0.5/1, recoil modifier
  scales both normal and charged, Double Barrel burst shells inherit
  ratio/payload.
- `tests/combat05/chargeStateMachine.test.ts`: press/hold/tap/partial/full/
  indefinite hold, rejection, cooldown, death/clear cancellation.

## 10. HUD

- Bottom Jackpot row and old charge row deleted.
- Compact reticle-adjacent charge meter (`crosshair-charge`) with vertical
  fill, held/full states, visible only when `gunner.chargeUnlocked`.
- HUD fill uses local predicted charge for Gunner/Single Player
  (`GameClient.getLocalChargeView`) and authoritative state otherwise.

## 11. Commands run (actual output)

```text
npx tsc --noEmit                      PASS
npm run generate:presentation-content PASS (10 scenes, 1 hud)
npm run generate:content-pack         PASS (3 modes)
npm test                              555/555 PASS (63 files)
npm run test:demo                     PASS (golden regenerated intentionally)
```

Remaining gates (build/e2e/loop/maps/maplab/netcode) are executed in
Milestone 9 verification; see the command-gate section of this report.

## 12. Remaining limitations

- The deprecated optional `GunnerInput.ability` field remains in the type
  for old fixtures only; production code never sends or reads it.
- Demo fixture checkpoint labels still say `jackpotWindow` (test-internal
  historical label, not player-facing).
- No ballistic drop reticle (unchanged scope).

## 13. Completion checklist

```text
1.  Normal tank contact damage is zero                    DONE
2.  High-speed non-Dash contact damage is zero            DONE
3.  Dash uses a dedicated authoritative damage window     DONE
4.  Dash damage tunable, not 999                          DONE
5.  Enemy contact damage remains                          DONE
6.  Local turret equals mouse target same frame           DONE
7.  Server instant aim direct + validated                DONE
8.  Reconcile no longer creates stickiness               DONE
9.  Cannon action includes action-time aim               DONE
10. Tank fall damage deleted                             DONE
11. Enemy fall damage deleted                            DONE
12. Fall damage config/source deleted                    DONE
13. Charge capability generic + relic-grantable          DONE
14. Charge on by default (mode defaultCapabilities)      DONE
15. No-capability cannon fires immediately               DONE
16. Tap release fires normal cannon                      DONE
17. Partial charge fires on release                      DONE
18. Full charge clamps at 100%                           DONE
19. Indefinite full hold                                 DONE
20. Never auto-fires                                     DONE
21. Linear scaling of damage/recoil/knockback/radius     DONE
22. Charge remains a cannon                              DONE
23. All cannon modifiers affect charge                   DONE
24. Burst shells inherit charge                          DONE
25. Full-charge defaults resemble old Jackpot            DONE
26. Jackpot meter/system/state/config removed            DONE
27. Default loadout has no Jackpot ability               DONE
28. No player Jackpot shell kind/source remains          DONE
29. Bottom Jackpot HUD removed                           DONE
30. Compact reticle charge meter works                   DONE
31. Charge HUD locally responsive                        DONE
32. Single Player shares implementation                  DONE
33. Netcode/maps/presentation/lifecycle regression       gate in progress
34. All tests + manual checks                            unit gates DONE, e2e pending
35. Report truthfully documents results                  this report
```
