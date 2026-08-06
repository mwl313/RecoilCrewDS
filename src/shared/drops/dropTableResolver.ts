import type { SystemContext } from '../sim/systems/systemContext';
import type { EnemyState } from '../types';
import { enemyDropTableId } from '../enemies/monsterCompat';
import { mulberry32, type Rng } from '../mapgen/prng';
import { hash32 } from '../mapgen/seed';

/**
 * Resolves an enemy's drop table into pickups through PickupSystem.
 * Deterministic under the seeded RNG: entries run in order and scatter
 * draws happen in the exact legacy order (angle, then radius).
 */
export class DropTableResolver {
  private readonly dropsRng: Rng;

  constructor(private readonly ctx: SystemContext) {
    this.dropsRng = mulberry32(hash32('monsterDrops', this.ctx.state.matchId));
  }

  resolveFor(enemy: EnemyState): void {
    const def = this.ctx.enemies.defFor(enemy);
    const dropTableId = enemyDropTableId(def);
    if (!dropTableId) return;
    const table = this.ctx.rules.dropTables.get(dropTableId);
    if (!table) throw new Error(`missing drop table '${def.dropTableId}' for enemy '${def.id}'`);
    for (const entry of table.entries) {
      if (entry.scatter) {
        const rng = enemy.monster ? this.dropsRng : Math.random;
        for (let i = 0; i < entry.count; i++) {
          const ang = (i / entry.count) * Math.PI * 2 + rng() * entry.scatter.angleJitter;
          const radius = entry.scatter.minRadius + rng() * (entry.scatter.maxRadius - entry.scatter.minRadius);
          this.ctx.pickups.spawn(entry.kind, enemy.x + Math.cos(ang) * radius, enemy.z + Math.sin(ang) * radius);
        }
      } else {
        for (let i = 0; i < entry.count; i++) {
          this.ctx.pickups.spawn(entry.kind, enemy.x + (entry.offsetX ?? 0), enemy.z + (entry.offsetZ ?? 0));
        }
      }
    }
  }
}
