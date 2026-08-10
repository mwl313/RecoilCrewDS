import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { AssetService } from '../../src/client/assets';
import {
  ARENA_BOUNDARY_ASSET_ID,
  ARENA_BOUNDARY_OVERLAP_RATIO,
  ArenaBoundaryBarricades,
  buildArenaBoundaryPlan,
  measureArenaBoundaryAsset,
  type ArenaBoundaryAssetMetrics,
  type ArenaBoundarySide,
} from '../../src/client/environment/arenaBoundaryBarricades';
import { GAMEPLAY_APRON_DIAGNOSTICS } from '../../src/client/app/renderWorld';
import { loadContentPackFromFilesystem } from '../../src/shared/content/contentLoader';
import { buildSpawnAnchors } from '../../src/shared/horde/spawnAnchors';
import { PRESSURE_SPAWN_BOUNDARY_INSET } from '../../src/shared/horde/spawnPlanner';
import { selectArenaSession } from '../../src/shared/mapgen/arenaSession';
import { resolveMapBundle } from '../../src/shared/mapgen/profiles';
import {
  ARENA_ACTOR_BOUNDARY_INSET,
  pointInsideArenaBounds,
  type ArenaBounds,
} from '../../src/shared/sim/arenaBounds';
import type { ArenaWorld } from '../../src/shared/sim/arenaWorld';
import { Match } from '../../src/shared/sim/match';
import { applyStableBoundary } from '../../src/shared/sim/tankKinematics';

const SIDES: ArenaBoundarySide[] = ['north', 'east', 'south', 'west'];

function barrierModel(longAxis: 'x' | 'z' = 'x'): THREE.Group {
  const root = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: 0xb3863a, roughness: .38, metalness: .25 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x23282e, roughness: .8 });
  const dimensions: [number, number, number] = longAxis === 'x' ? [2, .9, .32] : [.32, .9, 2];
  const main = new THREE.Mesh(new THREE.BoxGeometry(...dimensions), paint);
  main.position.y = .45;
  root.add(main);
  for (const along of [-.7, .7]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(.3, 1, .3), dark);
    if (longAxis === 'x') post.position.set(along, .5, 0);
    else post.position.set(0, .5, along);
    root.add(post);
  }
  return root;
}

function fakeAssets(longAxis: 'x' | 'z' = 'x'): AssetService {
  return { model: (id: string) => {
    if (id !== ARENA_BOUNDARY_ASSET_ID) throw new Error(`unexpected asset ${id}`);
    return barrierModel(longAxis);
  } } as unknown as AssetService;
}

function fakeWorld(
  bounds: ArenaBounds,
  groundHeightAt: (x: number, z: number) => number = () => 0,
): ArenaWorld {
  return {
    half: Math.min(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 2,
    bounds,
    groundHeightAt,
  } as ArenaWorld;
}

function sidePlacements(
  plan: ReturnType<typeof buildArenaBoundaryPlan>,
  side: ArenaBoundarySide,
) {
  return plan.placements.filter((placement) => placement.side === side);
}

function expectRunCovered(
  centers: number[],
  min: number,
  max: number,
  segmentLength: number,
): void {
  const sorted = [...centers].sort((a, b) => a - b);
  expect(sorted[0] - segmentLength / 2).toBeLessThanOrEqual(min);
  expect(sorted.at(-1)! + segmentLength / 2).toBeGreaterThanOrEqual(max);
  for (let i = 1; i < sorted.length; i++) {
    expect(sorted[i] - sorted[i - 1]).toBeLessThanOrEqual(
      segmentLength * (1 - ARENA_BOUNDARY_OVERLAP_RATIO) + 1e-9,
    );
  }
}

describe('arena boundary asset measurement and plan', () => {
  it('measures the source AABB once and derives its horizontal long axis', () => {
    const metrics = measureArenaBoundaryAsset(barrierModel());
    expect(metrics.longAxis).toBe('x');
    expect(metrics.segmentLength).toBeCloseTo(2, 8);
    expect(metrics.thickness).toBeCloseTo(.32, 7);
    expect(metrics.height).toBeCloseTo(1, 8);
    expect(metrics.bounds.minX).toBeCloseTo(-1, 8);
    expect(metrics.bounds.maxX).toBeCloseTo(1, 8);
    expect(metrics.bounds.minY).toBeCloseTo(0, 8);
    expect(metrics.bounds.maxY).toBeCloseTo(1, 8);
    expect(metrics.bounds.minZ).toBeCloseTo(-.16, 7);
    expect(metrics.bounds.maxZ).toBeCloseTo(.16, 7);
  });

  it('builds four complete, overlapping runs for the 400×400 primary map', () => {
    const bounds = { minX: -200, maxX: 200, minZ: -200, maxZ: 200 };
    const metrics = measureArenaBoundaryAsset(barrierModel());
    const plan = buildArenaBoundaryPlan(fakeWorld(bounds), metrics);
    expect(plan.bounds).toEqual(bounds);
    expect(plan.sideCounts).toEqual({ north: 217, east: 217, south: 217, west: 217 });
    expect(plan.placements).toHaveLength(868);
    expect(new Set(plan.placements.map((placement) => placement.side))).toEqual(new Set(SIDES));
    expectRunCovered(sidePlacements(plan, 'north').map((placement) => placement.x), -200, 200, 2);
    expectRunCovered(sidePlacements(plan, 'south').map((placement) => placement.x), -200, 200, 2);
    expectRunCovered(sidePlacements(plan, 'east').map((placement) => placement.z), -200, 200, 2);
    expectRunCovered(sidePlacements(plan, 'west').map((placement) => placement.z), -200, 200, 2);

    const north = sidePlacements(plan, 'north')[0];
    const south = sidePlacements(plan, 'south')[0];
    const west = sidePlacements(plan, 'west')[0];
    const east = sidePlacements(plan, 'east')[0];
    expect(north.z + metrics.thickness / 2).toBeCloseTo(bounds.minZ + ARENA_ACTOR_BOUNDARY_INSET);
    expect(south.z - metrics.thickness / 2).toBeCloseTo(bounds.maxZ - ARENA_ACTOR_BOUNDARY_INSET);
    expect(west.x + metrics.thickness / 2).toBeCloseTo(bounds.minX + ARENA_ACTOR_BOUNDARY_INSET);
    expect(east.x - metrics.thickness / 2).toBeCloseTo(bounds.maxX - ARENA_ACTOR_BOUNDARY_INSET);
  });

  it('derives offset rectangular bounds and handles a Z-long source model', () => {
    const bounds = { minX: 10, maxX: 310, minZ: -50, maxZ: 550 };
    const metrics = measureArenaBoundaryAsset(barrierModel('z'));
    const plan = buildArenaBoundaryPlan(fakeWorld(bounds), metrics);
    expect(metrics.longAxis).toBe('z');
    expect(plan.bounds).toEqual(bounds);
    expect(plan.sideCounts).toEqual({ north: 163, east: 325, south: 163, west: 325 });
    expect(sidePlacements(plan, 'north')[0].assetYaw).toBeCloseTo(Math.PI / 2);
    expect(sidePlacements(plan, 'east')[0].assetYaw).toBe(0);
    expect(plan.placements.some((placement) => Math.abs(placement.x) === 200)).toBe(false);
  });

  it('samples each final segment center and records exact stepped terrain height', () => {
    const bounds = { minX: -40, maxX: 40, minZ: -40, maxZ: 40 };
    const ground = (x: number, z: number) => 3 + x * .01 - z * .02;
    const plan = buildArenaBoundaryPlan(
      fakeWorld(bounds, ground),
      measureArenaBoundaryAsset(barrierModel()),
    );
    for (const placement of plan.placements) {
      expect(placement.groundY).toBeCloseTo(ground(placement.x, placement.z), 10);
    }
  });
});

describe('arena boundary instanced renderer lifecycle', () => {
  it('uses one batch per source mesh plus one seam footing draw for all 868 segments', () => {
    const scene = new THREE.Scene();
    const boundary = new ArenaBoundaryBarricades(
      scene,
      fakeAssets(),
      fakeWorld({ minX: -200, maxX: 200, minZ: -200, maxZ: 200 }, (x, z) => x * .001 + z * .002),
    );
    const diagnostics = boundary.diagnostics();
    expect(diagnostics).toMatchObject({
      enabled: true,
      assetId: 'prop.barrier',
      segmentCount: 868,
      instanceBatches: 3,
      drawCalls: 4,
      footingEnabled: true,
      castsShadows: false,
    });
    const batches = boundary.group.children.filter((child): child is THREE.InstancedMesh =>
      (child as THREE.InstancedMesh).isInstancedMesh,
    );
    expect(batches).toHaveLength(4);
    expect(batches.every((batch) => batch.count === 868)).toBe(true);

    const firstAssetBatch = batches.find((batch) => batch.name.endsWith('AssetBatch'))!;
    firstAssetBatch.geometry.computeBoundingBox();
    const matrix = new THREE.Matrix4();
    firstAssetBatch.getMatrixAt(0, matrix);
    const firstBounds = firstAssetBatch.geometry.boundingBox!.clone().applyMatrix4(matrix);
    expect(firstBounds.min.y).toBeCloseTo(boundary.plan.placements[0].groundY, 6);
  });

  it('disposes cleanly and can rebuild for a different map without stale batches', () => {
    const scene = new THREE.Scene();
    const primary = new ArenaBoundaryBarricades(
      scene,
      fakeAssets(),
      fakeWorld({ minX: -200, maxX: 200, minZ: -200, maxZ: 200 }),
    );
    primary.dispose(scene);
    primary.dispose(scene);
    expect(scene.getObjectByName('ArenaBoundaryBarricades')).toBeUndefined();
    expect(primary.diagnostics().enabled).toBe(false);

    const fallback = new ArenaBoundaryBarricades(
      scene,
      fakeAssets(),
      fakeWorld({ minX: -40, maxX: 40, minZ: -40, maxZ: 40 }),
    );
    expect(fallback.diagnostics().segmentCount).toBe(176);
    expect(scene.getObjectByName('ArenaBoundaryBarricades')).toBe(fallback.group);
    fallback.dispose(scene);
  });
});

describe('gameplay boundary authority and spawn parity', () => {
  it('keeps the gameplay apron permanently disabled even through compatibility toggles', () => {
    expect(GAMEPLAY_APRON_DIAGNOSTICS).toEqual({
      enabled: false,
      quality: 'disabled',
      instances: 0,
      drawCalls: 0,
      castsShadows: false,
    });
  });

  it('clamps actor centers on the same planes used by the barrier inside faces', () => {
    const bounds = { minX: -200, maxX: 200, minZ: -200, maxZ: 200 };
    const probes = [
      { x: -220, z: 0, vx: -9, vz: 3, expectedX: -199.5, expectedZ: 0 },
      { x: 220, z: 0, vx: 9, vz: -3, expectedX: 199.5, expectedZ: 0 },
      { x: 0, z: -220, vx: 4, vz: -9, expectedX: 0, expectedZ: -199.5 },
      { x: 0, z: 220, vx: -4, vz: 9, expectedX: 0, expectedZ: 199.5 },
    ];
    for (const probe of probes) {
      const actor = { x: probe.x, z: probe.z, vx: probe.vx, vz: probe.vz };
      applyStableBoundary(actor, bounds);
      expect(actor.x).toBe(probe.expectedX);
      expect(actor.z).toBe(probe.expectedZ);
      expect(pointInsideArenaBounds(actor.x, actor.z, bounds, ARENA_ACTOR_BOUNDARY_INSET)).toBe(true);
    }
  });

  it('keeps primary spawns, recovery, anchors, and pressure formations inside authority', () => {
    const pack = loadContentPackFromFilesystem('content');
    const bundle = resolveMapBundle(pack, 'map.arena400Primary');
    const fallbackBundle = resolveMapBundle(pack, bundle.map.fallbackMapId!);
    const session = selectArenaSession({
      roomCode: 'BOUNDARY', matchIndex: 0, bundle, fallbackBundle,
    });
    const bounds = session.world.bounds!;
    const arena = session.world.arena!;
    const fixedPoints = [
      ...session.world.spawnPoints,
      ...session.world.bugSpawns,
      ...(arena.layout?.recovery ?? []).map((point) => ({
        x: point.x + arena.originX,
        z: point.z + arena.originZ,
      })),
    ];
    expect(fixedPoints.length).toBeGreaterThan(0);
    expect(fixedPoints.every((point) => pointInsideArenaBounds(point.x, point.z, bounds))).toBe(true);
    const anchors = buildSpawnAnchors(session.world).anchors;
    expect(anchors.length).toBeGreaterThan(0);
    expect(anchors.every((anchor) => pointInsideArenaBounds(anchor.x, anchor.z, bounds))).toBe(true);

    const match = new Match('boundary-pressure', 'none', pack, session.world, 'mode.mainStage');
    const tank = match.state.tank;
    tank.x = bounds.maxX - ARENA_ACTOR_BOUNDARY_INSET;
    tank.z = bounds.minZ + ARENA_ACTOR_BOUNDARY_INSET;
    tank.yaw = Math.PI / 4;
    match.runtime.systems.flowField?.forceRefresh(tank.x, tank.z);
    const plans = Array.from({ length: 24 }, () =>
      match.runtime.systems.spawnPlanner.pressurePoint(8, {
        minDistance: 42,
        maxDistance: 62,
        forceOffCamera: false,
      }),
    ).filter((plan) => plan !== null);
    expect(plans.length).toBeGreaterThan(0);
    expect(plans.flatMap((plan) => plan.positions).every((position) =>
      pointInsideArenaBounds(position.x, position.z, bounds, PRESSURE_SPAWN_BOUNDARY_INSET),
    )).toBe(true);
  }, 20_000);
});
