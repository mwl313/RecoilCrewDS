import { pushEvent, type SystemContext } from '../sim/systems/systemContext';
import type { EnemyState } from '../types';

/**
 * Authoritative tank-vs-enemy contact combat (Combat 05 M1).
 *
 * Normal tank movement deals ZERO enemy damage (`contactDamage = 0`). Only
 * the accepted Dash damage window (`TankState.dashDamageT`, set by shared
 * kinematics when a Dash is accepted) can damage enemies by contact.
 * Enemy-to-tank contact attacks remain owned by enemy behaviors.
 */
export class TankContactCombat {
  /** Per-enemy last Dash-hit time (bounded by cooldown pruning). */
  private readonly lastDashHit = new Map<number, number>();
  private readonly lastRoadkillHit = new Map<number, number>();
  private readonly nearby: EnemyState[] = [];

  constructor(private readonly ctx: SystemContext) {}

  update(): void {
    const s = this.ctx.state;
    const t = s.tank;
    if (t.deadT > 0) return;

    const tankCfg = this.ctx.rules.config.tank;
    const tankR = this.ctx.rules.config.arena.tankRadius;
    const dashActive = t.dashState === 'burst' && t.dashDamageT > 0;
    const dashDamage = tankCfg.dashContactDamage;
    const knockback = tankCfg.dashContactKnockback;
    const perTargetCooldown = Math.max(0.001, tankCfg.dashContactPerTargetCooldown);

    // Prune expired per-target entries so the map never grows unbounded.
    for (const [id, at] of [...this.lastDashHit]) {
      if (s.time - at >= perTargetCooldown) this.lastDashHit.delete(id);
    }
    const roadkill = this.ctx.progression?.roadkillParams() ?? null;
    if (roadkill) {
      for (const [id, at] of [...this.lastRoadkillHit]) {
        if (s.time - at >= roadkill.perTargetCooldownSeconds) this.lastRoadkillHit.delete(id);
      }
    } else {
      this.lastRoadkillHit.clear();
    }

    const queryRadius = tankR + 0.4 + 4;
    const nearby = this.ctx.enemySpatial.queryCircle(t.x, t.z, queryRadius, this.nearby);
    for (const e of nearby) {
      if (!e.alive) continue;
      const def = this.ctx.enemies.defFor(e);
      // Gun Towers are immovable turrets, not contact targets.
      if (def.knockback?.immovable) continue;
      const r = this.ctx.enemies.radiusFor(e);
      const d = Math.hypot(e.x - t.x, e.z - t.z);
      if (d > r + tankR + 0.4) continue;
      // Normal contact: zero enemy damage by design (contactDamage = 0).
      if (dashActive) {
        const last = this.lastDashHit.get(e.id);
        if (last !== undefined && s.time - last < perTargetCooldown) continue;
        this.lastDashHit.set(e.id, s.time);
        if (dashDamage <= 0) continue;

        const result = this.ctx.damage.applyEnemy(e, dashDamage, 'dash');
        if (e.alive && knockback < 1) {
          // The chassis bleeds a little speed; the enemy gets a small pop.
          t.vx *= knockback;
          t.vz *= knockback;
          if (t.dashSpeed !== undefined) t.dashSpeed *= knockback;
          if (t.dashPeakSpeed !== undefined) t.dashPeakSpeed *= knockback;
          const dirX = d > 0.001 ? (e.x - t.x) / d : 0;
          const dirZ = d > 0.001 ? (e.z - t.z) / d : 0;
          this.ctx.enemyImpulses.apply(e, def, dirX, dirZ, 2.5, 1.1, 'dash');
        }
        this.ctx.score.addScore(this.ctx.rules.scoring.dashScore, 'DASH');
        this.ctx.combo.addDriverContribution(1, 'DASH');
        this.ctx.progression?.notifyDashHit(e.id);
        pushEvent(this.ctx, 'dashContact', e.x, e.y, e.z, {
          id: e.id,
          value: dashDamage,
          kind: result.killed ? 'kill' : 'hit',
        });
        continue;
      }
      // ROADKILL: only when not in the Dash window, capability present, and
      // resolved forward-speed threshold met.
      if (roadkill && this.ctx.capabilities.has(roadkill.capability)) {
        const speed = Math.hypot(t.vx, t.vz);
        const maxSpeed = this.ctx.rules.resolver.resolve('tank.forwardSpeed');
        if (speed >= maxSpeed * roadkill.minimumSpeedRatio) {
          const last = this.lastRoadkillHit.get(e.id);
          if (last === undefined || s.time - last >= roadkill.perTargetCooldownSeconds) {
            this.lastRoadkillHit.set(e.id, s.time);
            const speedRatio = speed / Math.max(0.001, maxSpeed);
            const coefficient =
              roadkill.baseDamageCoefficient +
              roadkill.coefficientPerAdditionalStack * (roadkill.stacks - 1);
            // ROADKILL uses the authored contact-damage baseline as its own
            // coefficient base. Relic modifiers that explicitly say "Dash
            // damage" (UNSTOPPABLE) must not leak into non-Dash contact.
            const roadkillBaseDamage = this.ctx.rules.resolver.getBase('tank.dashContactDamage');
            const damage = Math.max(1, Math.round(roadkillBaseDamage * speedRatio * coefficient));
            const result = this.ctx.damage.applyEnemy(e, damage, 'roadkill');
            this.ctx.progression?.recordRoadkill(speed, maxSpeed, damage);
            if (result.killed) this.ctx.progression?.recordRoadkillKill();
            const dirX = d > 0.001 ? (e.x - t.x) / d : 0;
            const dirZ = d > 0.001 ? (e.z - t.z) / d : 0;
            const def2 = this.ctx.enemies.defFor(e);
            this.ctx.enemyImpulses.apply(
              e,
              def2,
              dirX,
              dirZ,
              2.5 * roadkill.knockbackCoefficient,
              1.1,
              'roadkill',
            );
            pushEvent(this.ctx, 'roadkillContact', e.x, e.y, e.z, {
              id: e.id,
              value: damage,
              kind: result.killed ? 'kill' : 'hit',
            });
          }
        }
      }
    }
  }
}
