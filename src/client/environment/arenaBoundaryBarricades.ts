import * as THREE from 'three';
import type { AssetService } from '../assets';
import type { ArenaWorld } from '../../shared/sim/arenaWorld';
import {
  ARENA_ACTOR_BOUNDARY_INSET,
  resolveArenaBounds,
  type ArenaBounds,
} from '../../shared/sim/arenaBounds';

export const ARENA_BOUNDARY_ASSET_ID = 'prop.barrier';
export const ARENA_BOUNDARY_OVERLAP_RATIO = 0.075;
export const ARENA_BOUNDARY_FOOTING_HEIGHT = 0.65;

export type ArenaBoundarySide = 'north' | 'east' | 'south' | 'west';
type HorizontalAxis = 'x' | 'z';

export interface ArenaBoundaryAssetMetrics {
  bounds: ArenaBounds & { minY: number; maxY: number };
  centerX: number;
  centerZ: number;
  longAxis: HorizontalAxis;
  segmentLength: number;
  thickness: number;
  height: number;
}

export interface ArenaBoundaryPlacement {
  side: ArenaBoundarySide;
  x: number;
  groundY: number;
  z: number;
  /** Rotation that maps the measured asset's long axis onto the run. */
  assetYaw: number;
  /** Rotation for a canonical X-axis-aligned footing segment. */
  runYaw: number;
}

export interface ArenaBoundaryPlan {
  bounds: ArenaBounds;
  collisionInset: number;
  requestedOverlapRatio: number;
  spacing: { x: number; z: number };
  sideCounts: Record<ArenaBoundarySide, number>;
  placements: ArenaBoundaryPlacement[];
}

export interface ArenaBoundaryDiagnostics {
  enabled: boolean;
  assetId: typeof ARENA_BOUNDARY_ASSET_ID;
  bounds: ArenaBounds;
  collisionInset: number;
  assetBounds: ArenaBoundaryAssetMetrics['bounds'];
  longAxis: HorizontalAxis;
  segmentLength: number;
  thickness: number;
  height: number;
  requestedOverlapRatio: number;
  spacing: { x: number; z: number };
  sideCounts: Record<ArenaBoundarySide, number>;
  segmentCount: number;
  instanceBatches: number;
  drawCalls: number;
  footingEnabled: boolean;
  castsShadows: boolean;
}

interface RunPlan {
  count: number;
  spacing: number;
  centers: number[];
}

/** Measure the transformed model once, before any instances are allocated. */
export function measureArenaBoundaryAsset(model: THREE.Object3D): ArenaBoundaryAssetMetrics {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  if (box.isEmpty()) throw new Error(`${ARENA_BOUNDARY_ASSET_ID} has no measurable geometry`);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const longAxis: HorizontalAxis = size.x >= size.z ? 'x' : 'z';
  const segmentLength = longAxis === 'x' ? size.x : size.z;
  const thickness = longAxis === 'x' ? size.z : size.x;
  if (!Number.isFinite(segmentLength) || segmentLength <= 0.001) {
    throw new Error(`${ARENA_BOUNDARY_ASSET_ID} has no usable horizontal length`);
  }
  if (!Number.isFinite(thickness) || thickness <= 0.001) {
    throw new Error(`${ARENA_BOUNDARY_ASSET_ID} has no usable horizontal thickness`);
  }
  return {
    bounds: {
      minX: box.min.x,
      maxX: box.max.x,
      minY: box.min.y,
      maxY: box.max.y,
      minZ: box.min.z,
      maxZ: box.max.z,
    },
    centerX: center.x,
    centerZ: center.z,
    longAxis,
    segmentLength,
    thickness,
    height: size.y,
  };
}

/**
 * Build four deterministic, uniformly spaced runs. The asset's inside face
 * lands on the existing actor clamp plane rather than changing authority.
 */
export function buildArenaBoundaryPlan(
  world: Pick<ArenaWorld, 'half' | 'bounds' | 'groundHeightAt'>,
  metrics: ArenaBoundaryAssetMetrics,
  overlapRatio = ARENA_BOUNDARY_OVERLAP_RATIO,
): ArenaBoundaryPlan {
  const bounds = { ...resolveArenaBounds(world) };
  const requestedOverlapRatio = THREE.MathUtils.clamp(overlapRatio, 0.05, 0.1);
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  if (!(width > ARENA_ACTOR_BOUNDARY_INSET * 2) || !(depth > ARENA_ACTOR_BOUNDARY_INSET * 2)) {
    throw new Error('arena boundary requires positive bounds larger than the authority inset');
  }
  const runX = planRun(bounds.minX, bounds.maxX, metrics.segmentLength, requestedOverlapRatio);
  const runZ = planRun(bounds.minZ, bounds.maxZ, metrics.segmentLength, requestedOverlapRatio);
  const halfThickness = metrics.thickness / 2;
  const northZ = bounds.minZ + ARENA_ACTOR_BOUNDARY_INSET - halfThickness;
  const southZ = bounds.maxZ - ARENA_ACTOR_BOUNDARY_INSET + halfThickness;
  const westX = bounds.minX + ARENA_ACTOR_BOUNDARY_INSET - halfThickness;
  const eastX = bounds.maxX - ARENA_ACTOR_BOUNDARY_INSET + halfThickness;
  const xAssetYaw = metrics.longAxis === 'x' ? 0 : Math.PI / 2;
  const zAssetYaw = metrics.longAxis === 'z' ? 0 : Math.PI / 2;
  const placements: ArenaBoundaryPlacement[] = [];
  for (const x of runX.centers) {
    placements.push({
      side: 'north', x, z: northZ, groundY: world.groundHeightAt(x, northZ),
      assetYaw: xAssetYaw, runYaw: 0,
    });
    placements.push({
      side: 'south', x, z: southZ, groundY: world.groundHeightAt(x, southZ),
      assetYaw: xAssetYaw, runYaw: 0,
    });
  }
  for (const z of runZ.centers) {
    placements.push({
      side: 'west', x: westX, z, groundY: world.groundHeightAt(westX, z),
      assetYaw: zAssetYaw, runYaw: Math.PI / 2,
    });
    placements.push({
      side: 'east', x: eastX, z, groundY: world.groundHeightAt(eastX, z),
      assetYaw: zAssetYaw, runYaw: Math.PI / 2,
    });
  }
  return {
    bounds,
    collisionInset: ARENA_ACTOR_BOUNDARY_INSET,
    requestedOverlapRatio,
    spacing: { x: runX.spacing, z: runZ.spacing },
    sideCounts: {
      north: runX.count,
      east: runZ.count,
      south: runX.count,
      west: runZ.count,
    },
    placements,
  };
}

/** Instanced, terrain-aligned visual boundary owned by RenderWorld. */
export class ArenaBoundaryBarricades {
  readonly group = new THREE.Group();
  readonly metrics: ArenaBoundaryAssetMetrics;
  readonly plan: ArenaBoundaryPlan;
  private readonly batches: THREE.InstancedMesh[] = [];
  private footing: THREE.InstancedMesh | null = null;
  private disposed = false;

  constructor(parent: THREE.Object3D, assets: AssetService, world: ArenaWorld, footingEnabled = true) {
    this.group.name = 'ArenaBoundaryBarricades';
    const prototype = assets.model(ARENA_BOUNDARY_ASSET_ID);
    this.metrics = measureArenaBoundaryAsset(prototype);
    this.plan = buildArenaBoundaryPlan(world, this.metrics);
    this.buildAssetBatches(prototype);
    if (footingEnabled) this.buildFooting();
    parent.add(this.group);
  }

  diagnostics(): ArenaBoundaryDiagnostics {
    const assetDrawCalls = this.batches.reduce((sum, mesh) => sum + drawCallsFor(mesh), 0);
    return {
      enabled: !this.disposed && this.group.visible,
      assetId: ARENA_BOUNDARY_ASSET_ID,
      bounds: { ...this.plan.bounds },
      collisionInset: this.plan.collisionInset,
      assetBounds: { ...this.metrics.bounds },
      longAxis: this.metrics.longAxis,
      segmentLength: this.metrics.segmentLength,
      thickness: this.metrics.thickness,
      height: this.metrics.height,
      requestedOverlapRatio: this.plan.requestedOverlapRatio,
      spacing: { ...this.plan.spacing },
      sideCounts: { ...this.plan.sideCounts },
      segmentCount: this.plan.placements.length,
      instanceBatches: this.batches.length,
      drawCalls: assetDrawCalls + (this.footing ? 1 : 0),
      footingEnabled: this.footing !== null,
      castsShadows: this.batches.some((mesh) => mesh.castShadow) || Boolean(this.footing?.castShadow),
    };
  }

  dispose(parent: THREE.Object3D): void {
    if (this.disposed) return;
    this.disposed = true;
    parent.remove(this.group);
    for (const child of [...this.group.children]) this.group.remove(child);
    if (this.footing) {
      this.footing.geometry.dispose();
      const materials = Array.isArray(this.footing.material) ? this.footing.material : [this.footing.material];
      for (const material of materials) material.dispose();
      this.footing = null;
    }
    this.batches.length = 0;
  }

  private buildAssetBatches(prototype: THREE.Object3D): void {
    prototype.updateMatrixWorld(true);
    const normalization = new THREE.Matrix4().makeTranslation(
      -this.metrics.centerX,
      -this.metrics.bounds.minY,
      -this.metrics.centerZ,
    );
    const placementMatrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3(1, 1, 1);
    const up = new THREE.Vector3(0, 1, 0);
    prototype.traverse((node) => {
      const source = node as THREE.Mesh;
      if (!source.isMesh || !(source.geometry instanceof THREE.BufferGeometry)) return;
      const mesh = new THREE.InstancedMesh(source.geometry, source.material, this.plan.placements.length);
      mesh.name = 'ArenaBoundaryBarricades.AssetBatch';
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = true;
      this.plan.placements.forEach((entry, index) => {
        position.set(entry.x, entry.groundY, entry.z);
        rotation.setFromAxisAngle(up, entry.assetYaw);
        placementMatrix.compose(position, rotation, scale);
        placementMatrix.multiply(normalization);
        placementMatrix.multiply(source.matrixWorld);
        mesh.setMatrixAt(index, placementMatrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
      this.batches.push(mesh);
      this.group.add(mesh);
    });
    if (this.batches.length === 0) {
      throw new Error(`${ARENA_BOUNDARY_ASSET_ID} has no instanced mesh sources`);
    }
  }

  private buildFooting(): void {
    const depth = Math.max(0.35, Math.min(0.75, this.metrics.thickness * 1.15));
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(this.metrics.segmentLength, ARENA_BOUNDARY_FOOTING_HEIGHT, depth),
      new THREE.MeshStandardMaterial({ color: 0x252a2b, roughness: 1, metalness: 0 }),
      this.plan.placements.length,
    );
    mesh.name = 'ArenaBoundaryBarricades.FootingBatch';
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = true;
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3(1, 1, 1);
    const up = new THREE.Vector3(0, 1, 0);
    this.plan.placements.forEach((entry, index) => {
      rotation.setFromAxisAngle(up, entry.runYaw);
      position.set(
        entry.x,
        entry.groundY - ARENA_BOUNDARY_FOOTING_HEIGHT / 2 + 0.02,
        entry.z,
      );
      matrix.compose(position, rotation, scale);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    this.footing = mesh;
    this.group.add(mesh);
  }
}

function planRun(min: number, max: number, segmentLength: number, overlapRatio: number): RunPlan {
  const length = max - min;
  const maximumSpacing = segmentLength * (1 - overlapRatio);
  const count = Math.max(1, Math.ceil(length / maximumSpacing));
  const spacing = length / count;
  const centers = Array.from({ length: count }, (_, index) => min + (index + 0.5) * spacing);
  return { count, spacing, centers };
}

function drawCallsFor(mesh: THREE.InstancedMesh): number {
  if (!Array.isArray(mesh.material)) return 1;
  return Math.max(1, mesh.geometry.groups.length || mesh.material.length);
}
