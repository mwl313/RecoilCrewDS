export type DamageTargetKind = 'enemy' | 'tank' | 'barrel';

export type DamageSource =
  | 'mg'
  | 'cannon'
  | 'barrel'
  | 'tower'
  | 'dash'
  | 'rammer'
  | 'bug'
  | 'crash'
  | 'splash'
  | 'relic'
  | 'roadkill'
  | 'enemy'
  | 'test';

/** Damage directly caused by the Gunner's equipped weapons. */
export function isGunnerWeaponDamage(source: DamageSource): boolean {
  return source === 'mg' || source === 'cannon';
}

/** Cannon splash is the authoritative self-damage source in ProjectileSystem. */
export function isCannonSelfDamage(source: DamageSource): boolean {
  return source === 'cannon' || source === 'splash';
}

export interface DamageTags {
  explosive?: boolean;
  recoilCaused?: boolean;
  [tag: string]: boolean | undefined;
}

/**
 * A damage request produced by weapons/projectiles/environment. Target ids
 * are enemy/barrel entity ids or the literal 'tank'.
 */
export interface DamageRequest {
  targetId: number | string;
  targetKind: DamageTargetKind;
  amount: number;
  source: DamageSource;
  weaponId?: string;
  tags?: DamageTags;
}

export interface DamageResult {
  applied: boolean;
  killed: boolean;
  amount: number;
  targetId: number | string;
}

/** Semantic bus payloads (internal; the wire SimEvent stream is unchanged). */
export interface DamageAppliedEvent {
  targetId: number | string;
  targetKind: DamageTargetKind;
  amount: number;
  source: DamageSource;
  weaponId?: string;
}

export interface EntityKilledEvent {
  enemy: { id: number; type: string; x: number; y: number; z: number };
  source: DamageSource;
  weaponId?: string;
}
