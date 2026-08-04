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
  const resolve = (id: string, fallback: number): number => {
    try {
      return ctx.rules.resolver.resolve(id);
    } catch {
      // Stats absent from the resolved flat block (e.g. proof weapons
      // without a full cannon statBlock) fall back to per-weapon content.
      const block = weapon.statBlock[id];
      return block !== undefined ? block : fallback;
    }
  };
  const lerp = (base: number, full: number): number => base + (full - base) * q;

  const charge = weapon.charge;
  const damage = lerp(resolve('weapon.cannonDamage', 12), resolve('weapon.cannonDamage', 12) * resolve('weapon.chargeFullDamageMultiplier', charge?.fullDamageMultiplier ?? 1));
  const splashRadius = lerp(resolve('weapon.cannonRadius', 3.4), resolve('weapon.cannonRadius', 3.4) * resolve('weapon.chargeFullSplashRadiusMultiplier', charge?.fullSplashRadiusMultiplier ?? 1));
  const recoilImpulse = lerp(resolve('weapon.cannonRecoilImpulse', ctx.rules.matchConfig.recoilImpulse), resolve('weapon.cannonRecoilImpulse', ctx.rules.matchConfig.recoilImpulse) * resolve('weapon.chargeFullRecoilMultiplier', charge?.fullRecoilMultiplier ?? 1));
  const knockbackMax = lerp(resolve('weapon.splashKnockbackMax', 8), resolve('weapon.splashKnockbackMax', 8) * resolve('weapon.chargeFullKnockbackMaxMultiplier', charge?.fullKnockbackMaxMultiplier ?? 1));
  const knockbackMin = lerp(resolve('weapon.splashKnockbackMin', 1.5), resolve('weapon.splashKnockbackMin', 1.5) * resolve('weapon.chargeFullKnockbackMinMultiplier', charge?.fullKnockbackMinMultiplier ?? 1));
  const knockbackVertical = lerp(resolve('weapon.splashKnockbackVertical', 2.5), resolve('weapon.splashKnockbackVertical', 2.5) * resolve('weapon.chargeFullKnockbackVerticalMultiplier', charge?.fullKnockbackVerticalMultiplier ?? 1));
  const fullVisualScale = resolve('weapon.chargeFullShellVisualScale', charge?.fullShellVisualScale ?? 1);

  return {
    chargeRatio: q,
    damage,
    splashRadius,
    recoilImpulse,
    recoilSpin: resolve('weapon.cannonRecoilSpin', 1.7),
    knockbackMax,
    knockbackMin,
    knockbackVertical,
    knockbackRadiusMultiplier: resolve('weapon.splashKnockbackRadiusMultiplier', 1),
    knockbackFalloffExponent: resolve('weapon.splashKnockbackFalloffExponent', 1.25),
    speed: resolve('weapon.cannonSpeed', 52),
    gravity: resolve('weapon.cannonGravity', 5),
    life: resolve('weapon.cannonLife', 2.4),
    visualScale: 1 + (fullVisualScale - 1) * q,
  };
}
