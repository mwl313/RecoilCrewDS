import { describe, expect, it } from 'vitest';
import { resolveEnemyWorldUiAnchorHeight } from '../../src/client/worldUi/enemyWorldUiLayer';
import { rayVerticalBodyHitDistance } from '../../src/shared/enemies/enemyCollisionGeometry';
import { enforceSpawnClearance } from '../../src/shared/horde/spawnPlanner';
import { resolveMonsterEngagementGeometry } from '../../src/shared/monsters/engagementGeometry';
import {
  LEGACY_TARGET_HEIGHTS,
  resolveMonsterDimensionsForDefId,
  TARGET_HEIGHTS,
  TIER_SCALES,
} from '../../src/shared/monsters/monsterNormalization';
import type { EnemyState } from '../../src/shared/types';

const representatives = [
  ['enemy.quaternius.ninja', 'small', 1.2],
  ['enemy.quaternius.tribal', 'medium', 1.8],
  ['enemy.quaternius.dino', 'large', 2],
] as const;

function enemy(defId: string): EnemyState {
  return {
    id: 1, type: 'monster', defId, x: 3, y: 2, z: 4, yaw: 0,
    hp: 10, maxHp: 10, state: 'hunt', stateT: 0, aimYaw: 0, speed: 0,
    alive: true, telegraph: 0, flash: 0, spawnT: 0,
  };
}

describe('enemy readability physical scale V1', () => {
  it('uses exact ordinary targets for small, medium, and large definitions', () => {
    expect(TARGET_HEIGHTS).toEqual({ small: 1.2, medium: 1.8, large: 2 });
    for (const [defId, sizeClass, target] of representatives) {
      const dimensions = resolveMonsterDimensionsForDefId(defId);
      expect(dimensions.finalHeight, `${defId} (${sizeClass})`).toBeCloseTo(target, 8);
      expect(dimensions.targetBaseHeight).toBe(target);
      expect(dimensions.tierScale).toBe(1);
    }
  });

  it('preserves elite and boss final dimensions from the legacy baselines', () => {
    const elite = resolveMonsterDimensionsForDefId('enemy.quaternius.alien-high-detail');
    const boss = resolveMonsterDimensionsForDefId('enemy.quaternius.demon-high-detail');
    expect(elite.finalHeight).toBeCloseTo(LEGACY_TARGET_HEIGHTS.medium * TIER_SCALES.elite, 8);
    expect(elite.finalHeight).toBeCloseTo(4.59, 8);
    expect(boss.finalHeight).toBeCloseTo(LEGACY_TARGET_HEIGHTS.large * TIER_SCALES.boss, 8);
    expect(boss.finalHeight).toBeCloseTo(8.5, 8);
    expect(elite.readabilityScale).toBe(1);
    expect(boss.readabilityScale).toBe(1);
  });

  it('derives width, depth, hitbox, clearance, engagement, shadow, and socket from finalScale', () => {
    for (const [defId] of representatives) {
      const dimensions = resolveMonsterDimensionsForDefId(defId);
      expect(dimensions.finalWidth).toBeCloseTo(dimensions.sourceWidth * dimensions.finalScale, 8);
      expect(dimensions.finalDepth).toBeCloseTo(dimensions.sourceDepth * dimensions.finalScale, 8);
      expect(dimensions.collisionRadius).toBeCloseTo(
        Math.max(dimensions.finalWidth, dimensions.finalDepth) * 0.45,
        8,
      );
      expect(dimensions.collisionHeight).toBeCloseTo(dimensions.finalHeight * 0.9, 8);
      expect(dimensions.spawnClearanceRadius).toBeCloseTo(dimensions.collisionRadius * 1.25, 8);
      expect(dimensions.engagementRadius).toBeCloseTo(dimensions.collisionRadius * 2, 8);
      expect(dimensions.projectileSocketY).toBeCloseTo(dimensions.projectileSocket[1], 8);
      expect(dimensions.projectileSocketY / dimensions.finalScale).toBeGreaterThan(0);
      expect(dimensions.shadowRadius).toBeCloseTo(
        Math.max(dimensions.collisionRadius * 1.5, dimensions.finalHeight * 0.35),
        8,
      );
    }
  });

  it('uses collision height and exact physical radius for ray hits', () => {
    const dimensions = resolveMonsterDimensionsForDefId('enemy.quaternius.ninja');
    const body = { x: 5, groundY: 0, z: 0, radius: dimensions.collisionRadius, height: dimensions.collisionHeight };
    const edgeHit = rayVerticalBodyHitDistance(
      { x: 0, y: dimensions.collisionHeight * 0.5, z: dimensions.collisionRadius - 0.001 },
      { x: 1, y: 0, z: 0 },
      body,
      20,
    );
    const outside = rayVerticalBodyHitDistance(
      { x: 0, y: dimensions.collisionHeight + 0.001, z: 0 },
      { x: 1, y: 0, z: 0 },
      body,
      20,
    );
    expect(edgeHit).not.toBeNull();
    expect(outside).toBeNull();
  });

  it('drives world UI and melee engagement from the same resolved body', () => {
    const state = enemy('enemy.quaternius.tribal');
    const dimensions = resolveMonsterDimensionsForDefId(state.defId!);
    expect(resolveEnemyWorldUiAnchorHeight(state)).toBeCloseTo(dimensions.finalHeight + 0.28, 8);
    const melee = resolveMonsterEngagementGeometry({
      enemyRadius: dimensions.collisionRadius,
      tankRadius: 1.35,
      authoredAttackReach: 0.8,
    });
    expect(melee.enemyRadius).toBe(dimensions.collisionRadius);
    expect(melee.effectiveAttackDistance).toBeCloseTo(dimensions.collisionRadius + 1.35 + 0.8, 8);
  });

  it('enforces pairwise spawn clearance using resolved radii', () => {
    const radii = representatives.map(([defId]) => resolveMonsterDimensionsForDefId(defId).spawnClearanceRadius);
    const positions = enforceSpawnClearance(
      [{ x: 0, z: 0 }, { x: 0.1, z: 0 }, { x: 0.2, z: 0 }],
      radii,
    );
    for (let i = 0; i < positions.length; i++) {
      for (let j = 0; j < i; j++) {
        expect(Math.hypot(positions[i].x - positions[j].x, positions[i].z - positions[j].z))
          .toBeGreaterThanOrEqual(radii[i] + radii[j] - 1e-6);
      }
    }
  });
});
