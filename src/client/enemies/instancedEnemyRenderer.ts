import * as THREE from 'three';
import type { AssetService } from '../assets';
import type { EnemyState } from '../../shared/types';
import { InstanceSlotPool } from './instanceSlotPool';

/**
 * Core Loop 06 M6: instanced fodder presentation. Ordinary enemies share a
 * bounded per-archetype instance batch instead of a cloned hierarchy each.
 * The slot pool is stable (free-list reuse, bounded), and special rigs
 * (elite/boss/complex specialists) remain unique per entity.
 */
export interface InstancedFodderState {
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
  flash: number;
  deathT: number;
  variant: number;
  visible: boolean;
  tier: 0 | 1 | 2 | 3;
}

export interface InstancedBatchHost {
  setTransform(slot: number, state: InstancedFodderState): void;
  setColor(slot: number, r: number, g: number, b: number): void;
  setCount(count: number): void;
  needsUpdate(): void;
}

export class InstancedEnemyRenderer {
  private readonly pool: InstanceSlotPool;
  private readonly slots = new Map<number, number>();
  private readonly states = new Map<number, InstancedFodderState>();

  constructor(
    private readonly host: InstancedBatchHost,
    capacity: number,
  ) {
    this.pool = new InstanceSlotPool(capacity);
  }

  /** True when this enemy type should use the instanced fodder path. */
  static isFodder(type: string): boolean {
    return type === 'scrapBug';
  }

  /** Allocate and/or refresh an instanced fodder. Returns false on overflow. */
  upsert(e: EnemyState, dt: number): boolean {
    const id = e.id;
    let slot: number | undefined = this.slots.get(id);
    if (slot === undefined) {
      const allocated = this.pool.alloc();
      if (allocated === null) return false;
      slot = allocated;
      this.slots.set(id, slot);
      this.states.set(id, {
        x: e.x,
        y: e.y,
        z: e.z,
        yaw: e.yaw,
        scale: 1,
        flash: 0,
        deathT: 0,
        variant: (id * 2654435761) >>> 24,
        visible: true,
        tier: 0,
      });
    }
    const state = this.states.get(id)!;
    state.x = e.x;
    state.y = e.y;
    state.z = e.z;
    state.yaw = e.yaw;
    state.flash = e.flash > 0 ? 1 : 0;
    if (e.alive) {
      state.deathT = 0;
      state.visible = true;
    } else {
      state.deathT += dt;
      state.visible = state.deathT <= 1.2;
    }
    if (state.visible) {
      this.host.setTransform(slot, state);
      const tint = FODDER_TINTS[state.variant % FODDER_TINTS.length];
      const f = state.flash;
      this.host.setColor(
        slot,
        tint.r + (1 - tint.r) * f,
        tint.g + (1 - tint.g) * f,
        tint.b + (1 - tint.b) * f,
      );
    }
    this.host.setCount(this.pool.activeCount);
    this.host.needsUpdate();
    return true;
  }

  remove(id: number): void {
    const slot = this.slots.get(id);
    if (slot === undefined) return;
    this.slots.delete(id);
    this.states.delete(id);
    this.pool.release(slot);
    this.host.setCount(this.pool.activeCount);
    this.host.needsUpdate();
  }

  reset(): void {
    this.slots.clear();
    this.states.clear();
    this.pool.reset();
    this.host.setCount(0);
    this.host.needsUpdate();
  }

  get activeCount(): number {
    return this.pool.activeCount;
  }

  get capacity(): number {
    return this.pool.max;
  }

  get hasFreeSlots(): boolean {
    return this.pool.activeCount < this.pool.max;
  }

  ids(): IterableIterator<number> {
    return this.slots.keys();
  }
}

const FODDER_TINTS = [
  { r: 1, g: 0.92, b: 0.82 },
  { r: 0.92, g: 1, b: 0.86 },
  { r: 0.95, g: 0.85, b: 1 },
  { r: 1, g: 0.86, b: 0.86 },
] as const;

/** THREE host: one InstancedMesh per source mesh in the archetype model. */
export function createScrapBugInstancedHost(
  scene: THREE.Scene,
  assets: AssetService,
  capacity: number,
): InstancedBatchHost {
  const prototype = assets.model('enemy.scrapBug').clone(true);
  const meshes: THREE.Mesh[] = [];
  prototype.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) meshes.push(mesh);
  });
  const batches: THREE.InstancedMesh[] = meshes.map((mesh) => {
    const material = (mesh.material as THREE.MeshStandardMaterial).clone();
    material.emissive = new THREE.Color(0x000000);
    const instanced = new THREE.InstancedMesh(mesh.geometry, material, capacity);
    instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    instanced.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    instanced.frustumCulled = false;
    instanced.castShadow = false;
    instanced.receiveShadow = true;
    instanced.count = 0;
    scene.add(instanced);
    return instanced;
  });
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  return {
    setTransform(slot, state) {
      if (state.deathT > 0) {
        const k = Math.max(0, 1 - state.deathT);
        dummy.position.set(state.x, state.y - state.deathT * 0.9, state.z);
        dummy.rotation.set(0, state.yaw, 0);
        dummy.scale.setScalar(state.scale * k);
      } else {
        dummy.position.set(state.x, state.y, state.z);
        dummy.rotation.set(0, state.yaw, 0);
        dummy.scale.setScalar(state.scale);
      }
      dummy.updateMatrix();
      for (const batch of batches) batch.setMatrixAt(slot, dummy.matrix);
    },
    setColor(slot, r, g, b) {
      color.setRGB(r, g, b);
      for (const batch of batches) batch.setColorAt(slot, color);
    },
    setCount(count) {
      for (const batch of batches) batch.count = Math.max(0, Math.min(capacity, count));
    },
    needsUpdate() {
      for (const batch of batches) {
        batch.instanceMatrix.needsUpdate = true;
        if (batch.instanceColor) batch.instanceColor.needsUpdate = true;
      }
    },
  };
}
