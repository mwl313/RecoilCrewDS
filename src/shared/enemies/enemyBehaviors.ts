import { angleLerp, clamp, dist } from '../math';
import { pushEvent, type SystemContext } from '../sim/systems/systemContext';
import type { EnemyState } from '../types';
import { behaviorParam, EnemyBehaviorRegistry } from './enemyBehaviorRegistry';
import type { EnemyRuntimeState } from './enemyRuntimeState';
import { canTraverseGroundStep } from '../mapgen/terrainTraversal';

/**
 * Built-in enemy behavior primitives. Each is a straight port of the legacy
 * per-type logic so composed behavior order reproduces the Demo exactly.
 */
export function createBuiltinEnemyBehaviors(): EnemyBehaviorRegistry {
  const registry = new EnemyBehaviorRegistry();

  registry.register({
    id: 'movement.seekTank',
    update(ctx, e, runtime) {
      const s = ctx.state;
      const def = ctx.enemies.defFor(e);
      const speed = behaviorParam(def, 'movement.seekTank', 'speed', 3.2);
      const wobbleAmplitude = behaviorParam(def, 'movement.seekTank', 'wobbleAmplitude', 0.6);
      const wobbleFrequency = behaviorParam(def, 'movement.seekTank', 'wobbleFrequency', 1.7);
      runtime.speed = speed + Math.sin(s.time * wobbleFrequency + e.id) * wobbleAmplitude;
      const dx = s.tank.x - e.x;
      const dz = s.tank.z - e.z;
      const d = Math.hypot(dx, dz) || 1;
      runtime.distToTank = d;
      runtime.dirX = dx / d;
      runtime.dirZ = dz / d;
    },
  });

  registry.register({
    id: 'movement.circleTarget',
    update(ctx, e, runtime) {
      const def = ctx.enemies.defFor(e);
      const distance = behaviorParam(def, 'movement.circleTarget', 'distance', 7);
      const strength = behaviorParam(def, 'movement.circleTarget', 'strength', 0.85);
      if (runtime.distToTank >= distance) return;
      const cw = e.id % 2 === 0 ? 1 : -1;
      // Legacy order: mz uses the already-updated mx.
      runtime.dirX = runtime.dirX + (-runtime.dirZ * cw) * strength;
      runtime.dirZ = runtime.dirZ + (runtime.dirX * cw) * strength;
      const ml = Math.hypot(runtime.dirX, runtime.dirZ) || 1;
      runtime.dirX /= ml;
      runtime.dirZ /= ml;
    },
  });

  registry.register({
    id: 'movement.separation',
    update(ctx, e, runtime) {
      const def = ctx.enemies.defFor(e);
      const distance = behaviorParam(def, 'movement.separation', 'distance', 2.4);
      const strength = behaviorParam(def, 'movement.separation', 'strength', 0.8);
      for (const o of ctx.state.enemies) {
        if (o === e || !o.alive || o.type !== e.type) continue;
        const ox = e.x - o.x;
        const oz = e.z - o.z;
        const od = Math.hypot(ox, oz);
        if (od < distance && od > 0.01) {
          runtime.dirX += (ox / od) * strength;
          runtime.dirZ += (oz / od) * strength;
        }
      }
    },
  });

  registry.register({
    id: 'movement.obstacleAvoid',
    update(ctx, e, runtime) {
      const def = ctx.enemies.defFor(e);
      const lookAhead = behaviorParam(def, 'movement.obstacleAvoid', 'lookAhead', 2);
      const turn = behaviorParam(def, 'movement.obstacleAvoid', 'turn', 1.1);
      const aheadX = e.x + runtime.dirX * lookAhead;
      const aheadZ = e.z + runtime.dirZ * lookAhead;
      if (ctx.world.obstacleAt(aheadX, aheadZ)) {
        const ang = Math.atan2(runtime.dirX, runtime.dirZ);
        const side = e.id % 2 === 0 ? 1 : -1;
        const newAng = ang + side * turn;
        runtime.dirX = Math.sin(newAng);
        runtime.dirZ = Math.cos(newAng);
      }
    },
  });

  registry.register({
    id: 'movement.integrate',
    update(ctx, e, runtime, dt) {
      // Impulse-driven motion owns position while the enemy is airborne.
      if (ctx.enemyImpulses.isAirborne(e)) return;
      const r = ctx.enemies.radiusFor(e);
      const ml = Math.hypot(runtime.dirX, runtime.dirZ) || 1;
      const nx = e.x + (runtime.dirX / ml) * runtime.speed * dt;
      const nz = e.z + (runtime.dirZ / ml) * runtime.speed * dt;
      if (ctx.world.queryTerrainTransition) {
        const tr = ctx.world.queryTerrainTransition(e.x, e.z, nx, nz);
        if (tr && !canTraverseGroundStep(tr)) {
          // Cliff/step guard: ground enemies cannot snap upward through
          // cliffs; they stay put (bounded recovery behaviors handle traps).
          e.y = ctx.world.groundHeightAt(e.x, e.z);
          e.yaw = angleLerp(e.yaw, Math.atan2(runtime.dirX, runtime.dirZ), clamp(dt * 6, 0, 1));
          return;
        }
      }
      e.x = nx;
      e.z = nz;
      e.y = ctx.world.groundHeightAt(e.x, e.z);
      e.yaw = angleLerp(e.yaw, Math.atan2(runtime.dirX, runtime.dirZ), clamp(dt * 6, 0, 1));
      const col = ctx.world.resolveCircle(e.x, e.z, r);
      e.x = col.x;
      e.z = col.z;
    },
  });

  registry.register({
    id: 'attack.contactRam',
    update(ctx, e, runtime) {
      const s = ctx.state;
      const t = s.tank;
      const def = ctx.enemies.defFor(e);
      const hitCooldown = behaviorParam(def, 'attack.contactRam', 'hitCooldown', 1.0);
      const radiusOffset = behaviorParam(def, 'attack.contactRam', 'contactRadiusOffset', 0.4);
      const ramSpeedThreshold = behaviorParam(def, 'attack.contactRam', 'ramSpeedThreshold', 5);
      const knockback = behaviorParam(def, 'attack.contactRam', 'knockback', 0.92);
      const damage = behaviorParam(def, 'attack.contactRam', 'damage', 4);
      if (runtime.distToTank < ctx.enemies.radiusFor(e) + ctx.rules.config.arena.tankRadius + radiusOffset && (e.hitCd ?? 0) <= 0 && t.deadT <= 0) {
        e.hitCd = hitCooldown;
        const tankSpeed = Math.hypot(t.vx, t.vz);
        if (tankSpeed > ramSpeedThreshold) {
          ctx.damage.applyEnemy(e, 999, 'ram');
          t.vx *= knockback;
          t.vz *= knockback;
          ctx.score.addScore(ctx.rules.scoring.ramScore, 'RAM');
          ctx.combo.addDriverContribution(1, ctx.rules.config.jackpot.ramGain, 'RAM');
        } else {
          ctx.damage.applyTank(damage, 'bug');
          pushEvent(ctx, 'crash', e.x, e.y, e.z, { value: damage });
          e.x -= runtime.dirX * 0.8;
          e.z -= runtime.dirZ * 0.8;
        }
      }
    },
  });

  registry.register({
    id: 'attack.telegraphedCharge',
    update(ctx, e, _runtime, dt) {
      const s = ctx.state;
      const t = s.tank;
      const def = ctx.enemies.defFor(e);
      const r = ctx.enemies.radiusFor(e);
      const approachSpeed = behaviorParam(def, 'attack.telegraphedCharge', 'approachSpeed', 3.2);
      const chargeSpeed = behaviorParam(def, 'attack.telegraphedCharge', 'chargeSpeed', 13);
      const damage = behaviorParam(def, 'attack.telegraphedCharge', 'damage', 16);
      const telegraphTime = behaviorParam(def, 'attack.telegraphedCharge', 'telegraphTime', 0.75);
      const chargeTime = behaviorParam(def, 'attack.telegraphedCharge', 'chargeTime', 1.25);
      const recoveryTime = behaviorParam(def, 'attack.telegraphedCharge', 'recoveryTime', 0.9);
      const lockTime = behaviorParam(def, 'attack.telegraphedCharge', 'lockTime', 0.45);
      const lockDistance = behaviorParam(def, 'attack.telegraphedCharge', 'lockDistance', 16);
      const dodgeDistance = behaviorParam(def, 'attack.telegraphedCharge', 'dodgeDistance', 3.6);
      const knockback = behaviorParam(def, 'attack.telegraphedCharge', 'knockback', 7);
      const recoveryDecel = behaviorParam(def, 'attack.telegraphedCharge', 'recoveryDecel', 8);
      const dx = t.x - e.x;
      const dz = t.z - e.z;
      const d = Math.hypot(dx, dz) || 1;
      const toTank = Math.atan2(dx, dz);
      switch (e.state) {
        case 'approach':
          e.yaw = angleLerp(e.yaw, toTank, clamp(dt * 3, 0, 1));
          e.x += Math.sin(e.yaw) * approachSpeed * dt;
          e.z += Math.cos(e.yaw) * approachSpeed * dt;
          if (d < lockDistance) {
            e.state = 'lock';
            e.stateT = 0;
          }
          break;
        case 'lock': {
          e.aimYaw = toTank;
          e.yaw = e.aimYaw;
          if (e.stateT >= lockTime) {
            e.state = 'telegraph';
            e.stateT = 0;
            e.telegraph = telegraphTime;
            pushEvent(ctx, 'rammerTelegraph', e.x, e.y + 1, e.z, {
              id: e.id,
              tx: e.x + Math.sin(e.aimYaw) * 6,
              tz: e.z + Math.cos(e.aimYaw) * 6,
            });
          }
          break;
        }
        case 'telegraph':
          e.yaw = e.aimYaw;
          if (e.stateT >= telegraphTime) {
            e.state = 'charge';
            e.stateT = 0;
            ctx.enemies.sharedDodgeAwarded = false;
          }
          break;
        case 'charge': {
          e.yaw = e.aimYaw;
          e.x += Math.sin(e.yaw) * chargeSpeed * dt;
          e.z += Math.cos(e.yaw) * chargeSpeed * dt;
          if (!ctx.enemies.sharedDodgeAwarded && d < dodgeDistance) {
            ctx.enemies.sharedDodgeAwarded = true;
            ctx.combo.addDriverContribution(2, ctx.rules.config.jackpot.dodgeGain, 'DODGE');
          }
          const col = ctx.world.resolveCircle(e.x, e.z, r);
          if (col.hit) {
            e.state = 'recovery';
            e.stateT = 0;
            e.x = col.x;
            e.z = col.z;
            break;
          }
          if (d < r + ctx.rules.config.arena.tankRadius + 0.5 && t.deadT <= 0) {
            ctx.damage.applyTank(damage, 'rammer');
            const nx = dx / d;
            const nz = dz / d;
            t.vx += nx * knockback;
            t.vz += nz * knockback;
            pushEvent(ctx, 'crash', e.x, e.y + 1, e.z, { value: damage });
            e.state = 'recovery';
            e.stateT = 0;
          }
          if (e.stateT >= chargeTime) {
            e.state = 'recovery';
            e.stateT = 0;
          }
          break;
        }
        case 'recovery':
          e.speed = Math.max(0, e.speed - dt * recoveryDecel);
          e.x += Math.sin(e.yaw) * e.speed * dt;
          e.z += Math.cos(e.yaw) * e.speed * dt;
          if (e.stateT >= recoveryTime) {
            e.state = 'approach';
            e.stateT = 0;
          }
          break;
      }
      e.y = ctx.world.groundHeightAt(e.x, e.z);
    },
  });

  registry.register({
    id: 'attack.projectileBurst',
    update(ctx, e, _runtime, dt) {
      const s = ctx.state;
      const t = s.tank;
      const def = ctx.enemies.defFor(e);
      const trackRate = behaviorParam(def, 'attack.projectileBurst', 'trackRate', 2.2);
      const idleTime = behaviorParam(def, 'attack.projectileBurst', 'idleTime', 1.2);
      const telegraphTime = behaviorParam(def, 'attack.projectileBurst', 'telegraphTime', 0.7);
      const shotInterval = behaviorParam(def, 'attack.projectileBurst', 'shotInterval', 0.22);
      const aimJitter = behaviorParam(def, 'attack.projectileBurst', 'aimJitter', 0.05);
      const muzzleOffsetX = behaviorParam(def, 'attack.projectileBurst', 'muzzleOffsetX', 1.3);
      const muzzleHeight = behaviorParam(def, 'attack.projectileBurst', 'muzzleHeight', 2.4);
      const shotSpeed = behaviorParam(def, 'attack.projectileBurst', 'shotSpeed', 9);
      const shotLife = behaviorParam(def, 'attack.projectileBurst', 'shotLife', 6);
      const shotCount = behaviorParam(def, 'attack.projectileBurst', 'shotCount', 3);
      const firePause = behaviorParam(def, 'attack.projectileBurst', 'firePause', 2.4);
      const toTank = Math.atan2(t.x - e.x, t.z - e.z);
      e.aimYaw = angleLerp(e.aimYaw, toTank, clamp(dt * trackRate, 0, 1));
      if (e.state === 'idle') {
        if (e.stateT >= idleTime) {
          e.state = 'telegraph';
          e.stateT = 0;
          e.telegraph = telegraphTime;
          pushEvent(ctx, 'rammerTelegraph', e.x, e.y + 2.2, e.z, { id: e.id, kind: 'tower', tx: t.x, tz: t.z });
        }
      } else if (e.state === 'telegraph') {
        if (e.stateT >= telegraphTime) {
          e.state = 'fire';
          e.stateT = 0;
          e.shotsFired = 0;
        }
      } else if (e.state === 'fire') {
        if (e.stateT >= shotInterval) {
          const yaw = e.aimYaw + (Math.random() - 0.5) * aimJitter;
          const mx = e.x + Math.sin(yaw) * muzzleOffsetX;
          const mz = e.z + Math.cos(yaw) * muzzleOffsetX;
          const my = e.y + muzzleHeight;
          const d = Math.hypot(t.x - mx, t.z - mz) || 1;
          const sx = (t.x - mx) / d;
          const sz = (t.z - mz) / d;
          const sy = clamp((t.y + 1.2 - my) / d, -0.15, 0.35);
          ctx.projectiles.spawn(mx, my, mz, sx, sy, sz, shotSpeed, 'tower', shotLife);
          pushEvent(ctx, 'towerFire', mx, my, mz, { id: e.id, tx: t.x, ty: t.y + 1, tz: t.z });
          e.shotsFired = (e.shotsFired ?? 0) + 1;
          if (e.shotsFired >= shotCount) {
            e.state = 'pause';
            e.stateT = 0;
          } else {
            e.stateT = 0;
          }
        }
      } else if (e.state === 'pause') {
        if (e.stateT >= firePause) {
          e.state = 'idle';
          e.stateT = 0;
        }
      }
    },
  });

  registry.register({
    id: 'movement.followRoute',
    update(ctx, e, _runtime, dt) {
      const s = ctx.state;
      const truck = s.truck;
      const def = ctx.enemies.defFor(e);
      const speed = behaviorParam(def, 'movement.followRoute', 'speed', 7);
      const waypointReach = behaviorParam(def, 'movement.followRoute', 'waypointReach', 2.5);
      const collisionPushTank = behaviorParam(def, 'movement.followRoute', 'collisionPushTank', 4);
      const collisionPushTruck = behaviorParam(def, 'movement.followRoute', 'collisionPushTruck', 0.7);
      const truckRules = ctx.rules.spawnDirector.truck;
      if (!truck.active) return;
      truck.sirenT += dt;
      const route = ctx.world.truckRoute;
      const wp = route[truck.waypoint];
      const dx = wp.x - truck.x;
      const dz = wp.z - truck.z;
      const d = Math.hypot(dx, dz) || 1;
      truck.yaw = angleLerp(truck.yaw, Math.atan2(dx, dz), clamp(dt * 3, 0, 1));
      const nx = truck.x + (dx / d) * speed * dt;
      const nz = truck.z + (dz / d) * speed * dt;
      if (ctx.world.queryTerrainTransition) {
        const tr = ctx.world.queryTerrainTransition(truck.x, truck.z, nx, nz);
        if (tr && !canTraverseGroundStep(tr)) {
          truck.y = ctx.world.groundHeightAt(truck.x, truck.z);
          e.x = truck.x;
          e.y = truck.y;
          e.z = truck.z;
          e.yaw = truck.yaw;
          const col = ctx.world.resolveCircle(truck.x, truck.z, ctx.enemies.radiusFor(e));
          truck.x = col.x;
          truck.z = col.z;
          return;
        }
      }
      truck.x = nx;
      truck.z = nz;
      truck.y = ctx.world.groundHeightAt(truck.x, truck.z);
      e.x = truck.x;
      e.y = truck.y;
      e.z = truck.z;
      e.yaw = truck.yaw;
      const col = ctx.world.resolveCircle(truck.x, truck.z, ctx.enemies.radiusFor(e));
      truck.x = col.x;
      truck.z = col.z;
      if (d < waypointReach) {
        truck.waypoint++;
        if (truck.waypoint >= route.length) {
          truck.waypoint = 0;
          if (s.time > truckRules.escapeTime - truckRules.escapeShortcut) {
            truck.escaped = true;
            truck.active = false;
            e.alive = false;
            pushEvent(ctx, 'truckEscape', truck.x, truck.y + 1, truck.z);
            ctx.pickups.spawn('heavy', truck.x, truck.z);
          }
        }
      }
      if (s.time > truckRules.escapeTime && truck.active) {
        truck.escaped = true;
        truck.active = false;
        e.alive = false;
        pushEvent(ctx, 'truckEscape', truck.x, truck.y + 1, truck.z);
        ctx.pickups.spawn('heavy', truck.x, truck.z);
      }
      const td = dist(truck.x, truck.z, s.tank.x, s.tank.z);
      if (td < ctx.rules.config.arena.truckRadius + ctx.rules.config.arena.tankRadius + 0.3) {
        const nx = (s.tank.x - truck.x) / (td || 1);
        const nz = (s.tank.z - truck.z) / (td || 1);
        s.tank.vx += nx * collisionPushTank;
        s.tank.vz += nz * collisionPushTank;
        truck.x -= nx * collisionPushTruck;
        truck.z -= nz * collisionPushTruck;
        pushEvent(ctx, 'crash', truck.x, truck.y + 1, truck.z, { value: 0, kind: 'truck' });
      }
    },
  });

  // Marker behaviors (no per-frame logic).
  for (const id of ['trait.nonAttackingObjective', 'trait.vulnerableRear', 'defense.armoredFront']) {
    registry.register({
      id,
      update() {
        // Data markers consumed by DamageSystem and presentation.
      },
    });
  }

  return registry;
}
