import { pushEvent, type SystemContext } from '../sim/systems/systemContext';
import type { WeaponDefinition } from './weaponDefinition';
import { weaponStat } from './weaponDefinition';
import { WeaponBehaviorRegistry } from './weaponBehaviorRegistry';
import type { WeaponRuntimeState } from './weaponRuntimeState';
import { computeWeaponMountWorldPose, resolveTerrainSafeMuzzle } from '../vehicle/tankRigGeometry';
import { resolveCannonShotProfile } from './cannonShotProfile';
import { rayVerticalBodyHitDistance } from '../enemies/enemyCollisionGeometry';

/**
 * World muzzle origin + direction resolved from the shared tank rig
 * geometry (gameplay04 M4/M5). Every weapon behavior reads this one source
 * so authoritative shots and rendered VFX use identical geometry.
 */
export function muzzleWorld(ctx: SystemContext): { x: number; y: number; z: number; dx: number; dy: number; dz: number } {
  const mount = computeWeaponMountWorldPose(ctx.state.tank, ctx.state.turret, ctx.rules.tank.rig);
  const origin = resolveTerrainSafeMuzzle(mount, (x, z) => ctx.world.groundHeightAt(x, z));
  return {
    x: origin.x,
    y: origin.y,
    z: origin.z,
    dx: mount.direction.x,
    dy: mount.direction.y,
    dz: mount.direction.z,
  };
}

export function createBuiltinWeaponBehaviors(): WeaponBehaviorRegistry {
  const registry = new WeaponBehaviorRegistry();

  registry.register({
    id: 'weapon.hitscan',
    fire(ctx, weapon) {
      const s = ctx.state;
      const t = s.tank;
      const muzzle = muzzleWorld(ctx);
      const actionSeq = ctx.pendingActionSeq;
      ctx.pendingActionSeq = undefined;
      const spread = weaponStat(weapon, 'weapon.mgSpread', ctx.rules.config.weapons.mgSpread);
      const dx = muzzle.dx + (Math.random() - 0.5) * spread;
      const dy = muzzle.dy + (Math.random() - 0.5) * spread;
      const dz = muzzle.dz + (Math.random() - 0.5) * spread;
      const dl = Math.hypot(dx, dy, dz);
      const nx = dx / dl;
      const ny = dy / dl;
      const nz = dz / dl;
      ctx.recoil.apply(
        {
          sourceId: weapon.id,
          kind: 'mg',
          direction: { x: -nx, y: -ny, z: -nz },
          magnitude: weaponStat(weapon, 'weapon.mgRecoilImpulse', ctx.rules.config.tank.mgRecoilImpulse),
          yawImpulse: (Math.random() - 0.5) * 2 * weaponStat(weapon, 'weapon.mgRecoilSpin', 0.05),
          rollImpulse: (Math.random() - 0.5) * 0.05,
          verticalScale: weaponStat(weapon, 'weapon.recoilVerticalScale', 1),
          launchThreshold: weaponStat(weapon, 'weapon.recoilGroundLaunchThreshold', 0.25),
          sourceActionSeq: actionSeq,
        },
      );
      pushEvent(ctx, 'shot', muzzle.x, muzzle.y, muzzle.z, { kind: 'mg', tx: nx, ty: ny, tz: nz, actionSeq });
      ctx.eventBus.emit('weapon.fired', { weaponId: weapon.id, slot: 'primary', kind: 'mg' });

      const w = ctx.rules.config.weapons;
      const range = weaponStat(weapon, 'weapon.mgRange', w.mgRange);
      // Runtime progression/items own weapon modifiers through StatResolver.
      // Reading the frozen weapon statBlock here bypasses effects such as
      // HEAT SINK and MG damage level-up cards.
      const damage = ctx.rules.resolver.resolve('weapon.mgDamage');
      let bestT = range;
      let bestEnemy: (typeof s.enemies)[number] | null = null;
      for (const e of s.enemies) {
        if (!e.alive || e.type === 'gunTower') continue;
        const dimensions = ctx.enemies.dimensionsFor(e);
        if (dimensions) {
          const hitT = rayVerticalBodyHitDistance(
            { x: muzzle.x, y: muzzle.y, z: muzzle.z },
            { x: nx, y: ny, z: nz },
            {
              x: e.x,
              groundY: e.y,
              z: e.z,
              radius: dimensions.collisionRadius,
              height: dimensions.collisionHeight,
            },
            bestT,
          );
          if (hitT !== null && hitT < bestT) {
            bestT = hitT;
            bestEnemy = e;
          }
          continue;
        }
        const r = ctx.enemies.radiusFor(e) + 0.45;
        const ox = e.x - muzzle.x;
        const oy = e.y + 0.6 - muzzle.y;
        const oz = e.z - muzzle.z;
        const b = ox * nx + oy * ny + oz * nz;
        if (b < 0 || b > bestT) continue;
        const c = ox * ox + oy * oy + oz * oz - b * b;
        if (c <= r * r && b < bestT) {
          bestT = b;
          bestEnemy = e;
        }
      }
      let bestBarrel: (typeof s.barrels)[number] | null = null;
      let bestBarrelT = range;
      for (const b of s.barrels) {
        if (b.exploded) continue;
        const ox = b.x - muzzle.x;
        const oy = 0.7 - muzzle.y;
        const oz = b.z - muzzle.z;
        const bt = ox * nx + oy * ny + oz * nz;
        if (bt < 0 || bt > bestBarrelT) continue;
        const c = ox * ox + oy * oy + oz * oz - bt * bt;
        if (c <= 1.0 * 1.0 && bt < bestBarrelT) {
          bestBarrelT = bt;
          bestBarrel = b;
        }
      }
      if (bestEnemy && (!bestBarrel || bestT <= bestBarrelT)) {
        const hitX = muzzle.x + nx * bestT;
        const hitY = muzzle.y + ny * bestT;
        const hitZ = muzzle.z + nz * bestT;
        pushEvent(ctx, 'mgHit', hitX, hitY, hitZ);
        ctx.damage.applyEnemy(bestEnemy, damage, 'mg', weapon.id);
        return;
      }
      if (bestBarrel) {
        const hitX = muzzle.x + nx * bestBarrelT;
        const hitY = muzzle.y + ny * bestBarrelT;
        const hitZ = muzzle.z + nz * bestBarrelT;
        pushEvent(ctx, 'mgHit', hitX, hitY, hitZ);
        ctx.damage.applyBarrel(bestBarrel, damage);
      }
      void t;
    },
  });

  registry.register({
    id: 'weapon.projectile',
    fire(ctx, weapon, _runtime, request) {
      const s = ctx.state;
      const tur = s.turret;
      const muzzle = muzzleWorld(ctx);
      const actionSeq = request?.actionSeq ?? ctx.pendingActionSeq;
      ctx.pendingActionSeq = undefined;
      const chargeRatio = request?.chargeRatio ?? 0;
      const profile = resolveCannonShotProfile(ctx, weapon, chargeRatio);
      tur.cannonFlash = 0.12;
      ctx.recoil.apply(
        {
          sourceId: weapon.id,
          kind: 'cannon',
          direction: { x: -muzzle.dx, y: -muzzle.dy, z: -muzzle.dz },
          magnitude: profile.recoilImpulse,
          yawImpulse: (Math.random() - 0.5) * 2 * profile.recoilSpin,
          rollImpulse: (Math.random() - 0.5) * 0.35,
          verticalScale: weaponStat(weapon, 'weapon.recoilVerticalScale', 1),
          launchThreshold: weaponStat(weapon, 'weapon.recoilGroundLaunchThreshold', 0.25),
          sourceActionSeq: actionSeq,
        },
      );
      pushEvent(ctx, 'shot', muzzle.x, muzzle.y, muzzle.z, {
        kind: 'cannon',
        chargeRatio: profile.chargeRatio,
        tx: muzzle.dx,
        ty: muzzle.dy,
        tz: muzzle.dz,
        actionSeq,
      });
      ctx.eventBus.emit('weapon.fired', { weaponId: weapon.id, slot: 'secondary', kind: 'cannon', chargeRatio: profile.chargeRatio });
      ctx.projectiles.spawn(
        muzzle.x, muzzle.y, muzzle.z, muzzle.dx, muzzle.dy, muzzle.dz,
        profile.speed, 'cannon', profile.life, weapon.id,
        {
          damage: profile.damage,
          splashRadius: profile.splashRadius,
          knockbackMax: profile.knockbackMax,
          knockbackMin: profile.knockbackMin,
          knockbackVertical: profile.knockbackVertical,
          knockbackRadiusMultiplier: profile.knockbackRadiusMultiplier,
          knockbackFalloffExponent: profile.knockbackFalloffExponent,
          chargeRatio: profile.chargeRatio,
          visualScale: profile.visualScale,
        },
      );
      if (profile.chargeRatio > 0) s.stats.chargedCannonShots++;
      if (profile.chargeRatio >= 1) s.stats.fullChargeShots++;
      ctx.combo.addContribution('gunner', 1);
    },
  });

  return registry;
}

export type { WeaponRuntimeState };
