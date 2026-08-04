#!/usr/bin/env tsx
/**
 * Enemy animation content pipeline (Animation07):
 *
 *   content/enemy-presentation-profiles/
 *   content/enemy-animation-profiles/
 *   content/animation-lod-policies/
 *   content/animation-shadow-policies/
 *   content/enemies/ (legacy mapping + presentationProfileId checks)
 *   content/assets/ (model asset resolution)
 *     → Zod validation + cross-reference validation
 *     → src/generated/enemyAnimationContent.generated.ts (plain data, hash)
 *
 * Invoked by `npm run generate:presentation-content` (and standalone via
 * `npm run generate:enemy-animation-content`). Runtime lookup is the typed
 * generated bundle — no second JSON-loading system.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalStringify } from '../src/shared/content/hash';
import { assetCatalogDefinitionSchema, type AssetCatalogDefinition } from '../src/shared/presentation/schemas';
import { REQUIRED_ASSET_IDS } from '../src/shared/assetRegistry';
import {
  validateAnimationContent,
  buildAnimationContentBundle,
  type AnimationContentSource,
} from '../src/shared/animation/animationContentValidation';
import type { EnemyAnimationContentBundle } from '../src/shared/animation/animationProfileTypes';
import { enemyAnimationProfileSchema } from '../src/shared/animation/enemyAnimationProfileSchema';
import { enemyPresentationProfileSchema } from '../src/shared/animation/enemyPresentationProfileSchema';
import { animationLodPolicySchema } from '../src/shared/animation/animationLodPolicySchema';
import { animationShadowPolicySchema } from '../src/shared/animation/animationShadowPolicySchema';

export const ENEMY_ANIMATION_CONTENT_FORMAT = 1;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_ROOT = path.join(ROOT, 'content');
const OUT_DIR = path.join(ROOT, 'src', 'generated');
const OUT_FILE =
  process.env.ENEMY_ANIMATION_OUT ?? path.join(OUT_DIR, 'enemyAnimationContent.generated.ts');

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function listJson(dir: string): string[] {
  const full = path.join(CONTENT_ROOT, dir);
  if (!existsSync(full)) return [];
  return readdirSync(full)
    .filter((f) => f.endsWith('.json'))
    .sort();
}

function parseProfiles<T>(dir: string, schema: { safeParse(data: unknown): { success: boolean; data?: T; error?: unknown } }): T[] {
  const out: T[] = [];
  for (const file of listJson(dir)) {
    const parsed = schema.safeParse(readJson(path.join(CONTENT_ROOT, dir, file)));
    if (!parsed.success) {
      throw new Error(`${dir}/${file}: ${JSON.stringify(parsed.error).slice(0, 400)}`);
    }
    out.push(parsed.data as T);
  }
  return out;
}

function loadAssetCatalog(): AssetCatalogDefinition {
  const catalogs = listJson('assets').map((f) => {
    const parsed = assetCatalogDefinitionSchema.safeParse(readJson(path.join(CONTENT_ROOT, 'assets', f)));
    if (!parsed.success) throw new Error(`assets/${f}: ${JSON.stringify(parsed.error).slice(0, 400)}`);
    return parsed.data;
  });
  return {
    id: 'catalog.presentation',
    builtins: [...new Set(catalogs.flatMap((c) => c.builtins))].sort(),
    project: catalogs.flatMap((c) => c.project),
  };
}

function resolvableAssetIds(catalog: AssetCatalogDefinition): Set<string> {
  return new Set<string>([...REQUIRED_ASSET_IDS, ...catalog.builtins, ...catalog.project.map((p) => p.id)]);
}

export interface EnemyAnimationContentOutput {
  bundle: EnemyAnimationContentBundle;
  sourceHash: string;
}

export function buildEnemyAnimationContent(contentRoot = CONTENT_ROOT): EnemyAnimationContentOutput {
  const presentationProfiles = parseProfiles(
    'enemy-presentation-profiles',
    enemyPresentationProfileSchema,
  );
  const animationProfiles = parseProfiles('enemy-animation-profiles', enemyAnimationProfileSchema);
  const lodPolicies = parseProfiles('animation-lod-policies', animationLodPolicySchema);
  const shadowPolicies = parseProfiles('animation-shadow-policies', animationShadowPolicySchema);
  const catalog = loadAssetCatalog();
  const resolvable = resolvableAssetIds(catalog);

  const enemyJson = listJson('enemies').map((f) => readJson(path.join(contentRoot, 'enemies', f)) as Record<string, unknown>);
  const issues = validateAnimationContent(
    { presentationProfiles, animationProfiles, lodPolicies, shadowPolicies },
    (id) => resolvable.has(id),
    enemyJson,
  );
  if (issues.length > 0) {
    throw new Error(`enemy animation content validation failed:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
  }

  // Legacy type -> presentation profile mapping derived from enemy JSON.
  // A type uses its legacy profile unless every definition of that type has
  // an explicit presentationProfileId.
  const legacyTypePresentation: Record<string, string> = {};
  const byType = new Map<string, Array<Record<string, unknown>>>();
  for (const raw of enemyJson) {
    const type = typeof raw.type === 'string' ? raw.type : '';
    if (!type) continue;
    const list = byType.get(type) ?? [];
    list.push(raw);
    byType.set(type, list);
  }
  for (const [type, defs] of byType) {
    const allExplicit = defs.every((d) => typeof d.presentationProfileId === 'string');
    if (!allExplicit) legacyTypePresentation[type] = `enemyPresentation.legacy.${type}`;
  }

  const bundle = buildAnimationContentBundle({
    presentationProfiles,
    animationProfiles,
    lodPolicies,
    shadowPolicies,
  });
  bundle.legacyTypePresentation = legacyTypePresentation;
  const canonical = canonicalStringify({ format: ENEMY_ANIMATION_CONTENT_FORMAT, bundle });
  const sourceHash = createHash('sha256').update(canonical, 'utf8').digest('hex');
  bundle.sourceHash = sourceHash;
  return {
    bundle,
    sourceHash,
  };
}

function renderModule(input: EnemyAnimationContentOutput): string {
  const b = input.bundle;
  return [
    '/**',
    ' * AUTO-GENERATED — do not edit by hand.',
    ' * Run `npm run generate:presentation-content` (or generate:enemy-animation-content)',
    ' * after changing animation content JSON.',
    ' * Source: content/{enemy-presentation-profiles,enemy-animation-profiles,animation-lod-policies,animation-shadow-policies,enemies,assets}.',
    ' * Format: plain data only (no functions/runtime objects).',
    ' */',
    `export const ENEMY_ANIMATION_CONTENT_FORMAT = ${ENEMY_ANIMATION_CONTENT_FORMAT};`,
    `export const ENEMY_ANIMATION_CONTENT_SOURCE_HASH = '${input.sourceHash}';`,
    '',
    "import type { EnemyAnimationContentBundle } from '../shared/animation/animationProfileTypes';",
    '',
    `export const ENEMY_ANIMATION_CONTENT: EnemyAnimationContentBundle = ${canonicalStringify(b)};`,
    '',
    `export const ENEMY_ANIMATION_PRESENTATION_PROFILES = ENEMY_ANIMATION_CONTENT.presentationProfiles;`,
    `export const ENEMY_ANIMATION_ANIMATION_PROFILES = ENEMY_ANIMATION_CONTENT.animationProfiles;`,
    `export const ENEMY_ANIMATION_LOD_POLICIES = ENEMY_ANIMATION_CONTENT.lodPolicies;`,
    `export const ENEMY_ANIMATION_SHADOW_POLICIES = ENEMY_ANIMATION_CONTENT.shadowPolicies;`,
    `export const ENEMY_ANIMATION_PRESENTATION_PROFILE_ORDER = ENEMY_ANIMATION_CONTENT.presentationProfileOrder;`,
    `export const ENEMY_ANIMATION_LEGACY_TYPE_PRESENTATION = ENEMY_ANIMATION_CONTENT.legacyTypePresentation;`,
    '',
  ].join('\n');
}

export function writeEnemyAnimationContent(contentRoot = CONTENT_ROOT, outFile = OUT_FILE): string {
  const input = buildEnemyAnimationContent(contentRoot);
  mkdirSync(path.dirname(outFile), { recursive: true });
  writeFileSync(outFile, renderModule(input), 'utf8');
  return input.sourceHash;
}

export function readEnemyAnimationSourceHash(): string {
  const text = readFileSync(OUT_FILE, 'utf8');
  const match = text.match(/ENEMY_ANIMATION_CONTENT_SOURCE_HASH = '([0-9a-f]{64})'/);
  if (!match) throw new Error(`cannot read enemy animation source hash from ${OUT_FILE}`);
  return match[1];
}

if (!process.env.VITEST && process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('generate-enemy-animation-content.ts')) {
  const hash = writeEnemyAnimationContent();
  const b = buildEnemyAnimationContent();
  console.log('[enemy-animation] wrote src/generated/enemyAnimationContent.generated.ts');
  console.log(
    `[enemy-animation] sourceHash ${hash.slice(0, 12)}… presentation: ${Object.keys(b.bundle.presentationProfiles).length}, animation: ${Object.keys(b.bundle.animationProfiles).length}, lod: ${Object.keys(b.bundle.lodPolicies).length}, shadow: ${Object.keys(b.bundle.shadowPolicies).length}`,
  );
  console.log('[enemy-animation] PASS');
}
