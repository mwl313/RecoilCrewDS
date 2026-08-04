import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEnemyAnimationContent } from '../scripts/generate-enemy-animation-content';
import { ENEMY_ANIMATION_CONTENT } from '../src/generated/enemyAnimationContent.generated';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOL = path.join(ROOT, 'tools', 'enemy-animation-preview');

describe('enemy animation preview tool (animation07 M14)', () => {
  it('uses production runtime modules instead of duplicating the runtime', () => {
    const src = fs.readFileSync(path.join(TOOL, 'src', 'main.ts'), 'utf8');
    expect(src).toContain("from '@app/client/assets'");
    expect(src).toContain('EnemyAnimationController');
    expect(src).toContain('createAnimationClipResolver');
    expect(src).toContain('ENEMY_ANIMATION_CONTENT');
    expect(src).not.toContain('new THREE.AnimationMixer');
    expect(src).not.toContain('clipAction');
  });

  it('preview content matches the generated bundle (no stale profiles)', () => {
    const built = buildEnemyAnimationContent();
    expect(ENEMY_ANIMATION_CONTENT.sourceHash).toBe(built.sourceHash);
  });

  it('provides the required tool entry points', () => {
    expect(fs.existsSync(path.join(TOOL, 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(TOOL, 'vite.config.ts'))).toBe(true);
  });
});
