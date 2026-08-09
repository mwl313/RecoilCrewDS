import { describe, expect, it } from 'vitest';
import { loadContentPackFromFilesystem } from '../src/shared/content/contentLoader';
import {
  ENEMY_ANIMATION_ANIMATION_PROFILES,
  ENEMY_ANIMATION_PRESENTATION_PROFILES,
} from '../src/generated/enemyAnimationContent.generated';
import { PRESENTATION_ASSET_CATALOG } from '../src/generated/presentationContent.generated';
import { monsterHealthMultiplier, monsterDamageMultiplier, monsterXpReward } from '../src/shared/monsters/monsterDifficulty';
import {
  normalizedEnemyDimensions,
  TIER_SCALES,
  TARGET_HEIGHTS,
} from '../src/shared/monsters/monsterNormalization';

const pack = loadContentPackFromFilesystem('content');

describe('monster roster content', () => {
  const monsters = pack.ids('enemies')
    .map((id) => pack.getEnemy(id))
    .filter((e) => e.type === 'monster');

  it('contains 51 monsters: 39 ordinary + 4+2 elites + 2+4 bosses (cross-role pool)', () => {
    expect(monsters).toHaveLength(51);
    const tiers = monsters.reduce<Record<string, number>>((acc, m) => {
      if (m.type !== 'monster') return acc;
      acc[m.tier] = (acc[m.tier] ?? 0) + 1;
      return acc;
    }, {});
    expect(tiers.fodder + tiers.specialist).toBe(39);
    expect(tiers.elite).toBe(6);
    expect(tiers.boss).toBe(6);
  });

  it('every ordinary/elite has exactly one melee or ranged attack; bosses are mixed', () => {
    for (const m of monsters) {
      if (m.type !== 'monster') continue;
      const attack = m.attack;
      if (m.tier === 'boss') {
        expect(attack.type).toBe('mixed');
        if (attack.type === 'mixed') {
          expect(attack.patterns.length).toBeGreaterThanOrEqual(2);
          expect(attack.patterns.some((p) => p.type === 'ranged')).toBe(true);
        }
        expect(m.levelScaling.damage).toBe(false);
        expect(m.levelScaling.health).toBe(true);
        expect(m.tierScale).toBe(5);
      } else {
        expect(['melee', 'ranged']).toContain(attack.type);
        expect(m.levelScaling.damage).toBe(true);
        expect(m.tierScale).toBe(m.tier === 'elite' ? 3 : 1);
        if (attack.type === 'melee') {
          expect(attack.damageModel).toBe('contactDps');
          expect(attack.contactDps).toBeGreaterThan(0);
          expect(attack.engagementProfileId).toBe('meleeEngagement.default');
        } else if (attack.type === 'ranged') {
          expect(attack.shotCount).toBe(1);
          expect(pack.has('projectiles', attack.projectileId)).toBe(true);
        }
      }
    }
  });

  it('binding elites and bosses are present with exact identities', () => {
    const eliteSlugs = ['alien-high-detail', 'cactoro-high-detail', 'fish-high-detail', 'ninja-high-detail'];
    const bossSlugs = ['demon-high-detail', 'yeti-high-detail'];
    for (const slug of eliteSlugs) {
      const def = pack.getEnemy(`enemy.quaternius.${slug}`);
      expect(def.type).toBe('monster');
      if (def.type === 'monster') {
        expect(def.tier).toBe('elite');
        expect(def.rewardClass).toBe('elite');
      }
    }
    for (const slug of bossSlugs) {
      const def = pack.getEnemy(`enemy.quaternius.${slug}`);
      expect(def.type).toBe('monster');
      if (def.type === 'monster') {
        expect(def.tier).toBe('boss');
        expect(def.rewardClass).toBe('boss');
      }
    }
  });

  it('all 45 resolve presentation/animation profiles with Idle/Walk/Attack/Death semantics', () => {
    for (const m of monsters) {
      if (m.type !== 'monster') continue;
      const presentation = ENEMY_ANIMATION_PRESENTATION_PROFILES[m.presentationProfileId];
      expect(presentation, m.presentationProfileId).toBeDefined();
      const animation = ENEMY_ANIMATION_ANIMATION_PROFILES[m.animationProfileId];
      expect(animation, m.animationProfileId).toBeDefined();
      for (const role of ['idle', 'walk', 'attackPrimary', 'death'] as const) {
        const clip = animation.clips[role] ?? animation.fallbacks?.[role];
        expect(clip, `${m.animationProfileId} ${role}`).toBeTruthy();
      }
    }
  });

  it('enemy projectiles are slow, positive, and registered', () => {
    const enemyProjectiles = pack.ids('projectiles')
      .map((id) => pack.getProjectile(id))
      .filter((p) => p.kind === 'enemy');
    expect(enemyProjectiles.length).toBeGreaterThanOrEqual(5);
    for (const p of enemyProjectiles) {
      expect(p.speed).toBeGreaterThanOrEqual(5);
      expect(p.speed).toBeLessThanOrEqual(12);
      expect(p.life).toBeGreaterThan(0);
      expect(p.hitRadius).toBeGreaterThan(0);
    }
  });

  it('production roster exists, preview roster is preserved, and preload ids resolve', () => {
    const production = pack.getEnemyArtRoster('enemyArtRoster.quaternius.mainStage');
    expect(production.commonPresentationProfileIds.length).toBe(15);
    expect(production.elitePresentationProfileIds.length).toBe(4);
    expect(production.bossPresentationProfileIds.length).toBe(2);
    const preview = pack.getEnemyArtRoster('enemyArtRoster.quaternius.integrationPreview');
    expect(preview.id).toBe('enemyArtRoster.quaternius.integrationPreview');
    const projectIds = new Set(PRESENTATION_ASSET_CATALOG.project.map((p) => p.id));
    for (const id of production.preloadAssetIds) {
      expect(projectIds.has(id), id).toBe(true);
    }
  });
});

describe('mode parity and normalization', () => {
  it('enemy difficulty is mode-independent; only XP multiplier differs', () => {
    expect(monsterHealthMultiplier(7, { levelIntervalSeconds: 15, minimumLevel: 1, maximumLevel: 13, healthMultiplierPerLevel: 1.2, damageMultiplierPerLevel: 1.18, bossPhaseLevel: 13 }))
      .toBe(monsterHealthMultiplier(7, { levelIntervalSeconds: 15, minimumLevel: 1, maximumLevel: 13, healthMultiplierPerLevel: 1.2, damageMultiplierPerLevel: 1.18, bossPhaseLevel: 13 }));
    expect(monsterDamageMultiplier(7, { levelIntervalSeconds: 15, minimumLevel: 1, maximumLevel: 13, healthMultiplierPerLevel: 1.2, damageMultiplierPerLevel: 1.18, bossPhaseLevel: 13 }))
      .toBe(monsterDamageMultiplier(7, { levelIntervalSeconds: 15, minimumLevel: 1, maximumLevel: 13, healthMultiplierPerLevel: 1.2, damageMultiplierPerLevel: 1.18, bossPhaseLevel: 13 }));
    expect(monsterXpReward(5, 'ambient', { classes: { ambient: { base: 1, perLevel: 1 }, wave: { base: 2, perLevel: 2 }, elite: { base: 40, perLevel: 8 }, boss: { base: 150, perLevel: 0 } } }, 2))
      .toBe(2 * monsterXpReward(5, 'ambient', { classes: { ambient: { base: 1, perLevel: 1 }, wave: { base: 2, perLevel: 2 }, elite: { base: 40, perLevel: 8 }, boss: { base: 150, perLevel: 0 } } }, 1));
  });

  it('normalizes ordinary tiers to 1.20/1.80/2.00 m and preserves elite/boss baselines', () => {
    expect(TARGET_HEIGHTS).toEqual({ small: 1.2, medium: 1.8, large: 2 });
    expect(TIER_SCALES).toEqual({ fodder: 1, specialist: 1, elite: 3, boss: 5 });
    const source = { width: 3, height: 3, depth: 2, groundOffset: 0.5 };
    const small = normalizedEnemyDimensions(source, 'small', 'fodder');
    expect(small.normalizedHeight).toBeCloseTo(1.2, 6);
    expect(small.collisionRadius).toBeCloseTo(0.45 * Math.max(small.normalizedWidth, small.normalizedDepth), 6);
    const boss = normalizedEnemyDimensions(source, 'large', 'boss');
    expect(boss.normalizedHeight).toBeCloseTo(1.7 * 5, 6);
  });
});
