export function localizationId(id: string): string {
  return id.replace(/[.-]/g, '_');
}

export function relicKey(id: string, field: 'name' | 'description'): string {
  return `relic.${localizationId(id)}.${field}`;
}

export function upgradeKey(id: string): string {
  return `upgrade.${localizationId(id)}.name`;
}

export function statKey(id: string): string {
  return `upgrade.stat.${localizationId(id)}`;
}

export function enemyKey(id: string): string {
  return `enemy.${localizationId(id)}.name`;
}
