import { dist, dist2, pointInBox } from '../math';
import { pushEvent, type SystemContext } from '../sim/systems/systemContext';
import type { ShellCombatPayload, ShellState } from '../types';
import { createBuiltinProjectileBehaviors } from './projectileBehaviors';
import { ProjectileBehaviorRegistry } from './projectileBehaviorRegistry';
import { projectileWithinVerticalBody } from '../enemies/enemyCollisionGeometry';

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

  spawn(
    x: number,
    y: number,
    z: number,
    dx: number,
    dy: number,
    dz: number,
    speed: number,
    kind: ShellState['kind'],
    life: number,
    weaponId?: string,
    payload?: Partial<ShellCombatPayload> & {
      chargeRatio?: number;
      visualScale?: number;
      visualColor?: string;
      hitRadius?: number;
      tankHitRadius?: number;
      team?: 'player' | 'enemy';
      ownerEnemyId?: number;
      sourceTier?: ShellState['sourceTier'];
      sourceSizeClass?: ShellState['sourceSizeClass'];
      sourcePresentationProfileId?: string;
      sourceAttackSequence?: number;
    },
  ): ShellState {
    const s = this.ctx.state;
    const shell: ShellState = {
      id: s.nextShellId++,
      kind,
      team: payload?.team ?? 'player',
      ownerEnemyId: payload?.ownerEnemyId,
      sourceTier: payload?.sourceTier,
      sourceSizeClass: payload?.sourceSizeClass,
      sourcePresentationProfileId: payload?.sourcePresentationProfileId,
      sourceAttackSequence: payload?.sourceAttackSequence,
      weaponId,
      x,
      y,
      z,
      vx: dx * speed,
      vy: dy * speed,
      vz: dz * speed,
      life,
      hitRadius: payload?.hitRadius,
      tankHitRadius: payload?.tankHitRadius,
      chargeRatio: payload?.chargeRatio,
      visualScale: payload?.visualScale,
      visualColor: payload?.visualColor,
      combat:
        payload && payload.damage !== undefined && payload.splashRadius !== undefined
          ? {
              damage: payload.damage,
              splashRadius: payload.splashRadius,
              knockbackMax: payload.knockbackMax ?? 8,
              knockbackMin: payload.knockbackMin ?? 1.5,
              knockbackVertical: payload.knockbackVertical ?? 2.5,
              knockbackRadiusMultiplier: payload.knockbackRadiusMultiplier ?? 1,
              knockbackFalloffExponent: payload.knockbackFalloffExponent ?? 1.25,
            }
          : undefined,
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
      if (sh.kind === 'cannon') {
        sh.vy -= w.cannonGravity * dt;
      }
      if (sh.kind === 'tower') {
        const td = dist(sh.x, sh.z, s.tank.x, s.tank.z);
        if (td < 1.05 && s.tank.deadT <= 0) {
          this.ctx.damage.applyTank(this.ctx.rules.config.enemies.towerShotDamage, 'tower', undefined, {
            sourcePosition: { x: sh.x, y: sh.y, z: sh.z },
            kind: 'projectile',
            tier: 'specialist',
          });
          pushEvent(this.ctx, 'hit', s.tank.x, s.tank.y + 1.2, s.tank.z, {
            value: this.ctx.rules.config.enemies.towerShotDamage,
            kind: 'tower',
          });
          continue;
        }
      }
      if (sh.kind === 'enemy') {
        const tankHitRadius = sh.tankHitRadius ?? 1.2;
        const td = dist(sh.x, sh.z, s.tank.x, s.tank.z);
        if (td < tankHitRadius && s.tank.deadT <= 0) {
          const damage = sh.combat?.damage ?? 6;
          this.ctx.damage.applyTank(damage, 'enemy', undefined, {
            sourcePosition: { x: sh.x, y: sh.y, z: sh.z },
            kind: 'projectile',
            tier: sh.sourceTier,
          });
          pushEvent(this.ctx, 'enemyProjectileImpact', s.tank.x, s.tank.y + 1.2, s.tank.z, {
            value: damage,
            kind: 'enemy',
            id: sh.ownerEnemyId,
            tier: sh.sourceTier,
            sizeClass: sh.sourceSizeClass,
            presentationProfileId: sh.sourcePresentationProfileId,
            eventSequence: sh.sourceAttackSequence,
            attackSemantic: 'projectileImpact',
          });
          continue;
        }
      }
      const h = this.ctx.world.groundHeightAt(sh.x, sh.z);
      let exploded = false;
      if (sh.y <= h + 0.05) {
        sh.y = h + 0.05;
        exploded = true;
      }
      if (!exploded) {
        const r = 0.9;
        for (const o of this.ctx.world.obstacles) {
          if (pointInBox(sh.x, sh.z, o.x, o.z, o.w + r * 2, o.d + r * 2)) {
            exploded = true;
            break;
          }
        }
      }
      if (!exploded && sh.kind !== 'enemy') {
        const nearby = this.ctx.enemySpatial.queryCircle(sh.x, sh.z, 4.7);
        for (const e of nearby) {
          if (!e.alive || e.type === 'gunTower') continue;
          const projectileRadius = 0.7;
          const dimensions = this.ctx.enemies.dimensionsFor(e);
          const rr = (dimensions?.collisionRadius ?? this.ctx.enemies.radiusFor(e)) + projectileRadius;
          const withinHeight = !dimensions || projectileWithinVerticalBody(
            sh.y,
            projectileRadius,
            e.y,
            dimensions.collisionHeight,
          );
          if (withinHeight && dist2(sh.x, sh.z, e.x, e.z) < rr * rr) {
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
    this.ctx.eventBus.emit('projectile.impacted', { shellId: sh.id, kind: sh.kind, x: sh.x, y: sh.y, z: sh.z, chargeRatio: sh.chargeRatio });
    if (sh.kind === 'enemy') {
      pushEvent(this.ctx, 'enemyProjectileImpact', sh.x, sh.y, sh.z, {
        value: sh.hitRadius ?? 0.6,
        kind: 'world',
        id: sh.ownerEnemyId,
        tier: sh.sourceTier,
        sizeClass: sh.sourceSizeClass,
        presentationProfileId: sh.sourcePresentationProfileId,
        eventSequence: sh.sourceAttackSequence,
        attackSemantic: 'projectileImpact',
      });
      return;
    }
    const resolver = this.ctx.rules.resolver;
    const combat = sh.combat;
    const radius = combat?.splashRadius ?? w.cannonRadius;
    const dmg = combat?.damage ?? w.cannonDamage;
    pushEvent(this.ctx, this.ctx.rules.packId === 'legacy' ? 'enemyExplosion' : 'playerCannonImpact', sh.x, sh.y, sh.z, {
      id: sh.id,
      value: radius,
      kind: 'cannon',
      chargeRatio: sh.chargeRatio,
    });
    const innerRatio = resolver.resolve('weapon.splashInnerRatio');
    const innerMult = resolver.resolve('weapon.splashInnerMultiplier');
    const outerMult = resolver.resolve('weapon.splashOuterMultiplier');
    const splashNearby = this.ctx.enemySpatial.queryCircle(sh.x, sh.z, radius + 4);
    let firstHitEnemyId: number | null = null;
    for (const e of splashNearby) {
      if (!e.alive) continue;
      const d = dist(sh.x, sh.z, e.x, e.z);
      const rr = this.ctx.enemies.radiusFor(e);
      if (d < radius + rr) {
        const falloff = d < radius * innerRatio ? innerMult : outerMult;
        this.ctx.damage.applyEnemy(e, dmg * falloff, 'cannon', sh.weaponId);
        if (firstHitEnemyId === null) firstHitEnemyId = e.id;
      }
    }
    if (firstHitEnemyId !== null) this.ctx.progression?.notifyCannonHit(firstHitEnemyId);
    for (const b of s.barrels) {
      if (b.exploded) continue;
      const d = dist(sh.x, sh.z, b.x, b.z);
      if (d < this.ctx.rules.matchConfig.barrelRadius + 0.8) {
        this.ctx.damage.applyBarrel(b, 999);
      }
    }
    const tankD = dist(sh.x, sh.z, s.tank.x, s.tank.z);
    if (tankD < radius + 1.5) {
      const tankSplash = combat ? 5 + 7 * (sh.chargeRatio ?? 0) : 5;
      this.ctx.damage.applyTank(tankSplash, 'splash', sh.weaponId, {
        sourcePosition: { x: sh.x, y: sh.y, z: sh.z },
        kind: 'explosive',
      });
    }
    // Knockback is a separate effect from damage: radial impulse pushes
    // enemies away (never the tank; content sets tank multiplier to 0).
    const weapon = sh.weaponId ? this.ctx.rules.weapons.get(sh.weaponId) : undefined;
    const kbStat = (id: string, fallback: number): number =>
      weapon ? (weapon.statBlock[id] ?? fallback) : fallback;
    this.ctx.radialImpulses.apply({
      originX: sh.x,
      originY: sh.y,
      originZ: sh.z,
      radius: combat ? radius * combat.knockbackRadiusMultiplier : radius * kbStat('weapon.splashKnockbackRadiusMultiplier', 1),
      maxImpulse: combat ? combat.knockbackMax : kbStat('weapon.splashKnockbackMax', 8),
      minImpulse: combat ? combat.knockbackMin : kbStat('weapon.splashKnockbackMin', 1.5),
      verticalImpulse: combat ? combat.knockbackVertical : kbStat('weapon.splashKnockbackVertical', 2.5),
      falloffExponent: combat ? combat.knockbackFalloffExponent : kbStat('weapon.splashKnockbackFalloffExponent', 1.25),
      source: 'cannon',
      affectsTank: false,
      affectsEnemies: true,
    });
  }
}
