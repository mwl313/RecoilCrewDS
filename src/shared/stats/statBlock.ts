import type { GameConfig } from '../config';
import type { MatchConfig } from '../types';

/** Base stat block: flat statId -> number, split by scope. */
export type StatBlock = Record<string, number>;

export interface BaseStatBlocks {
  match: StatBlock;
  tank: StatBlock;
  weapon: StatBlock;
  enemy: StatBlock;
}

/**
 * Build base blocks from a GameConfig + MatchConfig. Ids are derived from
 * config paths (`weapons.mgDamage` -> `weapon.mgDamage`) so the runtime
 * registry and the content catalog can never drift apart.
 */
export function baseStatBlocksFromConfig(config: GameConfig, matchConfig: MatchConfig): BaseStatBlocks {
  return {
    match: pickNumeric(matchConfig as unknown as Record<string, unknown>, 'match'),
    tank: pickNumeric(config.tank as unknown as Record<string, unknown>, 'tank'),
    weapon: pickNumeric(config.weapons as unknown as Record<string, unknown>, 'weapon'),
    enemy: pickNumeric(config.enemies as unknown as Record<string, unknown>, 'enemy'),
  };
}

function pickNumeric(source: Record<string, unknown>, prefix: string): StatBlock {
  const out: StatBlock = {};
  for (const [key, value] of Object.entries(source)) {
    // surfaceLaunch* fields are movement tuning consumed directly from
    // GameConfig/BASE_CONFIG; they are not gameplay stats and must not enter
    // the stat registry.
    if (prefix === 'tank' && key.startsWith('surfaceLaunch')) continue;
    if (typeof value === 'number') out[`${prefix}.${key}`] = value;
  }
  return out;
}
