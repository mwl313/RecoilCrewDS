import { BASE_CONFIG, buildMatchConfig } from '../config';

/**
 * Canonical stat id catalog derived from the current config surface so it can
 * never drift from the values Phase 2 will resolve. Arrays (footprint) and
 * non-numeric leaves are excluded.
 */
function numericLeafIds(value: Record<string, unknown>, prefix: string): string[] {
  const out: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === 'number') {
      out.push(`${prefix}.${key}`);
    } else if (child && typeof child === 'object' && !Array.isArray(child)) {
      out.push(...numericLeafIds(child as Record<string, unknown>, `${prefix}.${key}`));
    }
  }
  return out;
}

const CATEGORY_RENAMES: Record<string, string> = {
  tank: 'tank',
  weapons: 'weapon',
  enemies: 'enemy',
  scoring: 'scoring',
  jackpot: 'jackpot',
  arena: 'arena',
};

export function defaultStatIds(): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const [category, child] of Object.entries(BASE_CONFIG)) {
    const prefix = CATEGORY_RENAMES[category];
    if (!prefix || typeof child !== 'object' || child === null || Array.isArray(child)) continue;
    for (const id of numericLeafIds(child as Record<string, unknown>, prefix)) ids.add(id);
  }
  for (const id of numericLeafIds(buildMatchConfig('none') as unknown as Record<string, unknown>, 'match')) {
    ids.add(id);
  }
  return ids;
}
