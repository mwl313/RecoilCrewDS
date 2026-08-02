import type { GameConfig } from '../config';
import type { EnemyType } from '../types';

export function enemyRadius(type: EnemyType, cfg: GameConfig): number {
  switch (type) {
    case 'scrapBug':
      return cfg.arena.bugRadius;
    case 'rammer':
      return cfg.arena.rammerRadius;
    case 'gunTower':
      return cfg.arena.towerRadius;
    case 'lootTruck':
      return cfg.arena.truckRadius;
  }
}
