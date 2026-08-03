import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('presentation preview bundle separation', () => {
  it('preview tooling is absent from the normal game client chunks', () => {
    const distAssets = path.join(ROOT, 'dist', 'assets');
    if (!existsSync(distAssets)) return; // build gate runs before tests in CI flow
    const combined = readdirSync(distAssets)
      .filter((f) => f.endsWith('.js'))
      .map((f) => readFileSync(path.join(distAssets, f), 'utf8'))
      .join('\n');
    expect(combined).not.toContain('PRESENTATION PREVIEW');
    expect(combined).not.toContain('presentation-preview');
    expect(combined).not.toContain('dev:presentation-preview');
  });
});
