import { describe, expect, it } from 'vitest';
import { Match } from '../../src/shared/sim/match';
import type { EnemyState } from '../../src/shared/types';

function spawnAt(match: Match, type: 'scrapBug' | 'rammer' | 'gunTower' | 'lootTruck', x: number, z: number): EnemyState {
  const e = match.spawnEnemy(type, x, z);
  if (!e) throw new Error('spawn failed');
  return e;
}

describe('enemy radial knockback', () => {
  it('applies resistance-scaled impulses per type and keeps towers immovable', () => {
    const match = new Match('m', 'none');
    const bug = spawnAt(match, 'scrapBug', 10, 0);
    const rammer = spawnAt(match, 'rammer', 10, 0);
    const truck = spawnAt(match, 'lootTruck', 10, 0);
    const tower = spawnAt(match, 'gunTower', 10, 0);
    match.runtime.systems.radialImpulses.apply({
      originX: 0, originY: 0, originZ: 0,
      radius: 20,
      maxImpulse: 10,
      minImpulse: 5,
      verticalImpulse: 3,
      falloffExponent: 1,
      source: 'cannon',
      affectsTank: false,
      affectsEnemies: true,
    });
    expect(bug.impulseVx ?? 0).toBeGreaterThan(0);
    expect(rammer.impulseVx ?? 0).toBeGreaterThan(0);
    expect(truck.impulseVx ?? 0).toBeGreaterThan(0);
    expect(bug.impulseVx ?? 0).toBeGreaterThan(rammer.impulseVx ?? 0);
    expect(rammer.impulseVx ?? 0).toBeGreaterThan(truck.impulseVx ?? 0);
    expect(tower.impulseVx ?? 0).toBe(0);
    expect(tower.impulseGrounded).toBe(true);
  });

  it('falloff pushes closer enemies harder', () => {
    const match = new Match('m', 'none');
    const near = spawnAt(match, 'scrapBug', 2, 0);
    const far = spawnAt(match, 'scrapBug', 18, 0);
    match.runtime.systems.radialImpulses.apply({
      originX: 0, originY: 0, originZ: 0,
      radius: 20,
      maxImpulse: 10,
      minImpulse: 5,
      verticalImpulse: 3,
      falloffExponent: 1,
      source: 'cannon',
      affectsTank: false,
      affectsEnemies: true,
    });
    expect(near.impulseVx ?? 0).toBeGreaterThan(far.impulseVx ?? 0);
  });

  it('airborne enemies fall, land, and take fall damage with source credit', () => {
    const match = new Match('m', 'none');
    const bug = spawnAt(match, 'scrapBug', 0, 0);
    bug.y = 12;
    bug.impulseVy = 0;
    bug.impulseGrounded = false;
    bug.lastImpulseSource = 'cannon';
    const hp0 = bug.hp;
    for (let i = 0; i < 120 && bug.impulseGrounded === false; i++) {
      match.runtime.systems.enemyImpulses.update(bug, match.runtime.systems.enemies.defFor(bug), 1 / 30);
    }
    expect(bug.impulseGrounded).toBe(true);
    expect(bug.y).toBeLessThan(0.01);
    expect(bug.hp).toBeLessThan(hp0); // fall damage applied
  });

  it('cannon splash knocks enemies back but never the tank', () => {
    const match = new Match('m', 'none');
    // A Rammer survives splash damage (hp 14) so the knockback is observable.
    const rammer = spawnAt(match, 'rammer', 2.5, 0);
    // Legacy arena floor is below y=0; spawn under it so it explodes on step.
    match.runtime.systems.projectiles.spawn(0, -1, 0, 0, 0, 0, 1, 'cannon', 2, 'weapon.mainCannon');
    const tankVx = match.state.tank.vx;
    match.step(1 / 30); // shell explodes on spawn (ground) → radial knockback
    expect(rammer.impulseVx ?? 0).not.toBe(0);
    expect(match.state.tank.vx).toBe(tankVx); // tank splash knockback stays zero
  });
});
