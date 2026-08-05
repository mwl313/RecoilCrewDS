import type { SystemContext } from '../sim/systems/systemContext';
import type { EnemyState } from '../types';
import { enemyDropTableId } from '../enemies/monsterCompat';

/**
 * Resolves an enemy's drop table into pickups through PickupSystem.
 * Deterministic under the seeded RNG: entries run in order and scatter
 * draws happen in the exact legacy order (angle, then radius).
 */
export class DropTableResolver {
  constructor(private readonly ctx: SystemContext) {}

  resolveFor(enemy: EnemyState): void {
    const def = this.ctx.enemies.defFor(enemy);
    const dropTableId = enemyDropTableId(def);
    if (!dropTableId) return;
    const table = this.ctx.rules.dropTables.get(dropTableId);
    if (!table) throw new Error(`missing drop table '${def.dropTableId}' for enemy '${def.id}'`);
    for (const entry of table.entries) {
      if (entry.scatter) {
        for (let i = 0; i < entry.count; i++) {
          const ang = (i / entry.count) * Math.PI * 2 + Math.random() * entry.scatter.angleJitter;
          const radius = entry.scatter.minRadius + Math.random() * (entry.scatter.maxRadius - entry.scatter.minRadius);
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
