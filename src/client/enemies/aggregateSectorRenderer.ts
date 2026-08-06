import * as THREE from 'three';
import type { AssetService } from '../assets';
import type { EnemyPresentationProfileDefinition } from '../../shared/animation/animationProfileTypes';
import { ENEMY_DEFINITION_SIZE_TIER } from '../../generated/monsterDimensions.generated';
import { resolveMonsterDimensionsForDefId } from '../../shared/monsters/monsterNormalization';
import { localFootOffset } from '../app/monsterTransform';

export interface AggregateSectorRecord {
  sectorId: number;
  x: number;
  z: number;
  count: number;
  presentationProfileId?: string;
  enemyDefId?: string;
  presentationSeed: number;
}

export interface AggregateSectorResolver {
  (sector: AggregateSectorRecord): EnemyPresentationProfileDefinition | null;
}

interface AggregateGroup {
  root: THREE.Object3D;
  instanced: THREE.InstancedMesh[];
  material: THREE.Material | null;
  slots: Map<number, number>;
  capacity: number;
  loaded: boolean;
  procedural: boolean;
  /** Profile id -> measured local foot offset at profile scale/rotation. */
  footOffsets: Map<string, number>;
}

/**
 * Far-sector aggregate presentation (Monster Pack 10).
 *
 * One shared mesh group per aggregate asset id; sectors are instances, never
 * individual enemy hierarchies, and never use AnimationMixer. Procedural
 * fallback is preserved when the asset is unavailable.
 */
export class AggregateSectorRenderer {
  private readonly groups = new Map<string, AggregateGroup>();
  private readonly pending = new Map<string, Promise<void>>();
  private readonly dummy = new THREE.Object3D();
  private lastSectors: readonly AggregateSectorRecord[] = [];
  private lastTankX = 0;
  private lastTankZ = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly assets: AssetService,
    private readonly resolveProfile: AggregateSectorResolver,
    private readonly capacityPerAsset = 512,
    private readonly groundHeightAt: (x: number, z: number) => number = () => 0,
  ) {}

  update(sectors: readonly AggregateSectorRecord[], tankX: number, tankZ: number): void {
    this.lastSectors = sectors;
    this.lastTankX = tankX;
    this.lastTankZ = tankZ;
    const seen = new Set<string>();
    const byKey = new Map<string, AggregateSectorRecord[]>();
    for (const sector of sectors) {
      const profile = this.resolveProfile(sector);
      if (!profile?.aggregateModelAssetId) continue;
      const key = profile.aggregateModelAssetId;
      seen.add(key);
      let list = byKey.get(key);
      if (!list) {
        list = [];
        byKey.set(key, list);
      }
      list.push(sector);
    }
    for (const key of seen) this.ensureGroup(key);
    for (const [key, list] of byKey) {
      const group = this.groups.get(key);
      if (!group) continue;
      group.slots.clear();
      let index = 0;
      for (const sector of list) {
        if (index >= group.capacity) break;
        group.slots.set(sector.sectorId, index);
        const profile = this.resolveProfile(sector);
        const dims =
          sector.enemyDefId && ENEMY_DEFINITION_SIZE_TIER[sector.enemyDefId]
            ? resolveMonsterDimensionsForDefId(sector.enemyDefId)
            : undefined;
        const profileScale = profile?.transform?.scale;
        const sx = typeof profileScale === 'number' ? profileScale : (profileScale?.[0] ?? 1);
        const sy = typeof profileScale === 'number' ? profileScale : (profileScale?.[1] ?? 1);
        const sz = typeof profileScale === 'number' ? profileScale : (profileScale?.[2] ?? 1);
        const crowdScale = THREE.MathUtils.clamp(0.7 + Math.sqrt(Math.min(8, sector.count)) * 0.25, 0.7, 1.8);
        const dimsScale = dims?.finalScale ?? 1;
        const k = dimsScale * crowdScale;
        const rotation = profile?.transform?.rotation;
        const yaw = (sector.presentationSeed % 360) * (Math.PI / 180);
        this.dummy.rotation.set(rotation?.[0] ?? 0, (rotation?.[1] ?? 0) + yaw, rotation?.[2] ?? 0);
        this.dummy.scale.set(sx * k, sy * k, sz * k);
        // foot0 is the root-to-foot distance at profile scale; it scales
        // linearly with the sector's finalScale x crowdScale multiplier.
        const foot0 = profile
          ? this.footOffsetFor(profile, group)
          : dims
            ? dims.groundOffset / dimsScale
            : 0;
        const position = profile?.transform?.position;
        this.dummy.position.set(
          sector.x + (position?.[0] ?? 0) * k,
          this.groundHeightAt(sector.x, sector.z) + foot0 * k + (position?.[1] ?? 0) * k,
          sector.z + (position?.[2] ?? 0) * k,
        );
        this.dummy.updateMatrix();
        for (const mesh of group.instanced) mesh.setMatrixAt(index, this.dummy.matrix);
        index++;
      }
      for (const mesh of group.instanced) {
        mesh.count = index;
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
    // Remove stale groups for assets no longer referenced.
    for (const [key, group] of [...this.groups]) {
      if (!seen.has(key)) {
        this.disposeGroup(key, group);
      }
    }
  }

  private ensureGroup(assetId: string): void {
    if (this.groups.has(assetId) || this.pending.has(assetId)) return;
    const promise = this.assets
      .preloadModels([assetId])
      .then(() => {
        try {
          const prototype = this.assets.model(assetId).clone(true);
          const meshes: THREE.Mesh[] = [];
          prototype.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (mesh.isMesh) meshes.push(mesh);
          });
          if (meshes.length === 0) throw new Error('no meshes');
          const material = (meshes[0].material as THREE.MeshStandardMaterial).clone();
          const instanced = meshes.map((mesh) => {
            const im = new THREE.InstancedMesh(mesh.geometry, material, this.capacityPerAsset);
            im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            im.instanceColor = new THREE.InstancedBufferAttribute(
              new Float32Array(this.capacityPerAsset * 3),
              3,
            );
            im.frustumCulled = false;
            im.castShadow = false;
            im.receiveShadow = false;
            im.count = 0;
            this.scene.add(im);
            return im;
          });
          this.groups.set(assetId, {
            root: prototype,
            instanced,
            material,
            slots: new Map(),
            capacity: this.capacityPerAsset,
            loaded: true,
            procedural: false,
            footOffsets: new Map(),
          });
          // Re-apply sectors now that the group exists (async load).
          this.update(this.lastSectors, this.lastTankX, this.lastTankZ);
        } catch {
          this.installProcedural(assetId);
          this.update(this.lastSectors, this.lastTankX, this.lastTankZ);
        }
      })
      .catch(() => {
        this.installProcedural(assetId);
        this.update(this.lastSectors, this.lastTankX, this.lastTankZ);
      })
      .finally(() => this.pending.delete(assetId));
    this.pending.set(assetId, promise);
  }

  private installProcedural(assetId: string): void {
    if (this.groups.has(assetId)) return;
    const material = new THREE.MeshStandardMaterial({ color: 0x6f8f9f, roughness: 0.9 });
    const mesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.7, 1.1, 6), material, this.capacityPerAsset);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    this.scene.add(mesh);
    this.groups.set(assetId, {
      root: new THREE.Group(),
      instanced: [mesh],
      material,
      slots: new Map(),
      capacity: this.capacityPerAsset,
      loaded: true,
      procedural: true,
      footOffsets: new Map(),
    });
  }

  /**
   * Measured local foot offset for one profile/asset pair. The aggregate
   * prototype is posed with the profile rotation + full vector scale at
   * position 0; the resulting foot offset scales linearly with the sector's
   * `dims.finalScale x crowdScale`, so it is measured once per profile.
   */
  private footOffsetFor(
    profile: EnemyPresentationProfileDefinition,
    group: AggregateGroup,
  ): number {
    const cached = group.footOffsets.get(profile.id);
    if (cached !== undefined) return cached;
    if (group.procedural) {
      // Procedural cone foot sits at its base (local minY = 0).
      const offset = 0;
      group.footOffsets.set(profile.id, offset);
      return offset;
    }
    const prototype = group.root;
    prototype.rotation.set(0, 0, 0);
    prototype.scale.set(1, 1, 1);
    prototype.position.set(0, 0, 0);
    const rotation = profile.transform?.rotation;
    if (rotation) prototype.rotation.set(rotation[0], rotation[1], rotation[2]);
    const scale = profile.transform?.scale;
    const sx = typeof scale === 'number' ? scale : (scale?.[0] ?? 1);
    const sy = typeof scale === 'number' ? scale : (scale?.[1] ?? 1);
    const sz = typeof scale === 'number' ? scale : (scale?.[2] ?? 1);
    prototype.scale.set(sx, sy, sz);
    const offset = localFootOffset(prototype);
    group.footOffsets.set(profile.id, offset);
    return offset;
  }

  private disposeGroup(key: string, group: AggregateGroup): void {
    for (const mesh of group.instanced) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    if (group.material) group.material.dispose();
    this.groups.delete(key);
  }

  reset(): void {
    for (const [key, group] of [...this.groups]) this.disposeGroup(key, group);
    this.pending.clear();
  }

  get groupCount(): number {
    return this.groups.size;
  }

  get instanceCount(): number {
    let total = 0;
    for (const group of this.groups.values()) total += group.instanced[0]?.count ?? 0;
    return total;
  }

  get drawCalls(): number {
    let total = 0;
    for (const group of this.groups.values()) total += group.instanced.length;
    return total;
  }
}
