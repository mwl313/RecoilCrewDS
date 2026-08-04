import type { SystemContext } from '../sim/systems/systemContext';
import type { DamageSource } from '../damage/damageTypes';

export interface RadialImpulseOptions {
  originX: number;
  originY: number;
  originZ: number;
  radius: number;
  maxImpulse: number;
  minImpulse: number;
  verticalImpulse: number;
  falloffExponent: number;
  source: DamageSource;
  affectsTank: boolean;
  affectsEnemies: boolean;
}

/**
 * Radial splash impulse (arcade movement). Damage and knockback are separate
 * effects; `ProjectileSystem.explode()` delegates here. Tank splash
 * knockback remains disabled by content (splashTankKnockbackMultiplier 0).
 */
export class RadialImpulseEffect {
  constructor(private readonly ctx: SystemContext) {}

  apply(opts: RadialImpulseOptions): void {
    if (opts.affectsEnemies) {
      for (const e of this.ctx.state.enemies) {
        if (!e.alive) continue;
        const d = Math.hypot(e.x - opts.originX, e.z - opts.originZ);
        if (d > opts.radius) continue;
        const falloff = Math.pow(Math.max(0, 1 - d / opts.radius), opts.falloffExponent);
        const horizontal = opts.minImpulse + (opts.maxImpulse - opts.minImpulse) * falloff;
        const vertical = opts.verticalImpulse * falloff;
        if (horizontal <= 0.01 && vertical <= 0) continue;
        const dirX = d > 0.001 ? (e.x - opts.originX) / d : 0;
        const dirZ = d > 0.001 ? (e.z - opts.originZ) / d : 0;
        this.ctx.enemyImpulses.apply(
          e,
          this.ctx.enemies.defFor(e),
          dirX,
          dirZ,
          horizontal,
          vertical,
          opts.source,
        );
      }
    }
    void opts.affectsTank; // reserved: tank splash knockback stays data-zero
  }
}
