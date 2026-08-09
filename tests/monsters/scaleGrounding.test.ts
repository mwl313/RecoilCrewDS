import { describe, expect, it } from 'vitest';
import {
  resolveMonsterDimensions,
  resolveMonsterDimensionsForDefId,
  LEGACY_TARGET_HEIGHTS,
  TARGET_HEIGHTS,
  TIER_SCALES,
} from '../../src/shared/monsters/monsterNormalization';
import { loadContentPackFromFilesystem } from '../../src/shared/content/contentLoader';

const pack = loadContentPackFromFilesystem('content');

describe('monster scale, collision, and grounding (readability V1)', () => {
  it('normalizes small ordinary to exactly 1.20 m', () => {
    const d = resolveMonsterDimensions('enemy.quaternius.ninja', 'small', 'fodder');
    expect(d.finalHeight).toBeCloseTo(TARGET_HEIGHTS.small, 4);
    expect(d.tierScale).toBe(1);
    expect(d.readabilityScale).toBeCloseTo(1.2 / 1.02, 8);
  });

  it('scales medium elite to ~4.59 m (1.53 × 3)', () => {
    const d = resolveMonsterDimensions('enemy.quaternius.alien-high-detail', 'medium', 'elite');
    expect(d.finalHeight).toBeCloseTo(LEGACY_TARGET_HEIGHTS.medium * TIER_SCALES.elite, 4);
    expect(d.finalHeight).toBeCloseTo(4.59, 2);
    expect(d.readabilityScale).toBe(1);
  });

  it('scales large boss to ~8.50 m (1.70 × 5)', () => {
    const d = resolveMonsterDimensions('enemy.quaternius.demon-high-detail', 'large', 'boss');
    expect(d.finalHeight).toBeCloseTo(LEGACY_TARGET_HEIGHTS.large * TIER_SCALES.boss, 4);
    expect(d.finalHeight).toBeCloseTo(8.5, 2);
    expect(d.readabilityScale).toBe(1);
  });

  it('orders colliders boss > elite > ordinary', () => {
    const ordinary = resolveMonsterDimensions('enemy.quaternius.ninja', 'small', 'fodder');
    const elite = resolveMonsterDimensions('enemy.quaternius.alien-high-detail', 'medium', 'elite');
    const boss = resolveMonsterDimensions('enemy.quaternius.demon-high-detail', 'large', 'boss');
    expect(boss.collisionRadius).toBeGreaterThan(elite.collisionRadius);
    expect(elite.collisionRadius).toBeGreaterThan(ordinary.collisionRadius);
    expect(boss.collisionHeight).toBeGreaterThan(elite.collisionHeight);
    expect(elite.collisionHeight).toBeGreaterThan(ordinary.collisionHeight);
  });

  it('preserves the neutral-pose foot offset (lowest point on the plane)', () => {
    for (const defId of [
      'enemy.quaternius.ninja',
      'enemy.quaternius.alien-high-detail',
      'enemy.quaternius.demon-high-detail',
      'enemy.quaternius.yeti-high-detail',
    ]) {
      const d = resolveMonsterDimensionsForDefId(defId);
      // Prepared hero GLBs author socket.shadow at the grounded root, so a
      // zero source offset is the expected import contract.
      expect(d.sourceGroundOffset).toBeGreaterThanOrEqual(0);
      // scaledGroundOffset = sourceGroundOffset × finalScale; placing the
      // visual root at terrain + groundOffset puts the lowest vertex at 0.
      expect(d.groundOffset).toBeCloseTo(d.sourceGroundOffset * d.finalScale, 6);
      const lowestPoint = d.groundOffset - d.sourceGroundOffset * d.finalScale;
      expect(lowestPoint).toBeGreaterThanOrEqual(0);
      expect(lowestPoint).toBeLessThanOrEqual(0.05);
      expect(d.finalScale).toBeCloseTo(d.normalizationScale * d.tierScale * d.variantScale, 6);
    }
  });

  it('every featured boss resolves a final scale with tier ×5', () => {
    const roster = pack.getEnemyGameplayRoster('enemyGameplayRoster.quaternius.mainStage');
    for (const identity of roster.featuredIdentities) {
      const d = resolveMonsterDimensionsForDefId(identity.bossEnemyId);
      expect(d.tierScale).toBe(5);
      expect(d.finalScale).toBeCloseTo(d.normalizationScale * 5, 6);
    }
  });

  it('exposes projectile sockets and spawn/engagement radii on the resolved record', () => {
    const d = resolveMonsterDimensionsForDefId('enemy.quaternius.wizard');
    expect(d.projectileSocketY).toBeGreaterThan(0);
    expect(d.projectileSocketY).toBeLessThan(d.finalHeight);
    expect(d.spawnClearanceRadius).toBeGreaterThan(d.collisionRadius);
    expect(d.engagementRadius).toBeGreaterThan(d.collisionRadius);
    expect(d.shadowRadius).toBeGreaterThan(d.collisionRadius);
  });
});
