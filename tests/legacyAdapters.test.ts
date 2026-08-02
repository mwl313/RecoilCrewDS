import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BASE_CONFIG, buildMatchConfig } from '../src/shared/config';
import { loadContentPackFromFilesystem } from '../src/shared/content/contentLoader';
import {
  contentEnemyIdFromType,
  difficultyIdFromModifierId,
  legacyEnemyTypeFromContentId,
  legacyGameConfigFromContent,
  legacyMatchConfigFromContent,
  legacyModifierIdFromDifficultyId,
  legacyWeaponKindFromContentId,
} from '../src/shared/legacy';
import type { ModifierId } from '../src/shared/types';

const CONTENT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../content');
const pack = loadContentPackFromFilesystem(CONTENT_ROOT);

const ALL_MODIFIERS: ModifierId[] = [
  'none',
  'doubleBarrel',
  'soapTracks',
  'moonYard',
  'volatileInventory',
  'scrapMagnet',
  'overclocked',
];

describe('LegacyConfigAdapter', () => {
  it('reconstructs the exact current GameConfig from content', () => {
    expect(legacyGameConfigFromContent(pack)).toEqual(BASE_CONFIG);
  });

  it('reconstructs buildMatchConfig output for every modifier', () => {
    for (const modifier of ALL_MODIFIERS) {
      expect(legacyMatchConfigFromContent(pack, modifier), modifier).toEqual(buildMatchConfig(modifier));
    }
  });

  it('content-derived config sections match config in isolation', () => {
    const config = legacyGameConfigFromContent(pack);
    expect(config.tank).toEqual(BASE_CONFIG.tank);
    expect(config.weapons).toEqual(BASE_CONFIG.weapons);
    expect(config.enemies).toEqual(BASE_CONFIG.enemies);
    expect(config.scoring).toEqual(BASE_CONFIG.scoring);
    expect(config.jackpot).toEqual(BASE_CONFIG.jackpot);
    expect(config.arena).toEqual(BASE_CONFIG.arena);
    expect(config.rematch.modifiers).toEqual(BASE_CONFIG.rematch.modifiers);
  });
});

describe('LegacyContentAdapter', () => {
  it('maps content ids to legacy enums and back', () => {
    expect(legacyEnemyTypeFromContentId('enemy.scrapBug')).toBe('scrapBug');
    expect(legacyEnemyTypeFromContentId('enemy.rammer')).toBe('rammer');
    expect(legacyEnemyTypeFromContentId('enemy.gunTower')).toBe('gunTower');
    expect(legacyEnemyTypeFromContentId('enemy.lootTruck')).toBe('lootTruck');
    expect(contentEnemyIdFromType('scrapBug')).toBe('enemy.scrapBug');
    expect(contentEnemyIdFromType('lootTruck')).toBe('enemy.lootTruck');
    expect(legacyWeaponKindFromContentId('weapon.machineGun')).toBe('mg');
    expect(legacyWeaponKindFromContentId('weapon.mainCannon')).toBe('cannon');
    expect(legacyWeaponKindFromContentId('weapon.jackpotShell')).toBe('jackpot');
    expect(legacyModifierIdFromDifficultyId('difficulty.moonYard')).toBe('moonYard');
    expect(difficultyIdFromModifierId('soapTracks')).toBe('difficulty.soapTracks');
  });

  it('throws on unknown content ids instead of silently mapping', () => {
    expect(() => legacyEnemyTypeFromContentId('enemy.nope')).toThrow();
    expect(() => legacyWeaponKindFromContentId('weapon.nope')).toThrow();
  });
});
