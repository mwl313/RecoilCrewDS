#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { colorRatio, measureGlbColor, type GlbColorStats } from './monsterpack10/colorFidelity';

interface BaselineEntry {
  sourceFile: string;
  sourceSha256: string;
  stats: GlbColorStats;
}

interface Baseline {
  format: number;
  sourceArchive: string;
  entries: Record<string, BaselineEntry>;
}

const root = process.cwd();
const baseline = JSON.parse(
  readFileSync(path.join(root, 'docs', 'quality', 'MONSTER_COLOR_FIDELITY_BASELINE.json'), 'utf8'),
) as Baseline;
const variants = JSON.parse(
  readFileSync(path.join(root, 'docs', 'monsterpack10', 'source-manifests', 'runtime_variants.json'), 'utf8'),
) as { variants: Record<string, { variant: string; sourceModelId: string; outputFile: string }> };

const failures: string[] = [];
let checked = 0;
let minSaturation = Infinity;
let minValue = Infinity;
let minLuminance = Infinity;
let maxSaturation = 0;
let maxValue = 0;
let maxLuminance = 0;

for (const variant of Object.values(variants.variants).filter((entry) => entry.variant === 'hero')) {
  const source = baseline.entries[variant.sourceModelId];
  if (!source) {
    failures.push(`${variant.sourceModelId}: missing source color baseline`);
    continue;
  }
  const runtimeFile = path.join(
    root,
    'public',
    'assets',
    'models',
    'enemies',
    'quaternius',
    'hero',
    path.basename(variant.outputFile),
  );
  const actual = await measureGlbColor(runtimeFile);
  const saturation = colorRatio(actual.saturation, source.stats.saturation);
  const value = colorRatio(actual.value, source.stats.value);
  const luminance = colorRatio(actual.luminance, source.stats.luminance);
  minSaturation = Math.min(minSaturation, saturation);
  minValue = Math.min(minValue, value);
  minLuminance = Math.min(minLuminance, luminance);
  maxSaturation = Math.max(maxSaturation, saturation);
  maxValue = Math.max(maxValue, value);
  maxLuminance = Math.max(maxLuminance, luminance);
  if (saturation < 0.95 || saturation > 1.05) failures.push(`${variant.sourceModelId}: saturation ratio ${saturation.toFixed(4)}`);
  if (value < 0.97 || value > 1.03) failures.push(`${variant.sourceModelId}: value ratio ${value.toFixed(4)}`);
  if (luminance < 0.97 || luminance > 1.03) failures.push(`${variant.sourceModelId}: luminance ratio ${luminance.toFixed(4)}`);
  checked++;
}

if (checked !== 45) failures.push(`expected 45 hero comparisons, completed ${checked}`);
if (failures.length) {
  throw new Error(`Monster source-color fidelity failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}`);
}

console.log(`[monster-color] PASS ${checked}/45 source palettes`);
console.log(`[monster-color] saturation ratio ${minSaturation.toFixed(4)}–${maxSaturation.toFixed(4)}`);
console.log(`[monster-color] value ratio ${minValue.toFixed(4)}–${maxValue.toFixed(4)}`);
console.log(`[monster-color] luminance ratio ${minLuminance.toFixed(4)}–${maxLuminance.toFixed(4)}`);
