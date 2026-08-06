import { angleLerp, clamp, dist } from '../math';
import { pushEvent, type SystemContext } from '../sim/systems/systemContext';
import type { EnemyState } from '../types';
import { behaviorParam, EnemyBehaviorRegistry } from './enemyBehaviorRegistry';
import type { EnemyRuntimeState } from './enemyRuntimeState';
import { canTraverseGroundStep } from '../mapgen/terrainTraversal';
import { enemySpeed, isMonster } from './monsterCompat';
import {
  advanceAttackCycle,
  startAttackCycle,
} from '../monsters/monsterAttack';
import {
  resolveMonsterDimensions,
  resolveProjectileSocketY,
} from '../monsters/monsterNormalization';
import {
  reservationTarget,
  resolveMonsterEngagementGeometry,
} from '../monsters/engagementGeometry';
import {
  DEFAULT_MELEE_MOVEMENT_PROFILE,
  RANGED_HOLD_PROFILE,
} from '../monsters/movementProfiles';

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

  const densityScratch: EnemyState[] = [];
  registry.register({
    id: 'movement.densitySteering',
    update(ctx, e, runtime) {
      const def = ctx.enemies.defFor(e);
      const distance = behaviorParam(def, 'movement.densitySteering', 'distance', 2.4);
      const strength = behaviorParam(def, 'movement.densitySteering', 'strength', 0.8);
      runtime.densityX = 0;
      runtime.densityZ = 0;
      const nearby = ctx.enemySpatial.queryCircle(e.x, e.z, distance, densityScratch);
      for (const o of nearby) {
        if (o === e || !o.alive || o.type !== e.type) continue;
        const ox = e.x - o.x;
        const oz = e.z - o.z;
        const od = Math.hypot(ox, oz);
        if (od < distance && od > 0.01) {
          const pushX = (ox / od) * strength;
          const pushZ = (oz / od) * strength;
          runtime.densityX += pushX;
          runtime.densityZ += pushZ;
          // Legacy consumers still read dirX/dirZ directly; monsters blend
          // the dedicated density vector after engagement selection.
          runtime.dirX += pushX;
          runtime.dirZ += pushZ;
        }
      }
    },
  });

  registry.register({
    id: 'movement.flowSeek',
    update(ctx, e, runtime, dt) {
      const field = ctx.flowField;
      const tank = ctx.state.tank;
      const dx = tank.x - e.x;
      const dz = tank.z - e.z;
      const d = Math.hypot(dx, dz) || 1;
      runtime.distToTank = d;
      const directX = dx / d;
      const directZ = dz / d;
      if (!field) {
        runtime.dirX = directX;
        runtime.dirZ = directZ;
        runtime.speed = 3.2;
        return;
      }
      const policy = ctx.horde?.resolved.policies.navigation;
      const nearWeight = policy?.nearWeight ?? 0.7;
      const directWeight = policy?.directWeight ?? 0.2;
      const flow = field.direction(e.x, e.z);
      if (!flow) {
        runtime.dirX = directX;
        runtime.dirZ = directZ;
      } else if (d < 90) {
        runtime.dirX = flow.x * nearWeight + directX * directWeight;
        runtime.dirZ = flow.z * nearWeight + directZ * directWeight;
      } else {
        runtime.dirX = flow.x;
        runtime.dirZ = flow.z;
      }
      const def = ctx.enemies.defFor(e);
      runtime.speed = behaviorParam(def, 'movement.flowSeek', 'speed', 3.2);
      // Stuck detection: require net progress toward the tank.
      const threshold = policy?.stuckProgressThreshold ?? 0.25;
      const stuckTime = policy?.stuckTimeSeconds ?? 2.5;
      const progress = runtime.lastProgress - d;
      if (progress < threshold * runtime.speed * dt) {
        runtime.stuckT += dt;
      } else {
        runtime.stuckT = 0;
        runtime.recovered = false;
      }
      runtime.lastProgress = d;
      if (runtime.stuckT > stuckTime && !runtime.recovered) {
        runtime.recovered = true;
        runtime.stuckT = 0;
        // Alternate recovery: rotate the flow direction away from the wall
        // based on deterministic per-enemy parity.
        const side = e.id % 2 === 0 ? 1 : -1;
        const ang = Math.atan2(runtime.dirX, runtime.dirZ) + side * Math.PI * 0.5;
        runtime.dirX = Math.sin(ang);
        runtime.dirZ = Math.cos(ang);
      } else if (runtime.stuckT > stuckTime * 2.5) {
        // Last resort: despawn/refund only when invisible and safe so a
        // trapped enemy cannot consume the population cap indefinitely.
        if (d > 30) {
          ctx.enemies.purge((c) => c.id === e.id);
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
      // Final speed ordering: authored speed → progression/relic modifier →
      // integration. The modifier is applied here, immediately before
      // displacement, so debuffs always change movement.
      const speedMultiplier = ctx.progression?.enemySpeedMultiplier
        ? ctx.progression.enemySpeedMultiplier(e)
        : 1;
      const ml = Math.hypot(runtime.dirX, runtime.dirZ) || 1;
      const speed = runtime.speed * speedMultiplier;
      const nx = e.x + (runtime.dirX / ml) * speed * dt;
      const nz = e.z + (runtime.dirZ / ml) * speed * dt;
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
      const damage = behaviorParam(def, 'attack.contactRam', 'damage', 4);
      if (runtime.distToTank < ctx.enemies.radiusFor(e) + ctx.rules.config.arena.tankRadius + radiusOffset && (e.hitCd ?? 0) <= 0 && t.deadT <= 0) {
        e.hitCd = hitCooldown;
        // Enemy-to-tank contact attack (unchanged). Tank offense is owned by
        // TankContactCombat (Dash-only); normal contact deals zero enemy
        // damage and speed alone can no longer kill.
        ctx.damage.applyTank(damage, 'bug');
        pushEvent(ctx, 'crash', e.x, e.y, e.z, { value: damage });
        e.x -= runtime.dirX * 0.8;
        e.z -= runtime.dirZ * 0.8;
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
            ctx.combo.addDriverContribution(2, 'DODGE');
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

  // ---------------------------------------------------------- monster system

  registry.register({
    id: 'movement.trackTank',
    update(ctx, e, runtime) {
      const s = ctx.state;
      const def = ctx.enemies.defFor(e);
      runtime.speed = enemySpeed(def);
      const dx = s.tank.x - e.x;
      const dz = s.tank.z - e.z;
      const d = Math.hypot(dx, dz) || 1;
      runtime.distToTank = d;
      const preferred = behaviorParam(def, 'movement.trackTank', 'preferredRange', 0);
      let dirX = dx / d;
      let dirZ = dz / d;
      // Ranged monsters hold a preferred ring instead of closing in.
      if (preferred > 0) {
        const inner = preferred * RANGED_HOLD_PROFILE.innerRatio;
        const outer = preferred * RANGED_HOLD_PROFILE.outerRatio;
        if (d > outer) {
          // Approach the preferred ring.
        } else if (d < inner) {
          dirX = -dirX;
          dirZ = -dirZ;
        } else {
          // Hold band: slow stable strafe, never flip direction each update.
          const side = e.id % 2 === 0 ? 1 : -1;
          const tx = -dirZ * side;
          const tz = dirX * side;
          dirX = tx;
          dirZ = tz;
          runtime.speed *= 0.35;
        }
      }
      runtime.dirX = dirX;
      runtime.dirZ = dirZ;
    },
  });

  registry.register({
    id: 'movement.meleeEngagement',
    update(ctx, e, runtime) {
      const def = ctx.enemies.defFor(e);
      if (!isMonster(def) || def.attack.type !== 'melee') return;
      const attack = def.attack;
      const profile = DEFAULT_MELEE_MOVEMENT_PROFILE;
      const s = ctx.state;
      const dx = s.tank.x - e.x;
      const dz = s.tank.z - e.z;
      const d = runtime.distToTank || Math.hypot(dx, dz) || 1;
      const toX = dx / d;
      const toZ = dz / d;
      const enemyRadius = resolveMonsterDimensions(def.id, def.sizeClass, def.tier).collisionRadius;
      const tankRadius = ctx.rules.config.arena.tankRadius;
      const geometry = resolveMonsterEngagementGeometry({
        enemyRadius,
        tankRadius,
        authoredAttackReach: attack.range,
        movement: profile,
      });
      const stopRadius = geometry.stopRadius;
      const stagingOuter = geometry.stagingOuterRadius;
      const stagingInner = geometry.stagingInnerRadius;
      const densityX = runtime.densityX;
      const densityZ = runtime.densityZ;

      if (runtime.meleeReserved) {
        // Reserved enemies physically approach their assigned angular slot
        // on the reservation ring, not the tank center.
        const reservation = ctx.enemies.meleeReservations.reservation(e.id);
        const target = reservation
          ? reservationTarget(reservation.angle, s.tank.x, s.tank.z, geometry.reservationRadius)
          : { x: s.tank.x, z: s.tank.z };
        const tdx = target.x - e.x;
        const tdz = target.z - e.z;
        const td = Math.hypot(tdx, tdz) || 1;
        if (td <= stopRadius) {
          // ATTACK_HOLD: stop, face the tank, let attack.meleeCue fire.
          runtime.dirX = 0;
          runtime.dirZ = 0;
          runtime.speed = 0;
          return;
        }
        // RESERVED_APPROACH: pursue the assigned point, density blended in.
        runtime.dirX = tdx / td + densityX;
        runtime.dirZ = tdz / td + densityZ;
        const ml = Math.hypot(runtime.dirX, runtime.dirZ) || 1;
        runtime.dirX /= ml;
        runtime.dirZ /= ml;
        const approachScale = Math.max(
          0.3,
          Math.min(1, (td - stopRadius) / Math.max(0.5, geometry.effectiveAttackDistance)),
        );
        runtime.speed *= approachScale;
        return;
      }

      if (d > stagingOuter) {
        // CHASE: direct pursuit blended with density/separation steering.
        runtime.dirX = toX + densityX;
        runtime.dirZ = toZ + densityZ;
        const ml = Math.hypot(runtime.dirX, runtime.dirZ) || 1;
        runtime.dirX /= ml;
        runtime.dirZ /= ml;
        return;
      }

      // STAGE: keep a radial ring and search an open arc without crossing
      // through the tank.
      const side = e.id % 2 === 0 ? 1 : -1;
      const tx = -toZ * side;
      const tz = toX * side;
      runtime.dirX = tx + densityX;
      runtime.dirZ = tz + densityZ;
      runtime.speed *= profile.tangentialSpeedMultiplier;
      const minRing = Math.max(stagingInner, geometry.enemyRadius + geometry.tankRadius + 0.2);
      // Controlled inward drift inside the staging band probes for an open
      // attack arc; the reservation gate requires proximity to attack range.
      // Outside the outer ring is handled by CHASE; below minRing pushes out.
      const radial = d < minRing ? -1 : d > stagingInner ? 0.6 : 0;
      if (radial !== 0) {
        runtime.dirX += toX * radial * profile.radialCorrectionStrength;
        runtime.dirZ += toZ * radial * profile.radialCorrectionStrength;
      }
      const ml = Math.hypot(runtime.dirX, runtime.dirZ) || 1;
      runtime.dirX /= ml;
      runtime.dirZ /= ml;
    },
  });

  registry.register({
    id: 'attack.meleeCue',
    update(ctx, e, runtime) {
      const def = ctx.enemies.defFor(e);
      if (!isMonster(def)) return;
      const attack = def.attack;
      if (attack.type !== 'melee') return;
      if (!runtime.meleeReserved) return;
      const s = ctx.state;
      const geometry = resolveMonsterEngagementGeometry({
        enemyRadius: resolveMonsterDimensions(def.id, def.sizeClass, def.tier).collisionRadius,
        tankRadius: ctx.rules.config.arena.tankRadius,
        authoredAttackReach: attack.range,
      });
      if (runtime.distToTank > geometry.effectiveAttackDistance) {
        runtime.speed *= 0.6;
        return;
      }
      let atk = runtime.attackRuntime;
      if (!atk || !atk.active) {
        atk = startAttackCycle(s.time, attack.rate, attack.attackCueNormalized, runtime.attackSequence);
        runtime.attackRuntime = atk;
      }
      const res = advanceAttackCycle(atk, s.time, () => {
        const scaledDps = e.monster?.scaledContactDps ?? attack.contactDps;
        const damagePerHit = scaledDps / attack.rate;
        if (s.tank.deadT <= 0) {
          ctx.damage.applyTank(damagePerHit, 'bug');
          pushEvent(ctx, 'crash', e.x, e.y + 1, e.z, { value: damagePerHit, kind: 'monster' });
        }
      });
      if (res === 'done') {
        runtime.attackRuntime = undefined;
        runtime.attackSequence++;
      }
    },
  });

  registry.register({
    id: 'attack.projectileCue',
    update(ctx, e, runtime) {
      const def = ctx.enemies.defFor(e);
      if (!isMonster(def)) return;
      const attack = def.attack;
      if (attack.type !== 'ranged') return;
      const s = ctx.state;
      if (runtime.distToTank > attack.range) return;
      let atk = runtime.attackRuntime;
      if (!atk || !atk.active) {
        atk = startAttackCycle(s.time, attack.rate, attack.attackCueNormalized, runtime.attackSequence);
        runtime.attackRuntime = atk;
        e.telegraph = attack.telegraphTime;
        pushEvent(ctx, 'rammerTelegraph', e.x, e.y + 1.2, e.z, { id: e.id, kind: 'enemy' });
      }
      const res = advanceAttackCycle(atk, s.time, () => {
        e.telegraph = 0;
        const projectile = ctx.rules.projectiles.get(attack.projectileId);
        if (!projectile) return;
        const dx = s.tank.x - e.x;
        const dz = s.tank.z - e.z;
        const d = Math.hypot(dx, dz) || 1;
        const damage = e.monster?.scaledProjectileDamage ?? attack.damage;
        ctx.projectiles.spawn(
          e.x,
          e.y + resolveProjectileSocketY(def.id, def.sizeClass, def.tier),
          e.z,
          dx / d,
          0,
          dz / d,
          projectile.speed,
          'enemy',
          projectile.life,
          undefined,
          {
            damage,
            splashRadius: projectile.hitRadius,
            knockbackMax: 0,
            knockbackMin: 0,
            knockbackVertical: 0,
            knockbackRadiusMultiplier: 1,
            knockbackFalloffExponent: 1,
            tankHitRadius: projectile.tankHitRadius ?? projectile.hitRadius + 0.6,
            team: 'enemy',
            ownerEnemyId: e.id,
          },
        );
        pushEvent(ctx, 'towerFire', e.x, e.y + 1.2, e.z, { id: e.id, kind: 'enemy' });
      });
      if (res === 'done') {
        runtime.attackRuntime = undefined;
        runtime.attackSequence++;
      }
    },
  });

  registry.register({
    id: 'attack.bossCue',
    update(ctx, e, runtime) {
      const def = ctx.enemies.defFor(e);
      if (!isMonster(def)) return;
      const attack = def.attack;
      if (attack.type !== 'mixed') return;
      const s = ctx.state;
      const patterns = attack.patterns;
      if (patterns.length === 0) return;
      const pattern = patterns[runtime.attackSequence % patterns.length];
      if (pattern.type === 'ranged' && runtime.distToTank > pattern.range) return;
      if (pattern.type === 'melee') {
        const geometry = resolveMonsterEngagementGeometry({
          enemyRadius: resolveMonsterDimensions(def.id, def.sizeClass, def.tier).collisionRadius,
          tankRadius: ctx.rules.config.arena.tankRadius,
          authoredAttackReach: pattern.range,
        });
        if (runtime.distToTank > geometry.effectiveAttackDistance) {
          runtime.speed *= 0.6;
          return;
        }
        // Melee hold: stop moving at the resolved attack distance so the
        // boss body never overlaps the tank while the pattern is melee.
        runtime.dirX = 0;
        runtime.dirZ = 0;
        runtime.speed = 0;
      }
      let atk = runtime.attackRuntime;
      if (!atk || !atk.active || atk.patternId !== pattern.id) {
        atk = startAttackCycle(s.time, pattern.rate, pattern.attackCueNormalized, runtime.attackSequence, pattern.id);
        runtime.attackRuntime = atk;
        if (pattern.type === 'ranged') {
          e.telegraph = pattern.telegraphTime;
          pushEvent(ctx, 'rammerTelegraph', e.x, e.y + resolveProjectileSocketY(def.id, def.sizeClass, def.tier), e.z, { id: e.id, kind: 'boss' });
        }
      }
      const res = advanceAttackCycle(atk, s.time, () => {
        e.telegraph = 0;
        // Boss damage is fixed (never level-scaled).
        if (pattern.type === 'melee') {
          if (s.tank.deadT <= 0) {
            ctx.damage.applyTank(pattern.damage, 'bug');
            pushEvent(ctx, 'crash', e.x, e.y + 1, e.z, { value: pattern.damage, kind: 'boss' });
          }
          return;
        }
        const projectile = ctx.rules.projectiles.get(pattern.projectileId);
        if (!projectile) return;
        const dx = s.tank.x - e.x;
        const dz = s.tank.z - e.z;
        const d = Math.hypot(dx, dz) || 1;
        ctx.projectiles.spawn(
          e.x,
          e.y + resolveProjectileSocketY(def.id, def.sizeClass, def.tier),
          e.z,
          dx / d,
          0,
          dz / d,
          projectile.speed,
          'enemy',
          projectile.life,
          undefined,
          {
            damage: pattern.damage,
            splashRadius: projectile.hitRadius,
            knockbackMax: 0,
            knockbackMin: 0,
            knockbackVertical: 0,
            knockbackRadiusMultiplier: 1,
            knockbackFalloffExponent: 1,
            tankHitRadius: projectile.tankHitRadius ?? projectile.hitRadius + 0.6,
            team: 'enemy',
            ownerEnemyId: e.id,
          },
        );
        pushEvent(ctx, 'towerFire', e.x, e.y + 2, e.z, { id: e.id, kind: 'boss' });
      });
      if (res === 'done') {
        runtime.attackRuntime = undefined;
        runtime.attackSequence++;
      }
    },
  });

  return registry;
}
