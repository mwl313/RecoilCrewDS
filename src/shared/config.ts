import type { MatchConfig, ModifierId } from './types';

export const GAME = {
  roundDuration: 90,
  snapshotHz: 20,
  simHz: 30,
  maxRooms: 200,
  roomCodeAlphabet: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
  roomCodeLength: 6,
  inputTimeout: 1.5,
  reconnectGrace: 10,
};

export interface GameConfig {
  tank: {
    forwardSpeed: number;
    reverseSpeed: number;
    accel: number;
    reverseAccel: number;
    steerLow: number;
    steerHigh: number;
    boostMult: number;
    boostGrip: number;
    normalGrip: number;
    braceGrip: number;
    braceAccelMult: number;
    braceSteerMult: number;
    airControl: number;
    gravity: number;
    jumpImpulse: number;
    collisionRadius: number;
    maxIntegrity: number;
    respawnTime: number;
    shieldTime: number;
    autoRightTime: number;
    autoRightRoll: number;
    fallDamageSpeed: number;
    fallDamage: number;
    recoilImpulse: number;
    recoilSpin: number;
    braceRecoilMult: number;
    jackpotRecoilImpulse: number;
    jackpotSpin: number;
    jackpotBraceMult: number;
    mgRecoilImpulse: number;
  };
  weapons: {
    mgDamage: number;
    mgRate: number;
    mgRange: number;
    mgSpread: number;
    mgSpeed: number;
    cannonDamage: number;
    cannonRadius: number;
    cannonCooldown: number;
    cannonSpeed: number;
    cannonGravity: number;
    cannonLife: number;
    jackpotDamage: number;
    jackpotRadius: number;
    jackpotSpeed: number;
    jackpotChargeTime: number;
    jackpotLife: number;
    turretTurnRate: number;
    turretMaxPitch: number;
    turretMinPitch: number;
    barrelHp: number;
    barrelRadius: number;
    barrelChainRadius: number;
  };
  enemies: {
    bugSpeed: number;
    bugHp: number;
    bugDamage: number;
    rammerHp: number;
    rammerChargeSpeed: number;
    rammerApproachSpeed: number;
    rammerDamage: number;
    rammerTelegraphTime: number;
    rammerChargeTime: number;
    rammerRecoveryTime: number;
    rammerLockTime: number;
    towerHp: number;
    towerShotDamage: number;
    towerShotSpeed: number;
    towerShotInterval: number;
    towerShotCount: number;
    towerFirePause: number;
    towerTelegraphTime: number;
    towerTrackRate: number;
    truckHp: number;
    truckSpeed: number;
    truckSpawnTime: number;
    truckEscapeTime: number;
  };
  scoring: {
    bugScore: number;
    rammerScore: number;
    towerScore: number;
    truckScore: number;
    normalScrap: number;
    heavyScrap: number;
    jackpotScrap: number;
    linkBraceShot: number;
    linkScrapLoop: number;
    linkRamFinish: number;
    comboPointsPerLevel: number;
    comboMax: number;
    comboDecayTime: number;
    comboBothWindow: number;
    wipeoutPenalty: number;
  };
  jackpot: {
    bugGain: number;
    rammerGain: number;
    towerGain: number;
    truckGain: number;
    normalScrapGain: number;
    heavyScrapGain: number;
    jackpotScrapGain: number;
    jackpotCooldown: number;
    speedCollectGain: number;
    ramGain: number;
    dodgeGain: number;
    braceShotGain: number;
    assistFloor55: number;
    assistFloor66: number;
    assistFloor70: number;
    assistRequireContributions: number;
    finalChaosMult: number;
    finalChaosStart: number;
  };
  arena: {
    half: number;
    tankRadius: number;
    bugRadius: number;
    rammerRadius: number;
    towerRadius: number;
    truckRadius: number;
    minActiveBugs: number;
    maxActiveBugs: number;
    maxRammers: number;
    maxTowers: number;
    maxPickups: number;
  };
  rematch: {
    modifiers: ModifierId[];
  };
}

export const BASE_CONFIG: GameConfig = {
  tank: {
    forwardSpeed: 18,
    reverseSpeed: 8,
    accel: 14,
    reverseAccel: 10,
    steerLow: 1.5,
    steerHigh: 0.65,
    boostMult: 1.45,
    boostGrip: 0.35,
    normalGrip: 2.6,
    braceGrip: 7.5,
    braceAccelMult: 0.45,
    braceSteerMult: 0.5,
    airControl: 0.35,
    gravity: 16,
    jumpImpulse: 4.5,
    collisionRadius: 1.35,
    maxIntegrity: 100,
    respawnTime: 3,
    shieldTime: 2,
    autoRightTime: 1.2,
    autoRightRoll: 1.15,
    fallDamageSpeed: 14,
    fallDamage: 10,
    recoilImpulse: 7.2,
    recoilSpin: 1.7,
    braceRecoilMult: 0.35,
    jackpotRecoilImpulse: 17,
    jackpotSpin: 4.5,
    jackpotBraceMult: 0.32,
    mgRecoilImpulse: 0.07,
  },
  weapons: {
    mgDamage: 2,
    mgRate: 11,
    mgRange: 45,
    mgSpread: 0.018,
    mgSpeed: 220,
    cannonDamage: 12,
    cannonRadius: 3.4,
    cannonCooldown: 1.6,
    cannonSpeed: 52,
    cannonGravity: 5,
    cannonLife: 2.4,
    jackpotDamage: 60,
    jackpotRadius: 9,
    jackpotSpeed: 38,
    jackpotChargeTime: 1.0,
    jackpotLife: 3.2,
    turretTurnRate: 4.6,
    turretMaxPitch: 0.42,
    turretMinPitch: -0.12,
    barrelHp: 3,
    barrelRadius: 2.4,
    barrelChainRadius: 6,
  },
  enemies: {
    bugSpeed: 3.2,
    bugHp: 3,
    bugDamage: 4,
    rammerHp: 14,
    rammerChargeSpeed: 13,
    rammerApproachSpeed: 3.2,
    rammerDamage: 16,
    rammerTelegraphTime: 0.75,
    rammerChargeTime: 1.25,
    rammerRecoveryTime: 0.9,
    rammerLockTime: 0.45,
    towerHp: 18,
    towerShotDamage: 5,
    towerShotSpeed: 9,
    towerShotInterval: 0.22,
    towerShotCount: 3,
    towerFirePause: 2.4,
    towerTelegraphTime: 0.7,
    towerTrackRate: 2.2,
    truckHp: 26,
    truckSpeed: 7,
    truckSpawnTime: 42,
    truckEscapeTime: 78,
  },
  scoring: {
    bugScore: 50,
    rammerScore: 250,
    towerScore: 400,
    truckScore: 800,
    normalScrap: 25,
    heavyScrap: 75,
    jackpotScrap: 150,
    linkBraceShot: 50,
    linkScrapLoop: 40,
    linkRamFinish: 40,
    comboPointsPerLevel: 3,
    comboMax: 5,
    comboDecayTime: 6,
    comboBothWindow: 8,
    wipeoutPenalty: 0.15,
  },
  jackpot: {
    bugGain: 3,
    rammerGain: 8,
    towerGain: 12,
    truckGain: 18,
    normalScrapGain: 1.5,
    heavyScrapGain: 4,
    jackpotScrapGain: 8,
    jackpotCooldown: 12,
    speedCollectGain: 2,
    ramGain: 4,
    dodgeGain: 3,
    braceShotGain: 4,
    assistFloor55: 60,
    assistFloor66: 85,
    assistFloor70: 100,
    assistRequireContributions: 2,
    finalChaosMult: 1.5,
    finalChaosStart: 70,
  },
  arena: {
    half: 40,
    tankRadius: 1.35,
    bugRadius: 0.8,
    rammerRadius: 1.05,
    towerRadius: 1.0,
    truckRadius: 1.8,
    minActiveBugs: 7,
    maxActiveBugs: 11,
    maxRammers: 3,
    maxTowers: 2,
    maxPickups: 26,
  },
  rematch: {
    modifiers: [
      'doubleBarrel',
      'soapTracks',
      'moonYard',
      'volatileInventory',
      'scrapMagnet',
      'overclocked',
    ],
  },
};

export const MODIFIER_OVERRIDES: Record<ModifierId, Partial<MatchConfig> & { label: string; desc: string }> = {
  none: { label: 'Standard Rules', desc: 'The classic Recoil Crew experience.' },
  doubleBarrel: {
    label: 'Double Barrel',
    desc: 'Two shells per shot, more recoil, longer cooldown.',
    cannonBurst: 2,
    recoilImpulse: 9.5,
    cannonCooldown: 2.4,
  },
  soapTracks: {
    label: 'Soap Tracks',
    desc: 'Lower grip, wider drifts, less steering control.',
    grip: 0.35,
    boostGrip: 0.18,
  },
  moonYard: {
    label: 'Moon Yard',
    desc: 'Lower gravity and longer airtime.',
    gravity: 6.5,
  },
  volatileInventory: {
    label: 'Volatile Inventory',
    desc: 'Bigger barrel blasts and longer chain reactions.',
    barrelRadius: 3.4,
  },
  scrapMagnet: {
    label: 'Scrap Magnet',
    desc: 'Stronger pickup magnet but shorter pickup life.',
    pickupMagnet: 2.2,
    pickupLife: 0.45,
  },
  overclocked: {
    label: 'Overclocked',
    desc: 'Faster machine gun and more enemies.',
    mgRate: 1.5,
    maxBugs: 1.4,
    maxRammers: 1.4,
    maxTowers: 1.5,
  },
};

export const MODIFIER_LABELS: Record<ModifierId, string> = Object.fromEntries(
  (Object.keys(MODIFIER_OVERRIDES) as ModifierId[]).map((k) => [k, MODIFIER_OVERRIDES[k].label]),
) as Record<ModifierId, string>;
