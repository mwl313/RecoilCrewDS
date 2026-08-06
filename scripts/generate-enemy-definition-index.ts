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

// Exact runtime type for every validated enemy definition (never a partial
// handwritten map): legacy types keep their wire type, monsters are
// 'monster', and scrapBugHorde stays a real scrapBug.
const runtimeTypeByDefId: Record<string, string> = {};
for (const id of order) {
  runtimeTypeByDefId[id] = pack.getEnemy(id).type;
}

// Formation roles are authored on spawn-pack entries; emit the stable
// sorted order so replication can use one compact index.
const formationRoles = new Set<string>();
for (const id of pack.ids('spawnPacks')) {
  for (const entry of pack.getSpawnPack(id).entries) {
    if (entry.formationRole) formationRoles.add(entry.formationRole);
  }
}
const formationRoleOrder = [...formationRoles].sort();

const body = `/**
 * AUTO-GENERATED — do not edit by hand.
 * Run \`npm run generate:content-pack\` (or this script directly).
 * Source: validated content pack enemy definitions, sorted by id.
 */
export const ENEMY_DEFINITION_ORDER: readonly string[] = ${JSON.stringify(order)};
/** Deterministic hash of the sorted definition order (protocol gate). */
export const ENEMY_DEFINITION_ORDER_HASH = '${definitionOrderHash}';
export const ENEMY_DEFINITION_INDEX: Readonly<Record<string, number>> = ${JSON.stringify(index, null, 2)};
/** Exact runtime type for every enemy definition (generated from content). */
export const ENEMY_RUNTIME_TYPE_BY_DEF_ID: Readonly<Record<string, string>> = ${JSON.stringify(runtimeTypeByDefId, null, 2)};
/** Stable authored formation-role order used by compact ownership encoding. */
export const ENEMY_FORMATION_ROLE_ORDER: readonly string[] = ${JSON.stringify(formationRoleOrder)};
`;

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, body);
console.log(`generated ${order.length} enemy definition indexes`);
