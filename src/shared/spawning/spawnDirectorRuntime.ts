import { ARENA, groundHeightAt } from '../arena';
import type { SpawnDirectorDefinition } from '../content/schemas/spawnDirector';
import { pushEvent, type SystemContext } from '../sim/systems/systemContext';

/**
 * Authoritative spawn director: pacing, schedules, Loot Truck timing, and
 * final-chaos all read from the validated spawn-director definition.
 */
export class SpawnDirectorRuntime {
  rammerSpawnIdx = 0;
  towerSpawnIdx = 0;
  truckSpawned = false;

  constructor(
    private readonly ctx: SystemContext,
    readonly def: SpawnDirectorDefinition,
  ) {}

  step(dt: number): void {
    const s = this.ctx.state;
    const ac = this.ctx.rules.config.arena;
    const mcfg = this.ctx.rules.matchConfig;
    const def = this.def;
    const bugCount = s.enemies.filter((e) => e.alive && e.type === 'scrapBug').length;
    const target = Math.min(
      Math.round(ac.minActiveBugs * mcfg.maxBugs),
      ac.maxActiveBugs,
      Math.max(2, Math.floor(2 + s.time * def.bugPacing.rampPerSecond)),
    );
    if (bugCount < target && s.enemies.length < def.bugPacing.cap) {
      this.ctx.enemies.spawnEnemy('scrapBug');
    }
    while (this.rammerSpawnIdx < def.rammerSpawns.length && s.time >= def.rammerSpawns[this.rammerSpawnIdx]) {
      const rammers = s.enemies.filter((e) => e.alive && e.type === 'rammer').length;
      if (rammers < Math.round(ac.maxRammers * mcfg.maxRammers)) {
        this.ctx.enemies.spawnEnemy('rammer');
      }
      this.rammerSpawnIdx++;
    }
    while (this.towerSpawnIdx < def.towerSpawns.length && s.time >= def.towerSpawns[this.towerSpawnIdx]) {
      const towers = s.enemies.filter((e) => e.alive && e.type === 'gunTower').length;
      const spot = ARENA.towerSpots[this.towerSpawnIdx % ARENA.towerSpots.length];
      if (towers < Math.round(ac.maxTowers * mcfg.maxTowers)) {
        this.ctx.enemies.spawnEnemy('gunTower', spot.x, spot.z);
      }
      this.towerSpawnIdx++;
    }
    if (!this.truckSpawned && s.time >= def.truck.spawnTime) {
      this.truckSpawned = true;
      const start = ARENA.truckRoute[0];
      s.truck.active = true;
      s.truck.x = start.x;
      s.truck.y = groundHeightAt(start.x, start.z);
      s.truck.z = start.z;
      s.truck.hp = this.ctx.rules.config.enemies.truckHp;
      const e = this.ctx.enemies.spawnEnemy('lootTruck', start.x, start.z);
      if (e) {
        e.state = 'route';
        pushEvent(this.ctx, 'truckSpawn', start.x, s.truck.y + 1, start.z);
      }
    }
    if (s.time > def.finalChaos.start) {
      const rammers = s.enemies.filter((e) => e.alive && e.type === 'rammer').length;
      if (rammers < Math.min(3, Math.round(ac.maxRammers * mcfg.maxRammers)) && Math.random() < dt * def.finalChaos.rammerProbability) {
        this.ctx.enemies.spawnEnemy('rammer');
      }
      const towers = s.enemies.filter((e) => e.alive && e.type === 'gunTower').length;
      if (towers < Math.round(ac.maxTowers * mcfg.maxTowers) && Math.random() < dt * def.finalChaos.towerProbability) {
        this.ctx.enemies.spawnEnemy(
          'gunTower',
          ARENA.towerSpots[Math.floor(Math.random() * ARENA.towerSpots.length)].x,
          ARENA.towerSpots[Math.floor(Math.random() * ARENA.towerSpots.length)].z,
        );
      }
    }
  }
}
