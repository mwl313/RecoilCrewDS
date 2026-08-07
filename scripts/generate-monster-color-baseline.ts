#!/usr/bin/env tsx
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { measureGlbColor } from './monsterpack10/colorFidelity';

const root = process.cwd();
const sourceIndex = process.argv.indexOf('--source');
const sourceRoot = sourceIndex >= 0 ? process.argv[sourceIndex + 1] : '';
if (!sourceRoot) throw new Error('usage: npm run generate:monster-color-baseline -- --source <original GLB directory>');

const variants = JSON.parse(
  readFileSync(path.join(root, 'docs', 'monsterpack10', 'source-manifests', 'runtime_variants.json'), 'utf8'),
) as { variants: Record<string, { variant: string; sourceModelId: string; sourceFile: string; sourceSha256: string }> };
const entries: Record<string, unknown> = {};

for (const variant of Object.values(variants.variants).filter((entry) => entry.variant === 'hero')) {
  const file = path.join(sourceRoot, variant.sourceFile);
  const bytes = readFileSync(file);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== variant.sourceSha256.toLowerCase()) {
    throw new Error(`${variant.sourceFile}: source hash mismatch`);
  }
  entries[variant.sourceModelId] = {
    sourceFile: variant.sourceFile,
    sourceSha256: sha256,
    stats: await measureGlbColor(file),
  };
}

const output = path.join(root, 'docs', 'quality', 'MONSTER_COLOR_FIDELITY_BASELINE.json');
writeFileSync(output, JSON.stringify({
  format: 1,
  sourceArchive: 'docs/quality/Ultimate Monsters Bundle-glb.zip',
  note: 'Linear-space source palette measurements. Regenerate only from the verified original 45-GLB archive.',
  entries,
}, null, 2) + '\n');
console.log(`[monster-color] wrote ${output} (${Object.keys(entries).length} sources)`);
