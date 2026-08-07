import * as THREE from 'three';
import type { Obstacle } from '../shared/arena';
import type { ArenaWorld } from '../shared/sim/arenaWorld';
import type { AssetService } from './assets';
import { setClientGroundHeightAt } from './groundQuery';
import {
  buildCliffWallChunks,
  buildTerrainChunks,
  cliffWallMaterial,
  updateChunkLod,
} from './map-debug/terrainMesh';
import { buildCameraCollisionIndex, type CameraCollisionQuery } from './cameraCollision';
import { TerrainMaterialFactory } from './materials/terrainMaterialFactory';
import type { TerrainMaterialProfileDef } from '../shared/mapgen/profiles';
import type { UrbanVisualPlacement } from '../shared/mapgen/urbanLayout';

export interface Collider {
  box: THREE.Box3;
  /** Pre-expanded camera AABB (built at arena construction; M5). */
  expanded?: THREE.Box3;
  type: string;
}


const LEGACY_PROCEDURAL_FALLBACK: TerrainMaterialProfileDef = {
  id: 'terrainMaterial.legacyProcedural',
  label: 'Legacy Procedural Ground',
  kind: 'proceduralFallback',
  tileSizeMeters: 8,
  baseColor: '#8a7a55',
  gridColor: '#493d29',
  patchColor: '#785f37',
  roughness: 0.92,
  metalness: 0.02,
};

function hazardTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#3a3026';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#f2a23b';
  for (let i = -1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 48, 128);
    ctx.lineTo(i * 48 + 32, 128);
    ctx.lineTo(i * 48 + 64, 0);
    ctx.lineTo(i * 48 + 32, 0);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function cloneScaled(assets: AssetService, id: string, sx: number, sy: number, sz: number, x: number, z: number, y = 0, ry = 0): THREE.Object3D {
  const m = assets.model(id).clone(true);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  return m;
}

function boxMat(color: number, rough = 0.75): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.12, flatShading: true });
}

function boxMesh(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/**
 * Arena view built from the match-scoped ArenaWorld. Generated worlds get
 * chunked terrain (LOD + frustum culling) whose vertices agree with the
 * authoritative heightfield; legacy worlds keep the flat ground view.
 * Rendering never mutates authoritative data.
 */
export class ArenaView {
  group = new THREE.Group();
  colliders: Collider[] = [];
  cameraQuery: CameraCollisionQuery | null = null;
  barrelMeshes = new Map<number, THREE.Object3D>();
  private readonly world: ArenaWorld;
  private readonly assets: AssetService;
  private readonly materialFactory: TerrainMaterialFactory;
  private readonly chunks: ReturnType<typeof buildTerrainChunks> = [];
  private readonly disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture | THREE.Object3D> = [];

  constructor(assets: AssetService, world: ArenaWorld) {
    this.assets = assets;
    this.world = world;
    this.materialFactory = new TerrainMaterialFactory({ assets });
    setClientGroundHeightAt((x, z) => world.groundHeightAt(x, z));
    this.build();
    this.cameraQuery = buildCameraCollisionIndex(this.colliders);
  }

  private build() {
    const half = this.world.half;
    if (this.world.heightfield) {
      this.buildTerrainChunks();
    } else {
      this.buildLegacyGround(half);
    }

    if (this.world.arena?.urbanLayout) {
      this.buildUrbanPlacements(this.world.arena.urbanLayout.roads);
      this.buildUrbanPlacements(this.world.arena.urbanLayout.decorations);
    }

    // Ramps.
    for (const ramp of this.world.ramps) {
      const model = this.assets.model('arena.ramp');
      model.scale.set(ramp.w, ramp.rise, ramp.d);
      model.position.set(ramp.x, ramp.baseY, ramp.z);
      model.rotation.y = Math.atan2(ramp.dirX, ramp.dirZ);
      model.traverse((o) => {
        o.castShadow = true;
        o.receiveShadow = true;
      });
      this.group.add(model);
      this.disposables.push(model);
      this.colliders.push({
        box: new THREE.Box3(
          new THREE.Vector3(ramp.x - ramp.w / 2, 0, ramp.z - ramp.d / 2),
          new THREE.Vector3(ramp.x + ramp.w / 2, ramp.baseY + ramp.rise, ramp.z + ramp.d / 2),
        ),
        type: 'ramp',
      });
    }

    // Obstacles (authoritative colliders, visibly represented).
    for (const o of this.world.obstacles) {
      this.buildObstacle(o);
    }

    // Barrels.
    for (const b of this.world.barrels) {
      const mesh = this.assets.model('prop.explosiveBarrel').clone(true);
      mesh.position.set(b.x, 0, b.z);
      mesh.rotation.y = Math.random() * Math.PI;
      this.group.add(mesh);
      this.barrelMeshes.set(b.id, mesh);
      this.disposables.push(mesh);
      this.colliders.push({ box: new BoxAround(b.x, b.z, 0.9, 0.9, 1.1), type: 'barrel' });
    }

    // Client-only decorations + data-driven light poles as instanced meshes.
    this.buildDecorations();
  }

  private buildLegacyGround(half: number) {
    const profile = this.world.arena?.terrainMaterialProfile ?? LEGACY_PROCEDURAL_FALLBACK;
    const planeWidth = half * 2 + 4;
    const planeDepth = half * 2 + 4;
    const material = this.materialFactory.create(profile, {
      repeatOverride: {
        x: planeWidth / profile.tileSizeMeters,
        y: planeDepth / profile.tileSizeMeters,
      },
    });
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(planeWidth, planeDepth),
      material,
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    this.group.add(ground);
    this.disposables.push(ground.geometry, ground.material as THREE.Material);

    const bowl = new THREE.Mesh(
      new THREE.CircleGeometry(7.4, 32),
      new THREE.MeshStandardMaterial({ color: 0x5e5340, roughness: 0.9, flatShading: true }),
    );
    bowl.rotation.x = -Math.PI / 2;
    bowl.position.y = -0.4;
    bowl.receiveShadow = true;
    this.group.add(bowl);
    this.disposables.push(bowl.geometry, bowl.material as THREE.Material);
    const bowlRing = new THREE.Mesh(
      new THREE.TorusGeometry(7.4, 0.22, 6, 40),
      boxMat(0xd8c08a, 0.6),
    );
    bowlRing.rotation.x = -Math.PI / 2;
    bowlRing.position.y = -0.38;
    this.group.add(bowlRing);
    this.disposables.push(bowlRing.geometry, bowlRing.material as THREE.Material);
  }

  private buildTerrainChunks() {
    const hf = this.world.heightfield!;
    const profile = this.world.arena?.terrainMaterialProfile ?? LEGACY_PROCEDURAL_FALLBACK;
    const material = this.materialFactory.create(profile);
    this.disposables.push(material);
    const chunks = buildTerrainChunks(hf, this.world.half, material);
    for (const c of chunks) {
      this.group.add(c.mesh);
      this.disposables.push(c.full, c.half);
    }
    this.chunks.push(...chunks);
    const arena = this.world.arena;
    if (arena && arena.cliffEdges.length > 0) {
      const wallMaterial = cliffWallMaterial(arena.terrainProfile.cliffMaterialId);
      this.disposables.push(wallMaterial);
      const wallGeos = buildCliffWallChunks(hf, arena.cliffEdges, -this.world.half, -this.world.half);
      for (const geo of wallGeos) {
        if (geo.attributes.position.count === 0) {
          geo.dispose();
          continue;
        }
        const mesh = new THREE.Mesh(geo, wallMaterial);
        mesh.frustumCulled = true;
        this.group.add(mesh);
        this.disposables.push(mesh);
      }
      // Camera collision: cliff walls are camera colliders so the TPS rig
      // pulls in instead of clipping through them (tank physics stays on
      // the heightfield + step guard).
      for (const e of arena.cliffEdges) {
        const minX = Math.min(e.ax, e.bx) - 0.9;
        const maxX = Math.max(e.ax, e.bx) + 0.9;
        const minZ = Math.min(e.az, e.bz) - 0.9;
        const maxZ = Math.max(e.az, e.bz) + 0.9;
        this.colliders.push({
          box: new THREE.Box3(
            new THREE.Vector3(minX, Math.min(e.topY, e.bottomY) - 0.5, minZ),
            new THREE.Vector3(maxX, Math.max(e.topY, e.bottomY) + 0.5, maxZ),
          ),
          type: 'cliff',
        });
      }
    }
  }

  private buildDecorations() {
    const layout = this.world.arena?.layout;
    if (!layout) return;
    const decorations = layout.objects.filter((o) => !o.collider || o.kind === 'lightPole');
    const byAsset = new Map<string, typeof decorations>();
    for (const d of decorations) {
      const list = byAsset.get(d.assetId) ?? [];
      list.push(d);
      byAsset.set(d.assetId, list);
    }
    for (const [assetId, items] of byAsset) {
      const proto = this.assets.model(assetId) as THREE.Mesh;
      const protoGeo = proto.geometry instanceof THREE.BufferGeometry
        ? proto.geometry
        : new THREE.BoxGeometry(0.7, 0.7, 0.7);
      const protoMat =
        proto.material instanceof THREE.Material
          ? proto.material
          : new THREE.MeshStandardMaterial({ color: 0x8a7a55 });
      const mesh = new THREE.InstancedMesh(
        protoGeo,
        protoMat,
        items.length,
      );
      const matrix = new THREE.Matrix4();
      const quat = new THREE.Quaternion();
      const scale = new THREE.Vector3(0.7, 0.7, 0.7);
      items.forEach((item, i) => {
        quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), item.yaw);
        matrix.compose(new THREE.Vector3(item.x, item.h ?? 0.5, item.z), quat, scale);
        mesh.setMatrixAt(i, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = true;
      this.group.add(mesh);
      this.disposables.push(mesh);
    }
  }

  /**
   * Roads and street dressing are rigid source-pack models. Instancing keeps
   * the 400 m connected street graph to a small, bounded number of draw calls.
   * Source materials are reused unchanged: no tint or material override.
   */
  private buildUrbanPlacements(placements: readonly UrbanVisualPlacement[]) {
    const byAsset = new Map<string, UrbanVisualPlacement[]>();
    for (const placement of placements) {
      const list = byAsset.get(placement.assetId) ?? [];
      list.push(placement);
      byAsset.set(placement.assetId, list);
    }
    const placementMatrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (const [assetId, items] of byAsset) {
      const prototype = this.assets.model(assetId);
      prototype.updateMatrixWorld(true);
      prototype.traverse((node) => {
        const source = node as THREE.Mesh;
        if (!source.isMesh || !(source.geometry instanceof THREE.BufferGeometry)) return;
        const mesh = new THREE.InstancedMesh(source.geometry, source.material, items.length);
        mesh.castShadow = source.castShadow;
        mesh.receiveShadow = true;
        items.forEach((item, index) => {
          rotation.setFromAxisAngle(up, item.yaw);
          scale.setScalar(item.scale);
          placementMatrix.compose(new THREE.Vector3(item.x, item.y, item.z), rotation, scale);
          mesh.setMatrixAt(index, placementMatrix.clone().multiply(source.matrixWorld));
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.frustumCulled = true;
        this.group.add(mesh);
      });
    }
  }

  private buildObstacle(o: Obstacle) {
    const { x, z, w, d, h } = o;
    let mesh: THREE.Object3D;
    switch (o.type) {
      case 'container':
        mesh = cloneScaled(this.assets, 'prop.container', w / 2.4, h / 2.4, d / 5.8, x, z, h / 2);
        break;
      case 'barrier':
        mesh = cloneScaled(this.assets, 'prop.barrier', w / 2.0, h / 0.9, d / 0.32, x, z, h / 2);
        break;
      case 'tires':
        mesh = cloneScaled(this.assets, 'prop.tire', w / 2.4, h / 2.5, d / 2.4, x, z, h / 2);
        break;
      case 'factory':
        mesh = cloneScaled(this.assets, 'arena.factory', w / 5, h / 6, d / 4, x, z, h / 2);
        break;
      case 'wall': {
        const g = new THREE.Group();
        g.add(boxMesh(w, h, d, boxMat(0x7b6f58, 0.9), 0, h / 2, 0));
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, d + 0.06), new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.8 }));
        stripe.position.y = h - 0.28;
        g.add(stripe);
        mesh = g;
        this.disposables.push(stripe.material as THREE.Material, stripe.geometry);
        break;
      }
      case 'crusher': {
        const g = new THREE.Group();
        const mat = boxMat(0x5c4f3f, 0.85);
        g.add(boxMesh(0.5, h, d, mat, -w / 2, h / 2, 0));
        g.add(boxMesh(0.5, h, d, mat, w / 2, h / 2, 0));
        const head = boxMesh(w - 1.2, 1.2, d - 0.4, boxMat(0x8a2f2f, 0.6), 0, h - 0.6, 0);
        g.add(head);
        const stripeMat = new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.8 });
        g.add(boxMesh(0.7, 0.7, d + 0.1, stripeMat, 0, h - 0.35, 0));
        mesh = g;
        this.disposables.push(stripeMat, head.geometry);
        break;
      }
      case 'towerBase': {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(new THREE.CylinderGeometry(Math.max(w, d) / 2, Math.max(w, d) / 2 * 1.15, h, 12), boxMat(0x6c5a48, 0.8)));
        g.position.y = h / 2;
        g.position.x = x;
        g.position.z = z;
        mesh = g;
        break;
      }
      case 'scrapPile': {
        const g = new THREE.Group();
        const mat = boxMat(0x6f6657, 0.9);
        for (let i = 0; i < 7; i++) {
          const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45 + Math.random() * 0.7, 0), mat);
          s.position.set((Math.random() - 0.5) * w * 0.7, 0.4 + Math.random() * (h - 0.8), (Math.random() - 0.5) * d * 0.7);
          s.rotation.set(Math.random(), Math.random(), Math.random());
          s.castShadow = true;
          g.add(s);
        }
        g.position.x = x;
        g.position.z = z;
        mesh = g;
        break;
      }
      case 'urbanBuilding':
      case 'urbanProp': {
        if (!o.assetId || !o.modelScale) {
          mesh = boxMesh(w, h, d, boxMat(0x5c5345), x, h / 2, z);
          break;
        }
        mesh = this.assets.model(o.assetId);
        mesh.scale.setScalar(o.modelScale);
        mesh.rotation.y = o.yaw ?? 0;
        mesh.position.set(x, 0.06, z);
        mesh.traverse((node) => {
          node.castShadow = true;
          node.receiveShadow = true;
        });
        break;
      }
      default:
        mesh = boxMesh(w, h, d, boxMat(0x5c5345), x, h / 2, z);
    }
    if (o.type !== 'towerBase' && o.type !== 'scrapPile' && o.type !== 'urbanBuilding' && o.type !== 'urbanProp') {
      mesh.position.x = x;
      mesh.position.z = z;
      mesh.position.y = h / 2;
    }
    this.group.add(mesh);
    if (o.type !== 'urbanBuilding' && o.type !== 'urbanProp') this.disposables.push(mesh);
    this.colliders.push({ box: new BoxAround(x, z, w, d, h), type: o.type });
  }

  /** Per-frame LOD + culling maintenance (cheap geometry swap). */
  update(cameraPosition: THREE.Vector3): void {
    updateChunkLod(this.chunks, cameraPosition);
  }

  /** Remove everything and release per-view resources (rematch-safe). */
  dispose(): void {
    for (const chunk of this.chunks) {
      this.group.remove(chunk.mesh);
    }
    this.chunks.length = 0;
    for (const d of this.disposables) {
      if (d instanceof THREE.BufferGeometry) d.dispose();
      else if (d instanceof THREE.Material) {
        d.dispose();
      } else if (d instanceof THREE.Texture) d.dispose();
      else if (d instanceof THREE.Object3D) {
        d.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.geometry) m.geometry.dispose();
          const mat = m.material as THREE.Material | THREE.Material[] | undefined;
          if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
          else if (mat) mat.dispose();
        });
      }
    }
    this.disposables.length = 0;
    this.materialFactory.dispose();
    this.colliders.length = 0;
    this.barrelMeshes.clear();
  }
}

class BoxAround extends THREE.Box3 {
  constructor(x: number, z: number, w: number, d: number, h: number) {
    super();
    this.min.set(x - w / 2, 0, z - d / 2);
    this.max.set(x + w / 2, h, z + d / 2);
  }
}

export function rayAabbT(origin: THREE.Vector3, dir: THREE.Vector3, box: THREE.Box3): number | null {
  let tmin = 0;
  let tmax = 1e9;
  for (let i = 0; i < 3; i++) {
    const o = origin.getComponent(i);
    const d = dir.getComponent(i);
    const lo = box.min.getComponent(i);
    const hi = box.max.getComponent(i);
    if (Math.abs(d) < 1e-8) {
      if (o < lo || o > hi) return null;
      continue;
    }
    let t1 = (lo - o) / d;
    let t2 = (hi - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin > 0 ? tmin : null;
}

export function cameraRayHit(colliders: Collider[], origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): number {
  let best = maxDist;
  for (const c of colliders) {
    const t = rayAabbT(origin, dir, c.box);
    if (t !== null && t < best && t > 0.05) best = t;
  }
  return best;
}
