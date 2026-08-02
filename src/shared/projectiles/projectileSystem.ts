import { ARENA, groundHeightAt } from '../arena';
import { dist, dist2, pointInBox } from '../math';
import { enemyRadius } from '../sim/enemyRadius';
import { pushEvent, type SystemContext } from '../sim/systems/systemContext';
import type { ShellState } from '../types';
import { createBuiltinProjectileBehaviors } from './projectileBehaviors';
import { ProjectileBehaviorRegistry } from './projectileBehaviorRegistry';

/**
 * Authoritative projectile system: spawns shells for weapons, advances every
 * shell (weapon-fired and enemy-fired), resolves collisions, and emits
 * damage requests plus `projectile.impacted` bus events.
 */
export class ProjectileSystem {
  readonly behaviors: ProjectileBehaviorRegistry;

  constructor(private readonly ctx: SystemContext) {
    this.behaviors = createBuiltinProjectileBehaviors();
  }

  spawn(x: number, y: number, z: number, dx: number, dy: number, dz: number, speed: number, kind: ShellState['kind'], life: number): ShellState {
    const s = this.ctx.state;
    const shell: ShellState = {
      id: s.nextShellId++,
      kind,
      x,
      y,
      z,
      vx: dx * speed,
      vy: dy * speed,
      vz: dz * speed,
      life,
    };
    s.shells.push(shell);
    return shell;
  }

  update(dt: number): void {
    const s = this.ctx.state;
    const w = this.ctx.rules.config.weapons;
    const keep: ShellState[] = [];
    for (const sh of s.shells) {
      sh.life -= dt;
      sh.x += sh.vx * dt;
      sh.y += sh.vy * dt;
      sh.z += sh.vz * dt;
      if (sh.kind === 'cannon' || sh.kind === 'jackpot') {
        sh.vy -= w.cannonGravity * dt;
      }
      if (sh.kind === 'tower') {
        const td = dist(sh.x, sh.z, s.tank.x, s.tank.z);
        if (td < 1.05 && s.tank.deadT <= 0) {
          this.ctx.damage.applyTank(this.ctx.rules.config.enemies.towerShotDamage, 'tower');
          pushEvent(this.ctx, 'hit', s.tank.x, s.tank.y + 1.2, s.tank.z, {
            value: this.ctx.rules.config.enemies.towerShotDamage,
            kind: 'tower',
          });
          continue;
        }
      }
      const h = groundHeightAt(sh.x, sh.z);
      let exploded = false;
      if (sh.y <= h + 0.05) {
        sh.y = h + 0.05;
        exploded = true;
      }
      if (!exploded) {
        const r = sh.kind === 'jackpot' ? 1.4 : 0.9;
        for (const o of ARENA.obstacles) {
          if (pointInBox(sh.x, sh.z, o.x, o.z, o.w + r * 2, o.d + r * 2)) {
            exploded = true;
            break;
          }
        }
      }
      if (!exploded) {
        for (const e of s.enemies) {
          if (!e.alive || e.type === 'gunTower') continue;
          const rr = enemyRadius(e.type, this.ctx.rules.config) + 0.7;
          if (dist2(sh.x, sh.z, e.x, e.z) < rr * rr) {
            exploded = true;
            break;
          }
        }
      }
      if (exploded || sh.life <= 0) {
        this.explode(sh);
        continue;
      }
      keep.push(sh);
    }
    s.shells = keep;
  }

  private explode(sh: ShellState): void {
    const s = this.ctx.state;
    const w = this.ctx.rules.config.weapons;
    const resolver = this.ctx.rules.resolver;
    const isJackpot = sh.kind === 'jackpot';
    const radius = isJackpot ? w.jackpotRadius : w.cannonRadius;
    const dmg = isJackpot ? w.jackpotDamage : w.cannonDamage;
    if (isJackpot) {
      pushEvent(this.ctx, 'jackpotImpact', sh.x, sh.y, sh.z, { value: radius });
      this.ctx.combo.addContribution('gunner', 2);
    } else {
      pushEvent(this.ctx, 'enemyExplosion', sh.x, sh.y, sh.z, { value: radius, kind: 'cannon' });
    }
    this.ctx.eventBus.emit('projectile.impacted', { shellId: sh.id, kind: sh.kind, x: sh.x, y: sh.y, z: sh.z });
    const innerRatio = resolver.resolve('weapon.splashInnerRatio');
    const innerMult = resolver.resolve('weapon.splashInnerMultiplier');
    const outerMult = resolver.resolve('weapon.splashOuterMultiplier');
    for (const e of s.enemies) {
      if (!e.alive) continue;
      const d = dist(sh.x, sh.z, e.x, e.z);
      const rr = enemyRadius(e.type, this.ctx.rules.config);
      if (d < radius + rr) {
        const falloff = d < radius * innerRatio ? innerMult : outerMult;
        this.ctx.damage.applyEnemy(e, dmg * falloff, isJackpot ? 'jackpot' : 'cannon');
      }
    }
    for (const b of s.barrels) {
      if (b.exploded) continue;
      const d = dist(sh.x, sh.z, b.x, b.z);
      if (d < (isJackpot ? w.barrelChainRadius * 2 : this.ctx.rules.matchConfig.barrelRadius) + 0.8) {
        this.ctx.damage.applyBarrel(b, 999);
      }
    }
    const tankD = dist(sh.x, sh.z, s.tank.x, s.tank.z);
    if (tankD < radius + 1.5) {
      this.ctx.damage.applyTank(isJackpot ? 12 : 5, 'splash');
    }
  }
}
