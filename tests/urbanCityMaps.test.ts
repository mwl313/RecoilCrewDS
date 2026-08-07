import { describe, expect, it } from 'vitest';
import { resolveClientMapBundle, selectArenaSession } from '../src/shared/mapgen/arenaSession';
import { createUrbanLayout, urbanSurfaceHeightAt } from '../src/shared/mapgen/urbanLayout';
import { canTraverseGroundStep } from '../src/shared/mapgen/terrainTraversal';

const TILE = 8;

function roadDegree(cells: ReadonlySet<string>, x: number, z: number): number {
  return [
    `${x + TILE},${z}`,
    `${x - TILE},${z}`,
    `${x},${z + TILE}`,
    `${x},${z - TILE}`,
  ].filter((key) => cells.has(key)).length;
}

describe.each([
  ['urban200', 30, 6],
  ['urban400', 100, 20],
] as const)('%s authored city', (prototypeId, minimumBuildings, minimumVehicles) => {
  const layout = createUrbanLayout(prototypeId);

  it('keeps building art consistent while using non-character city dressing', () => {
    expect(layout.buildings.length).toBeGreaterThanOrEqual(minimumBuildings);
    expect(layout.solidProps.length).toBeGreaterThanOrEqual(minimumVehicles);
    expect(layout.buildings.every((b) => b.assetId?.startsWith('environment.urban.ultimate.'))).toBe(true);
    expect(layout.roads.every((r) => r.assetId.startsWith('environment.urban.zombie.'))).toBe(true);
    expect(layout.decorations.every((r) => r.assetId.startsWith('environment.urban.zombie.'))).toBe(true);
    expect(layout.solidProps.every((p) => p.assetId?.startsWith('environment.urban.zombie.vehicle'))).toBe(true);
  });

  it('builds one connected, irregular street graph with corners, junctions, and dead ends', () => {
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
    const cells = new Set(byCell.keys());
    const rowLengths = new Set<number>();
    const byRow = new Map<number, number>();
    for (const road of layout.roads) byRow.set(road.z, (byRow.get(road.z) ?? 0) + 1);
    for (const length of byRow.values()) rowLengths.add(length);

    expect(visited.size).toBe(layout.roads.length);
    expect(layout.roads.filter((r) => roadDegree(cells, r.x, r.z) === 1).length).toBeGreaterThanOrEqual(3);
    expect(rowLengths.size).toBeGreaterThanOrEqual(5);
    expect(layout.roads.some((r) => r.assetId.endsWith('streetTurn'))).toBe(true);
    expect(layout.roads.some((r) => r.assetId.endsWith('streetT'))).toBe(true);
    expect(layout.roads.some((r) => r.assetId.endsWith('street4Way'))).toBe(true);
  });

  it('creates a varied skyline with authoritative flat roof surfaces and no access ramps', () => {
    const heights = layout.buildings.map((b) => b.h);
    const buildingModels = new Set(layout.buildings.map((b) => b.assetId));
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(12);
    expect(buildingModels.size).toBeGreaterThanOrEqual(5);
    for (const building of layout.buildings) {
      expect(building.roofDriveable).toBe(true);
      expect(urbanSurfaceHeightAt(layout, building.x, building.z)).toBeCloseTo(building.h, 4);
    }
  });
});

describe.each([
  ['map.urban200Prototype', 200],
  ['map.urban400Prototype', 400],
] as const)('%s runtime integration', (mapId, size) => {
  it('selects without fallback and exposes height-aware building and prop collision', () => {
    const { bundle, fallbackBundle } = resolveClientMapBundle(mapId);
    const session = selectArenaSession({ roomCode: 'URBAN-QA', matchIndex: 0, bundle, fallbackBundle });
    const layout = session.arena.urbanLayout!;
    expect(session.arena.fallbackUsed).toBe(false);
    expect([session.arena.widthMeters, session.arena.depthMeters]).toEqual([size, size]);
    expect(session.world.obstacles).toHaveLength(layout.buildings.length + layout.solidProps.length);
    expect(session.world.ramps).toHaveLength(0);

    const building = session.world.obstacles.find((o) => o.type === 'urbanBuilding')!;
    const groundContact = session.world.resolveCircleContacts(building.x, building.z, 1, 0);
    const roofContact = session.world.resolveCircleContacts(building.x, building.z, 1, building.h);
    expect(groundContact.contacts.length).toBeGreaterThan(0);
    expect(roofContact.contacts).toHaveLength(0);
    expect(session.world.groundHeightAt(building.x, building.z)).toBeCloseTo(building.h, 4);

    const parkedVehicle = session.world.obstacles.find((o) => o.type === 'urbanProp')!;
    expect(session.world.resolveCircleContacts(parkedVehicle.x, parkedVehicle.z, 1, 0).contacts.length).toBeGreaterThan(0);

    const directWallStep = session.world.queryTerrainTransition!(
      building.x - building.w / 2 - 0.2,
      building.z,
      building.x - building.w / 2 + 0.2,
      building.z,
    );
    expect(directWallStep && canTraverseGroundStep(directWallStep)).toBe(false);
    expect(session.world.spawnPoints.every((spawn) =>
      !session.world.obstacles.some((obstacle) =>
        Math.abs(spawn.x - obstacle.x) < obstacle.w / 2 && Math.abs(spawn.z - obstacle.z) < obstacle.d / 2,
      ),
    )).toBe(true);
  });
});
