import { existsSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { planImport } from '../../scripts/import-monsterpack10';

describe('monsterpack10 stale cleanup', () => {
  it('stale managed files are removed safely and unmanaged files are untouched', () => {
    const ROOT = path.resolve(path.dirname(path.dirname(__dirname)));
    const heroDir = path.join(ROOT, 'public', 'assets', 'models', 'enemies', 'quaternius', 'hero');
    const stale = path.join(heroDir, 'zz-stale-test.glb');
    const unmanaged = path.join(heroDir, 'zz-unmanaged-test.glb');
    writeFileSync(stale, 'stale', 'utf8');
    writeFileSync(unmanaged, 'keep', 'utf8');
    try {
      const plan = planImport(path.join(ROOT, 'build', 'monsterpack10-import'), {}, { hero: 0, commonNear: 0, commonFar: 0, aggregate: 0 }, [], [stale]);
      expect(plan.staleRemovals).toEqual([path.resolve(stale)]);
      expect(plan.staleRemovals).not.toContain(path.resolve(unmanaged));
      expect(existsSync(unmanaged)).toBe(true);
    } finally {
      rmSync(stale, { force: true });
      rmSync(unmanaged, { force: true });
    }
  });
});
