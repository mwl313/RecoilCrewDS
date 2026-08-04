/**
 * Phase 2 known-stat registry. Scope is deliberately limited to the four
 * simulation scopes named in the phase prompt: match, tank, weapon, enemy.
 * Ids mirror the Phase 1 content catalog (`tank.forwardSpeed`,
 * `match.cannonCooldown`, ...) so content validation and runtime resolution
 * agree.
 */
export type StatScope = 'match' | 'tank' | 'weapon' | 'enemy';

export const MATCH_STAT_IDS = [
  'match.timeScale',
  'match.cannonCooldown',
  'match.cannonBurst',
  'match.recoilImpulse',
  'match.grip',
  'match.gravity',
  'match.barrelRadius',
  'match.pickupMagnet',
  'match.pickupLife',
  'match.mgRate',
  'match.maxBugs',
  'match.maxRammers',
  'match.maxTowers',
  'match.jackpotGainMult',
] as const;

export const TANK_STAT_IDS = [
  'tank.forwardSpeed',
  'tank.reverseSpeed',
  'tank.accel',
  'tank.reverseAccel',
  'tank.steerLow',
  'tank.steerHigh',
  'tank.normalGrip',
  'tank.airControl',
  'tank.airGripMultiplier',
  'tank.groundYawDamping',
  'tank.airYawDamping',
  'tank.hardHorizontalSpeedCap',
  'tank.maxVisualAirPitch',
  'tank.maxVisualAirRoll',
  'tank.visualAirLevelRate',
  'tank.landingGripSeconds',
  'tank.landingGripMultiplier',
  'tank.gravity',
  'tank.jumpHeight',
  'tank.rampLaunchSpeed',
  'tank.dashImpulse',
  'tank.dashCooldown',
  'tank.dashAirMultiplier',
  'tank.dashMaxHorizontalSpeed',
  'tank.dashPresentationSeconds',
  'tank.contactDamage',
  'tank.dashContactDamage',
  'tank.dashDamageWindowSeconds',
  'tank.dashContactKnockback',
  'tank.dashContactPerTargetCooldown',
  'tank.collisionRadius',
  'tank.maxSafeStep',
  'tank.maxSubsteps',
  'tank.reverseSteerMult',
  'tank.maxIntegrity',
  'tank.respawnTime',
  'tank.shieldTime',
  'tank.autoRightTime',
  'tank.autoRightRoll',
  'tank.recoilImpulse',
  'tank.recoilSpin',
  'tank.jackpotRecoilImpulse',
  'tank.jackpotSpin',
  'tank.mgRecoilImpulse',
] as const;

export const WEAPON_STAT_IDS = [
  'weapon.mgDamage',
  'weapon.mgRate',
  'weapon.mgRange',
  'weapon.mgSpread',
  'weapon.mgSpeed',
  'weapon.cannonDamage',
  'weapon.cannonRadius',
  'weapon.cannonCooldown',
  'weapon.cannonSpeed',
  'weapon.cannonGravity',
  'weapon.cannonLife',
  'weapon.burst',
  'weapon.jackpotDamage',
  'weapon.jackpotRadius',
  'weapon.jackpotSpeed',
  'weapon.jackpotChargeTime',
  'weapon.jackpotLife',
  'weapon.turretTurnRate',
  'weapon.turretMaxPitch',
  'weapon.turretMinPitch',
  'weapon.barrelHp',
  'weapon.barrelRadius',
  'weapon.barrelChainRadius',
  // Phase 3 weapon behavior parameters (per-kind so the flat weapon stat
  // block can carry all Demo weapons without collisions).
  'weapon.mgRecoilImpulse',
  'weapon.mgRecoilSpin',
  'weapon.cannonRecoilImpulse',
  'weapon.cannonRecoilSpin',
  'weapon.jackpotRecoilImpulse',
  'weapon.jackpotRecoilSpin',
  'weapon.recoilVerticalScale',
  'weapon.recoilGroundLaunchThreshold',
  'weapon.splashKnockbackRadiusMultiplier',
  'weapon.splashKnockbackMax',
  'weapon.splashKnockbackMin',
  'weapon.splashKnockbackVertical',
  'weapon.splashKnockbackFalloffExponent',
  'weapon.splashTankKnockbackMultiplier',
  'weapon.burstSpacing',
  'weapon.splashInnerRatio',
  'weapon.splashInnerMultiplier',
  'weapon.splashOuterMultiplier',
] as const;

export const ENEMY_STAT_IDS = [
  'enemy.bugSpeed',
  'enemy.bugHp',
  'enemy.bugDamage',
  'enemy.rammerHp',
  'enemy.rammerChargeSpeed',
  'enemy.rammerApproachSpeed',
  'enemy.rammerDamage',
  'enemy.rammerTelegraphTime',
  'enemy.rammerChargeTime',
  'enemy.rammerRecoveryTime',
  'enemy.rammerLockTime',
  'enemy.towerHp',
  'enemy.towerShotDamage',
  'enemy.towerShotSpeed',
  'enemy.towerShotInterval',
  'enemy.towerShotCount',
  'enemy.towerFirePause',
  'enemy.towerTelegraphTime',
  'enemy.towerTrackRate',
  'enemy.truckHp',
  'enemy.truckSpeed',
  'enemy.truckSpawnTime',
  'enemy.truckEscapeTime',
] as const;

export const ALL_STAT_IDS = [...MATCH_STAT_IDS, ...TANK_STAT_IDS, ...WEAPON_STAT_IDS, ...ENEMY_STAT_IDS] as const;

const STAT_SET = new Set<string>(ALL_STAT_IDS);
const SCOPE_BY_STAT = new Map<string, StatScope>();
for (const id of MATCH_STAT_IDS) SCOPE_BY_STAT.set(id, 'match');
for (const id of TANK_STAT_IDS) SCOPE_BY_STAT.set(id, 'tank');
for (const id of WEAPON_STAT_IDS) SCOPE_BY_STAT.set(id, 'weapon');
for (const id of ENEMY_STAT_IDS) SCOPE_BY_STAT.set(id, 'enemy');

export function isKnownStat(id: string): boolean {
  return STAT_SET.has(id);
}

export function statScope(id: string): StatScope | null {
  return SCOPE_BY_STAT.get(id) ?? null;
}

/**
 * Movement-critical stats: anything the Driver predictor simulates locally.
 * When one of these changes, the authoritative movement rules revision must
 * advance and the compact movement block must be replicated to clients.
 */
export const MOVEMENT_STAT_IDS = new Set<string>([
  ...TANK_STAT_IDS,
  'match.grip',
  'match.gravity',
  'weapon.turretTurnRate',
]);
