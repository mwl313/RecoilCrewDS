import { BASE_CONFIG, GAME } from '../config';
import { DEMO_GRADE_RULES, DEMO_TITLE_RULES } from '../sim/results';
import type { DropTableDefinition } from '../content/schemas/dropTable';
import type { EnemyDefinition } from '../content/schemas/enemy';
import type { LoadoutDefinition } from '../content/schemas/loadout';
import type { ModeDefinition } from '../content/schemas/mode';
import type { ObjectiveDefinition } from '../content/schemas/objective';
import type { PickupDefinition } from '../content/schemas/pickup';
import type { ResultsDefinition } from '../content/schemas/results';
import type { ScoringDefinition } from '../content/schemas/scoring';
import type { SpawnDirectorDefinition } from '../content/schemas/spawnDirector';
import type { WeaponDefinition } from '../content/schemas/weapon';
import type { StatBlock } from '../stats/statBlock';

/**
 * Client-safe Demo rules bundle synthesized from the legacy constants.
 * Values mirror content/demoScoreAttack.* exactly (parity is tested); this
 * keeps the browser Practice path free of fs/zod while using the same rule
 * shapes as the authoritative content path.
 */
export interface DemoRulesBundle {
  objective: ObjectiveDefinition;
  scoring: ScoringDefinition;
  results: ResultsDefinition;
  spawnDirector: SpawnDirectorDefinition;
  weaponStatBlocks: StatBlock;
  loadout: LoadoutDefinition;
  weapons: Record<string, WeaponDefinition>;
  enemies: Record<string, EnemyDefinition>;
  dropTables: Record<string, DropTableDefinition>;
  pickups: Record<string, PickupDefinition>;
}

export const LEGACY_DEMO_CONSTANTS = {
  atSpeedThreshold: 12,
  atSpeedBonus: 25,
  scrapLoopWindow: 3,
  ramScore: 20,
} as const;

export function createLegacyDemoRulesBundle(): DemoRulesBundle {
  const j = BASE_CONFIG.jackpot;
  const sc = BASE_CONFIG.scoring;
  const scoring: ScoringDefinition = {
    id: 'scoring.demoScoreAttack',
    behaviors: ['behavior.scoring.demo'],
    enemyScores: {
      'enemy.scrapBug': sc.bugScore,
      'enemy.rammer': sc.rammerScore,
      'enemy.gunTower': sc.towerScore,
      'enemy.lootTruck': sc.truckScore,
    },
    scrapScores: { normal: sc.normalScrap, heavy: sc.heavyScrap, jackpot: sc.jackpotScrap },
    jackpotGains: {
      'enemy.scrapBug': j.bugGain,
      'enemy.rammer': j.rammerGain,
      'enemy.gunTower': j.towerGain,
      'enemy.lootTruck': j.truckGain,
      normalScrap: j.normalScrapGain,
      heavyScrap: j.heavyScrapGain,
      jackpotScrap: j.jackpotScrapGain,
      speedCollect: j.speedCollectGain,
      ram: j.ramGain,
      dodge: j.dodgeGain,
      linkGain: j.linkGain,
    },
    combo: {
      pointsPerLevel: sc.comboPointsPerLevel,
      max: sc.comboMax,
      decayTime: sc.comboDecayTime,
      bothWindow: sc.comboBothWindow,
    },
    links: {
      scrapLoop: sc.linkScrapLoop,
      ramFinish: sc.linkRamFinish,
    },
    atSpeed: { threshold: LEGACY_DEMO_CONSTANTS.atSpeedThreshold, bonus: LEGACY_DEMO_CONSTANTS.atSpeedBonus },
    scrapLoopWindow: LEGACY_DEMO_CONSTANTS.scrapLoopWindow,
    ramScore: LEGACY_DEMO_CONSTANTS.ramScore,
    wipeoutPenalty: sc.wipeoutPenalty,
    jackpotCooldown: j.jackpotCooldown,
    assist: {
      floor55: j.assistFloor55,
      floor66: j.assistFloor66,
      floor70: j.assistFloor70,
      requireContributions: j.assistRequireContributions,
    },
    finalChaos: { mult: j.finalChaosMult, start: j.finalChaosStart },
  };

  const objective: ObjectiveDefinition = {
    id: 'objective.highScore',
    label: 'High Score',
    kind: 'scoreAttack',
    durationSeconds: GAME.roundDuration,
    behaviors: ['behavior.objective.scoreAttack'],
  };

  const results: ResultsDefinition = {
    id: 'results.demoScoreAttack',
    behaviors: ['behavior.results.demo'],
    grades: DEMO_GRADE_RULES.map((r) => ({
      grade: r.grade,
      minScore: r.minScore,
      ...(r.require ? { require: r.require } : {}),
    })),
    titles: DEMO_TITLE_RULES.map((t) => ({
      id: t.id,
      text: t.text,
      ...(t.require ? { require: t.require } : {}),
    })),
  };

  const spawnDirector: SpawnDirectorDefinition = {
    id: 'spawn.director.demoScoreAttack',
    behaviors: ['behavior.spawnDirector.demo'],
    initialSpawns: [
      { type: 'enemy.scrapBug', x: -7, z: 6 },
      { type: 'enemy.scrapBug', x: 8, z: -4 },
    ],
    bugPacing: {
      minActive: BASE_CONFIG.arena.minActiveBugs,
      maxActive: BASE_CONFIG.arena.maxActiveBugs,
      rampPerSecond: 0.22,
      cap: 22,
    },
    rammerSpawns: [22, 34, 50],
    towerSpawns: [26, 58],
    maxRammers: BASE_CONFIG.arena.maxRammers,
    maxTowers: BASE_CONFIG.arena.maxTowers,
    finalChaos: { start: 70, rammerProbability: 0.12, rammerMax: 3, towerProbability: 0.08 },
    truck: {
      spawnTime: BASE_CONFIG.enemies.truckSpawnTime,
      escapeTime: BASE_CONFIG.enemies.truckEscapeTime,
      escapeShortcut: 8,
    },
    arena: { half: BASE_CONFIG.arena.half, maxPickups: BASE_CONFIG.arena.maxPickups },
    props: {
      barrelHp: BASE_CONFIG.weapons.barrelHp,
      barrelRadius: BASE_CONFIG.weapons.barrelRadius,
      barrelChainRadius: BASE_CONFIG.weapons.barrelChainRadius,
    },
  };

  // Per-kind weapon behavior stats mirroring the Demo content statBlocks
  // (values from BASE_CONFIG + the legacy hardcoded weapon parameters).
  const weaponStatBlocks: StatBlock = {
    'weapon.mgDamage': BASE_CONFIG.weapons.mgDamage,
    'weapon.mgRate': BASE_CONFIG.weapons.mgRate,
    'weapon.mgRange': BASE_CONFIG.weapons.mgRange,
    'weapon.mgSpread': BASE_CONFIG.weapons.mgSpread,
    'weapon.mgSpeed': BASE_CONFIG.weapons.mgSpeed,
    'weapon.mgRecoilImpulse': BASE_CONFIG.tank.mgRecoilImpulse,
    'weapon.mgRecoilSpin': 0.05,
    'weapon.cannonDamage': BASE_CONFIG.weapons.cannonDamage,
    'weapon.cannonRadius': BASE_CONFIG.weapons.cannonRadius,
    'weapon.cannonSpeed': BASE_CONFIG.weapons.cannonSpeed,
    'weapon.cannonGravity': BASE_CONFIG.weapons.cannonGravity,
    'weapon.cannonLife': BASE_CONFIG.weapons.cannonLife,
    'weapon.cannonRecoilImpulse': BASE_CONFIG.tank.recoilImpulse,
    'weapon.cannonRecoilSpin': BASE_CONFIG.tank.recoilSpin,
    'weapon.recoilVerticalScale': 1.0,
    'weapon.recoilGroundLaunchThreshold': 0.25,
    'weapon.splashKnockbackRadiusMultiplier': 1.0,
    'weapon.splashKnockbackMax': 8.0,
    'weapon.splashKnockbackMin': 1.5,
    'weapon.splashKnockbackVertical': 2.5,
    'weapon.splashKnockbackFalloffExponent': 1.25,
    'weapon.splashTankKnockbackMultiplier': 0.0,
    'weapon.burst': 1,
    'weapon.burstSpacing': 0.12,
    'weapon.splashInnerRatio': 0.45,
    'weapon.splashInnerMultiplier': 1,
    'weapon.splashOuterMultiplier': 0.65,
    'weapon.jackpotDamage': BASE_CONFIG.weapons.jackpotDamage,
    'weapon.jackpotRadius': BASE_CONFIG.weapons.jackpotRadius,
    'weapon.jackpotSpeed': BASE_CONFIG.weapons.jackpotSpeed,
    'weapon.jackpotLife': BASE_CONFIG.weapons.jackpotLife,
    'weapon.jackpotRecoilImpulse': BASE_CONFIG.tank.jackpotRecoilImpulse,
    'weapon.jackpotRecoilSpin': BASE_CONFIG.tank.jackpotSpin,
  };

  const loadout: LoadoutDefinition = {
    id: 'loadout.default',
    label: 'Default Crew Loadout',
    behaviors: [],
    primary: 'weapon.machineGun',
    secondary: 'weapon.mainCannon',
    ability: 'weapon.jackpotShell',
    turret: {
      turnRate: BASE_CONFIG.weapons.turretTurnRate,
      pitchFollowRate: 40,
      maxPitch: BASE_CONFIG.weapons.turretMaxPitch,
      minPitch: BASE_CONFIG.weapons.turretMinPitch,
    },
  };

  const weapons: Record<string, WeaponDefinition> = {
    'weapon.machineGun': {
      id: 'weapon.machineGun',
      label: 'Machine Gun',
      behaviors: [],
      behaviorId: 'weapon.hitscan',
      fireMode: 'auto',
      cooldownSeconds: 1 / BASE_CONFIG.weapons.mgRate,
      statBlock: {
        'weapon.mgDamage': BASE_CONFIG.weapons.mgDamage,
        'weapon.mgRate': BASE_CONFIG.weapons.mgRate,
        'weapon.mgRange': BASE_CONFIG.weapons.mgRange,
        'weapon.mgSpread': BASE_CONFIG.weapons.mgSpread,
        'weapon.mgSpeed': BASE_CONFIG.weapons.mgSpeed,
        'weapon.mgRecoilImpulse': BASE_CONFIG.tank.mgRecoilImpulse,
        'weapon.mgRecoilSpin': 0.05,
        'weapon.recoilVerticalScale': 1.0,
      },
    },
    'weapon.mainCannon': {
      id: 'weapon.mainCannon',
      label: 'Main Cannon',
      behaviors: [],
      behaviorId: 'weapon.projectile',
      fireMode: 'semi',
      cooldownSeconds: BASE_CONFIG.weapons.cannonCooldown,
      statBlock: {
        'weapon.cannonDamage': BASE_CONFIG.weapons.cannonDamage,
        'weapon.cannonRadius': BASE_CONFIG.weapons.cannonRadius,
        'weapon.cannonSpeed': BASE_CONFIG.weapons.cannonSpeed,
        'weapon.cannonGravity': BASE_CONFIG.weapons.cannonGravity,
        'weapon.cannonLife': BASE_CONFIG.weapons.cannonLife,
        'weapon.cannonRecoilImpulse': BASE_CONFIG.tank.recoilImpulse,
        'weapon.cannonRecoilSpin': BASE_CONFIG.tank.recoilSpin,
        'weapon.recoilVerticalScale': 1.0,
        'weapon.recoilGroundLaunchThreshold': 0.25,
        'weapon.splashKnockbackRadiusMultiplier': 1.0,
        'weapon.splashKnockbackMax': 8.0,
        'weapon.splashKnockbackMin': 1.5,
        'weapon.splashKnockbackVertical': 2.5,
        'weapon.splashKnockbackFalloffExponent': 1.25,
        'weapon.splashTankKnockbackMultiplier': 0.0,
        'weapon.burst': 1,
        'weapon.burstSpacing': 0.12,
        'weapon.splashInnerRatio': 0.45,
        'weapon.splashInnerMultiplier': 1,
        'weapon.splashOuterMultiplier': 0.65,
      },
      projectileId: 'projectile.cannonShell',
    },
    'weapon.jackpotShell': {
      id: 'weapon.jackpotShell',
      label: 'JACKPOT Shell',
      behaviors: [],
      behaviorId: 'weapon.chargeProjectile',
      fireMode: 'charge',
      cooldownSeconds: BASE_CONFIG.jackpot.jackpotCooldown,
      chargeSeconds: BASE_CONFIG.weapons.jackpotChargeTime,
      statBlock: {
        'weapon.jackpotDamage': BASE_CONFIG.weapons.jackpotDamage,
        'weapon.jackpotRadius': BASE_CONFIG.weapons.jackpotRadius,
        'weapon.jackpotSpeed': BASE_CONFIG.weapons.jackpotSpeed,
        'weapon.jackpotLife': BASE_CONFIG.weapons.jackpotLife,
        'weapon.jackpotRecoilImpulse': BASE_CONFIG.tank.jackpotRecoilImpulse,
        'weapon.jackpotRecoilSpin': BASE_CONFIG.tank.jackpotSpin,
        'weapon.recoilVerticalScale': 1.0,
        'weapon.recoilGroundLaunchThreshold': 0.25,
        'weapon.splashKnockbackRadiusMultiplier': 1.0,
        'weapon.splashKnockbackMax': 12.0,
        'weapon.splashKnockbackMin': 2.5,
        'weapon.splashKnockbackVertical': 4.0,
        'weapon.splashKnockbackFalloffExponent': 1.25,
        'weapon.splashTankKnockbackMultiplier': 0.0,
        'weapon.splashInnerRatio': 0.45,
        'weapon.splashInnerMultiplier': 1,
        'weapon.splashOuterMultiplier': 0.65,
      },
      projectileId: 'projectile.jackpotShell',
    },
  };

  const enemies: Record<string, EnemyDefinition> = {
    'enemy.scrapBug': {
      id: 'enemy.scrapBug',
      label: 'Scrap Bug',
      type: 'scrapBug',
      presentationId: 'enemy.scrapBug',
      behaviors: [
        { id: 'movement.seekTank', parameters: {} },
        { id: 'movement.circleTarget', parameters: {} },
        { id: 'movement.separation', parameters: {} },
        { id: 'movement.obstacleAvoid', parameters: {} },
        { id: 'movement.integrate', parameters: {} },
        { id: 'attack.contactRam', parameters: {} },
      ],
      hp: BASE_CONFIG.enemies.bugHp,
      radius: BASE_CONFIG.arena.bugRadius,
      score: BASE_CONFIG.scoring.bugScore,
      jackpotGain: BASE_CONFIG.jackpot.bugGain,
      contributionPoints: 2,
      dropTableId: 'drops.scrapBug',
      speed: BASE_CONFIG.enemies.bugSpeed,
      damage: BASE_CONFIG.enemies.bugDamage,
      hitCooldown: 1.0,
      circleDistance: 7,
      circleStrength: 0.85,
      separationDistance: 2.4,
      separationStrength: 0.8,
      obstacleAvoidTurn: 1.1,
      speedWobbleAmplitude: 0.6,
      speedWobbleFrequency: 1.7,
      ramSpeedThreshold: 5,
      ramScore: LEGACY_DEMO_CONSTANTS.ramScore,
      ramKnockback: 0.92,
      knockback: {
        immovable: false,
        horizontalResistance: 1.0,
        verticalResistance: 1.0,
        groundDrag: 4.5,
        airDrag: 0.6,
        gravityScale: 1.0,
        fallDamageSpeed: 8,
        fallDamage: 2,
      },
    },
    'enemy.rammer': {
      id: 'enemy.rammer',
      label: 'Rammer',
      type: 'rammer',
      presentationId: 'enemy.rammer',
      behaviors: [
        { id: 'attack.telegraphedCharge', parameters: {} },
        { id: 'trait.vulnerableRear', parameters: { rearBonus: 1.5, whenState: 'recovery' } },
      ],
      hp: BASE_CONFIG.enemies.rammerHp,
      radius: BASE_CONFIG.arena.rammerRadius,
      score: BASE_CONFIG.scoring.rammerScore,
      jackpotGain: BASE_CONFIG.jackpot.rammerGain,
      contributionPoints: 2,
      dropTableId: 'drops.rammer',
      approachSpeed: BASE_CONFIG.enemies.rammerApproachSpeed,
      chargeSpeed: BASE_CONFIG.enemies.rammerChargeSpeed,
      damage: BASE_CONFIG.enemies.rammerDamage,
      telegraphTime: BASE_CONFIG.enemies.rammerTelegraphTime,
      chargeTime: BASE_CONFIG.enemies.rammerChargeTime,
      recoveryTime: BASE_CONFIG.enemies.rammerRecoveryTime,
      lockTime: BASE_CONFIG.enemies.rammerLockTime,
      lockDistance: 16,
      dodgeDistance: 3.6,
      recoveryDecel: 8,
      rearBonus: 1.5,
      knockback: {
        immovable: false,
        horizontalResistance: 0.45,
        verticalResistance: 0.5,
        groundDrag: 5.5,
        airDrag: 0.8,
        gravityScale: 1.1,
        fallDamageSpeed: 9,
        fallDamage: 4,
      },
    },
    'enemy.gunTower': {
      id: 'enemy.gunTower',
      label: 'Gun Tower',
      type: 'gunTower',
      presentationId: 'enemy.gunTower',
      behaviors: [{ id: 'attack.projectileBurst', parameters: {} }],
      hp: BASE_CONFIG.enemies.towerHp,
      radius: BASE_CONFIG.arena.towerRadius,
      score: BASE_CONFIG.scoring.towerScore,
      jackpotGain: BASE_CONFIG.jackpot.towerGain,
      contributionPoints: 3,
      dropTableId: 'drops.gunTower',
      damage: BASE_CONFIG.enemies.towerShotDamage,
      shotSpeed: BASE_CONFIG.enemies.towerShotSpeed,
      shotInterval: BASE_CONFIG.enemies.towerShotInterval,
      shotCount: BASE_CONFIG.enemies.towerShotCount,
      firePause: BASE_CONFIG.enemies.towerFirePause,
      telegraphTime: BASE_CONFIG.enemies.towerTelegraphTime,
      trackRate: BASE_CONFIG.enemies.towerTrackRate,
      idleTime: 1.2,
      aimJitter: 0.05,
      muzzleOffsetX: 1.3,
      muzzleHeight: 2.4,
      shotLife: 6,
      knockback: {
        immovable: true,
        horizontalResistance: 1.0,
        verticalResistance: 1.0,
        groundDrag: 0,
        airDrag: 0,
        gravityScale: 1.0,
        fallDamageSpeed: 0,
        fallDamage: 0,
      },
    },
    'enemy.lootTruck': {
      id: 'enemy.lootTruck',
      label: 'Loot Truck',
      type: 'lootTruck',
      presentationId: 'enemy.lootTruck',
      behaviors: [
        { id: 'movement.followRoute', parameters: {} },
        { id: 'trait.nonAttackingObjective', parameters: {} },
      ],
      hp: BASE_CONFIG.enemies.truckHp,
      radius: BASE_CONFIG.arena.truckRadius,
      score: BASE_CONFIG.scoring.truckScore,
      jackpotGain: BASE_CONFIG.jackpot.truckGain,
      contributionPoints: 4,
      dropTableId: 'drops.lootTruck',
      speed: BASE_CONFIG.enemies.truckSpeed,
      spawnTime: BASE_CONFIG.enemies.truckSpawnTime,
      escapeTime: BASE_CONFIG.enemies.truckEscapeTime,
      waypointReach: 2.5,
      escapeShortcut: 8,
      collisionPushTank: 4,
      collisionPushTruck: 0.7,
      jackpotScrapCount: 5,
      jackpotScrapLife: 16,
      knockback: {
        immovable: false,
        horizontalResistance: 0.12,
        verticalResistance: 0.15,
        groundDrag: 3.0,
        airDrag: 1.2,
        gravityScale: 1.0,
        fallDamageSpeed: 10,
        fallDamage: 6,
      },
    },
  };

  const dropTables: Record<string, DropTableDefinition> = {
    'drops.scrapBug': {
      id: 'drops.scrapBug',
      behaviors: [],
      entries: [{ kind: 'normal', count: 1, offsetX: 0, offsetZ: 0 }],
    },
    'drops.rammer': {
      id: 'drops.rammer',
      behaviors: [],
      entries: [
        { kind: 'heavy', count: 1, offsetX: 0, offsetZ: 0 },
        { kind: 'normal', count: 1, offsetX: 1.2, offsetZ: 0 },
      ],
    },
    'drops.gunTower': {
      id: 'drops.gunTower',
      behaviors: [],
      entries: [
        { kind: 'heavy', count: 1, offsetX: 0, offsetZ: 0 },
        { kind: 'normal', count: 1, offsetX: 1, offsetZ: 0 },
        { kind: 'normal', count: 1, offsetX: -1, offsetZ: 0 },
      ],
    },
    'drops.lootTruck': {
      id: 'drops.lootTruck',
      behaviors: [],
      entries: [{ kind: 'jackpot', count: 5, scatter: { minRadius: 1.4, maxRadius: 3.6, angleJitter: 0.6 } }],
    },
  };

  const pickups: Record<string, PickupDefinition> = {
    'pickup.normalScrap': { id: 'pickup.normalScrap', kind: 'normal', life: 26, magnetRadius: 5, presentationId: 'pickup.normalScrap', behaviors: [] },
    'pickup.heavyScrap': { id: 'pickup.heavyScrap', kind: 'heavy', life: 26, magnetRadius: 6.5, presentationId: 'pickup.heavyScrap', behaviors: [] },
    'pickup.jackpotScrap': { id: 'pickup.jackpotScrap', kind: 'jackpot', life: 16, magnetRadius: 8, presentationId: 'pickup.jackpotScrap', behaviors: [] },
  };

  return { objective, scoring, results, spawnDirector, weaponStatBlocks, loadout, weapons, enemies, dropTables, pickups };
}

/** Mode definition for the client-safe path (mirrors content/modes). */
export function createLegacyDemoModeDefinition(): ModeDefinition {
  return {
    id: 'mode.demoScoreAttack',
    label: 'Demo Score Attack',
    difficulty: 'difficulty.standard',
    tank: 'tank.default',
    loadout: 'loadout.default',
    objectives: ['objective.highScore'],
    spawnDirector: 'spawn.director.demoScoreAttack',
    scoring: 'scoring.demoScoreAttack',
    results: 'results.demoScoreAttack',
    presentation: 'presentation.demoScoreAttack',
    rematch: {
      modifiers: [
        'difficulty.doubleBarrel',
        'difficulty.soapTracks',
        'difficulty.moonYard',
        'difficulty.volatileInventory',
        'difficulty.scrapMagnet',
        'difficulty.overclocked',
      ],
    },
    behaviors: ['behavior.mode.demoScoreAttack'],
  };
}
