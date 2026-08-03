#!/usr/bin/env tsx
/**
 * Safe content application for Map Lab Profile Bundle exports.
 *
 * Usage:
 *   npm run maplab:apply -- ./downloads/profile.json
 *   npm run maplab:apply -- ./downloads/profile.json --overwrite
 *
 * Validates format/version, real Zod schemas, cross-references, and id
 * conflicts; writes content files (only with --overwrite for existing
 * ids), updates the manifest, regenerates the client-safe bundle, prints
 * changed files, and never creates a git commit.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContentPackFromFilesystem } from '../src/shared/content/contentLoader';
import { mapSchema } from '../src/shared/content/schemas/map';
import { terrainProfileSchema } from '../src/shared/content/schemas/terrainProfile';
import { validationProfileSchema } from '../src/shared/content/schemas/validationProfile';
import { furnitureSetSchema } from '../src/shared/content/schemas/furnitureSet';
import { densityProfileSchema } from '../src/shared/content/schemas/densityProfile';
import { landmarkSchema } from '../src/shared/content/schemas/landmark';
import { computeMapProfileSourceHash, writeGeneratedMapProfiles } from './generate-map-profile-bundle';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_ROOT = path.join(ROOT, 'content');
const MANIFEST_PATH = path.join(CONTENT_ROOT, 'manifest.json');

const CATEGORY_SCHEMAS: Record<string, { schema: { safeParse(v: unknown): { success: boolean; error?: unknown } }; folder: string }> = {
  map: { schema: mapSchema, folder: 'maps' },
  terrainProfile: { schema: terrainProfileSchema, folder: 'terrain-profiles' },
  validationProfile: { schema: validationProfileSchema, folder: 'validation-profiles' },
  furnitureSet: { schema: furnitureSetSchema, folder: 'furniture-sets' },
  densityProfile: { schema: densityProfileSchema, folder: 'density-profiles' },
  landmark: { schema: landmarkSchema, folder: 'landmarks' },
};

const MANIFEST_KEYS: Record<string, string> = {
  maps: 'maps',
  'terrain-profiles': 'terrainProfiles',
  'validation-profiles': 'validationProfiles',
  'furniture-sets': 'furnitureSets',
  'density-profiles': 'densityProfiles',
  landmarks: 'landmarks',
};

export class ApplyError extends Error {}

export function applyProfileBundle(
  bundle: unknown,
  options: { contentRoot?: string; overwrite?: boolean; writeGenerated?: boolean } = {},
): { changed: string[]; hash: string } {
  const rec = bundle as Record<string, unknown>;
  const contentRoot = options.contentRoot ?? CONTENT_ROOT;
  const overwrite = options.overwrite ?? false;
  const writeGenerated = options.writeGenerated ?? true;
  const manifestPath = path.join(contentRoot, 'manifest.json');
  if (rec.kind !== 'profile-bundle') throw new ApplyError(`expected kind "profile-bundle", got ${String(rec.kind)}`);
  if (typeof rec.formatVersion !== 'number' || rec.formatVersion !== 1) {
    throw new ApplyError(`unsupported formatVersion ${String(rec.formatVersion)} (expected 1)`);
  }
  const defs = rec.bundles as Record<string, unknown> | undefined;
  if (!defs || typeof defs !== 'object') throw new ApplyError('missing bundles object');
  const contentDefs = toContentShape(defs);

  // 1. Real schema validation.
  for (const [key, category] of Object.entries(CATEGORY_SCHEMAS)) {
    if (key === 'landmark') {
      const list = contentDefs.landmarks;
      if (!Array.isArray(list) || list.length === 0) throw new ApplyError('missing bundle section: landmarks');
      for (const def of list) {
        const parsed = category.schema.safeParse(def);
        if (!parsed.success) throw new ApplyError(`schema validation failed for landmark: ${JSON.stringify(parsed.error).slice(0, 300)}`);
      }
      continue;
    }
    const def = contentDefs[key];
    if (!def) throw new ApplyError(`missing bundle section: ${key}`);
    const parsed = category.schema.safeParse(def);
    if (!parsed.success) throw new ApplyError(`schema validation failed for ${key}: ${JSON.stringify(parsed.error).slice(0, 400)}`);
  }

  // 2. Cross-reference validation (bundle-internal + existing pack).
  const map = defs.map as { id: string; terrainProfileId: string; validationProfileId: string; furnitureSetId: string; densityProfileId: string; fallbackMapId?: string | null };
  const furnitureSet = defs.furnitureSet as { landmarks: string[] };
  const landmarkIds = new Set((defs.landmarks as Array<{ id: string }>).map((l) => l.id));
  const idOf = (section: Record<string, unknown>): string => {
    const value = (section as { id?: string }).id;
    if (!value) throw new ApplyError(`cannot read id from section`);
    return value;
  };
  const terrainId = idOf(defs.terrainProfile as Record<string, unknown>);
  const validationId = idOf(defs.validationProfile as Record<string, unknown>);
  const furnitureId = idOf(defs.furnitureSet as Record<string, unknown>);
  const densityId = idOf(defs.densityProfile as Record<string, unknown>);
  if (map.terrainProfileId !== terrainId) throw new ApplyError(`map.terrainProfileId ${map.terrainProfileId} != ${terrainId}`);
  if (map.validationProfileId !== validationId) throw new ApplyError(`map.validationProfileId ${map.validationProfileId} != ${validationId}`);
  if (map.furnitureSetId !== furnitureId) throw new ApplyError(`map.furnitureSetId ${map.furnitureSetId} != ${furnitureId}`);
  if (map.densityProfileId !== densityId) throw new ApplyError(`map.densityProfileId ${map.densityProfileId} != ${densityId}`);
  for (const landmarkRef of furnitureSet.landmarks) {
    if (!landmarkIds.has(landmarkRef)) throw new ApplyError(`furnitureSet references unknown landmark ${landmarkRef}`);
  }
  const pack = loadContentPackFromFilesystem(contentRoot);
  if (map.fallbackMapId && !pack.has('maps', map.fallbackMapId)) {
    throw new ApplyError(`fallbackMapId ${map.fallbackMapId} not found in content pack`);
  }

  // 3. Id conflicts + existing file mapping.
  const existing = scanContentFiles(contentRoot);
  const changed: string[] = [];
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { pack: { files: Record<string, string[]> } };

  for (const [key, category] of Object.entries(CATEGORY_SCHEMAS)) {
    if (key === 'landmark') {
      const list = contentDefs.landmarks as Array<{ id: string }>;
      for (const def of list) {
        const existingPath = existing[def.id];
        const targetPath =
          existingPath ?? path.join(category.folder, `${slug(def.id)}.json`).replace(/\\/g, '/');
        if (existingPath && !overwrite) {
          throw new ApplyError(`id conflict: ${def.id} already exists at ${existingPath} (use --overwrite to replace)`);
        }
        const absolute = path.join(contentRoot, targetPath);
        if (existsSync(absolute) && !overwrite) {
          throw new ApplyError(`file already exists: ${targetPath} (use --overwrite to replace)`);
        }
        writeFileSync(absolute, `${JSON.stringify(def, null, 2)}\n`, 'utf8');
        changed.push(targetPath);
        const manifestKey = MANIFEST_KEYS[category.folder] ?? category.folder;
        const list2 = manifest.pack.files[manifestKey] ?? [];
        if (!list2.includes(targetPath)) list2.push(targetPath);
        manifest.pack.files[manifestKey] = [...new Set(list2)];
      }
      continue;
    }
    const def = contentDefs[key] as { id: string };
    const existingPath = existing[def.id];
    const targetPath =
      existingPath ?? path.join(category.folder, `${slug(def.id)}.json`).replace(/\\/g, '/');
    if (existingPath && !overwrite) {
      throw new ApplyError(`id conflict: ${def.id} already exists at ${existingPath} (use --overwrite to replace)`);
    }
    const absolute = path.join(contentRoot, targetPath);
    if (existsSync(absolute) && !overwrite) {
      throw new ApplyError(`file already exists: ${targetPath} (use --overwrite to replace)`);
    }
    writeFileSync(absolute, `${JSON.stringify(def, null, 2)}\n`, 'utf8');
    changed.push(targetPath);
    const manifestKey = MANIFEST_KEYS[category.folder] ?? category.folder;
    const list = manifest.pack.files[manifestKey] ?? [];
    if (!list.includes(targetPath)) list.push(targetPath);
    manifest.pack.files[manifestKey] = [...new Set(list)];
  }

  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  changed.push('content/manifest.json');
  const hash = buildGeneratedHash(contentRoot);
  if (writeGenerated) {
    writeGeneratedMapProfiles(contentRoot);
    changed.push('src/generated/mapProfiles.generated.ts');
  }
  return { changed, hash };
}

function main(): void {
  const args = process.argv.slice(2);
  const fileArg = args.find((a) => !a.startsWith('--'));
  const overwrite = args.includes('--overwrite');
  if (!fileArg) {
    console.error('[maplab:apply] ERROR: usage: npm run maplab:apply -- <bundle.json> [--overwrite]');
    process.exit(1);
  }
  const filePath = path.resolve(ROOT, fileArg);
  if (!existsSync(filePath)) {
    console.error(`[maplab:apply] ERROR: bundle file not found: ${filePath}`);
    process.exit(1);
  }
  let bundle: Record<string, unknown>;
  try {
    bundle = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`[maplab:apply] ERROR: invalid JSON: ${(error as Error).message}`);
    process.exit(1);
  }
  try {
    const { changed, hash } = applyProfileBundle(bundle, { overwrite });
    console.log('[maplab:apply] applied profile bundle:');
    for (const file of changed.sort()) console.log(`  ${file}`);
    console.log(`[maplab:apply] client bundle regenerated (sourceHash ${hash.slice(0, 12)})`);
    console.log('[maplab:apply] next: npm test && npm run test:maps && npm run test:demo');
    console.log('[maplab:apply] no git commit created');
    console.log('[maplab:apply] PASS');
  } catch (error) {
    console.error(`[maplab:apply] ERROR: ${(error as Error).message}`);
    process.exit(1);
  }
}

function scanContentFiles(contentRoot: string): Record<string, string> {
  const out: Record<string, string> = {};
  const folders = ['maps', 'terrain-profiles', 'validation-profiles', 'furniture-sets', 'density-profiles', 'landmarks'];
  for (const folder of folders) {
    const dir = path.join(contentRoot, folder);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.json')) continue;
      const raw = JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as { id?: string };
      if (raw.id) out[raw.id] = `${folder}/${file}`;
    }
  }
  return out;
}

if (!process.env.VITEST && process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('apply-maplab-profile.ts')) {
  main();
}

function slug(id: string): string {
  return id.replace(/^[a-zA-Z]+\./, '').replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`).replace(/^_/, '');
}

function buildGeneratedHash(contentRoot: string): string {
  return computeMapProfileSourceHash(contentRoot);
}

/**
 * Convert the resolved bundle shape ({min,max} ranges) into the content
 * schema shape (tuple ranges) so apply output passes real Zod validation.
 */
function toContentShape(defs: Record<string, unknown>): Record<string, unknown> {
  const terrain = defs.terrainProfile as Record<string, unknown> | undefined;
  if (terrain && typeof terrain.features === 'object') {
    const features = terrain.features as Record<string, Record<string, unknown>>;
    for (const feature of Object.values(features)) {
      for (const key of ['radius', 'depth', 'height', 'length', 'width'] as const) {
        const range = feature[key] as { min?: number; max?: number } | undefined;
        if (range && typeof range === 'object' && !Array.isArray(range)) {
          feature[key] = [range.min ?? 0, range.max ?? 0];
        }
      }
    }
  }
  return defs;
}
