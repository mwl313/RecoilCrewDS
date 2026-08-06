import * as THREE from 'three';
import type { XpShardState } from '../../shared/types';

/**
 * Bounded instanced XP-shard presentation (second-pass fix).
 *
 * Live and pop instances are packed contiguously every frame:
 *
 *   indices 0..L-1        live shards (authoritative, visible)
 *   indices L..L+P-1      pop effects (removal presentation)
 *   mesh.count = L + P
 *
 * A separate always-available indicator mesh represents live shards beyond
 * the hard capacity (one visible cluster at the overflow centroid).
 *
 * Persistent arbitrary slots are gone: removing any shard never hides a
 * remaining shard because matrices are rewritten from index 0 each frame.
 *
 * Overflow policy (deterministic, no silent invisible XP):
 * - every live authoritative shard up to CAPACITY is rendered individually;
 * - live shards beyond CAPACITY are represented by one visible cluster
 *   indicator at the overflow centroid plus a diagnostic warning;
 * - pop effects are presentation-only and may be dropped after live shards
 *   when capacity is exhausted (documented, never hides XP);
 * - authoritative state is never mutated by this renderer.
 */
const CAPACITY = 512;
const OVERFLOW_WARN_RATIO = 0.8;
const POP_DURATION = 0.3;

export class XpShardRenderer {
  readonly mesh: THREE.InstancedMesh;
  readonly overflowIndicator: THREE.Mesh;
  readonly capacity = CAPACITY;
  /** Live shards beyond capacity (aggregate indicator count). */
  overflow = 0;
  /** Total live shards attempted this frame (before capacity). */
  liveCount = 0;
  /** Pop effects drawn this frame. */
  popCount = 0;
  /** Diagnostics/telemetry for pressure testing. */
  readonly telemetry = { peakLive: 0, overflowEvents: 0, lastWarnAt: -1 };
  private readonly dummy = new THREE.Object3D();
  private readonly pops = new Map<number, { x: number; y: number; z: number; t: number }>();
  private readonly lastSeen = new Map<number, XpShardState>();
  private readonly liveColor = new THREE.Color(0x8fe8ff);
  private readonly popColor = new THREE.Color(1, 0.92, 0.45);
  private readonly overflowColor = new THREE.Color(1, 0.45, 0.2);

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
    const overflowMaterial = new THREE.MeshBasicMaterial({
      color: 0xff7a33,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    this.overflowIndicator = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.55, 1),
      overflowMaterial,
    );
    this.overflowIndicator.visible = false;
    scene.add(this.overflowIndicator);
  }

  update(shards: readonly XpShardState[], time: number, dt: number): void {
    const seen = new Set<number>();
    let index = 0;
    this.liveCount = 0;
    this.overflow = 0;
    let overflowX = 0;
    let overflowY = 0;
    let overflowZ = 0;
    let overflowN = 0;

    // Pass 1: live shards, packed contiguously from index 0.
    for (const shard of shards) {
      if (shard.collected) continue;
      seen.add(shard.id);
      this.liveCount++;
      if (index >= CAPACITY) {
        this.overflow++;
        overflowX += shard.x;
        overflowY += shard.y;
        overflowZ += shard.z;
        overflowN++;
        continue;
      }
      this.dummy.position.set(shard.x, shard.y + Math.sin(time * 3.2 + shard.id) * 0.08, shard.z);
      this.dummy.scale.setScalar(1 + Math.sin(time * 4 + shard.id) * 0.15);
      this.dummy.rotation.set(time * 1.4 + shard.id, time * 1.8, 0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(index, this.dummy.matrix);
      this.mesh.setColorAt(index, this.liveColor);
      this.lastSeen.set(shard.id, shard);
      index++;
    }

    // Detect removals (collected/expired) and start one pop per removal.
    for (const [id, last] of [...this.lastSeen]) {
      if (seen.has(id)) continue;
      this.lastSeen.delete(id);
      this.pops.set(id, { x: last.x, y: last.y, z: last.z, t: POP_DURATION });
    }

    // Pass 2: pop effects, packed after all live shards. Pops are
    // presentation-only; when capacity is exhausted they are dropped
    // deterministically after live shards (documented policy).
    this.popCount = 0;
    for (const [id, pop] of [...this.pops]) {
      pop.t -= dt;
      if (pop.t <= 0) {
        this.pops.delete(id);
        continue;
      }
      if (index >= CAPACITY) continue;
      const p = pop.t / POP_DURATION;
      this.dummy.position.set(pop.x, pop.y, pop.z);
      this.dummy.scale.setScalar(0.4 + (1 - p) * 1.3);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(index, this.dummy.matrix);
      this.mesh.setColorAt(index, this.popColor);
      index++;
      this.popCount++;
    }

    // Pass 3: deterministic overflow indicator (never silent invisible XP).
    if (this.overflow > 0) {
      const n = Math.max(1, overflowN);
      this.overflowIndicator.position.set(
        overflowX / n,
        overflowY / n + 0.8,
        overflowZ / n,
      );
      const s = 1.4 + Math.min(4, this.overflow * 0.03);
      this.overflowIndicator.scale.setScalar(s);
      this.overflowIndicator.visible = true;
    } else {
      this.overflowIndicator.visible = false;
    }

    this.telemetry.peakLive = Math.max(this.telemetry.peakLive, this.liveCount);
    if (this.overflow > 0) this.telemetry.overflowEvents++;
    const nearCapacity = this.liveCount >= CAPACITY * OVERFLOW_WARN_RATIO;
    if (nearCapacity && (this.telemetry.lastWarnAt < 0 || time - this.telemetry.lastWarnAt > 5)) {
      this.telemetry.lastWarnAt = time;
      console.warn(
        `[xp] shard pressure: ${this.liveCount} live (capacity ${CAPACITY})` +
          (this.overflow > 0 ? `, ${this.overflow} in visible overflow cluster` : ''),
      );
    }

    this.mesh.count = index;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** Clear every internal map and the draw count (rematch/reset). */
  reset(): void {
    this.lastSeen.clear();
    this.pops.clear();
    this.overflow = 0;
    this.liveCount = 0;
    this.popCount = 0;
    this.overflowIndicator.visible = false;
    this.mesh.count = 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.reset();
    this.overflowIndicator.geometry.dispose();
    (this.overflowIndicator.material as THREE.Material).dispose();
    this.overflowIndicator.parent?.remove(this.overflowIndicator);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.parent?.remove(this.mesh);
  }
}
