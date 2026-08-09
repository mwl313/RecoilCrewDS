import { describe, expect, it } from 'vitest';
import type { Obstacle } from '../../src/shared/arena';
import { resolveTankHurtCapsule } from '../../src/shared/combat/tankHurtVolume';
import { loadContentPackFromFilesystem } from '../../src/shared/content/contentLoader';
import {
  segmentVerticalCapsuleFirstToi,
} from '../../src/shared/projectiles/projectileCollision';
import type { ArenaWorld } from '../../src/shared/sim/arenaWorld';
import { Match } from '../../src/shared/sim/match';

const pack = loadContentPackFromFilesystem('content');

function flatWorld(obstacles: Obstacle[] = []): ArenaWorld {
  return {
    metadata: null,
    groundHeightAt: () => 0,
    groundNormalAt: () => ({ nx: 0, ny: 1, nz: 0 }),
    ramps: [],
    half: 100,
    obstacleAt: () => undefined,
    resolveCircleContacts: (x, z) => ({ x, z, contacts: [] }),
    resolveCircle: (x, z) => ({ x, z, hit: false }),
    nearestSpawn: () => ({ x: 0, z: 0 }),
    obstacles,
    barrels: [],
    spawnPoints: [{ x: 0, z: 0 }],
    bugSpawns: [],
    towerSpots: [],
    truckRoute: [],
  };
}

function wall(x: number): Obstacle {
  return { id: `wall-${x}`, x, z: 0, w: 1, d: 8, h: 4, type: 'wall' };
}

function spawnEnemyShot(match: Match, x: number, y: number, dx: number, speed = 20): void {
  match.runtime.systems.projectiles.spawn(x, y, 0, dx, 0, 0, speed, 'enemy', 2, undefined, {
    damage: 12,
    splashRadius: 0.5,
    hitRadius: 0.5,
    tankHitRadius: 1.1,
    team: 'enemy',
    ownerEnemyId: 7,
    sourceTier: 'elite',
  });
}

describe('swept enemy projectile geometry', () => {
  it('detects tank crossing between ticks and rejects a shot below an airborne tank', () => {
    const grounded = resolveTankHurtCapsule({ x: 0, y: 0, z: 0 });
    expect(segmentVerticalCapsuleFirstToi(
      { x: -5, y: grounded.center.y, z: 0 },
      { x: 5, y: grounded.center.y, z: 0 },
      grounded,
      0.5,
    )).toBeDefined();

    const airborne = resolveTankHurtCapsule({ x: 0, y: 5, z: 0 });
    expect(segmentVerticalCapsuleFirstToi(
      { x: -5, y: 1, z: 0 },
      { x: 5, y: 1, z: 0 },
      airborne,
      0.5,
    )).toBeUndefined();
  });

  it('wall before tank wins earliest TOI', () => {
    const match = new Match('projectile-wall-first', 'none', pack, flatWorld([wall(0)]), 'mode.mainStage');
    match.state.tank.x = 5;
    match.state.tank.shieldedT = 0;
    const integrity = match.state.tank.integrity;
    spawnEnemyShot(match, -5, 1.05, 1);
    match.runtime.systems.projectiles.update(0.5);
    expect(match.state.tank.integrity).toBe(integrity);
    expect(match.state.shells).toHaveLength(0);
    expect(match.takeEvents().find((event) => event.type === 'enemyProjectileImpact')).toMatchObject({ kind: 'world' });
  });

  it('tank before wall wins earliest TOI and a tunneling segment damages once', () => {
    const match = new Match('projectile-tank-first', 'none', pack, flatWorld([wall(6)]), 'mode.mainStage');
    match.state.tank.x = 0;
    match.state.tank.shieldedT = 0;
    const integrity = match.state.tank.integrity;
    spawnEnemyShot(match, -5, 1.05, 1);
    match.runtime.systems.projectiles.update(0.6);
    expect(match.state.tank.integrity).toBe(integrity - 12);
    expect(match.state.shells).toHaveLength(0);
    expect(match.takeEvents().filter((event) => event.type === 'enemyProjectileImpact')).toHaveLength(1);
  });

  it('a projectile directly below an airborne tank does not hit', () => {
    const match = new Match('projectile-airborne-miss', 'none', pack, flatWorld(), 'mode.mainStage');
    match.state.tank.x = 0;
    match.state.tank.y = 5;
    match.state.tank.shieldedT = 0;
    const integrity = match.state.tank.integrity;
    spawnEnemyShot(match, -5, 1, 1);
    match.runtime.systems.projectiles.update(0.5);
    expect(match.state.tank.integrity).toBe(integrity);
    expect(match.state.shells).toHaveLength(1);
  });
});
