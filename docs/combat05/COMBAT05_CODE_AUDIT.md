# Combat 05 Code Audit
## Dash-Only Contact Damage, Instant Turret, No Fall Damage, Relic-Gated Cannon Charge

**Branch audited:** `main` @ `8ec5282` (gameplay04 merged)  
**Design:** `docs/combat05/COMBAT05_DASH_CHARGE_AND_TURRET_RESPONSIVENESS_DESIGN.md`

This audit lists the exact files, symbols, and current behavior that Combat 05
must migrate. It is the migration checklist; no item here may be skipped
silently.

---

## 1. Tank contact damage

- `src/shared/enemies/enemyBehaviors.ts` — `attack.contactRam`:
  - On overlap (`runtime.distToTank < enemyRadius + tankRadius + 0.4`) and
    `hitCd <= 0`:
    - if `tankSpeed > ramSpeedThreshold` (default 5): `damage.applyEnemy(e,
      999, 'ram')`, tank velocity scaled by `knockback` (0.92),
    `score.addScore(rules.scoring.ramScore, 'RAM')`,
    `combo.addDriverContribution(1, rules.config.jackpot.ramGain, 'RAM')`.
    - else: enemy deals its contact `damage` to the tank (source `'bug'`).
  - There is **no Dash-state check**; ordinary fast driving kills.
- Enemy content `ramSpeedThreshold`, `ramScore`, `ramKnockback`
  (`content/enemies/scrapBug.json`, legacy fixture `legacyDemoRules.ts`).
- `MatchRuntime.onEntityKilled` (src/shared/sim/matchRuntime.ts):
  `if (source === 'ram') s.stats.ramKills++` and
  `combo.addDriverContribution(2, jackpot.ramGain, 'RAMPAGE')`.
- Stats: `MatchState.stats.ramKills`; `StatsState.ramKills`.

## 2. Dash state

- `TankState.dashCooldown`, `dashPresentationT` (cosmetic only).
- `stepTankKinematics` applies the accepted dash impulse; there is no
  authoritative damage window (`src/shared/sim/tankKinematics.ts`).
- Predictor copies dash fields (`sharedTankPredictor.ts`, snapshot reconcile).

## 3. Damage attribution

- `DamageSource` (`src/shared/damage/damageTypes.ts`):
  `'ram' | 'bug' | 'rammer' | 'cannon' | 'mg' | 'barrel' | 'fall' | 'jackpot' | 'external'`.
- `ram` is tank-caused contact; `rammer` is the Rammer enemy's attack.

## 4. Fall damage

- Tank:
  - `tankKinematics.ts` `TankKinematicsCallbacks.onHardFall(fallSpeed)` fired
    when landing with `vy < -tankCfg.fallDamageSpeed`.
  - `matchRuntime.ts` `onHardFall: () => { damageTank(fallDamage, 'fall');
    push('crash', …, { value: fallDamage }) }`.
  - Config/content: `tank.fallDamageSpeed` (14), `tank.fallDamage` (10) in
    `content/tanks/default.json`, `BASE_CONFIG.tank`, `tankSchema`,
    `statIds` (`tank.fallDamageSpeed`, `tank.fallDamage`), `contentConfig`,
    legacy fixture.
- Enemies:
  - `src/shared/enemies/enemyImpulseController.ts` — on landing,
    `if (impact >= kb.fallDamageSpeed && kb.fallDamage > 0)
    damage.applyEnemy(e, kb.fallDamage, e.lastImpulseSource ?? 'fall')`.
  - Enemy schema `knockback.fallDamageSpeed/fallDamage`; content for
    scrapBug/rammer/lootTruck/gunTower; legacy fixture; test
    `tests/movement/enemyKnockback.test.ts` asserts fall damage.

## 5. Turret local prediction

- `src/client/app/predictionController.ts`:
  - `updateTurretTarget()` clamps `predictedTurretYawLocal` by
    `turretTurnRate * dt` and `predictedTurretPitch` by `pitchFollowRate * dt`.
  - `reconcileTurret()` for Gunner replays pending aim frames, then **blends
    predicted 50% toward reconstructed authority** (and snap-corrects in some
    branches) — this is the stickiness source.
  - Turret rates come from `MovementRulesBlock.turret` (`turnRate`,
    `pitchFollowRate`, `minPitch`, `maxPitch`).

## 6. Turret server validation

- `src/shared/weapons/weaponSystem.ts` `update()`:
  - `tur.yaw = tur.yaw + clamp(angleDiff(tur.yaw, input.aimYaw),
    -turnRate*dt, turnRate*dt)` then `wrapAngle`.
  - `tur.pitch = clamp(lerp(tur.pitch, input.aimPitch,
    clamp(dt*pitchFollowRate,0,1)), minPitch, maxPitch)`.
- `applyGunnerAction()` latches cannon/mg/ability edges.

## 7. Gunner action protocol

- `src/shared/net/protocol.ts` `PROTOCOL_VERSION = 2`;
  `GunnerActionType = 'cannonPressed' | 'mgStart' | 'mgStop' |
  'abilityStart' | 'abilityRelease'`.
- `GunnerActionMessage` has NO aim fields — an action uses the previous
  periodic aim frame.
- Server dispatch in `src/server/room.ts` (`t: 'action'`), results via
  `actionResult` (`accepted`, `reason`).

## 8. Click-time aim

- Absent: actions carry no `aimYaw`/`aimPitch`. Cannon fire can occur on a
  stale aim frame.

## 9. Jackpot state

- `src/shared/types.ts`:
  - `TurretState.jackpotReady`, `jackpotCooldown`, `chargeT`.
  - `StatsState.jackpotMeter`, `jackpotFired`.
  - `MatchConfig.jackpotGainMult`.
  - `ShellState.kind` includes `'jackpot'`; `ScrapKind` includes `'jackpot'`;
    `GunnerInput.ability`; `SimEvent` types `jackpotCharge/jackpotFire/
    jackpotImpact`.
  - `MatchResults.jackpotFired`.
- `src/shared/sim/systems/jackpotSystem.ts` — meter/gain/ready.
- `SystemContext.jackpot` (systemContext.ts).
- `matchRuntime.ts` calls `systems.jackpot.addGain(...)` on kills/ram/dodge/
  pickups; `j = cfg.jackpot` used for `finalChaosMult/start` and
  `jackpotMeter` contributions.

## 10. Jackpot config/stats

- `src/shared/config.ts` `GameConfig.jackpot` block (`ramGain`, `dodgeGain`,
  `linkGain`, scrap gains, `jackpotScrapGain`, `jackpotCooldown`, assist
  floors, `finalChaos`), `weapons.jackpotDamage/Radius/Speed/ChargeTime/Life`,
  `tank.jackpotRecoilImpulse/Spin`, `MatchConfig.jackpotGainMult`.
- `src/shared/stats/statIds.ts` `match.jackpotGainMult`,
  `tank.jackpotRecoilImpulse/Spin`, `weapon.jackpot*` ids.
- `src/shared/rules/contentConfig.ts` projects them.
- `src/shared/stats/rulesRevision.ts` `MovementRulesBlock.weapon` carries
  `jackpotChargeTime`.

## 11. Jackpot pickups/drop tables

- `content/pickups/jackpotScrap.json` (kind `jackpot`, score 150).
- `content/drop-tables/lootTruck.json` drops `kind: 'jackpot'` ×5.
- `src/shared/content/schemas/pickup.ts`/`dropTable.ts`/`scoring.ts` accept
  `jackpot` kind; `PickupSystem`/`DropTableResolver` handle it;
  `entityViewFactory` maps `kind === 'jackpot'` to `pickup.jackpotScrap`.

## 12. Jackpot results/title rules

- `content/results/demoScoreAttack.json` grade/title `require.jackpotFired`.
- `src/shared/content/schemas/results.ts` `jackpotFired` requirement keys.
- `content/scenes/results.json` shows `JACKPOT` stat rows.
- `ResultSystem`/`DemoScoreAttackModeRuntime` read `stats.jackpotFired`.

## 13. Ability loadout slot

- `content/loadouts/default.json` and `truckHunter.json`:
  `ability: "weapon.jackpotShell"`.
- `LoadoutRuntime` requires three slots; `LoadoutRuntime.updateAbility`
  handles `ability` input.
- `content/weapons/jackpotShell.json` (`behaviorId: weapon.chargeProjectile`,
  `projectileId: projectile.jackpotShell`).

## 14. Charge weapon behavior

- `src/shared/weapons/weaponSystem.ts` `updateAbility()`:
  - `if (held && tur.jackpotReady)` charge; **auto-fires at full charge**
    (`chargeT >= chargeSeconds`), zeroes the meter, sets `jackpotReady=false`;
    releasing decays charge.
- `weaponBehaviors.ts` `weapon.chargeProjectile`:
  - `jackpotFired++`, spawns `kind:'jackpot'` shell, `jackpot` recoil source,
    `jackpotFire` event, `weapon.fired` with `kind:'jackpot'`.

## 15. Projectile Jackpot branch

- `src/shared/projectiles/projectileSystem.ts` — spawn/impact branches on
  `kind === 'jackpot'` (damage/radius/knockback, `jackpotImpact` event).
- `src/shared/content/schemas/projectile.ts` `kind` enum includes `jackpot`.
- `content/projectiles/jackpotShell.json`.
- `entityViewFactory.ts` special-cases `sh.kind === 'jackpot'` for visuals.

## 16. HUD Jackpot and charge nodes

- `content/hud/gameplay.json`: `jackpot-row` (label/bar/fill), old bottom
  `charge-row` (`charge-fill` with `gunner.chargeRatio/chargeMax`), preview
  values, `JACKPOT READY` prompt.
- `src/client/presentation/hudViewModel.ts` `gunner.jackpot/jackpotMax/
  jackpotReady/chargeRatio/chargeMax`; `HUD_BINDING_PATHS` entries.
- `src/client/styles.css` `.bar-fill.jackpot`, `.jackpot-bar.ready`,
  `.prompt.jackpot`.
- `HudProjector` reads `jackpotReady`, `chargeT`, `jackpotMeter`.

## 17. VFX/audio IDs

- `src/shared/assetRegistry.ts` / `content/assets/builtins.json`:
  `pickup.jackpotScrap`, `vfx.jackpot`, `audio.jackpotCharge`,
  `audio.jackpotRelease`, `icon.jackpot`, `cameraImpulse.jackpot`.
- `src/client/audio.ts` `jackpotCharge/jackpotRelease` synth cases.
- `src/client/assets/fallbackAssetFactory.ts` jackpot pickup/vfx/audio.
- `content/presentation/demoScoreAttack.json` jackpot entries.
- `content/items/overdriveCannon.json` uses `presentationId: icon.jackpot`.

## 18. Item/relic schema and ItemSystem

- `src/shared/content/schemas/item.ts` — no capability grants.
- `src/shared/items/itemSystem.ts` — applies stat modifiers only.
- `content/items/overdriveCannon.json` — demo item (stat modifiers only).
- `MatchState` has no `build`/capability block.

## 19. Performance-sensitive paths

- `updateTurretTarget` allocates nothing but runs per frame.
- HUD applies cached bindings (no per-frame DOM rebuild) — must be preserved
  for the new charge meter.
- Projectile spawn/impact currently reads `GameConfig` per event; charge
  payload must be stored per shell.

## 20. Tests and fixtures that record current behavior

- `tests/weaponSystem.test.ts` (cooldown, ability charge/auto-fire).
- `tests/movement/enemyKnockback.test.ts` (fall damage).
- `tests/terrainTraversal.test.ts` (`onHardFall` callback).
- `tests/baselineCharacterization.test.ts` (ram kills, jackpot).
- `tests/jumpDash.test.ts` (fall stats in schema fixture).
- `tests/fixtures/demo-golden.json` (generated Demo with jackpot events).
- `e2e/full-game.spec.ts` (JACKPOT flow, `turret.jackpotReady`).
- `contentPack.test.ts` / `proofContent.test.ts` (content expectations).

## 21. Migration checklist

```text
attack.contactRam          → delegate to TankContactCombat (dash-only offense)
ramKills/ramScore/ram      → dashKills/dashScore/dash (tank-caused only)
fallDamageSpeed/fallDamage → deleted (tank + enemy + source 'fall')
onHardFall damage          → deleted
updateTurretTarget         → instant mode: predicted = desired
WeaponSystem.update        → instant mode: direct accepted aim
reconcileTurret            → no backward blend for local instant turret
GunnerActionMessage        → + aimYaw/aimPitch; PROTOCOL_VERSION 3
JackpotSystem/context/state/config/stats → deleted or migrated
weapon.jackpotShell/ability slot        → deleted; ability nullable
weapon.chargeProjectile    → removed; cannon charge state machine
jackpot shell kind/source/events        → cannon + chargeRatio payload
pickup/drop jackpot        → heavy scrap / content migration
results jackpotFired       → chargedCannonShots / fullChargeShots
HUD jackpot/charge rows    → reticle-adjacent charge meter
vfx/audio jackpot ids      → cannonCharge* semantic ids
item schema/system         → grantsCapabilities + CapabilitySystem
```
