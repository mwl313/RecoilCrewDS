/**
 * Generates the per-family source dimension cache from the monster pack
 * catalog (hero variant measured bounds). No GLB is scanned at runtime.
 */
import fs from 'node:fs';

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
    depth: maxY - minY,
    height: maxZ - minZ,
    groundOffset: 0,
    hasProjectileSocket: (hero.settings?.sockets ?? []).includes('socket.projectile'),
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
`;
fs.writeFileSync('src/generated/monsterDimensions.generated.ts', body);
console.log(`generated ${Object.keys(out).length} dimension entries`);
