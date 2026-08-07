import type { Obstacle } from '../arena';

export type UrbanPrototypeId = 'urban200' | 'urban400';

export interface UrbanVisualPlacement {
  id: string;
  assetId: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
}

export interface UrbanLayout {
  id: UrbanPrototypeId;
  roads: UrbanVisualPlacement[];
  decorations: UrbanVisualPlacement[];
  buildings: Obstacle[];
  solidProps: Obstacle[];
  spawnPoints: { x: number; z: number }[];
  bugSpawns: { x: number; z: number }[];
  truckRoute: { x: number; z: number }[];
}

interface BuildingModel {
  assetId: string;
  nativeW: number;
  nativeD: number;
  nativeH: number;
  scale: number;
}

interface CitySpec {
  size: number;
  targetBuildings: number;
  targetVehicles: number;
  paths: Array<Array<[number, number]>>;
  spawnPoints: Array<{ x: number; z: number }>;
  bugSpawns: Array<{ x: number; z: number }>;
  truckRoute: Array<{ x: number; z: number }>;
  plazas: Array<{ x: number; z: number; radius: number }>;
  landmarks: UrbanVisualPlacement[];
}

const BUILDING_MODELS: readonly BuildingModel[] = [
  { assetId: 'environment.urban.ultimate.oneStory.yellow', nativeW: 2.15416, nativeD: 2.174636, nativeH: 1.672246, scale: 4.4 },
  { assetId: 'environment.urban.ultimate.twoStoryWide.blue', nativeW: 3.825212, nativeD: 2.255298, nativeH: 2.747946, scale: 3.15 },
  { assetId: 'environment.urban.ultimate.twoStoryCenter.red', nativeW: 2.42115, nativeD: 2.498505, nativeH: 2.736507, scale: 3.5 },
  { assetId: 'environment.urban.ultimate.threeStorySmall.light', nativeW: 1.908879, nativeD: 2.056224, nativeH: 3.848539, scale: 3.8 },
  { assetId: 'environment.urban.ultimate.fourStoryCenter.darkBlue', nativeW: 2.42115, nativeD: 2.532175, nativeH: 5.091838, scale: 3.35 },
  { assetId: 'environment.urban.ultimate.sixStoryStack.grey', nativeW: 2.158646, nativeD: 2.498505, nativeH: 7.803365, scale: 3.0 },
];

const VEHICLES = [
  { assetId: 'environment.urban.zombie.vehiclePickup', w: 4.2, d: 2.0, h: 1.8 },
  { assetId: 'environment.urban.zombie.vehicleSports', w: 4.1, d: 1.9, h: 1.4 },
  { assetId: 'environment.urban.zombie.vehicleTruck', w: 6.2, d: 2.4, h: 2.7 },
] as const;

const ROAD = {
  straight: 'environment.urban.zombie.streetStraight',
  straightCrack1: 'environment.urban.zombie.streetStraightCrack1',
  straightCrack2: 'environment.urban.zombie.streetStraightCrack2',
  turn: 'environment.urban.zombie.streetTurn',
  tee: 'environment.urban.zombie.streetT',
  fourWay: 'environment.urban.zombie.street4Way',
} as const;

const TILE = 8;

const CITY_SPECS: Record<UrbanPrototypeId, CitySpec> = {
  urban200: {
    size: 200,
    targetBuildings: 62,
    targetVehicles: 12,
    paths: [
      [[-96, 8], [-64, 8], [-64, -16], [-16, -16], [-16, 16], [40, 16], [40, 48], [88, 48], [88, 96]],
      [[-24, -96], [-24, -56], [8, -56], [8, -16], [-16, -16]],
      [[-64, 8], [-64, 64], [-32, 64], [-32, 88]],
      [[40, 16], [72, 16], [72, -32], [96, -32]],
      [[-24, -56], [-72, -56], [-72, -80], [-40, -80], [-40, -56]],
      [[8, -56], [56, -56], [56, -16], [8, -16]],
      [[-64, 64], [-8, 64], [-8, 32], [40, 32]],
      [[-8, 64], [40, 64], [40, 48]],
      [[72, 16], [72, 72], [40, 72], [40, 64]],
      [[-16, 16], [-40, 16], [-40, 40]],
    ],
    spawnPoints: [{ x: -16, z: -16 }, { x: 40, z: 16 }, { x: -64, z: 8 }, { x: 8, z: -56 }],
    bugSpawns: [{ x: -94, z: 8 }, { x: -24, z: -94 }, { x: 94, z: -32 }, { x: 88, z: 94 }, { x: -32, z: 88 }, { x: -92, z: 10 }],
    truckRoute: [{ x: -88, z: 8 }, { x: -64, z: 8 }, { x: -64, z: -16 }, { x: -16, z: -16 }, { x: -16, z: 16 }, { x: 40, z: 16 }, { x: 40, z: 48 }, { x: 80, z: 48 }],
    plazas: [{ x: 12, z: 42, radius: 15 }, { x: -52, z: -70, radius: 10 }],
    landmarks: [
      { id: 'urban.landmark.waterTower.0', assetId: 'environment.urban.zombie.waterTower', x: 76, y: 0.05, z: -72, yaw: 0, scale: 1 },
    ],
  },
  urban400: {
    size: 400,
    targetBuildings: 210,
    targetVehicles: 38,
    paths: [
      [[-192, 24], [-152, 24], [-152, -8], [-80, -8], [-80, 16], [-8, 16], [-8, -16], [72, -16], [72, 16], [136, 16], [136, 48], [192, 48]],
      [[-24, -192], [-24, -144], [8, -144], [8, -72], [-16, -72], [-16, 16], [16, 16], [16, 88], [-8, 88], [-8, 152], [24, 152], [24, 192]],
      [[-152, -8], [-152, -96], [-112, -96], [-112, -144], [-24, -144]],
      [[-152, -96], [-176, -96], [-176, -160], [-112, -160], [-112, -144]],
      [[8, -72], [72, -72], [72, -16]],
      [[72, -72], [144, -72], [144, -128], [88, -128], [88, -72]],
      [[144, -128], [184, -128], [184, -168], [120, -168], [120, -128]],
      [[16, 88], [88, 88], [88, 48], [136, 48]],
      [[88, 88], [160, 88], [160, 152], [104, 152], [104, 88]],
      [[160, 152], [184, 152], [184, 192]],
      [[-8, 88], [-80, 88], [-80, 48], [-152, 48], [-152, 24]],
      [[-80, 88], [-144, 88], [-144, 144], [-80, 144], [-80, 88]],
      [[-144, 144], [-184, 144], [-184, 184]],
      [[-80, 48], [-48, 48], [-48, 72]],
      [[136, 16], [176, 16], [176, -24]],
      [[8, -104], [48, -104], [48, -72]],
      [[-112, -96], [-64, -96], [-64, -48], [-16, -48]],
      [[24, 152], [72, 152], [72, 184]],
    ],
    spawnPoints: [{ x: -16, z: 16 }, { x: 16, z: 16 }, { x: 16, z: 88 }, { x: 8, z: -72 }],
    bugSpawns: [{ x: -190, z: 24 }, { x: -24, z: -190 }, { x: 190, z: 48 }, { x: 24, z: 190 }, { x: 184, z: 190 }, { x: -184, z: 182 }, { x: 176, z: -24 }, { x: -176, z: -158 }],
    truckRoute: [{ x: -184, z: 24 }, { x: -152, z: 24 }, { x: -152, z: -8 }, { x: -80, z: -8 }, { x: -80, z: 16 }, { x: -8, z: 16 }, { x: -8, z: -16 }, { x: 72, z: -16 }, { x: 72, z: 16 }, { x: 136, z: 16 }, { x: 136, z: 48 }, { x: 184, z: 48 }],
    plazas: [{ x: -48, z: 56, radius: 22 }, { x: 104, z: -40, radius: 20 }, { x: -128, z: -128, radius: 13 }],
    landmarks: [
      { id: 'urban.landmark.waterTower.0', assetId: 'environment.urban.zombie.waterTower', x: -128, y: 0.05, z: -128, yaw: 0, scale: 1 },
      { id: 'urban.landmark.waterTower.1', assetId: 'environment.urban.zombie.waterTower', x: 112, y: 0.05, z: 120, yaw: Math.PI / 2, scale: 1 },
    ],
  },
};

export function createUrbanLayout(id: UrbanPrototypeId): UrbanLayout {
  const spec = CITY_SPECS[id];
  const cells = buildRoadCells(spec.paths);
  const roads = [...cells]
    .map(parseCell)
    .sort((a, b) => a.z - b.z || a.x - b.x)
    .map(({ x, z }, index) => roadVisual(cells, x, z, index));
  const buildings = placeBuildings(id, spec, roads);
  const solidProps = placeVehicles(id, spec, roads, buildings);
  const decorations = [...buildStreetDecorations(cells, roads, id), ...spec.landmarks];
  return {
    id,
    roads,
    decorations,
    buildings,
    solidProps,
    spawnPoints: spec.spawnPoints.map((p) => ({ ...p })),
    bugSpawns: spec.bugSpawns.map((p) => ({ ...p })),
    truckRoute: spec.truckRoute.map((p) => ({ ...p })),
  };
}

export function urbanAssetIds(layout: UrbanLayout): string[] {
  return [...new Set([
    ...layout.roads.map((p) => p.assetId),
    ...layout.decorations.map((p) => p.assetId),
    ...layout.buildings.map((p) => p.assetId).filter((id): id is string => Boolean(id)),
    ...layout.solidProps.map((p) => p.assetId).filter((id): id is string => Boolean(id)),
  ])].sort();
}

/** Flat ground plus any building roof that an airborne actor lands on. */
export function urbanSurfaceHeightAt(layout: UrbanLayout, x: number, z: number): number {
  for (const b of layout.buildings) {
    if (Math.abs(x - b.x) <= b.w / 2 && Math.abs(z - b.z) <= b.d / 2) return b.h;
  }
  return 0;
}

function placeBuildings(id: UrbanPrototypeId, spec: CitySpec, roads: readonly UrbanVisualPlacement[]): Obstacle[] {
  const rng = seededRandom(id === 'urban200' ? 0x200c17 : 0x400c17);
  const buildings: Obstacle[] = [];
  const half = spec.size / 2;
  const candidates = roads.flatMap((road) => {
    const horizontal = Math.abs(Math.sin(road.yaw)) > 0.5;
    return [-1, 1].map((side) => ({ road, horizontal, side, order: rng() }));
  }).sort((a, b) => a.order - b.order);

  for (const candidate of candidates) {
    if (buildings.length >= spec.targetBuildings) break;
    const { road, horizontal, side } = candidate;
    if (road.assetId === ROAD.fourWay || road.assetId === ROAD.tee || road.assetId === ROAD.turn) continue;
    const approximateX = road.x + (horizontal ? (rng() - 0.5) * 3.2 : side * 10);
    const approximateZ = road.z + (horizontal ? side * 10 : (rng() - 0.5) * 3.2);
    const core = Math.hypot(approximateX, approximateZ) < spec.size * 0.24;
    const inner = Math.hypot(approximateX, approximateZ) < spec.size * 0.38;
    const pool = core ? [2, 3, 4, 4, 5, 5] : inner ? [0, 1, 2, 3, 4, 5] : [0, 0, 1, 1, 2, 3];
    const model = BUILDING_MODELS[pool[Math.floor(rng() * pool.length)]];
    const scale = model.scale * (0.88 + rng() * 0.26);
    const yaw = horizontal ? 0 : Math.PI / 2;
    const rawW = model.nativeW * scale;
    const rawD = model.nativeD * scale;
    const w = yaw === 0 ? rawW : rawD;
    const d = yaw === 0 ? rawD : rawW;
    const h = model.nativeH * scale;
    const setback = 1.2 + rng() * 2.2;
    const x = snap(road.x + (horizontal ? (rng() - 0.5) * 3.2 : side * (TILE / 2 + w / 2 + setback)), 1);
    const z = snap(road.z + (horizontal ? side * (TILE / 2 + d / 2 + setback) : (rng() - 0.5) * 3.2), 1);
    if (Math.abs(x) + w / 2 > half - 2 || Math.abs(z) + d / 2 > half - 2) continue;
    if (overlapsRoad(x, z, w, d, roads, 0.9)) continue;
    if (spec.plazas.some((p) => Math.hypot(x - p.x, z - p.z) < p.radius + Math.max(w, d) / 2)) continue;
    if (spec.landmarks.some((p) => Math.hypot(x - p.x, z - p.z) < 12 + Math.max(w, d) / 2)) continue;
    if (spec.spawnPoints.some((p) => Math.hypot(x - p.x, z - p.z) < 12 + Math.max(w, d) / 2)) continue;
    if (buildings.some((b) => boxesOverlap(x, z, w, d, b.x, b.z, b.w, b.d, 1.8))) continue;
    buildings.push({
      id: `urban.building.${buildings.length}`,
      x,
      z,
      w,
      d,
      h,
      type: 'urbanBuilding',
      assetId: model.assetId,
      yaw,
      modelScale: scale,
      roofDriveable: true,
    });
  }
  return buildings;
}

function placeVehicles(
  id: UrbanPrototypeId,
  spec: CitySpec,
  roads: readonly UrbanVisualPlacement[],
  buildings: readonly Obstacle[],
): Obstacle[] {
  const rng = seededRandom(id === 'urban200' ? 0x2f00d : 0x4f00d);
  const props: Obstacle[] = [];
  const candidates = roads
    .filter((road) => road.assetId === ROAD.straight || road.assetId === ROAD.straightCrack1 || road.assetId === ROAD.straightCrack2)
    .map((road) => ({ road, side: rng() < 0.5 ? -1 : 1, order: rng() }))
    .sort((a, b) => a.order - b.order);
  for (const candidate of candidates) {
    if (props.length >= spec.targetVehicles) break;
    const source = VEHICLES[Math.floor(rng() * VEHICLES.length)];
    const { road, side } = candidate;
    const horizontal = Math.abs(Math.sin(road.yaw)) > 0.5;
    const yaw = horizontal ? Math.PI / 2 : 0;
    const w = yaw === 0 ? source.w : source.d;
    const d = yaw === 0 ? source.d : source.w;
    const curbOffset = TILE / 2 + (horizontal ? d : w) / 2 + 0.25;
    const x = road.x + (horizontal ? (rng() - 0.5) * 2 : side * curbOffset);
    const z = road.z + (horizontal ? side * curbOffset : (rng() - 0.5) * 2);
    if (spec.plazas.some((p) => Math.hypot(x - p.x, z - p.z) < p.radius)) continue;
    if (spec.spawnPoints.some((p) => Math.hypot(x - p.x, z - p.z) < 6)) continue;
    if (buildings.some((b) => boxesOverlap(x, z, w, d, b.x, b.z, b.w, b.d, 0.8))) continue;
    if (props.some((p) => boxesOverlap(x, z, w, d, p.x, p.z, p.w, p.d, 3))) continue;
    props.push({
      id: `urban.vehicle.${props.length}`,
      x,
      z,
      w,
      d,
      h: source.h,
      type: 'urbanProp',
      assetId: source.assetId,
      yaw,
      modelScale: 1,
    });
  }
  return props;
}

function buildRoadCells(paths: CitySpec['paths']): Set<string> {
  const cells = new Set<string>();
  for (const path of paths) {
    for (let i = 1; i < path.length; i++) addRoadSegment(cells, path[i - 1], path[i]);
  }
  return cells;
}

function addRoadSegment(cells: Set<string>, from: [number, number], to: [number, number]): void {
  if (from[0] !== to[0] && from[1] !== to[1]) throw new Error(`urban road segment must be orthogonal: ${from} -> ${to}`);
  const dx = Math.sign(to[0] - from[0]) * TILE;
  const dz = Math.sign(to[1] - from[1]) * TILE;
  let x = from[0];
  let z = from[1];
  cells.add(cell(x, z));
  while (x !== to[0] || z !== to[1]) {
    x += dx;
    z += dz;
    cells.add(cell(x, z));
  }
}

function roadVisual(cells: Set<string>, x: number, z: number, index: number): UrbanVisualPlacement {
  const n = cells.has(cell(x, z - TILE));
  const e = cells.has(cell(x + TILE, z));
  const s = cells.has(cell(x, z + TILE));
  const w = cells.has(cell(x - TILE, z));
  const count = Number(n) + Number(e) + Number(s) + Number(w);
  let assetId: string;
  let yaw = 0;
  if (count === 4) assetId = ROAD.fourWay;
  else if (count === 3) {
    assetId = ROAD.tee;
    if (!s) yaw = 0;
    else if (!w) yaw = Math.PI / 2;
    else if (!n) yaw = Math.PI;
    else yaw = -Math.PI / 2;
  } else if (count === 2 && ((n && s) || (e && w))) {
    assetId = index % 19 === 0 ? ROAD.straightCrack2 : index % 13 === 0 ? ROAD.straightCrack1 : ROAD.straight;
    yaw = e && w ? Math.PI / 2 : 0;
  } else if (count === 2) {
    assetId = ROAD.turn;
    if (n && e) yaw = 0;
    else if (e && s) yaw = Math.PI / 2;
    else if (s && w) yaw = Math.PI;
    else yaw = -Math.PI / 2;
  } else {
    assetId = ROAD.straight;
    yaw = e || w ? Math.PI / 2 : 0;
  }
  return { id: `urban.road.${index}`, assetId, x, y: 0.015, z, yaw, scale: 1 };
}

function buildStreetDecorations(
  cells: Set<string>,
  roads: readonly UrbanVisualPlacement[],
  id: UrbanPrototypeId,
): UrbanVisualPlacement[] {
  const out: UrbanVisualPlacement[] = [];
  let serial = 0;
  for (let index = 0; index < roads.length; index++) {
    const road = roads[index];
    const n = cells.has(cell(road.x, road.z - TILE));
    const e = cells.has(cell(road.x + TILE, road.z));
    const s = cells.has(cell(road.x, road.z + TILE));
    const w = cells.has(cell(road.x - TILE, road.z));
    const degree = Number(n) + Number(e) + Number(s) + Number(w);
    if (degree >= 3) {
      out.push({
        id: `urban.signal.${serial++}`,
        assetId: index % 2 === 0 ? 'environment.urban.zombie.trafficLight1' : 'environment.urban.zombie.trafficLight2',
        x: road.x + 3.35,
        y: 0.12,
        z: road.z + 3.35,
        yaw: Math.PI,
        scale: 1,
      });
      if (index % 2 === 0) {
        out.push({ id: `urban.hydrant.${serial++}`, assetId: 'environment.urban.zombie.fireHydrant', x: road.x - 4.3, y: 0.08, z: road.z + 4.1, yaw: 0, scale: 1 });
      }
    } else if (degree === 2 && index % 12 === 0) {
      const horizontal = e && w;
      out.push({
        id: `urban.light.${serial++}`,
        assetId: 'environment.urban.zombie.streetLights',
        x: road.x + (horizontal ? 0 : 3.65),
        y: 0.1,
        z: road.z + (horizontal ? 3.65 : 0),
        yaw: horizontal ? Math.PI / 2 : 0,
        scale: 1,
      });
    } else if (degree === 2 && index % 17 === 0) {
      out.push({
        id: `urban.trash.${serial++}`,
        assetId: index % 34 === 0 ? 'environment.urban.zombie.trashBag1' : 'environment.urban.zombie.trashBag2',
        x: road.x + 4.2,
        y: 0.05,
        z: road.z - 3.7,
        yaw: index * 0.7,
        scale: 0.9,
      });
    }
  }
  const roadwork = roads.filter((r) => r.assetId === ROAD.straight).slice(id === 'urban200' ? 8 : 28, id === 'urban200' ? 12 : 34);
  roadwork.forEach((road, i) => {
    out.push({
      id: `urban.cone.${serial++}`,
      assetId: i % 2 === 0 ? 'environment.urban.zombie.trafficCone1' : 'environment.urban.zombie.trafficCone2',
      x: road.x + 2.5,
      y: 0.08,
      z: road.z + (i % 3 - 1) * 1.4,
      yaw: i * 0.4,
      scale: 1,
    });
  });
  return out;
}

function overlapsRoad(x: number, z: number, w: number, d: number, roads: readonly UrbanVisualPlacement[], margin: number): boolean {
  return roads.some((r) => Math.abs(x - r.x) < w / 2 + TILE / 2 + margin && Math.abs(z - r.z) < d / 2 + TILE / 2 + margin);
}

function boxesOverlap(ax: number, az: number, aw: number, ad: number, bx: number, bz: number, bw: number, bd: number, gap: number): boolean {
  return Math.abs(ax - bx) < (aw + bw) / 2 + gap && Math.abs(az - bz) < (ad + bd) / 2 + gap;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function snap(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function cell(x: number, z: number): string {
  return `${x},${z}`;
}

function parseCell(value: string): { x: number; z: number } {
  const [x, z] = value.split(',').map(Number);
  return { x, z };
}
