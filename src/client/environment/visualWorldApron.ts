import * as THREE from 'three';
import type { AssetService } from '../assets';
import type { ArenaWorld } from '../../shared/sim/arenaWorld';

export type ApronQuality = 'high' | 'medium' | 'low';

export interface ApronPlacement {
  kind: 'building' | 'prop' | 'road' | 'silhouette';
  assetId?: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
}

export interface ApronPlan {
  seed: number;
  placements: ApronPlacement[];
  highCount: number;
  mediumCount: number;
  lowCount: number;
}

const QUALITY_RATIO: Record<ApronQuality, Record<ApronPlacement['kind'], number>> = {
  high: { building: 1, prop: 1, road: 1, silhouette: 1 },
  medium: { building: .7, prop: .7, road: .7, silhouette: .6 },
  low: { building: 0, prop: 0, road: .4, silhouette: .25 },
};

export function buildVisualWorldApronPlan(world: ArenaWorld): ApronPlan | null {
  const urban = world.arena?.urbanLayout;
  if (!urban) return null;
  const bounds = world.bounds ?? { minX: -world.half, maxX: world.half, minZ: -world.half, maxZ: world.half };
  const seed = (world.metadata?.arenaChecksum ?? world.arena?.candidateSeed ?? 0x5f3759df) >>> 0;
  const random = mulberry32(seed);
  const buildingAssets = [...new Set(urban.buildings.map((entry) => entry.assetId).filter(Boolean))] as string[];
  const propAssets = [...new Set(urban.decorations.map((entry) => entry.assetId).filter(Boolean))];
  const buildingScale = new Map(urban.buildings.map((entry) => [entry.assetId, entry.modelScale ?? 1]));
  const propScale = new Map(urban.decorations.map((entry) => [entry.assetId, entry.scale]));
  const placements: ApronPlacement[] = [];
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;
  const halfX = (bounds.maxX - bounds.minX) / 2;
  const halfZ = (bounds.maxZ - bounds.minZ) / 2;

  // Near parallax layer: authored families, entirely outside real bounds.
  for (let i = 0; i < 112; i++) {
    const p = pointOnOuterRing(random, centerX, centerZ, halfX + 14, halfZ + 14, 58);
    const assetId = buildingAssets[i % Math.max(1, buildingAssets.length)];
    const baseScale = buildingScale.get(assetId) ?? 1;
    placements.push({
      kind: 'building',
      assetId,
      x: p.x, y: .06, z: p.z,
      yaw: Math.floor(random() * 4) * Math.PI / 2,
      scaleX: baseScale * (.76 + random() * .38),
      scaleY: baseScale * (.76 + random() * .48),
      scaleZ: baseScale * (.76 + random() * .38),
    });
  }
  for (let i = 0; i < 24; i++) {
    const p = pointOnOuterRing(random, centerX, centerZ, halfX + 8, halfZ + 8, 38);
    const assetId = propAssets[i % Math.max(1, propAssets.length)];
    const baseScale = propScale.get(assetId) ?? 1;
    placements.push({
      kind: 'prop', assetId,
      x: p.x, y: 0, z: p.z, yaw: random() * Math.PI * 2,
      scaleX: baseScale, scaleY: baseScale, scaleZ: baseScale,
    });
  }
  for (let i = 0; i < 20; i++) {
    const p = pointOnOuterRing(random, centerX, centerZ, halfX + 4, halfZ + 4, 26);
    placements.push({
      kind: 'road', x: p.x, y: -.08, z: p.z, yaw: i % 2 ? 0 : Math.PI / 2,
      scaleX: 18 + random() * 18, scaleY: .12, scaleZ: 7.2,
    });
  }
  // Far skyline: intentionally primitive and material-shared.
  for (let i = 0; i < 72; i++) {
    const p = pointOnOuterRing(random, centerX, centerZ, halfX + 80, halfZ + 80, 95);
    placements.push({
      kind: 'silhouette', x: p.x, y: 0, z: p.z, yaw: Math.floor(random() * 4) * Math.PI / 2,
      scaleX: 7 + random() * 16, scaleY: 12 + random() * 34, scaleZ: 7 + random() * 14,
    });
  }
  return {
    seed,
    placements,
    highCount: placements.length,
    mediumCount: countForQuality(placements, 'medium'),
    lowCount: countForQuality(placements, 'low'),
  };
}

export class VisualWorldApron {
  readonly group = new THREE.Group();
  readonly plan: ApronPlan | null;
  private readonly meshes: THREE.InstancedMesh[] = [];
  private quality: ApronQuality = 'high';

  constructor(scene: THREE.Scene, assets: AssetService, world: ArenaWorld) {
    this.group.name = 'VisualWorldApron';
    this.plan = buildVisualWorldApronPlan(world);
    if (this.plan) this.build(assets, world);
    scene.add(this.group);
  }

  setQuality(quality: ApronQuality): void {
    if (quality === this.quality) return;
    this.quality = quality;
    for (const mesh of this.meshes) {
      const maximum = Number(mesh.userData.apronMaximum ?? mesh.count);
      const kind = mesh.userData.apronKind as ApronPlacement['kind'];
      mesh.count = Math.max(0, Math.floor(maximum * QUALITY_RATIO[quality][kind]));
    }
  }

  setEnabled(enabled: boolean): void {
    this.group.visible = enabled && this.plan !== null;
  }

  diagnostics(): { enabled: boolean; quality: ApronQuality; instances: number; drawCalls: number; castsShadows: boolean } {
    return {
      enabled: this.plan !== null && this.group.visible,
      quality: this.quality,
      instances: this.meshes.reduce((sum, mesh) => sum + mesh.count, 0),
      drawCalls: this.meshes.length,
      castsShadows: this.meshes.some((mesh) => mesh.castShadow || mesh.receiveShadow),
    };
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    for (const child of [...this.group.children]) this.group.remove(child);
    for (const mesh of this.meshes) {
      if (mesh.userData.apronOwnedGeometry) mesh.geometry.dispose();
      if (mesh.userData.apronOwnedMaterial) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) material.dispose();
      }
    }
    this.meshes.length = 0;
  }

  private build(assets: AssetService, world: ArenaWorld): void {
    const plan = this.plan!;
    const modelEntries = plan.placements.filter((entry) => (entry.kind === 'building' || entry.kind === 'prop') && entry.assetId);
    const byAsset = new Map<string, ApronPlacement[]>();
    for (const entry of modelEntries) {
      const list = byAsset.get(entry.assetId!) ?? [];
      list.push(entry);
      byAsset.set(entry.assetId!, list);
    }
    for (const [assetId, placements] of byAsset) {
      const prototype = assets.model(assetId);
      prototype.updateMatrixWorld(true);
      prototype.traverse((node) => {
        const source = node as THREE.Mesh;
        if (!source.isMesh || !(source.geometry instanceof THREE.BufferGeometry)) return;
        const mesh = new THREE.InstancedMesh(source.geometry, source.material, placements.length);
        this.populate(mesh, placements, source.matrixWorld);
        this.addMesh(mesh, placements.length, placements[0].kind);
      });
    }
    const roads = plan.placements.filter((entry) => entry.kind === 'road');
    if (roads.length) {
      const mesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: 0x343b3b, roughness: 1 }),
        roads.length,
      );
      mesh.userData.apronOwnedGeometry = true;
      mesh.userData.apronOwnedMaterial = true;
      this.populate(mesh, roads);
      this.addMesh(mesh, roads.length, 'road');
    }
    const skyline = plan.placements.filter((entry) => entry.kind === 'silhouette');
    if (skyline.length) {
      const mesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: 0x405052, roughness: 1, fog: true }),
        skyline.length,
      );
      mesh.userData.apronOwnedGeometry = true;
      mesh.userData.apronOwnedMaterial = true;
      this.populate(mesh, skyline, undefined, true);
      this.addMesh(mesh, skyline.length, 'silhouette');
    }
    void world;
  }

  private populate(mesh: THREE.InstancedMesh, placements: readonly ApronPlacement[], sourceMatrix?: THREE.Matrix4, groundAnchor = false): void {
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    placements.forEach((entry, index) => {
      rotation.setFromAxisAngle(up, entry.yaw);
      position.set(entry.x, entry.y + (groundAnchor ? entry.scaleY / 2 : 0), entry.z);
      scale.set(entry.scaleX, entry.scaleY, entry.scaleZ);
      matrix.compose(position, rotation, scale);
      if (sourceMatrix) matrix.multiply(sourceMatrix);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }

  private addMesh(mesh: THREE.InstancedMesh, maximum: number, kind: ApronPlacement['kind']): void {
    mesh.name = 'VisualWorldApron.InstanceBatch';
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = true;
    mesh.userData.apronMaximum = maximum;
    mesh.userData.apronKind = kind;
    this.meshes.push(mesh);
    this.group.add(mesh);
  }
}

function pointOnOuterRing(
  random: () => number,
  centerX: number,
  centerZ: number,
  halfX: number,
  halfZ: number,
  depth: number,
): { x: number; z: number } {
  const side = Math.floor(random() * 4);
  const along = random() * 2 - 1;
  const offset = 2 + random() * depth;
  if (side === 0) return { x: centerX + along * (halfX + depth), z: centerZ - halfZ - offset };
  if (side === 1) return { x: centerX + halfX + offset, z: centerZ + along * (halfZ + depth) };
  if (side === 2) return { x: centerX + along * (halfX + depth), z: centerZ + halfZ + offset };
  return { x: centerX - halfX - offset, z: centerZ + along * (halfZ + depth) };
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function countForQuality(placements: readonly ApronPlacement[], quality: ApronQuality): number {
  const totals: Record<ApronPlacement['kind'], number> = { building: 0, prop: 0, road: 0, silhouette: 0 };
  for (const placement of placements) totals[placement.kind]++;
  return (Object.keys(totals) as ApronPlacement['kind'][]).reduce(
    (count, kind) => count + Math.floor(totals[kind] * QUALITY_RATIO[quality][kind]),
    0,
  );
}
