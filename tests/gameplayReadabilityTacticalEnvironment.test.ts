import { describe, expect, it } from 'vitest';
import { createUrbanLayout } from '../src/shared/mapgen/urbanLayout';
import type { ArenaWorld } from '../src/shared/sim/arenaWorld';
import type { EnemyState } from '../src/shared/types';
import { buildVisualWorldApronPlan } from '../src/client/environment/visualWorldApron';
import {
  chassisYawToMiniMapRotation,
  MINI_MAP_PLAYER_MARKER_STYLE,
  miniMapEnemyMarkerStyle,
  miniMapEnemyThreatClass,
  miniMapSectorRadius,
  miniMapSectorShowsCount,
  worldToMiniMap,
} from '../src/client/tactical/miniMapRenderer';
import { presentLevelUpgradeSummary } from '../src/client/tactical/statPresentation';

describe('tactical presentation', () => {
  it('maps chassis yaw to the north-up player marker without camera or turret input', () => {
    expect(chassisYawToMiniMapRotation(0)).toBeCloseTo(Math.PI);
    expect(chassisYawToMiniMapRotation(Math.PI / 2)).toBeCloseTo(Math.PI / 2);
    expect(worldToMiniMap(-100, -100, { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }, 300)).toEqual({ x: 0, y: 0 });
    expect(worldToMiniMap(100, 100, { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }, 300)).toEqual({ x: 300, y: 300 });
    expect(MINI_MAP_PLAYER_MARKER_STYLE).toMatchObject({
      fill: '#59e391', tipY: -10.5, halfWidth: 7.5, baseY: 8, notchY: 5.25,
    });
  });

  it('groups and humanizes only replicated level-up contributions', () => {
    const rows = presentLevelUpgradeSummary([
      { statId: 'weapon.cannonDamage', additiveTotal: 40, multiplierProduct: 1, effectCount: 2 },
      { statId: 'tank.forwardSpeed', additiveTotal: 0, multiplierProduct: 1.32, effectCount: 2 },
      { statId: 'tank.maxIntegrity', additiveTotal: 20, multiplierProduct: 1, effectCount: 1 },
      { statId: 'weapon.mgSpread', additiveTotal: 0, multiplierProduct: .82, effectCount: 1 },
    ]);
    expect(rows.map((row) => row.group)).toEqual(['CREW', 'DRIVER', 'GUNNER', 'GUNNER']);
    expect(rows.find((row) => row.statId === 'weapon.cannonDamage')?.primary).toBe('+400');
    expect(rows.find((row) => row.statId === 'tank.maxIntegrity')?.primary).toBe('+200');
    expect(rows.find((row) => row.statId === 'tank.forwardSpeed')?.primary).toBe('×1.32');
    expect(rows.find((row) => row.statId === 'weapon.mgSpread')?.secondary).toBe('18% TIGHTER');
    expect(rows.some((row) => row.label.includes('.'))).toBe(false);
  });

  it('classifies minimap threats semantically with a distinct marker hierarchy', () => {
    const enemy = (rewardClass: 'ambient' | 'wave' | 'elite' | 'boss') => ({
      id: 7,
      monster: { rewardClass },
      ownership: { populationClass: 'ambient', priority: 2 },
    }) as unknown as EnemyState;
    const ordinary = enemy('ambient');
    const elite = enemy('elite');
    const boss = enemy('boss');

    expect(miniMapEnemyThreatClass(ordinary)).toBe('ordinary');
    expect(miniMapEnemyThreatClass(elite)).toBe('elite');
    expect(miniMapEnemyThreatClass(boss)).toBe('boss');
    expect(miniMapEnemyMarkerStyle(ordinary)).toMatchObject({ shape: 'circle', fill: '#d55347', stroke: '#2a0e0c', halfSize: 2.5, ringRadius: null });
    expect(miniMapEnemyMarkerStyle(elite)).toMatchObject({ shape: 'diamond', fill: '#b56cff', halfSize: 6, ringRadius: null });
    expect(miniMapEnemyMarkerStyle(boss)).toMatchObject({ shape: 'hex', fill: '#ff304d', halfSize: 9, ringRadius: 12 });
  });

  it('treats a semantic wave leader as elite without relying on priority', () => {
    const leader = {
      id: 19,
      ownership: {
        populationClass: 'wave', waveId: 2, leaderId: 19, packInstanceId: 1,
        spawnAnchorId: null, purgeOnLeaderDeath: true, priority: 0,
      },
    } as unknown as EnemyState;
    expect(miniMapEnemyThreatClass(leader)).toBe('elite');
  });

  it('uses a clamped square-root sector scale and only labels large aggregates', () => {
    expect(miniMapSectorRadius(1)).toBe(9);
    expect(miniMapSectorRadius(4)).toBe(9.5);
    expect(miniMapSectorRadius(1000)).toBe(16);
    expect(miniMapSectorShowsCount(8)).toBe(false);
    expect(miniMapSectorShowsCount(9)).toBe(true);
  });
});

describe('presentation-only visual world apron', () => {
  it('is deterministic, bounded, and wholly outside authoritative play bounds', () => {
    const layout = createUrbanLayout('urban200');
    const world = {
      half: 100,
      bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
      metadata: { arenaChecksum: 42017 },
      arena: { candidateSeed: 92, urbanLayout: layout },
    } as unknown as ArenaWorld;
    const first = buildVisualWorldApronPlan(world)!;
    const second = buildVisualWorldApronPlan(world)!;
    expect(first).toEqual(second);
    expect({ high: first.highCount, medium: first.mediumCount, low: first.lowCount }).toEqual({
      high: 228,
      medium: 151,
      low: 26,
    });
    expect(first.placements.every((entry) =>
      entry.x < -100 || entry.x > 100 || entry.z < -100 || entry.z > 100,
    )).toBe(true);
    expect((world as unknown as { obstacles?: unknown[] }).obstacles).toBeUndefined();
  });

  it('stays disabled for non-urban arenas', () => {
    const world = { half: 40, arena: undefined, metadata: null } as unknown as ArenaWorld;
    expect(buildVisualWorldApronPlan(world)).toBeNull();
  });
});
