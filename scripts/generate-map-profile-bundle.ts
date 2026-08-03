#!/usr/bin/env tsx
/**
 * Single-source pipeline: content JSON -> validated MapGenerationBundles ->
 * src/generated/mapProfiles.generated.ts.
 *
 * The server keeps resolving from validated JSON; the browser, Practice,
 * reconstruction, and Map Lab consume the generated module. The generated
 * file is plain data (no functions/runtime objects) with a source hash so
 * stale files fail tests.
 *
 * Usage: npm run generate:map-profiles
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContentPackFromFilesystem } from '../src/shared/content/contentLoader';
import { canonicalStringify } from '../src/shared/content/hash';
import { resolveMapBundle, type MapGenerationBundle } from '../src/shared/mapgen/profiles';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_ROOT = path.join(ROOT, 'content');
const OUT_DIR = path.join(ROOT, 'src', 'generated');
const OUT_FILE = path.join(OUT_DIR, 'mapProfiles.generated.ts');

export const GENERATED_BUNDLE_FORMAT = 1;

/** Deterministic source fingerprint over the resolved map bundles. */
export function computeMapProfileSourceHash(contentRoot = CONTENT_ROOT): string {
  const pack = loadContentPackFromFilesystem(contentRoot);
  const bundles: Record<string, MapGenerationBundle> = {};
  for (const mapId of pack.ids('maps')) {
    bundles[mapId] = resolveMapBundle(pack, mapId);
  }
  const canonical = canonicalStringify({ format: GENERATED_BUNDLE_FORMAT, bundles });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export function buildGeneratedMapProfiles(contentRoot = CONTENT_ROOT): {
  format: number;
  sourceHash: string;
  bundles: Record<string, MapGenerationBundle>;
} {
  const pack = loadContentPackFromFilesystem(contentRoot);
  const bundles: Record<string, MapGenerationBundle> = {};
  for (const mapId of [...pack.ids('maps')].sort()) {
    bundles[mapId] = resolveMapBundle(pack, mapId);
  }
  const canonical = canonicalStringify({ format: GENERATED_BUNDLE_FORMAT, bundles });
  return {
    format: GENERATED_BUNDLE_FORMAT,
    sourceHash: createHash('sha256').update(canonical, 'utf8').digest('hex'),
    bundles,
  };
}

export function renderGeneratedModule(input: {
  format: number;
  sourceHash: string;
  bundles: Record<string, MapGenerationBundle>;
}): string {
  const header = [
    '/**',
    ' * AUTO-GENERATED — do not edit by hand.',
    ' * Run `npm run generate:map-profiles` after changing content JSON.',
    ' * Source: content/{maps,terrain-profiles,validation-profiles,furniture-sets,density-profiles,landmarks}.',
    ' * Format: plain data only (no functions/runtime objects).',
    ' */',
    `export const MAP_PROFILE_BUNDLE_FORMAT = ${input.format};`,
    `export const MAP_PROFILE_SOURCE_HASH = '${input.sourceHash}';`,
    '',
    'import type { MapGenerationBundle } from \'../shared/mapgen/profiles\';',
    '',
    'export const GENERATED_MAP_PROFILES: Record<string, MapGenerationBundle> = ',
    `${canonicalStringify(input.bundles)};`,
    '',
    'export const GENERATED_MAP_IDS: readonly string[] = Object.keys(GENERATED_MAP_PROFILES);',
    '',
  ].join('\n');
  return header;
}

export function writeGeneratedMapProfiles(contentRoot = CONTENT_ROOT, outFile = OUT_FILE): string {
  const input = buildGeneratedMapProfiles(contentRoot);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(outFile, renderGeneratedModule(input), 'utf8');
  return input.sourceHash;
}

function main(): void {
  const hash = writeGeneratedMapProfiles();
  console.log(`[map-profiles] wrote ${path.relative(ROOT, OUT_FILE)}`);
  console.log(`[map-profiles] sourceHash ${hash.slice(0, 12)}… maps: ${Object.keys(GENERATED_IDS()).join(', ')}`);
  console.log('[map-profiles] PASS');
}

function GENERATED_IDS(): string[] {
  const pack = loadContentPackFromFilesystem(CONTENT_ROOT);
  return [...pack.ids('maps')];
}

// Also used by apply-maplab-profile and stale tests.
export function readGeneratedSourceHash(): string {
  const text = readFileSync(OUT_FILE, 'utf8');
  const match = text.match(/MAP_PROFILE_SOURCE_HASH = '([0-9a-f]{64})'/);
  if (!match) throw new Error(`cannot read source hash from ${OUT_FILE}`);
  return match[1];
}

if (!process.env.VITEST && process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('generate-map-profile-bundle.ts')) {
  main();
}
