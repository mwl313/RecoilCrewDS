import * as THREE from 'three';
import type { XpShardState } from '../../shared/types';

const CAPACITY = 128;
const POP_DURATION = 0.3;

/**
 * Bounded instanced XP-shard presentation (bug-fix phase 5).
 * Live shards hover/pulse/rotate above the grass; when a shard disappears
 * from authoritative state (collected or expired) a short pop plays.
 */
export class XpShardRenderer {
  private readonly mesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly slots = new Map<number, number>();
  private readonly free: number[] = [];
  private readonly pops = new Map<number, { x: number; y: number; z: number; t: number }>();
  private readonly lastSeen = new Map<number, XpShardState>();
  private readonly liveColor = new THREE.Color(0x8fe8ff);
  private readonly popColor = new THREE.Color(1, 0.92, 0.45);

  constructor(scene: THREE.Scene) {
    const geometry = new THREE.OctahedronGeometry(0.2, 0);
    const material = new THREE.MeshBasicMaterial({
      color: 0x8fe8ff,
      transparent: true,
      opacity: 1,
      depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, CAPACITY);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    for (let i = CAPACITY - 1; i >= 0; i--) this.free.push(i);
  }

  update(shards: readonly XpShardState[], time: number, dt: number): void {
    const seen = new Set<number>();
    let index = 0;
    for (const shard of shards) {
      if (shard.collected) continue;
      seen.add(shard.id);
      let slot = this.slots.get(shard.id);
      if (slot === undefined) {
        slot = this.free.pop();
        if (slot === undefined) continue;
        this.slots.set(shard.id, slot);
      }
      this.dummy.position.set(shard.x, shard.y + Math.sin(time * 3.2 + shard.id) * 0.08, shard.z);
      this.dummy.scale.setScalar(1 + Math.sin(time * 4 + shard.id) * 0.15);
      this.dummy.rotation.set(time * 1.4 + shard.id, time * 1.8, 0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(slot, this.dummy.matrix);
      this.mesh.setColorAt(slot, this.liveColor);
      this.lastSeen.set(shard.id, shard);
      index++;
    }
    for (const [id, slot] of [...this.slots]) {
      if (seen.has(id)) continue;
      const last = this.lastSeen.get(id);
      this.slots.delete(id);
      this.free.push(slot);
      if (last) this.pops.set(id, { x: last.x, y: last.y, z: last.z, t: POP_DURATION });
      this.lastSeen.delete(id);
    }
    for (const [id, pop] of [...this.pops]) {
      pop.t -= dt;
      if (pop.t <= 0) {
        this.pops.delete(id);
        continue;
      }
      const slot = this.free.pop();
      if (slot === undefined) continue;
      const p = pop.t / POP_DURATION;
      this.dummy.position.set(pop.x, pop.y, pop.z);
      this.dummy.scale.setScalar(0.4 + (1 - p) * 1.3);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(slot, this.dummy.matrix);
      this.mesh.setColorAt(slot, this.popColor);
      this.free.push(slot);
      index++;
    }
    this.mesh.count = index;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.parent?.remove(this.mesh);
  }
}
