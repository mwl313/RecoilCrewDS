#!/usr/bin/env tsx
/**
 * Generates the deterministic enemy-definition index used by the horde
 * replication protocol. The client reconstructs generalized monsters from
 * this index instead of the legacy five-entry type codec, so an exact
 * `defId` (never a Scrap Bug fallback) survives multiplayer.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContentPackFromFilesystem } from '../src/shared/content/contentLoader';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_ROOT = path.join(ROOT, 'content');
const OUT_DIR = path.join(ROOT, 'src', 'generated');
const OUT_FILE = path.join(OUT_DIR, 'enemyDefinitionIndex.generated.ts');

const pack = loadContentPackFromFilesystem(CONTENT_ROOT);
const order = [...pack.ids('enemies')].sort();
const index: Record<string, number> = {};
order.forEach((id, i) => {
  index[id] = i + 1;
});
const definitionOrderHash = createHash('sha256')
  .update(JSON.stringify(order), 'utf8')
  .digest('hex');

const legacyTypeByDefId: Record<string, string> = {
  'enemy.scrapBug': 'scrapBug',
  'enemy.rammer': 'rammer',
  'enemy.gunTower': 'gunTower',
  'enemy.lootTruck': 'lootTruck',
  'enemy.testHound': 'testHound',
};

const body = `/**
 * AUTO-GENERATED — do not edit by hand.
 * Run \`npm run generate:content-pack\` (or this script directly).
 * Source: validated content pack enemy definitions, sorted by id.
 */
export const ENEMY_DEFINITION_ORDER: readonly string[] = ${JSON.stringify(order)};
/** Deterministic hash of the sorted definition order (protocol gate). */
export const ENEMY_DEFINITION_ORDER_HASH = '${definitionOrderHash}';
export const ENEMY_DEFINITION_INDEX: Readonly<Record<string, number>> = ${JSON.stringify(index, null, 2)};
export const LEGACY_ENEMY_TYPE_BY_DEF_ID: Readonly<Record<string, string>> = ${JSON.stringify(legacyTypeByDefId, null, 2)};
`;

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, body);
console.log(`generated ${order.length} enemy definition indexes`);
