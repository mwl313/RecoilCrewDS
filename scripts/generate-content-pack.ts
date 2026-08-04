#!/usr/bin/env tsx
/**
 * Single-source gameplay content pipeline for the browser:
 *
 *   content/** (validated ContentPack)
 *     → src/generated/contentPack.generated.ts
 *
 * The server keeps loading validated JSON from disk. The browser (Single
 * Player and other client-side paths) consumes this generated module so
 * a local match resolves the same ContentPack → MatchRules → MatchRuntime
 * pipeline as multiplayer without shipping a filesystem loader or node
 * crypto into the client bundle.
 *
 * Usage: npm run generate:content-pack
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContentPackFromFilesystem } from '../src/shared/content/contentLoader';
import { canonicalStringify } from '../src/shared/content/hash';
import {
  CONTENT_CATEGORIES,
  type ContentCategory,
  type ContentPack,
} from '../src/shared/content/contentPack';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_ROOT = path.join(ROOT, 'content');
const OUT_DIR = path.join(ROOT, 'src', 'generated');
const OUT_FILE =
  process.env.CONTENT_PACK_OUT ?? path.join(OUT_DIR, 'contentPack.generated.ts');

export const GENERATED_CONTENT_PACK_FORMAT = 1;

/** Deterministic source fingerprint over the validated pack definitions. */
export function computeContentPackSourceHash(contentRoot = CONTENT_ROOT): string {
  const pack = loadContentPackFromFilesystem(contentRoot);
  const canonical = canonicalStringify({
    format: GENERATED_CONTENT_PACK_FORMAT,
    packId: pack.id,
    packVersion: pack.version,
    modeId: pack.modeId,
    hash: pack.hash,
    definitions: serializableDefinitions(pack),
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function serializableDefinitions(pack: ContentPack): Record<ContentCategory, unknown[]> {
  const out = {} as Record<ContentCategory, unknown[]>;
  for (const category of CONTENT_CATEGORIES) {
    out[category] = pack
      .ids(category)
      .slice()
      .sort()
      .map((id) => JSON.parse(JSON.stringify(pack.require(category, id))));
  }
  return out;
}

export function buildGeneratedContentPack(contentRoot = CONTENT_ROOT): {
  format: number;
  sourceHash: string;
  id: string;
  version: string;
  modeId: string;
  hash: string;
  definitions: Record<ContentCategory, unknown[]>;
} {
  const pack = loadContentPackFromFilesystem(contentRoot);
  const definitions = serializableDefinitions(pack);
  const canonical = canonicalStringify({
    format: GENERATED_CONTENT_PACK_FORMAT,
    packId: pack.id,
    packVersion: pack.version,
    modeId: pack.modeId,
    hash: pack.hash,
    definitions,
  });
  return {
    format: GENERATED_CONTENT_PACK_FORMAT,
    sourceHash: createHash('sha256').update(canonical, 'utf8').digest('hex'),
    id: pack.id,
    version: pack.version,
    modeId: pack.modeId,
    hash: pack.hash,
    definitions,
  };
}

export function renderGeneratedModule(input: ReturnType<typeof buildGeneratedContentPack>): string {
  const header = [
    '/**',
    ' * AUTO-GENERATED — do not edit by hand.',
    ' * Run `npm run generate:content-pack` after changing content JSON.',
    ' * Source: content/** validated by ContentLoader (server-side pipeline).',
    ' * Format: plain data + a browser-safe ContentPack builder (no fs, no node crypto).',
    ' */',
    `export const GENERATED_CONTENT_PACK_FORMAT = ${input.format};`,
    `export const CONTENT_PACK_SOURCE_HASH = '${input.sourceHash}';`,
    `export const CONTENT_PACK_ID = '${input.id}';`,
    `export const CONTENT_PACK_VERSION = '${input.version}';`,
    `export const CONTENT_PACK_MODE_ID = '${input.modeId}';`,
    `export const CONTENT_PACK_HASH = '${input.hash}';`,
    '',
    "import { ContentPack, CONTENT_CATEGORIES, type CategoryRegistries } from '../shared/content/contentPack';",
    "import { DefinitionRegistry, type ContentDefinition } from '../shared/content/definitionRegistry';",
    '',
    'const DEFINITIONS: Record<string, Array<{ id: string; definition: unknown }>> = {',
  ].join('\n');

  const body: string[] = [];
  for (const category of CONTENT_CATEGORIES) {
    const entries = (input.definitions[category] as Array<Record<string, unknown>>) ?? [];
    body.push(`  ${JSON.stringify(category)}: [`);
    for (const def of entries) {
      body.push(`    { id: ${JSON.stringify(def.id)}, definition: ${JSON.stringify(def)} },`);
    }
    body.push('  ],');
  }

  const footer = [
    '};',
    '',
    'function buildClientContentPack(): ContentPack {',
    '  const registries = {} as CategoryRegistries;',
    '  for (const category of CONTENT_CATEGORIES) {',
    '    const registry = new DefinitionRegistry<ContentDefinition>();',
    '    for (const entry of DEFINITIONS[category] ?? []) {',
    '      registry.register(entry.definition as ContentDefinition, `generated:${entry.id}`);',
    '    }',
    '    (registries as unknown as Record<string, DefinitionRegistry<ContentDefinition>>)[category] = registry;',
    '  }',
    '  return new ContentPack({',
    '    id: CONTENT_PACK_ID,',
    '    version: CONTENT_PACK_VERSION,',
    '    modeId: CONTENT_PACK_MODE_ID,',
    '    hash: CONTENT_PACK_HASH,',
    '    registries,',
    '  });',
    '}',
    '',
    '/** Browser-safe validated gameplay content pack (Single Player source of truth). */',
    'export const CLIENT_CONTENT_PACK: ContentPack = buildClientContentPack();',
    '',
  ].join('\n');

  return header + body.join('\n') + '\n' + footer;
}

function main(): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const input = buildGeneratedContentPack();
  writeFileSync(OUT_FILE, renderGeneratedModule(input), 'utf8');
  console.log(`[content-pack] wrote ${path.relative(ROOT, OUT_FILE)}`);
  console.log(`[content-pack] sourceHash ${input.sourceHash.slice(0, 12)}… modes: ${input.definitions.modes.length}`);
  console.log('[content-pack] PASS');
}

export function writeGeneratedContentPack(contentRoot = CONTENT_ROOT, outFile = OUT_FILE): string {
  const input = buildGeneratedContentPack(contentRoot);
  mkdirSync(path.dirname(outFile), { recursive: true });
  writeFileSync(outFile, renderGeneratedModule(input), 'utf8');
  return input.sourceHash;
}

export function readContentPackSourceHash(): string {
  const text = readFileSync(OUT_FILE, 'utf8');
  const match = text.match(/CONTENT_PACK_SOURCE_HASH = '([0-9a-f]{64})'/);
  if (!match) throw new Error(`cannot read content pack source hash from ${OUT_FILE}`);
  return match[1];
}

if (!process.env.VITEST && process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('generate-content-pack.ts')) {
  main();
}
