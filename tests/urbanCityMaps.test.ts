import { describe, expect, it } from 'vitest';
import { resolveClientMapBundle, selectArenaSession } from '../src/shared/mapgen/arenaSession';
import { createUrbanLayout, urbanSurfaceHeightAt } from '../src/shared/mapgen/urbanLayout';
import { canTraverseGroundStep } from '../src/shared/mapgen/terrainTraversal';

const TILE = 8;

describe.each(['urban200', 'urban400'] as const)('%s authored city', (prototypeId) => {
  const layout = createUrbanLayout(prototypeId);

  it('uses a single building pack and the zombie kit only for roads/dressing', () => {
    expect(layout.buildings.length).toBeGreaterThan(0);
    expect(layout.buildings.every((b) => b.assetId?.startsWith('environment.urban.ultimate.'))).toBe(true);
    expect(layout.roads.every((r) => r.assetId.startsWith('environment.urban.zombie.'))).toBe(true);
    expect(layout.decorations.every((r) => r.assetId.startsWith('environment.urban.zombie.'))).toBe(true);
  });

  it('builds one connected road graph with real corners and junctions', () => {
    const byCell = new Map(layout.roads.map((r) => [`${r.x},${r.z}`, r]));
    const visited = new Set<string>();
    const queue = [byCell.keys().next().value as string];
    while (queue.length > 0) {
      const key = queue.shift()!;
      if (visited.has(key)) continue;
      visited.add(key);
      const [x, z] = key.split(',').map(Number);
      for (const neighbour of [`${x + TILE},${z}`, `${x - TILE},${z}`, `${x},${z + TILE}`, `${x},${z - TILE}`]) {
        if (byCell.has(neighbour) && !visited.has(neighbour)) queue.push(neighbour);
      }
    }
    expect(visited.size).toBe(layout.roads.length);
    expect(layout.roads.some((r) => r.assetId.endsWith('streetTurn'))).toBe(true);
    expect(layout.roads.some((r) => r.assetId.endsWith('streetT'))).toBe(true);
    expect(layout.roads.some((r) => r.assetId.endsWith('street4Way'))).toBe(true);
  });

  it('gives every building a matched drivable roof and gentle access ramp', () => {
    expect(layout.roofRamps).toHaveLength(layout.buildings.length);
    for (const building of layout.buildings) {
      expect(building.roofDriveable).toBe(true);
      expect(urbanSurfaceHeightAt(layout, building.x, building.z)).toBeCloseTo(building.h, 4);
      const ramp = layout.roofRamps.find((r) => r.urbanRoofBuildingId === building.id);
      expect(ramp).toBeDefined();
      expect(ramp!.rise / ramp!.d).toBeLessThanOrEqual(0.5);
      const baseX = ramp!.x - ramp!.dirX * ramp!.w / 2;
      const baseZ = ramp!.z - ramp!.dirZ * ramp!.d / 2;
      const topX = ramp!.x + ramp!.dirX * ramp!.w / 2;
      const topZ = ramp!.z + ramp!.dirZ * ramp!.d / 2;
      expect(urbanSurfaceHeightAt(layout, baseX, baseZ)).toBeCloseTo(0, 4);
      expect(urbanSurfaceHeightAt(layout, topX, topZ)).toBeCloseTo(building.h, 4);
    }
  });
});

describe.each([
  ['map.urban200Prototype', 200, 18, 148],
  ['map.urban400Prototype', 400, 72, 565],
] as const)('%s runtime integration', (mapId, size, buildingCount, roadCount) => {
  it('selects without fallback and exposes height-aware building collision', () => {
    const { bundle, fallbackBundle } = resolveClientMapBundle(mapId);
    const session = selectArenaSession({ roomCode: 'URBAN-QA', matchIndex: 0, bundle, fallbackBundle });
    expect(session.arena.fallbackUsed).toBe(false);
    expect([session.arena.widthMeters, session.arena.depthMeters]).toEqual([size, size]);
    expect(session.arena.urbanLayout?.roads).toHaveLength(roadCount);
    expect(session.world.obstacles).toHaveLength(buildingCount);
    expect(session.world.ramps).toHaveLength(buildingCount);

    const building = session.world.obstacles[0];
    const groundContact = session.world.resolveCircleContacts(building.x, building.z, 1, 0);
    const roofContact = session.world.resolveCircleContacts(building.x, building.z, 1, building.h);
    expect(groundContact.contacts.length).toBeGreaterThan(0);
    expect(roofContact.contacts).toHaveLength(0);
    expect(session.world.groundHeightAt(building.x, building.z)).toBeCloseTo(building.h, 4);
    const ramp = session.world.ramps[0];
    const baseX = ramp.x - ramp.dirX * ramp.w / 2;
    const baseZ = ramp.z - ramp.dirZ * ramp.d / 2;
    const rampStep = session.world.queryTerrainTransition!(
      baseX + ramp.dirX * 0.2,
      baseZ + ramp.dirZ * 0.2,
      baseX + ramp.dirX * 1.2,
      baseZ + ramp.dirZ * 1.2,
    );
    expect(rampStep && canTraverseGroundStep(rampStep)).toBe(true);
    const directWallStep = session.world.queryTerrainTransition!(
      building.x - building.w / 2 - 0.2,
      building.z,
      building.x - building.w / 2 + 0.2,
      building.z,
    );
    expect(directWallStep && canTraverseGroundStep(directWallStep)).toBe(false);
    expect(session.world.spawnPoints.every((spawn) =>
      !session.world.obstacles.some((b) =>
        Math.abs(spawn.x - b.x) < b.w / 2 && Math.abs(spawn.z - b.z) < b.d / 2,
      ),
    )).toBe(true);
  });
});
