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
      const spots = this.ctx.world.towerSpots;
      if (spots.length > 0) {
        const towers = s.enemies.filter((e) => e.alive && e.type === 'gunTower').length;
        const spot = spots[this.towerSpawnIdx % spots.length];
        if (towers < Math.round(ac.maxTowers * mcfg.maxTowers)) {
          this.ctx.enemies.spawnEnemy('gunTower', spot.x, spot.z);
        }
      }
      this.towerSpawnIdx++;
    }
    const truckRoute = this.ctx.world.truckRoute;
    if (!this.truckSpawned && s.time >= def.truck.spawnTime && truckRoute.length > 0) {
      this.truckSpawned = true;
      const start = truckRoute[0];
      s.truck.active = true;
      s.truck.x = start.x;
      s.truck.y = this.ctx.world.groundHeightAt(start.x, start.z);
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
      const spots = this.ctx.world.towerSpots;
      if (spots.length > 0 && towers < Math.round(ac.maxTowers * mcfg.maxTowers) && Math.random() < dt * def.finalChaos.towerProbability) {
        // Legacy parity: two independent random picks (x and z) as before.
        this.ctx.enemies.spawnEnemy(
          'gunTower',
          spots[Math.floor(Math.random() * spots.length)].x,
          spots[Math.floor(Math.random() * spots.length)].z,
        );
      }
    }
  }
}
