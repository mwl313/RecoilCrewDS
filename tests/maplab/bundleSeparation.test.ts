import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('Map Lab bundle separation', () => {
  it('Map Lab/Tweakpane never enter the game client chunks', () => {
    const distAssets = path.join(ROOT, 'dist', 'assets');
    if (!existsSync(distAssets)) return; // build gate runs before tests in CI flow
    const jsFiles = readdirSync(distAssets).filter((f) => f.endsWith('.js'));
    expect(jsFiles.length).toBeGreaterThan(0);
    const combined = jsFiles.map((f) => readFileSync(path.join(distAssets, f), 'utf8')).join('\n');
    expect(combined).not.toContain('MapLabApp');
    expect(combined).not.toContain('tweakpane');
    expect(combined).not.toContain('maplab-');
  });
});
