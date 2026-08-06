import type { Obstacle, RampDef } from '../arena';

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
  /** Centered world-space road tiles selected from a connected street graph. */
  roads: UrbanVisualPlacement[];
  /** Non-authoritative street dressing; buildings are authoritative obstacles. */
  decorations: UrbanVisualPlacement[];
  buildings: Obstacle[];
  roofRamps: RampDef[];
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

const BUILDING_MODELS: readonly BuildingModel[] = [
  {
    assetId: 'environment.urban.ultimate.oneStory.yellow',
    nativeW: 2.15416,
    nativeD: 2.174636,
    nativeH: 1.672246,
    scale: 4.5,
  },
  {
    assetId: 'environment.urban.ultimate.twoStoryWide.blue',
    nativeW: 3.825212,
    nativeD: 2.255298,
    nativeH: 2.747946,
    scale: 3.2,
  },
  {
    assetId: 'environment.urban.ultimate.twoStoryCenter.red',
    nativeW: 2.42115,
    nativeD: 2.498505,
    nativeH: 2.736507,
    scale: 3.55,
  },
];

const ROAD = {
  straight: 'environment.urban.zombie.streetStraight',
  straightCrack1: 'environment.urban.zombie.streetStraightCrack1',
  straightCrack2: 'environment.urban.zombie.streetStraightCrack2',
  turn: 'environment.urban.zombie.streetTurn',
  tee: 'environment.urban.zombie.streetT',
  fourWay: 'environment.urban.zombie.street4Way',
} as const;

const TILE = 8;

/**
 * Builds a deterministic, authored city prototype. Roads come from a graph:
 * each tile chooses straight/turn/T/4-way geometry from its actual cardinal
 * neighbours. This prevents disconnected or randomly rotated road pieces.
 */
export function createUrbanLayout(id: UrbanPrototypeId): UrbanLayout {
  const size = id === 'urban200' ? 200 : 400;
  const half = size / 2;
  const axes = id === 'urban200'
    ? [-72, -24, 24, 72]
    : [-168, -112, -56, 0, 56, 112, 168];
  const cells = buildRoadCells(axes, half);
  const roads = [...cells]
    .map(parseCell)
    .sort((a, b) => a.z - b.z || a.x - b.x)
    .map(({ x, z }, index) => roadVisual(cells, x, z, index));

  const buildings: Obstacle[] = [];
  const roofRamps: RampDef[] = [];
  let buildingIndex = 0;
  for (let zi = 0; zi < axes.length - 1; zi++) {
    for (let xi = 0; xi < axes.length - 1; xi++) {
      const minX = axes[xi] + TILE / 2;
      const maxX = axes[xi + 1] - TILE / 2;
      const minZ = axes[zi] + TILE / 2;
      const maxZ = axes[zi + 1] - TILE / 2;
      const blockX = (minX + maxX) / 2;
      const blockZ = (minZ + maxZ) / 2;
      const spread = Math.min(11, (maxX - minX) * 0.24);
      for (let lot = 0; lot < 2; lot++) {
        const model = BUILDING_MODELS[(buildingIndex + lot + xi + zi) % BUILDING_MODELS.length];
        const yaw = ((xi + zi + lot) & 1) * Math.PI / 2;
        const rawW = model.nativeW * model.scale;
        const rawD = model.nativeD * model.scale;
        const w = yaw === 0 ? rawW : rawD;
        const d = yaw === 0 ? rawD : rawW;
        const h = model.nativeH * model.scale;
        const x = blockX + (lot === 0 ? -spread : spread);
        const z = blockZ;
        const building: Obstacle = {
          id: `urban.building.${buildingIndex}`,
          x,
          z,
          w,
          d,
          h,
          type: 'urbanBuilding',
          assetId: model.assetId,
          yaw,
          modelScale: model.scale,
          roofDriveable: true,
        };
        buildings.push(building);

        // Each building gets a broad, gentle street-facing ramp. Alternating
        // sides keeps lots readable and leaves a clear route between ramps.
        const rampLength = Math.ceil(Math.max(17, h / 0.48) / 2) * 2;
        const fromSouth = lot === 0;
        const dirZ = fromSouth ? -1 : 1;
        const rampZ = z + (fromSouth ? 1 : -1) * (d / 2 + rampLength / 2 - 0.8);
        roofRamps.push({
          id: `urban.roofRamp.${buildingIndex}`,
          x,
          z: rampZ,
          w: Math.max(7, Math.min(w, 10)),
          d: rampLength,
          dirX: 0,
          dirZ,
          rise: h,
          baseY: 0,
          assetId: ROAD.straight,
          urbanRoofBuildingId: building.id,
        });
        buildingIndex++;
      }
    }
  }

  const decorations = buildStreetDecorations(cells, axes, id);
  const edge = half - 12;
  const mid = Math.floor(axes.length / 2);
  const centerRoad = axes[mid];
  const previousRoad = axes[Math.max(0, mid - 1)];
  const entranceOffset = 2.4;
  const spawnPoints = id === 'urban200'
    ? [
        { x: previousRoad, z: previousRoad },
        { x: centerRoad, z: centerRoad },
        { x: previousRoad, z: centerRoad },
        { x: centerRoad, z: previousRoad },
      ]
    : [
        { x: axes[mid - 1], z: centerRoad },
        { x: axes[mid + 1], z: centerRoad },
        { x: centerRoad, z: axes[mid - 1] },
        { x: centerRoad, z: axes[mid + 1] },
      ];
  return {
    id,
    roads,
    decorations,
    buildings,
    roofRamps,
    spawnPoints,
    // Horde gates sit on the four entrance avenues (two lanes each), so
    // enemies enter through readable streets instead of cutting across lots.
    bugSpawns: [
      { x: -edge, z: centerRoad - entranceOffset },
      { x: -edge, z: centerRoad + entranceOffset },
      { x: edge, z: centerRoad - entranceOffset },
      { x: edge, z: centerRoad + entranceOffset },
      { x: previousRoad - entranceOffset, z: -edge },
      { x: previousRoad + entranceOffset, z: -edge },
      { x: previousRoad - entranceOffset, z: edge },
      { x: previousRoad + entranceOffset, z: edge },
    ],
    truckRoute: [
      { x: axes[0], z: axes[0] },
      { x: axes[axes.length - 1], z: axes[0] },
      { x: axes[axes.length - 1], z: axes[axes.length - 1] },
      { x: axes[0], z: axes[axes.length - 1] },
    ],
  };
}

export function urbanAssetIds(layout: UrbanLayout): string[] {
  return [...new Set([
    ...layout.roads.map((p) => p.assetId),
    ...layout.decorations.map((p) => p.assetId),
    ...layout.buildings.map((p) => p.assetId).filter((id): id is string => Boolean(id)),
    ...layout.roofRamps.map((p) => p.assetId).filter((id): id is string => Boolean(id)),
  ])].sort();
}

/** Authoritative surface shared by tank, enemies, projectiles, and camera. */
export function urbanSurfaceHeightAt(layout: UrbanLayout, x: number, z: number): number {
  let height = 0;
  for (const ramp of layout.roofRamps) {
    const localX = x - ramp.x;
    const localZ = z - ramp.z;
    if (Math.abs(localX) > ramp.w / 2 || Math.abs(localZ) > ramp.d / 2) continue;
    const along = Math.abs(ramp.dirX) > Math.abs(ramp.dirZ)
      ? localX / (ramp.w / 2)
      : localZ / (ramp.d / 2);
    const signed = (Math.abs(ramp.dirX) > Math.abs(ramp.dirZ) ? ramp.dirX : ramp.dirZ) * along;
    height = Math.max(height, ramp.baseY + ramp.rise * ((signed + 1) / 2));
  }
  for (const b of layout.buildings) {
    if (Math.abs(x - b.x) <= b.w / 2 && Math.abs(z - b.z) <= b.d / 2) {
      height = Math.max(height, b.h);
    }
  }
  return height;
}

function buildRoadCells(axes: readonly number[], half: number): Set<string> {
  const cells = new Set<string>();
  const first = axes[0];
  const last = axes[axes.length - 1];
  for (const x of axes) {
    for (let z = first; z <= last + 0.01; z += TILE) cells.add(cell(x, z));
  }
  for (const z of axes) {
    for (let x = first; x <= last + 0.01; x += TILE) cells.add(cell(x, z));
  }
  // Four connected entrance spurs reach the play boundary. They extend an
  // existing avenue, so the ring connection resolves to a real T junction.
  const westEastZ = axes[Math.floor(axes.length / 2)];
  const northSouthX = axes[Math.max(0, Math.floor(axes.length / 2) - 1)];
  for (let x = first - TILE; x >= -half + TILE / 2; x -= TILE) cells.add(cell(x, westEastZ));
  for (let x = last + TILE; x <= half - TILE / 2; x += TILE) cells.add(cell(x, westEastZ));
  for (let z = first - TILE; z >= -half + TILE / 2; z -= TILE) cells.add(cell(northSouthX, z));
  for (let z = last + TILE; z <= half - TILE / 2; z += TILE) cells.add(cell(northSouthX, z));
  return cells;
}

function roadVisual(cells: Set<string>, x: number, z: number, index: number): UrbanVisualPlacement {
  const n = cells.has(cell(x, z - TILE));
  const e = cells.has(cell(x + TILE, z));
  const s = cells.has(cell(x, z + TILE));
  const w = cells.has(cell(x - TILE, z));
  const count = Number(n) + Number(e) + Number(s) + Number(w);
  let assetId: string;
  let yaw = 0;
  if (count === 4) {
    assetId = ROAD.fourWay;
  } else if (count === 3) {
    assetId = ROAD.tee;
    // Base T connects north/east/west; rotate the missing side into south.
    if (!s) yaw = 0;
    else if (!w) yaw = Math.PI / 2;
    else if (!n) yaw = Math.PI;
    else yaw = -Math.PI / 2;
  } else if (count === 2 && ((n && s) || (e && w))) {
    assetId = index % 17 === 0
      ? ROAD.straightCrack2
      : index % 11 === 0
        ? ROAD.straightCrack1
        : ROAD.straight;
    yaw = e && w ? Math.PI / 2 : 0;
  } else if (count === 2) {
    assetId = ROAD.turn;
    // Base turn connects north/east.
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
  axes: readonly number[],
  id: UrbanPrototypeId,
): UrbanVisualPlacement[] {
  const out: UrbanVisualPlacement[] = [];
  let index = 0;
  // Traffic signals identify major junctions instead of appearing randomly.
  for (let zi = 1; zi < axes.length - 1; zi += 2) {
    for (let xi = 1; xi < axes.length - 1; xi += 2) {
      const x = axes[xi];
      const z = axes[zi];
      out.push({
        id: `urban.signal.${index++}`,
        assetId: (xi + zi) % 4 === 0
          ? 'environment.urban.zombie.trafficLight1'
          : 'environment.urban.zombie.trafficLight2',
        x: x + 3.35,
        y: 0.12,
        z: z + 3.35,
        yaw: Math.PI,
        scale: 1,
      });
    }
  }
  // Streetlights repeat along the outer boulevard at a deliberate cadence.
  const outer = axes[0];
  for (let x = axes[0] + 16; x < axes[axes.length - 1]; x += 32) {
    out.push({
      id: `urban.light.${index++}`,
      assetId: 'environment.urban.zombie.streetLights',
      x,
      y: 0.12,
      z: outer + 3.6,
      yaw: Math.PI / 2,
      scale: 1,
    });
  }
  // A small, authored roadwork scene adds landmarks without breaking lanes.
  const workX = axes[Math.floor(axes.length / 2)];
  const workZ = axes[0] + 16;
  if (cells.has(cell(workX, workZ))) {
    for (let i = 0; i < (id === 'urban200' ? 3 : 5); i++) {
      out.push({
        id: `urban.cone.${index++}`,
        assetId: i % 2 === 0
          ? 'environment.urban.zombie.trafficCone1'
          : 'environment.urban.zombie.trafficCone2',
        x: workX + 2.4,
        y: 0.12,
        z: workZ + i * 1.5,
        yaw: 0,
        scale: 1,
      });
    }
  }
  return out;
}

function cell(x: number, z: number): string {
  return `${roundCell(x)},${roundCell(z)}`;
}

function parseCell(value: string): { x: number; z: number } {
  const [x, z] = value.split(',').map(Number);
  return { x, z };
}

function roundCell(value: number): number {
  return Math.round(value * 1000) / 1000;
}
