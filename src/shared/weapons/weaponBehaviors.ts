import { pushEvent, type SystemContext } from '../sim/systems/systemContext';
import type { WeaponDefinition } from './weaponDefinition';
import { weaponStat } from './weaponDefinition';
import { WeaponBehaviorRegistry } from './weaponBehaviorRegistry';
import type { WeaponRuntimeState } from './weaponRuntimeState';

/** World muzzle origin + direction (legacy offsets, exactly as before). */
export function muzzleWorld(ctx: SystemContext): { x: number; y: number; z: number; dx: number; dy: number; dz: number } {
  const t = ctx.state.tank;
  const tur = ctx.state.turret;
  const yaw = t.yaw + tur.yaw;
  const pitch = tur.pitch;
  const dx = Math.cos(pitch) * Math.sin(yaw);
  const dy = Math.sin(pitch);
  const dz = Math.cos(pitch) * Math.cos(yaw);
  return {
    x: t.x + dx * 2.7,
    y: t.y + 1.55 + dy * 1.4,
    z: t.z + dz * 2.7,
    dx,
    dy,
    dz,
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
      const spread = weaponStat(weapon, 'weapon.mgSpread', ctx.rules.config.weapons.mgSpread);
      const dx = muzzle.dx + (Math.random() - 0.5) * spread;
      const dy = muzzle.dy + (Math.random() - 0.5) * spread;
      const dz = muzzle.dz + (Math.random() - 0.5) * spread;
      const dl = Math.hypot(dx, dy, dz);
      const nx = dx / dl;
      const ny = dy / dl;
      const nz = dz / dl;
      ctx.recoil.apply(
        -nx,
        -nz,
        weaponStat(weapon, 'weapon.mgRecoilImpulse', ctx.rules.config.tank.mgRecoilImpulse),
        weaponStat(weapon, 'weapon.mgRecoilSpin', 0.05),
        weapon.id,
      );
      pushEvent(ctx, 'shot', muzzle.x, muzzle.y, muzzle.z, { kind: 'mg', tx: nx, ty: ny, tz: nz });
      ctx.eventBus.emit('weapon.fired', { weaponId: weapon.id, slot: 'primary', kind: 'mg' });

      const w = ctx.rules.config.weapons;
      const range = weaponStat(weapon, 'weapon.mgRange', w.mgRange);
      const damage = weaponStat(weapon, 'weapon.mgDamage', w.mgDamage);
      let bestT = range;
      let bestEnemy: (typeof s.enemies)[number] | null = null;
      for (const e of s.enemies) {
        if (!e.alive || e.type === 'gunTower') continue;
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
    fire(ctx, weapon) {
      const s = ctx.state;
      const t = s.tank;
      const tur = s.turret;
      const muzzle = muzzleWorld(ctx);
      tur.cannonFlash = 0.12;
      ctx.recoil.apply(
        -muzzle.dx,
        -muzzle.dz,
        ctx.rules.matchConfig.recoilImpulse,
        weaponStat(weapon, 'weapon.cannonRecoilSpin', ctx.rules.config.tank.recoilSpin),
        weapon.id,
      );
      pushEvent(ctx, 'shot', muzzle.x, muzzle.y, muzzle.z, { kind: 'cannon', tx: muzzle.dx, ty: muzzle.dy, tz: muzzle.dz });
      ctx.eventBus.emit('weapon.fired', { weaponId: weapon.id, slot: 'secondary', kind: 'cannon' });
      const speed = weaponStat(weapon, 'weapon.cannonSpeed', ctx.rules.config.weapons.cannonSpeed);
      const life = weaponStat(weapon, 'weapon.cannonLife', ctx.rules.config.weapons.cannonLife);
      ctx.projectiles.spawn(muzzle.x, muzzle.y, muzzle.z, muzzle.dx, muzzle.dy, muzzle.dz, speed, 'cannon', life);
      ctx.combo.addContribution('gunner', 1);
    },
  });

  registry.register({
    id: 'weapon.chargeProjectile',
    fire(ctx, weapon) {
      const s = ctx.state;
      const t = s.tank;
      const tur = s.turret;
      const muzzle = muzzleWorld(ctx);
      s.stats.jackpotFired++;
      tur.cannonFlash = 0.3;
      tur.jackpotCooldown = weapon.cooldownSeconds;
      const impulse = weaponStat(weapon, 'weapon.jackpotRecoilImpulse', ctx.rules.config.tank.jackpotRecoilImpulse);
      ctx.recoil.apply(
        -muzzle.dx,
        -muzzle.dz,
        impulse,
        weaponStat(weapon, 'weapon.jackpotRecoilSpin', ctx.rules.config.tank.jackpotSpin),
        weapon.id,
      );
      pushEvent(ctx, 'jackpotFire', muzzle.x, muzzle.y, muzzle.z, { tx: muzzle.dx, ty: muzzle.dy, tz: muzzle.dz });
      ctx.eventBus.emit('weapon.fired', { weaponId: weapon.id, slot: 'ability', kind: 'jackpot' });
      const speed = weaponStat(weapon, 'weapon.jackpotSpeed', ctx.rules.config.weapons.jackpotSpeed);
      const life = weaponStat(weapon, 'weapon.jackpotLife', ctx.rules.config.weapons.jackpotLife);
      ctx.projectiles.spawn(muzzle.x, muzzle.y, muzzle.z, muzzle.dx, muzzle.dy, muzzle.dz, speed, 'jackpot', life);
      ctx.combo.addContribution('gunner', 4);
    },
  });

  return registry;
}

export type { WeaponRuntimeState };
