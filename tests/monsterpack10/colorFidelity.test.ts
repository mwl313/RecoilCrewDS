import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { colorRatio, measureGlbColor, type GlbColorStats } from '../../scripts/monsterpack10/colorFidelity';

interface Baseline {
  entries: Record<string, { stats: GlbColorStats }>;
}

describe('Monster Pack source-color fidelity', () => {
  it('keeps every hero palette within the source fidelity envelope', async () => {
    const root = process.cwd();
    const baseline = JSON.parse(
      readFileSync(path.join(root, 'docs', 'quality', 'MONSTER_COLOR_FIDELITY_BASELINE.json'), 'utf8'),
    ) as Baseline;
    const variants = JSON.parse(
      readFileSync(path.join(root, 'docs', 'monsterpack10', 'source-manifests', 'runtime_variants.json'), 'utf8'),
    ) as { variants: Record<string, { variant: string; sourceModelId: string; outputFile: string }> };
    const heroes = Object.values(variants.variants).filter((entry) => entry.variant === 'hero');
    expect(heroes).toHaveLength(45);

    for (const hero of heroes) {
      const source = baseline.entries[hero.sourceModelId];
      expect(source, `${hero.sourceModelId} source baseline`).toBeDefined();
      const runtime = await measureGlbColor(path.join(
        root,
        'public',
        'assets',
        'models',
        'enemies',
        'quaternius',
        'hero',
        path.basename(hero.outputFile),
      ));
      expect(colorRatio(runtime.saturation, source.stats.saturation), `${hero.sourceModelId} saturation`).toBeGreaterThanOrEqual(0.95);
      expect(colorRatio(runtime.saturation, source.stats.saturation), `${hero.sourceModelId} saturation`).toBeLessThanOrEqual(1.05);
      expect(colorRatio(runtime.value, source.stats.value), `${hero.sourceModelId} value`).toBeGreaterThanOrEqual(0.97);
      expect(colorRatio(runtime.value, source.stats.value), `${hero.sourceModelId} value`).toBeLessThanOrEqual(1.03);
      expect(colorRatio(runtime.luminance, source.stats.luminance), `${hero.sourceModelId} luminance`).toBeGreaterThanOrEqual(0.97);
      expect(colorRatio(runtime.luminance, source.stats.luminance), `${hero.sourceModelId} luminance`).toBeLessThanOrEqual(1.03);
    }
  }, 60_000);
});
