import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENEMY_ANIMATION_ANIMATION_PROFILES } from '../../src/generated/enemyAnimationContent.generated';
import { assertNoFallbackCycles, ENEMY_ANIMATION_ROLES } from '../../src/shared/animation/animationRoles';
import { readGlbSummary } from '../../scripts/monsterpack10/glbSummary';

const ROOT = path.resolve(path.dirname(path.dirname(__dirname)));
const STAGING = path.join(
  ROOT,
  'build',
  'monsterpack10-import',
  'Ultimate monster pack - Horde Ready',
);
const HAS_STAGING = existsSync(STAGING);

describe('monsterpack10 animation profile conversion', () => {
  const profiles = Object.values(ENEMY_ANIMATION_ANIMATION_PROFILES).filter((p) =>
    p.id.startsWith('enemyAnimation.quaternius.'),
  );

  it('generates 45 hero + 15 common native profiles', () => {
    const hero = profiles.filter((p) => p.id.endsWith('.hero'));
    const common = profiles.filter((p) => p.id.endsWith('.common'));
    expect(hero.length).toBe(45);
    expect(common.length).toBe(15);
    expect(new Set(profiles.map((p) => p.id)).size).toBe(profiles.length);
  });

  it('root motion is false everywhere and fallback chains are acyclic', () => {
    for (const profile of profiles) {
      expect(profile.rootMotion).toBe(false);
      expect(() => assertNoFallbackCycles(profile.fallbacks, profile.id)).not.toThrow();
    }
  });

  it('every mapped clip exists in the corresponding hero/common GLB', () => {
    if (!HAS_STAGING) return;
    for (const profile of profiles) {
      const slug = profile.id.replace(/^enemyAnimation\.quaternius\./, '').replace(/\.(hero|common)$/, '');
      const tier = profile.id.endsWith('.hero') ? 'hero' : 'common-near';
      const glb = path.join(
        STAGING,
        'exports',
        tier === 'hero' ? 'hero' : 'common-near',
        `${slug}.${tier === 'hero' ? 'hero' : 'common-near'}.glb`,
      );
      if (!existsSync(glb)) continue;
      const summary = readGlbSummary(readFileSync(glb));
      const clipSet = new Set(summary.clipNames);
      for (const [role, clip] of Object.entries(profile.clips)) {
        expect(clipSet.has(clip), `${profile.id} ${role} -> ${clip}`).toBe(true);
      }
      for (const role of ENEMY_ANIMATION_ROLES) {
        if (profile.fallbacks[role]) {
          expect(ENEMY_ANIMATION_ROLES).toContain(profile.fallbacks[role]);
        }
      }
    }
  });

  it('common profiles do not reference clips stripped from common-near GLBs', () => {
    if (!HAS_STAGING) return;
    for (const profile of profiles.filter((p) => p.id.endsWith('.common'))) {
      const slug = profile.id.replace(/^enemyAnimation\.quaternius\./, '').replace(/\.common$/, '');
      const glb = path.join(STAGING, 'exports', 'common-near', `${slug}.common-near.glb`);
      if (!existsSync(glb)) continue;
      const summary = readGlbSummary(readFileSync(glb));
      const clipSet = new Set(summary.clipNames);
      for (const clip of Object.values(profile.clips)) {
        expect(clipSet.has(clip), `${profile.id} -> ${clip}`).toBe(true);
      }
    }
  });
});
