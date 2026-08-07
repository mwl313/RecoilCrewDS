import { describe, expect, it } from 'vitest';
import { createUrbanLayout } from '../src/shared/mapgen/urbanLayout';
import type { ArenaWorld } from '../src/shared/sim/arenaWorld';
import { buildVisualWorldApronPlan } from '../src/client/environment/visualWorldApron';
import { chassisYawToMiniMapRotation, worldToMiniMap } from '../src/client/tactical/miniMapRenderer';
import { presentLevelUpgradeSummary } from '../src/client/tactical/statPresentation';

describe('tactical presentation', () => {
  it('maps chassis yaw to the north-up player marker without camera or turret input', () => {
    expect(chassisYawToMiniMapRotation(0)).toBeCloseTo(Math.PI);
    expect(chassisYawToMiniMapRotation(Math.PI / 2)).toBeCloseTo(Math.PI / 2);
    expect(worldToMiniMap(-100, -100, { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }, 300)).toEqual({ x: 0, y: 0 });
    expect(worldToMiniMap(100, 100, { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }, 300)).toEqual({ x: 300, y: 300 });
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
