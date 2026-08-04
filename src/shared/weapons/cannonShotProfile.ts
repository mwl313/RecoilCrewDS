import type { SystemContext } from '../sim/systems/systemContext';
import type { WeaponDefinition } from '../content/schemas/weapon';

/**
 * Combat 05 M6: pure cannon charge profile resolver.
 *
 * Order is strict: resolved cannon stats first (difficulty/modifier/item
 * through StatResolver), then linear charge interpolation to the full-charge
 * multiplier. Every cannon modifier therefore affects charged shots.
 */
export interface CannonShotProfile {
  chargeRatio: number;
  damage: number;
  splashRadius: number;
  recoilImpulse: number;
  recoilSpin: number;
  knockbackMax: number;
  knockbackMin: number;
  knockbackVertical: number;
  knockbackRadiusMultiplier: number;
  knockbackFalloffExponent: number;
  speed: number;
  gravity: number;
  life: number;
  visualScale: number;
}

export function resolveCannonShotProfile(
  ctx: SystemContext,
  weapon: WeaponDefinition,
  chargeRatio: number,
): CannonShotProfile {
  const q = Math.max(0, Math.min(1, chargeRatio || 0));
  const resolve = (id: string): number => ctx.rules.resolver.resolve(id);
  const lerp = (base: number, full: number): number => base + (full - base) * q;

  const damage = lerp(resolve('weapon.cannonDamage'), resolve('weapon.cannonDamage') * resolve('weapon.chargeFullDamageMultiplier'));
  const splashRadius = lerp(resolve('weapon.cannonRadius'), resolve('weapon.cannonRadius') * resolve('weapon.chargeFullSplashRadiusMultiplier'));
  const recoilImpulse = lerp(resolve('weapon.cannonRecoilImpulse'), resolve('weapon.cannonRecoilImpulse') * resolve('weapon.chargeFullRecoilMultiplier'));
  const knockbackMax = lerp(resolve('weapon.splashKnockbackMax'), resolve('weapon.splashKnockbackMax') * resolve('weapon.chargeFullKnockbackMaxMultiplier'));
  const knockbackMin = lerp(resolve('weapon.splashKnockbackMin'), resolve('weapon.splashKnockbackMin') * resolve('weapon.chargeFullKnockbackMinMultiplier'));
  const knockbackVertical = lerp(resolve('weapon.splashKnockbackVertical'), resolve('weapon.splashKnockbackVertical') * resolve('weapon.chargeFullKnockbackVerticalMultiplier'));
  const fullVisualScale = resolve('weapon.chargeFullShellVisualScale');

  return {
    chargeRatio: q,
    damage,
    splashRadius,
    recoilImpulse,
    recoilSpin: resolve('weapon.cannonRecoilSpin'),
    knockbackMax,
    knockbackMin,
    knockbackVertical,
    knockbackRadiusMultiplier: resolve('weapon.splashKnockbackRadiusMultiplier'),
    knockbackFalloffExponent: resolve('weapon.splashKnockbackFalloffExponent'),
    speed: resolve('weapon.cannonSpeed'),
    gravity: resolve('weapon.cannonGravity'),
    life: resolve('weapon.cannonLife'),
    visualScale: 1 + (fullVisualScale - 1) * q,
  };
}
