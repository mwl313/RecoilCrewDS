/**
 * Generates the per-family source dimension cache from the monster pack
 * catalog (hero variant measured bounds) plus the authoritative
 * size-class/tier metadata for every generalized monster definition.
 * No GLB is scanned at runtime.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadContentPackFromFilesystem } from '../src/shared/content/contentLoader';
import { readGlbNodeTranslation } from './monsterpack10/glbSummary';

const catalog = JSON.parse(fs.readFileSync('docs/monsterpack10/source-manifests/monster_catalog.json', 'utf8')) as {
  models: Array<{ slug: string; runtimeVariants: Record<string, { outputFile: string; measured: { boundsMin: number[]; boundsMax: number[] }; settings?: { sockets?: string[] } }> }>;
};

type Vec3 = [number, number, number];
const READABILITY_SIZE_POLICY = {
  ordinaryTargetHeights: { small: 1.2, medium: 1.8, large: 2 },
  preservedBaselineHeights: { small: 1.02, medium: 1.53, large: 1.7 },
  tierScales: { fodder: 1, specialist: 1, elite: 3, boss: 5 },
  readabilityTiers: ['fodder', 'specialist'],
} as const;
const out: Record<string, { width: number; height: number; depth: number; groundOffset: number; projectileSocket: Vec3; groundSocket: Vec3 }> = {};
for (const model of catalog.models) {
  const hero = model.runtimeVariants.hero;
  if (!hero) continue;
  const [minX, minY, minZ] = hero.measured.boundsMin;
  const [maxX, maxY, maxZ] = hero.measured.boundsMax;
  const glbPath = path.join('public/assets/models/enemies/quaternius/hero', path.basename(hero.outputFile));
  const glb = fs.readFileSync(glbPath);
  const projectileSocket = readGlbNodeTranslation(glb, 'socket.projectile');
  const groundSocket = readGlbNodeTranslation(glb, 'socket.shadow');
  if (!projectileSocket || !groundSocket) throw new Error(`${model.slug}: required authored sockets missing from ${glbPath}`);
  out[model.slug] = {
    width: maxX - minX,
    // Catalog measurements use Blender Z-up; runtime GLB uses Y-up.
    height: maxZ - minZ,
    depth: maxY - minY,
    groundOffset: Math.max(0, -minZ),
    projectileSocket,
    groundSocket,
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
  projectileSocket: [number, number, number];
  groundSocket: [number, number, number];
}

/** Generated policy input consumed by the single runtime dimension resolver. */
export const MONSTER_READABILITY_SIZE_POLICY = ${JSON.stringify(READABILITY_SIZE_POLICY, null, 2)} as const;

export const MONSTER_DIMENSIONS: Record<string, MonsterSourceDimensions> = ${JSON.stringify(out, null, 2)};

/** Per-definition size-class/tier metadata for generalized monsters. */
export const ENEMY_DEFINITION_SIZE_TIER: Record<string, { sizeClass: 'small' | 'medium' | 'large'; tier: 'fodder' | 'specialist' | 'elite' | 'boss'; optionalVariantScale: number }> = ${JSON.stringify(sizeTier, null, 2)};
`;
fs.writeFileSync('src/generated/monsterDimensions.generated.ts', body);
console.log(`generated ${Object.keys(out).length} dimension entries`);
