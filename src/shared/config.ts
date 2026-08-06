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
    normalGrip: number;
    airControl: number;
    airGripMultiplier: number;
    groundYawDamping: number;
    airYawDamping: number;
    hardHorizontalSpeedCap: number;
    maxVisualAirPitch: number;
    maxVisualAirRoll: number;
    visualAirLevelRate: number;
    landingGripSeconds: number;
    landingGripMultiplier: number;
    gravity: number;
    /** Approximate vertical rise in world metres for a grounded jump. */
    jumpHeight: number;
    /** Launch speed used by ramp launches (preserved legacy ramp behavior). */
    rampLaunchSpeed: number;
    /** Minimum horizontal speed for a natural surface crest launch (m/s). */
    surfaceLaunchMinSpeed: number;
    /** Distance sampled behind the tank to measure incoming grade (m). */
    surfaceLaunchLookBehind: number;
    /** Distance sampled ahead of the tank to measure outgoing grade (m). */
    surfaceLaunchLookAhead: number;
    /** Minimum incoming uphill grade (rise/run) to consider a crest launch. */
    surfaceLaunchMinIncomingGrade: number;
    /** Maximum outgoing grade that still releases the tank at a crest. */
    surfaceLaunchMaxOutgoingGrade: number;
    /** Fraction of horizontal speed converted to launch vertical velocity. */
    surfaceLaunchRetention: number;
    /** Minimum accepted launch vertical velocity (m/s). */
    surfaceLaunchMinVy: number;
    /** Maximum launch vertical velocity (m/s). */
    surfaceLaunchMaxVy: number;
    /** Vertical offset above the crest surface when detaching (m). */
    surfaceLaunchDetachEpsilon: number;
    /** Forward velocity delta added by a grounded dash (m/s). */
    dashImpulse: number;
    /** Minimum authoritative seconds between accepted dashes. */
    dashCooldown: number;
    /** Dash strength multiplier while airborne (0 disables air dash). */
    dashAirMultiplier: number;
    /** Post-dash horizontal speed cap (preserves direction). */
    dashMaxHorizontalSpeed: number;
    /** Presentation window after an accepted dash (seconds). */
    dashPresentationSeconds: number;
    /** Offensive contact damage while NOT dashing (Combat 05: 0). */
    contactDamage: number;
    /** Damage dealt to a contacted enemy during the accepted Dash window. */
    dashContactDamage: number;
    /** Seconds the Dash contact-damage window stays active after a Dash. */
    dashDamageWindowSeconds: number;
    /** Chassis velocity multiplier applied on Dash contact. */
    dashContactKnockback: number;
    /** Per-target cooldown between Dash contact hits (seconds). */
    dashContactPerTargetCooldown: number;
    collisionRadius: number;
    /** Chassis footprint: circle offsets along forward and radii (metres). */
    footprint: { offset: number; radius: number }[];
    /** Maximum horizontal displacement per collision substep (metres). */
    maxSafeStep: number;
    /** Maximum number of collision substeps per simulation step. */
    maxSubsteps: number;
    /** Reverse steering strength multiplier (direction never flips). */
    reverseSteerMult: number;
    maxIntegrity: number;
    respawnTime: number;
    shieldTime: number;
    autoRightTime: number;
    autoRightRoll: number;
    recoilImpulse: number;
    recoilSpin: number;
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
    chargeTapMaxSeconds: number;
    chargeFullSeconds: number;
    chargeFullDamageMultiplier: number;
    chargeFullSplashRadiusMultiplier: number;
    chargeFullRecoilMultiplier: number;
    chargeFullKnockbackMaxMultiplier: number;
    chargeFullKnockbackMinMultiplier: number;
    chargeFullKnockbackVerticalMultiplier: number;
    chargeFullShellVisualScale: number;
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
    linkScrapLoop: number;
    linkRamFinish: number;
    comboPointsPerLevel: number;
    comboMax: number;
    comboDecayTime: number;
    comboBothWindow: number;
    wipeoutPenalty: number;
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
    steerHigh: 0.9,
    normalGrip: 2.1,
    airControl: 0.55,
    airGripMultiplier: 0.35,
    groundYawDamping: 3.2,
    airYawDamping: 2.2,
    hardHorizontalSpeedCap: 35.0,
    maxVisualAirPitch: 0.22,
    maxVisualAirRoll: 0.28,
    visualAirLevelRate: 4.0,
    landingGripSeconds: 0.12,
    landingGripMultiplier: 0.35,
    gravity: 13.5,
    jumpHeight: 3.0,
    rampLaunchSpeed: 6.5,
    surfaceLaunchMinSpeed: 7.0,
    surfaceLaunchLookBehind: 2.0,
    surfaceLaunchLookAhead: 2.5,
    surfaceLaunchMinIncomingGrade: 0.15,
    surfaceLaunchMaxOutgoingGrade: 0.05,
    surfaceLaunchRetention: 0.8,
    surfaceLaunchMinVy: 1.5,
    surfaceLaunchMaxVy: 8.0,
    surfaceLaunchDetachEpsilon: 0.05,
    dashImpulse: 13.0,
    dashCooldown: 0.8,
    dashAirMultiplier: 0.8,
    dashMaxHorizontalSpeed: 33.0,
    dashPresentationSeconds: 0.18,
    contactDamage: 0,
    dashContactDamage: 12,
    dashDamageWindowSeconds: 0.2,
    dashContactKnockback: 0.92,
    dashContactPerTargetCooldown: 0.25,
    collisionRadius: 1.35,
    footprint: [
      { offset: -1.0, radius: 0.9 },
      { offset: 0, radius: 1.15 },
      { offset: 1.0, radius: 0.9 },
    ],
    maxSafeStep: 0.45,
    maxSubsteps: 8,
    reverseSteerMult: 0.7,
    maxIntegrity: 100,
    respawnTime: 3,
    shieldTime: 2,
    autoRightTime: 1.2,
    autoRightRoll: 1.15,
    recoilImpulse: 10.5,
    recoilSpin: 1.7,
    mgRecoilImpulse: 0.15,
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
    chargeTapMaxSeconds: 0.16,
    chargeFullSeconds: 1.0,
    chargeFullDamageMultiplier: 5.0,
    chargeFullSplashRadiusMultiplier: 2.6470588235,
    chargeFullRecoilMultiplier: 1.619047619,
    chargeFullKnockbackMaxMultiplier: 1.5,
    chargeFullKnockbackMinMultiplier: 1.6666666667,
    chargeFullKnockbackVerticalMultiplier: 1.6,
    chargeFullShellVisualScale: 1.8,
  turretTurnRate: 60,
    turretMaxPitch: Math.PI / 2,
    turretMinPitch: -Math.PI / 2,
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
    linkScrapLoop: 40,
    linkRamFinish: 40,
    comboPointsPerLevel: 3,
    comboMax: 5,
    comboDecayTime: 6,
    comboBothWindow: 8,
    wipeoutPenalty: 0.15,
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

export function buildMatchConfig(modifier: ModifierId): MatchConfig {
  const over = MODIFIER_OVERRIDES[modifier];
  return {
    timeScale: 1,
    modifier,
    cannonCooldown: BASE_CONFIG.weapons.cannonCooldown,
    cannonBurst: 1,
    recoilImpulse: BASE_CONFIG.tank.recoilImpulse,
    grip: BASE_CONFIG.tank.normalGrip,
    gravity: BASE_CONFIG.tank.gravity,
    barrelRadius: BASE_CONFIG.weapons.barrelRadius,
    pickupMagnet: 1,
    pickupLife: 1,
    mgRate: 1,
    maxBugs: 1,
    maxRammers: 1,
    maxTowers: 1,
    ...over,
  };
}

export const MODIFIER_LABELS: Record<ModifierId, string> = Object.fromEntries(
  (Object.keys(MODIFIER_OVERRIDES) as ModifierId[]).map((k) => [k, MODIFIER_OVERRIDES[k].label]),
) as Record<ModifierId, string>;
