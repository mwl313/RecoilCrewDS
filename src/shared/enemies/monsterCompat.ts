import type { EnemyDefinition, MonsterEnemyDefinition } from '../content/schemas/enemy';

/**
 * Compatibility adapter between the legacy enemy schema and the generalized
 * monster variant (strangler migration). Every legacy consumer reads base
 * stats through these helpers, so monster definitions are additive and the
 * legacy Demo path stays byte-identical.
 *
 * Removal condition: once all consumers use the generalized runtime, these
 * helpers can be deleted.
 */
export function isMonster(def: EnemyDefinition): def is MonsterEnemyDefinition {
  return def.type === 'monster';
}

export function enemyHp(def: EnemyDefinition): number {
  return isMonster(def) ? def.stats.hp : def.hp;
}

export function enemySpeed(def: EnemyDefinition): number {
  return isMonster(def) ? def.stats.speed : (def as { speed?: number }).speed ?? 3.2;
}

export function enemyThreat(def: EnemyDefinition): number {
  return isMonster(def) ? def.stats.threat : def.threat ?? 1;
}

export function enemyRadius(def: EnemyDefinition, normalizedRadius?: number): number {
  if (isMonster(def)) return def.radius ?? normalizedRadius ?? 0.8;
  return def.radius;
}

export function enemyDropTableId(def: EnemyDefinition): string | undefined {
  return isMonster(def) ? def.dropTableId : def.dropTableId;
}
