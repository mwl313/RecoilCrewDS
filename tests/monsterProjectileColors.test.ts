import { describe, expect, it } from 'vitest';
import { projectileVisualColors } from '../src/client/presentation/projectileColor';
import { loadContentPackFromFilesystem } from '../src/shared/content/contentLoader';
import { isMonster } from '../src/shared/enemies/monsterCompat';

const pack = loadContentPackFromFilesystem('content');

describe('monster projectile colors', () => {
  it('assigns a unique authored color to every projectile-firing monster', () => {
    const shooters: Array<{ id: string; color: string }> = [];
    for (const id of pack.ids('enemies')) {
      const enemy = pack.getEnemy(id);
      if (!isMonster(enemy)) continue;
      if (enemy.attack.type === 'ranged') {
        shooters.push({ id, color: enemy.attack.visualColor.toUpperCase() });
      } else if (enemy.attack.type === 'mixed') {
        const ranged = enemy.attack.patterns.filter((pattern) => pattern.type === 'ranged');
        expect(ranged.length, `${id} must fire at least one ranged projectile`).toBeGreaterThan(0);
        expect(new Set(ranged.map((pattern) => pattern.visualColor.toUpperCase())).size, `${id} must use one color across its ranged patterns`).toBe(1);
        shooters.push({ id, color: ranged[0].visualColor.toUpperCase() });
      }
    }

    expect(shooters).toHaveLength(22);
    expect(new Set(shooters.map(({ color }) => color)).size).toBe(shooters.length);
  });

  it('uses the authored enemy color for both the projectile glow and core', () => {
    expect(projectileVisualColors({ kind: 'enemy', visualColor: '#35D9FF' })).toEqual({
      glow: '#35D9FF',
      core: '#35D9FF',
    });
  });

  it('keeps player cannon and tower colors independent from monster colors', () => {
    expect(projectileVisualColors({ kind: 'tower' })).toEqual({ glow: 0xff6a58, core: 0xff3b30 });
    expect(projectileVisualColors({ kind: 'cannon', chargeRatio: 1 })).toEqual({ glow: 0xfff2b0, core: 0xfff7d0 });
  });
});
