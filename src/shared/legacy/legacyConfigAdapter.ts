import type { ContentPack } from '../content/contentPack';
import type { DifficultyDefinition } from '../content/schemas/difficulty';
import type { EnemyDefinition } from '../content/schemas/enemy';
import type { WeaponDefinition } from '../content/schemas/weapon';
import type { GameConfig } from '../config';
import type { MatchConfig, ModifierId } from '../types';

/**
 * Phase 1 compatibility adapter: maps validated content definitions back to
 * the current `GameConfig`/`MatchConfig` shapes so parity with
 * `BASE_CONFIG`/`buildMatchConfig` can be proven before any caller migrates.
 *
 * Removal phase: Phase 2 (immutable match rules replace BASE_CONFIG callers).
 */
export function legacyGameConfigFromContent(pack: ContentPack): GameConfig {
  const mode = pack.selectedMode;
  const tank = pack.getTank(mode.tank);
  const loadout = pack.getLoadout(mode.loadout);
  const mg = weaponOfKind(pack, loadout.primary, 'mg');
  const cannon = weaponOfKind(pack, loadout.secondary, 'cannon');
  const jackpot = weaponOfKind(pack, loadout.ability, 'jackpot');
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
      boostMult: tank.boostMult,
      boostGrip: tank.boostGrip,
      normalGrip: tank.normalGrip,
      braceGrip: tank.braceGrip,
      braceAccelMult: tank.braceAccelMult,
      braceSteerMult: tank.braceSteerMult,
      airControl: tank.airControl,
      gravity: tank.gravity,
      jumpImpulse: tank.jumpImpulse,
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
      fallDamageSpeed: tank.fallDamageSpeed,
      fallDamage: tank.fallDamage,
      recoilImpulse: tank.recoilImpulse,
      recoilSpin: tank.recoilSpin,
      braceRecoilMult: tank.braceRecoilMult,
      jackpotRecoilImpulse: tank.jackpotRecoilImpulse,
      jackpotSpin: tank.jackpotSpin,
      jackpotBraceMult: tank.jackpotBraceMult,
      mgRecoilImpulse: tank.mgRecoilImpulse,
    },
    weapons: {
      mgDamage: mg.damage,
      mgRate: mg.rate,
      mgRange: mg.range,
      mgSpread: mg.spread,
      mgSpeed: mg.speed,
      cannonDamage: cannon.damage,
      cannonRadius: cannon.radius,
      cannonCooldown: cannon.cooldown,
      cannonSpeed: cannon.speed,
      cannonGravity: cannon.gravity,
      cannonLife: cannon.life,
      jackpotDamage: jackpot.damage,
      jackpotRadius: jackpot.radius,
      jackpotSpeed: jackpot.speed,
      jackpotChargeTime: jackpot.chargeTime,
      jackpotLife: jackpot.life,
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
      jackpotScrap: scoring.scrapScores.jackpot,
      linkBraceShot: scoring.links.braceShot,
      linkScrapLoop: scoring.links.scrapLoop,
      linkRamFinish: scoring.links.ramFinish,
      comboPointsPerLevel: scoring.combo.pointsPerLevel,
      comboMax: scoring.combo.max,
      comboDecayTime: scoring.combo.decayTime,
      comboBothWindow: scoring.combo.bothWindow,
      wipeoutPenalty: scoring.wipeoutPenalty,
    },
    jackpot: {
      bugGain: scoring.jackpotGains['enemy.scrapBug'],
      rammerGain: scoring.jackpotGains['enemy.rammer'],
      towerGain: scoring.jackpotGains['enemy.gunTower'],
      truckGain: scoring.jackpotGains['enemy.lootTruck'],
      normalScrapGain: scoring.jackpotGains.normalScrap,
      heavyScrapGain: scoring.jackpotGains.heavyScrap,
      jackpotScrapGain: scoring.jackpotGains.jackpotScrap,
      jackpotCooldown: scoring.jackpotCooldown,
      speedCollectGain: scoring.jackpotGains.speedCollect,
      ramGain: scoring.jackpotGains.ram,
      dodgeGain: scoring.jackpotGains.dodge,
      braceShotGain: scoring.jackpotGains.braceShot,
      assistFloor55: scoring.assist.floor55,
      assistFloor66: scoring.assist.floor66,
      assistFloor70: scoring.assist.floor70,
      assistRequireContributions: scoring.assist.requireContributions,
      finalChaosMult: scoring.finalChaos.mult,
      finalChaosStart: scoring.finalChaos.start,
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
export function legacyMatchConfigFromContent(pack: ContentPack, modifier: ModifierId): MatchConfig {
  const mode = pack.selectedMode;
  const tank = pack.getTank(mode.tank);
  const loadout = pack.getLoadout(mode.loadout);
  const cannon = weaponOfKind(pack, loadout.secondary, 'cannon');
  const spawn = pack.getSpawnDirector(mode.spawnDirector);
  const difficulty = pack.getDifficulty(modifier === 'none' ? mode.difficulty : `difficulty.${modifier}`);
  const base: MatchConfig & { label?: string; desc?: string } = {
    timeScale: difficulty.timeScale,
    modifier,
    cannonCooldown: cannon.cooldown,
    cannonBurst: cannon.burst,
    recoilImpulse: tank.recoilImpulse,
    grip: tank.normalGrip,
    boostGrip: tank.boostGrip,
    gravity: tank.gravity,
    barrelRadius: spawn.props.barrelRadius,
    pickupMagnet: 1,
    pickupLife: 1,
    mgRate: 1,
    maxBugs: 1,
    maxRammers: 1,
    maxTowers: 1,
    jackpotGainMult: 1,
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

type WeaponOfKind<K extends 'mg' | 'cannon' | 'jackpot'> = Extract<WeaponDefinition, { kind: K }>;
type EnemyOfType<T extends 'scrapBug' | 'rammer' | 'gunTower' | 'lootTruck'> = Extract<EnemyDefinition, { type: T }>;

function weaponOfKind<K extends 'mg' | 'cannon' | 'jackpot'>(pack: ContentPack, id: string, kind: K): WeaponOfKind<K> {
  const weapon = pack.getWeapon(id);
  if (weapon.kind !== kind) {
    throw new Error(`content mismatch: expected weapon '${id}' to be kind '${kind}', got '${weapon.kind}'`);
  }
  return weapon as WeaponOfKind<K>;
}

function enemyOfType<T extends 'scrapBug' | 'rammer' | 'gunTower' | 'lootTruck'>(pack: ContentPack, id: string, type: T): EnemyOfType<T> {
  const enemy = pack.getEnemy(id);
  if (enemy.type !== type) {
    throw new Error(`content mismatch: expected enemy '${id}' to be type '${type}', got '${enemy.type}'`);
  }
  return enemy as EnemyOfType<T>;
}
