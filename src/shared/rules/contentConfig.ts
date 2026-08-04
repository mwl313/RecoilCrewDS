import type { ContentPack } from '../content/contentPack';
import type { DifficultyDefinition } from '../content/schemas/difficulty';
import type { EnemyDefinition } from '../content/schemas/enemy';
import type { WeaponDefinition } from '../content/schemas/weapon';
import type { GameConfig } from '../config';
import type { MatchConfig, ModifierId } from '../types';

/**
 * Content-driven projection: maps validated content definitions into the
 * legacy `GameConfig`/`MatchConfig` shapes that the simulation still reads
 * through MatchRules. This is the single content-to-legacy-shape builder
 * (the old LegacyConfigAdapter was folded here and removed).
 */
export function legacyGameConfigFromContent(pack: ContentPack, modeId = pack.modeId): GameConfig {
  const mode = pack.getMode(modeId);
  const tank = pack.getTank(mode.tank);
  const loadout = pack.getLoadout(mode.loadout);
  const mg = weaponOfKind(pack, loadout.primary, 'weapon.hitscan');
  const cannon = weaponOfKind(pack, loadout.secondary, 'weapon.projectile');
  const bug = enemyOfType(pack, 'enemy.scrapBug', 'scrapBug');
  const rammer = enemyOfType(pack, 'enemy.rammer', 'rammer');
  const tower = enemyOfType(pack, 'enemy.gunTower', 'gunTower');
  const truck = enemyOfType(pack, 'enemy.lootTruck', 'lootTruck');
  const scoring = pack.getScoring(mode.scoring);
  const spawn = pack.getSpawnDirector(mode.spawnDirector);
  const modifiers = (mode.rematch?.modifiers ?? []).map((id) => legacyModifier(id));

  return {
    tank: {
      forwardSpeed: tank.forwardSpeed,
      reverseSpeed: tank.reverseSpeed,
      accel: tank.accel,
      reverseAccel: tank.reverseAccel,
      steerLow: tank.steerLow,
      steerHigh: tank.steerHigh,
      normalGrip: tank.normalGrip,
      airControl: tank.airControl,
      airGripMultiplier: tank.airGripMultiplier,
      groundYawDamping: tank.groundYawDamping,
      airYawDamping: tank.airYawDamping,
      hardHorizontalSpeedCap: tank.hardHorizontalSpeedCap,
      maxVisualAirPitch: tank.maxVisualAirPitch,
      maxVisualAirRoll: tank.maxVisualAirRoll,
      visualAirLevelRate: tank.visualAirLevelRate,
      landingGripSeconds: tank.landingGripSeconds,
      landingGripMultiplier: tank.landingGripMultiplier,
      gravity: tank.gravity,
      jumpHeight: tank.jumpHeight,
      rampLaunchSpeed: tank.rampLaunchSpeed,
      dashImpulse: tank.dashImpulse,
      dashCooldown: tank.dashCooldown,
      dashAirMultiplier: tank.dashAirMultiplier,
      dashMaxHorizontalSpeed: tank.dashMaxHorizontalSpeed,
      dashPresentationSeconds: tank.dashPresentationSeconds,
      contactDamage: tank.contactDamage,
      dashContactDamage: tank.dashContactDamage,
      dashDamageWindowSeconds: tank.dashDamageWindowSeconds,
      dashContactKnockback: tank.dashContactKnockback,
      dashContactPerTargetCooldown: tank.dashContactPerTargetCooldown,
      collisionRadius: tank.collisionRadius,
      footprint: tank.footprint.map((f) => ({ ...f })),
      maxSafeStep: tank.maxSafeStep,
      maxSubsteps: tank.maxSubsteps,
      reverseSteerMult: tank.reverseSteerMult,
      maxIntegrity: tank.maxIntegrity,
      respawnTime: tank.respawnTime,
      shieldTime: tank.shieldTime,
      autoRightTime: tank.autoRightTime,
      autoRightRoll: tank.autoRightRoll,
      recoilImpulse: tank.recoilImpulse,
      recoilSpin: tank.recoilSpin,
      mgRecoilImpulse: tank.mgRecoilImpulse,
    },
    weapons: {
      mgDamage: stat(mg, 'weapon.mgDamage'),
      mgRate: stat(mg, 'weapon.mgRate'),
      mgRange: stat(mg, 'weapon.mgRange'),
      mgSpread: stat(mg, 'weapon.mgSpread'),
      mgSpeed: stat(mg, 'weapon.mgSpeed'),
      cannonDamage: stat(cannon, 'weapon.cannonDamage'),
      cannonRadius: stat(cannon, 'weapon.cannonRadius'),
      cannonCooldown: cannon.cooldownSeconds,
      cannonSpeed: stat(cannon, 'weapon.cannonSpeed'),
      cannonGravity: stat(cannon, 'weapon.cannonGravity'),
      cannonLife: stat(cannon, 'weapon.cannonLife'),
      chargeTapMaxSeconds: cannon.statBlock['weapon.chargeTapMaxSeconds'] ?? cannon.charge?.tapMaxSeconds ?? 0.16,
      chargeFullSeconds: cannon.statBlock['weapon.chargeFullSeconds'] ?? cannon.charge?.fullChargeSeconds ?? 1.0,
      chargeFullDamageMultiplier: cannon.statBlock['weapon.chargeFullDamageMultiplier'] ?? cannon.charge?.fullDamageMultiplier ?? 1,
      chargeFullSplashRadiusMultiplier: cannon.statBlock['weapon.chargeFullSplashRadiusMultiplier'] ?? cannon.charge?.fullSplashRadiusMultiplier ?? 1,
      chargeFullRecoilMultiplier: cannon.statBlock['weapon.chargeFullRecoilMultiplier'] ?? cannon.charge?.fullRecoilMultiplier ?? 1,
      chargeFullKnockbackMaxMultiplier: cannon.statBlock['weapon.chargeFullKnockbackMaxMultiplier'] ?? cannon.charge?.fullKnockbackMaxMultiplier ?? 1,
      chargeFullKnockbackMinMultiplier: cannon.statBlock['weapon.chargeFullKnockbackMinMultiplier'] ?? cannon.charge?.fullKnockbackMinMultiplier ?? 1,
      chargeFullKnockbackVerticalMultiplier: cannon.statBlock['weapon.chargeFullKnockbackVerticalMultiplier'] ?? cannon.charge?.fullKnockbackVerticalMultiplier ?? 1,
      chargeFullShellVisualScale: cannon.statBlock['weapon.chargeFullShellVisualScale'] ?? cannon.charge?.fullShellVisualScale ?? 1.8,
      turretTurnRate: loadout.turret.turnRate,
      turretMaxPitch: loadout.turret.maxPitch,
      turretMinPitch: loadout.turret.minPitch,
      barrelHp: spawn.props.barrelHp,
      barrelRadius: spawn.props.barrelRadius,
      barrelChainRadius: spawn.props.barrelChainRadius,
    },
    enemies: {
      bugSpeed: bug.speed,
      bugHp: bug.hp,
      bugDamage: bug.damage,
      rammerHp: rammer.hp,
      rammerChargeSpeed: rammer.chargeSpeed,
      rammerApproachSpeed: rammer.approachSpeed,
      rammerDamage: rammer.damage,
      rammerTelegraphTime: rammer.telegraphTime,
      rammerChargeTime: rammer.chargeTime,
      rammerRecoveryTime: rammer.recoveryTime,
      rammerLockTime: rammer.lockTime,
      towerHp: tower.hp,
      towerShotDamage: tower.damage,
      towerShotSpeed: tower.shotSpeed,
      towerShotInterval: tower.shotInterval,
      towerShotCount: tower.shotCount,
      towerFirePause: tower.firePause,
      towerTelegraphTime: tower.telegraphTime,
      towerTrackRate: tower.trackRate,
      truckHp: truck.hp,
      truckSpeed: truck.speed,
      truckSpawnTime: truck.spawnTime,
      truckEscapeTime: truck.escapeTime,
    },
    scoring: {
      bugScore: scoring.enemyScores['enemy.scrapBug'],
      rammerScore: scoring.enemyScores['enemy.rammer'],
      towerScore: scoring.enemyScores['enemy.gunTower'],
      truckScore: scoring.enemyScores['enemy.lootTruck'],
      normalScrap: scoring.scrapScores.normal,
      heavyScrap: scoring.scrapScores.heavy,
      linkScrapLoop: scoring.links.scrapLoop,
      linkRamFinish: scoring.links.ramFinish,
      comboPointsPerLevel: scoring.combo.pointsPerLevel,
      comboMax: scoring.combo.max,
      comboDecayTime: scoring.combo.decayTime,
      comboBothWindow: scoring.combo.bothWindow,
      wipeoutPenalty: scoring.wipeoutPenalty,
    },
    arena: {
      half: spawn.arena.half,
      tankRadius: tank.collisionRadius,
      bugRadius: bug.radius,
      rammerRadius: rammer.radius,
      towerRadius: tower.radius,
      truckRadius: truck.radius,
      minActiveBugs: spawn.bugPacing.minActive,
      maxActiveBugs: spawn.bugPacing.maxActive,
      maxRammers: spawn.maxRammers,
      maxTowers: spawn.maxTowers,
      maxPickups: spawn.arena.maxPickups,
    },
    rematch: {
      modifiers,
    },
  };
}

/**
 * MatchConfig equivalent to `buildMatchConfig(modifier)` derived from
 * content. Includes the label/desc extras buildMatchConfig currently spreads
 * from MODIFIER_OVERRIDES so the two stay deep-equal.
 */
export function legacyMatchConfigFromContent(pack: ContentPack, modifier: ModifierId, modeId = pack.modeId): MatchConfig {
  const mode = pack.getMode(modeId);
  const tank = pack.getTank(mode.tank);
  const loadout = pack.getLoadout(mode.loadout);
  const cannon = weaponOfKind(pack, loadout.secondary, 'weapon.projectile');
  const spawn = pack.getSpawnDirector(mode.spawnDirector);
  const difficulty = pack.getDifficulty(modifier === 'none' ? mode.difficulty : `difficulty.${modifier}`);
  const base: MatchConfig & { label?: string; desc?: string } = {
    timeScale: difficulty.timeScale,
    modifier,
    cannonCooldown: cannon.cooldownSeconds,
    cannonBurst: stat(cannon, 'weapon.burst'),
    recoilImpulse: tank.recoilImpulse,
    grip: tank.normalGrip,
    gravity: tank.gravity,
    barrelRadius: spawn.props.barrelRadius,
    pickupMagnet: 1,
    pickupLife: 1,
    mgRate: 1,
    maxBugs: 1,
    maxRammers: 1,
    maxTowers: 1,
    label: difficulty.label,
    desc: difficulty.description ?? '',
  };
  if (difficulty.overrides) {
    for (const [key, value] of Object.entries(difficulty.overrides)) {
      (base as unknown as Record<string, unknown>)[key.replace('match.', '')] = value;
    }
  }
  return base as MatchConfig;
}

export function legacyEnemyConfigFromContent(pack: ContentPack, id: string): EnemyDefinition {
  return pack.getEnemy(id);
}

export function legacyDifficultyFromContent(pack: ContentPack, modifier: ModifierId): DifficultyDefinition {
  return pack.getDifficulty(modifier === 'none' ? pack.selectedMode.difficulty : `difficulty.${modifier}`);
}

function legacyModifier(difficultyId: string): ModifierId {
  return difficultyId.replace(/^difficulty\./, '') as ModifierId;
}

type EnemyOfType<T extends 'scrapBug' | 'rammer' | 'gunTower' | 'lootTruck'> = Extract<EnemyDefinition, { type: T }>;

function weaponOfKind<K extends 'weapon.hitscan' | 'weapon.projectile'>(
  pack: ContentPack,
  id: string,
  kind: K,
): WeaponDefinition {
  const weapon = pack.getWeapon(id);
  if (weapon.behaviorId !== kind) {
    throw new Error(`content mismatch: expected weapon '${id}' behavior '${kind}', got '${weapon.behaviorId}'`);
  }
  return weapon;
}

function stat(weapon: WeaponDefinition, id: string): number {
  const value = weapon.statBlock[id];
  if (value === undefined) {
    throw new Error(`content mismatch: weapon '${weapon.id}' statBlock is missing '${id}'`);
  }
  return value;
}

function enemyOfType<T extends 'scrapBug' | 'rammer' | 'gunTower' | 'lootTruck'>(pack: ContentPack, id: string, type: T): EnemyOfType<T> {
  const enemy = pack.getEnemy(id);
  if (enemy.type !== type) {
    throw new Error(`content mismatch: expected enemy '${id}' to be type '${type}', got '${enemy.type}'`);
  }
  return enemy as EnemyOfType<T>;
}
