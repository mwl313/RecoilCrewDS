import { describe, expect, it } from 'vitest';
import { BASE_CONFIG, buildMatchConfig } from '../src/shared/config';
import { resolveClientMapBundle, selectArenaSession } from '../src/shared/mapgen/arenaSession';
import {
  createUrbanLayout,
  urbanSurfaceHeightAt,
  urbanVehicleRampHeightAt,
} from '../src/shared/mapgen/urbanLayout';
import { canTraverseGroundStep } from '../src/shared/mapgen/terrainTraversal';
import { stepTankKinematics, type TankKinematicState } from '../src/shared/sim/tankKinematics';

const TILE = 8;
const VEHICLE_MODEL_BOUNDS = {
  'environment.urban.zombie.vehiclePickup': { length: 5.18, width: 2.312, height: 1.843 },
  'environment.urban.zombie.vehicleSports': { length: 5.655, width: 2.671, height: 1.853 },
  'environment.urban.zombie.vehicleTruck': { length: 5.256, width: 2.709, height: 2.885 },
} as const;

function roadDegree(cells: ReadonlySet<string>, x: number, z: number): number {
  return [
    `${x + TILE},${z}`,
    `${x - TILE},${z}`,
    `${x},${z + TILE}`,
    `${x},${z - TILE}`,
  ].filter((key) => cells.has(key)).length;
}

describe.each([
  ['urban200', 70, 6, 14],
  ['urban400', 250, 20, 45],
] as const)('%s authored city', (prototypeId, minimumBuildings, minimumVehicles, minimumTrees) => {
  const layout = createUrbanLayout(prototypeId);

  it('keeps building art consistent while using non-character city dressing', () => {
    expect(layout.buildings.length).toBeGreaterThanOrEqual(minimumBuildings);
    expect(layout.solidProps.length).toBeGreaterThanOrEqual(minimumVehicles);
    expect(layout.buildings.every((b) => b.assetId?.startsWith('environment.urban.ultimate.'))).toBe(true);
    expect(layout.roads.every((r) => r.assetId.startsWith('environment.urban.zombie.'))).toBe(true);
    expect(layout.decorations.every((r) =>
      r.assetId.startsWith('environment.urban.zombie.') || r.assetId.startsWith('environment.urban.nature.commonTree'),
    )).toBe(true);
    expect(layout.solidProps.every((p) => p.assetId?.startsWith('environment.urban.zombie.vehicle'))).toBe(true);
  });

  it('uses one coherent tree family as collision-free decoration in clear lots and verges', () => {
    const trees = layout.decorations.filter((d) => d.id.startsWith('urban.tree.'));
    expect(trees.length).toBeGreaterThanOrEqual(minimumTrees);
    expect(new Set(trees.map((tree) => tree.assetId)).size).toBeLessThanOrEqual(3);
    expect(trees.every((tree) => tree.assetId.startsWith('environment.urban.nature.commonTree'))).toBe(true);
    expect(trees.every((tree) => layout.roads.every((road) =>
      Math.abs(tree.x - road.x) >= TILE / 2 + 2 || Math.abs(tree.z - road.z) >= TILE / 2 + 2,
    ))).toBe(true);
    expect(trees.every((tree) => layout.buildings.every((building) =>
      Math.abs(tree.x - building.x) >= building.w / 2 + 2 || Math.abs(tree.z - building.z) >= building.d / 2 + 2,
    ))).toBe(true);
    expect(layout.solidProps.every((prop) => !prop.id.startsWith('urban.tree.'))).toBe(true);
  });

  it('matches every parked-vehicle surface to the measured source-model bounds', () => {
    for (const vehicle of layout.solidProps) {
      const expected = VEHICLE_MODEL_BOUNDS[vehicle.assetId as keyof typeof VEHICLE_MODEL_BOUNDS];
      expect(expected).toBeDefined();
      if (!expected) throw new Error(`missing measured bounds for ${vehicle.assetId}`);
      const swapsAxes = Math.abs(Math.sin(vehicle.yaw ?? 0)) > Math.abs(Math.cos(vehicle.yaw ?? 0));
      expect(vehicle.w).toBeCloseTo(swapsAxes ? expected.length : expected.width, 5);
      expect(vehicle.d).toBeCloseTo(swapsAxes ? expected.width : expected.length, 5);
      expect(vehicle.h).toBeCloseTo(expected.height, 5);
      expect(vehicle.driveableSurface).toBe('bidirectionalVehicleRamp');
    }
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
  it('selects without fallback and exposes height-aware building and vehicle surfaces', () => {
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
    expect(parkedVehicle.driveableSurface).toBe('bidirectionalVehicleRamp');
    const yaw = parkedVehicle.yaw ?? 0;
    const longitudinal = { x: Math.sin(yaw), z: Math.cos(yaw) };
    const lateral = { x: Math.cos(yaw), z: -Math.sin(yaw) };
    const swapsAxes = Math.abs(Math.sin(yaw)) > Math.abs(Math.cos(yaw));
    const length = swapsAxes ? parkedVehicle.w : parkedVehicle.d;
    const width = swapsAxes ? parkedVehicle.d : parkedVehicle.w;
    const point = (along: number, across: number) => ({
      x: parkedVehicle.x + longitudinal.x * along + lateral.x * across,
      z: parkedVehicle.z + longitudinal.z * along + lateral.z * across,
    });
    const frontEdge = point(length / 2, 0);
    const frontSlope = point(length * 0.25, 0);
    const rearSlope = point(-length * 0.25, 0);
    const frontOutside = point(length / 2 + 0.2, 0);
    const frontInside = point(length / 2 - 0.2, 0);
    const rearOutside = point(-length / 2 - 0.2, 0);
    const rearInside = point(-length / 2 + 0.2, 0);
    const sideOutside = point(0, width / 2 + 0.2);
    const sideInside = point(0, width / 2 - 0.2);
    const sideEdgeInside = point(0, width / 2 - 0.01);
    const sideEdgeOutside = point(0, width / 2 + 0.01);

    expect(urbanVehicleRampHeightAt(parkedVehicle, frontEdge.x, frontEdge.z)).toBeCloseTo(0, 5);
    expect(urbanVehicleRampHeightAt(parkedVehicle, frontSlope.x, frontSlope.z)).toBeCloseTo(
      urbanVehicleRampHeightAt(parkedVehicle, rearSlope.x, rearSlope.z)!,
      5,
    );
    expect(session.world.groundHeightAt(parkedVehicle.x, parkedVehicle.z)).toBeCloseTo(parkedVehicle.h, 5);
    expect(session.world.groundHeightAt(sideEdgeInside.x, sideEdgeInside.z)).toBeCloseTo(parkedVehicle.h, 5);
    expect(session.world.groundHeightAt(sideEdgeOutside.x, sideEdgeOutside.z)).toBe(0);

    expect(session.world.resolveCircleContacts(frontOutside.x, frontOutside.z, 0.5, 0).contacts).toHaveLength(0);
    expect(session.world.resolveCircleContacts(sideOutside.x, sideOutside.z, 0.5, 0).contacts.length).toBeGreaterThan(0);
    expect(session.world.resolveCircleContacts(parkedVehicle.x, parkedVehicle.z, 0.5, parkedVehicle.h).contacts).toHaveLength(0);
    expect(canTraverseGroundStep(session.world.queryTerrainTransition!(frontOutside.x, frontOutside.z, frontInside.x, frontInside.z)!)).toBe(true);
    expect(canTraverseGroundStep(session.world.queryTerrainTransition!(rearOutside.x, rearOutside.z, rearInside.x, rearInside.z)!)).toBe(true);
    expect(canTraverseGroundStep(session.world.queryTerrainTransition!(sideOutside.x, sideOutside.z, sideInside.x, sideInside.z)!)).toBe(false);

    const driveAcross = (direction: -1 | 1) => {
      const start = point(-direction * (length / 2 + 2.5), 0);
      const dirX = longitudinal.x * direction;
      const dirZ = longitudinal.z * direction;
      const tank: TankKinematicState = {
        x: start.x,
        y: 0,
        z: start.z,
        vx: 0,
        vy: 0,
        vz: 0,
        yaw: Math.atan2(dirX, dirZ),
        yawVel: 0,
        pitch: 0,
        roll: 0,
        grounded: true,
        dashCooldown: 0,
        dashPresentationT: 0,
        dashDamageT: 0,
        drift: false,
        landingGripT: 0,
      };
      let maxHeight = 0;
      let crossedCenter = false;
      for (let tick = 0; tick < 150; tick++) {
        stepTankKinematics(
          tank,
          { throttle: 1, steer: 0, dashPressed: false, jumpPressed: false },
          BASE_CONFIG,
          buildMatchConfig('none'),
          1 / 60,
          undefined,
          session.world,
        );
        maxHeight = Math.max(maxHeight, tank.y);
        const along = (tank.x - parkedVehicle.x) * longitudinal.x + (tank.z - parkedVehicle.z) * longitudinal.z;
        if (along * direction > 0.25) crossedCenter = true;
      }
      expect(crossedCenter).toBe(true);
      expect(maxHeight).toBeGreaterThan(parkedVehicle.h * 0.65);
    };
    driveAcross(1);
    driveAcross(-1);

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
