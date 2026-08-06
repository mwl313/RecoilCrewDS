/**
 * Generates the per-family source dimension cache from the monster pack
 * catalog (hero variant measured bounds) plus the authoritative
 * size-class/tier metadata for every generalized monster definition.
 * No GLB is scanned at runtime.
 */
import fs from 'node:fs';
import { loadContentPackFromFilesystem } from '../src/shared/content/contentLoader';

const catalog = JSON.parse(fs.readFileSync('docs/monsterpack10/source-manifests/monster_catalog.json', 'utf8')) as {
  models: Array<{ slug: string; runtimeVariants: Record<string, { measured: { boundsMin: number[]; boundsMax: number[] }; settings?: { sockets?: string[] } }> }>;
};

const out: Record<string, { width: number; height: number; depth: number; groundOffset: number; hasProjectileSocket: boolean }> = {};
for (const model of catalog.models) {
  const hero = model.runtimeVariants.hero;
  if (!hero) continue;
  const [minX, minY, minZ] = hero.measured.boundsMin;
  const [maxX, maxY, maxZ] = hero.measured.boundsMax;
  out[model.slug] = {
    width: maxX - minX,
    height: maxY - minY,
    depth: maxZ - minZ,
    // Neutral-pose foot plane: the lowest visible vertex below the root.
    groundOffset: Math.max(0, -minY),
    hasProjectileSocket: (hero.settings?.sockets ?? []).includes('socket.projectile'),
  };
}

const pack = loadContentPackFromFilesystem('content');
const sizeTier: Record<string, { sizeClass: string; tier: string; optionalVariantScale: number }> = {};
for (const id of pack.ids('enemies')) {
  const def = pack.getEnemy(id);
  if (!('tier' in def) || def.type !== 'monster') continue;
  sizeTier[id] = {
    sizeClass: def.sizeClass,
    tier: def.tier,
    optionalVariantScale: def.optionalVariantScale ?? 1,
  };
}

const body = `/** AUTO-GENERATED — do not edit by hand. Run \`npx tsx scripts/generate-monster-dimensions.ts\`. */
export interface MonsterSourceDimensions {
  width: number;
  height: number;
  depth: number;
  groundOffset: number;
  hasProjectileSocket: boolean;
}

export const MONSTER_DIMENSIONS: Record<string, MonsterSourceDimensions> = ${JSON.stringify(out, null, 2)};

/** Per-definition size-class/tier metadata for generalized monsters. */
export const ENEMY_DEFINITION_SIZE_TIER: Record<string, { sizeClass: 'small' | 'medium' | 'large'; tier: 'fodder' | 'specialist' | 'elite' | 'boss'; optionalVariantScale: number }> = ${JSON.stringify(sizeTier, null, 2)};
`;
fs.writeFileSync('src/generated/monsterDimensions.generated.ts', body);
console.log(`generated ${Object.keys(out).length} dimension entries`);
