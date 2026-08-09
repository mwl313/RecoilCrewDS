import * as THREE from 'three';
import type { EnemyState, PickupState, ShellState } from '../../shared/types';
import type { EntityViewFactory } from './entityViewFactory';
import {
  createScrapBugInstancedHost,
  InstancedEnemyRenderer,
} from '../enemies/instancedEnemyRenderer';
import type { EnemyAnimationController } from '../animation/enemyAnimationController';
import { disposeOwnedMaterials } from '../animation/animationCleanup';
import { animationTelemetry } from '../animation/animationTelemetry';
import type {
  EnemyAnimationLodTier,
  FarEnemyPresentationRecord,
} from '../../shared/animation/animationProfileTypes';
import type { EnemyPresentationResolution } from '../animation/enemyPresentationResolver';
import type { ResolvedMonsterDimensions } from '../../shared/monsters/monsterNormalization';
import type { EnemyAnimationContinuity } from '../animation/enemyAnimationController';
import type { DistantEnemyMotion } from '../animation/distantEnemyMotion';
import { EnemyGroundPresenceRenderer } from '../enemies/enemyGroundPresenceRenderer';

export interface EnemyRig {
  group: THREE.Group;
  /** Stable visual envelope retained while the model variant changes. */
  motionRoot: THREE.Group;
  model: THREE.Object3D;
  /** Animation07: resolved content profile id and metadata. */
  presentationProfileId: string;
  presentationResolution: EnemyPresentationResolution;
  animation: EnemyAnimationController | null;
  currentLod: EnemyAnimationLodTier;
  modelVariant: 'near' | 'far' | 'aggregate';
  phaseSeed: number;
  animationContinuity: EnemyAnimationContinuity | null;
  farMotion: DistantEnemyMotion | null;
  head?: THREE.Object3D;
  materials: THREE.MeshStandardMaterial[];
  telegraph: THREE.Group;
  telegraphMat: THREE.MeshBasicMaterial;
  deadT: number;
  /** Bug-fix: authoritative normalized scale/ground offset for monsters. */
  dimensions?: ResolvedMonsterDimensions;
}

export interface PickupRig {
  group: THREE.Group;
  model: THREE.Object3D;
}

export interface ShellRig {
  group: THREE.Group;
  glow: THREE.Sprite;
  kind: string;
}

/**
 * Tracks live entity views by id. Rematches and Single Player restarts call reset(),
 * which removes every view from the scene and empties the maps — no growth
 * across rounds.
 */
export class EntityViewRegistry {
  readonly enemyRigs = new Map<number, EnemyRig>();
  readonly pickupRigs = new Map<number, PickupRig>();
  readonly shellRigs = new Map<number, ShellRig>();
  readonly fodder: InstancedEnemyRenderer;
  readonly groundPresence: EnemyGroundPresenceRenderer;
  readonly barrelMeshes = new Map<number, THREE.Object3D>();
  truckRig: THREE.Group;
  truckMarker: THREE.Group;
  shieldMesh: THREE.Mesh;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly factory: EntityViewFactory,
    groundHeightAt: (x: number, z: number) => number = () => 0,
  ) {
    this.fodder = new InstancedEnemyRenderer(
      createScrapBugInstancedHost(scene, factory.assets, FODDER_CAPACITY),
      FODDER_CAPACITY,
    );
    this.groundPresence = new EnemyGroundPresenceRenderer(
      scene,
      GROUND_PRESENCE_CAPACITY,
      groundHeightAt,
    );
    this.truckRig = new THREE.Group();
    this.truckMarker = factory.makeMarker(0xffd94d, 1.3, scene);
    this.truckMarker.visible = false;
    this.shieldMesh = new THREE.Mesh(
      new THREE.SphereGeometry(2.2, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0x5eeaff, transparent: true, opacity: 0.24, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.shieldMesh.visible = false;
    scene.add(this.shieldMesh);
  }

  registerTruckRig(rig: THREE.Group, scene: THREE.Scene): void {
    this.truckRig = rig;
    scene.add(rig);
  }

  registerBarrel(id: number, mesh: THREE.Object3D): void {
    this.barrelMeshes.set(id, mesh);
  }

  createEnemy(e: EnemyState): EnemyRig {
    // Presenters route fodder through the instanced path first; this unique
    // path remains as an overflow fallback and for special rigs.
    const rig = this.factory.createEnemyRig(e, this.scene);
    this.enemyRigs.set(e.id, rig);
    return rig;
  }

  upsertFodder(e: EnemyState, dt: number): boolean {
    return this.fodder.upsert(e, dt);
  }

  removeFodder(id: number): void {
    this.fodder.remove(id);
  }

  /** Release instanced slots whose enemy is no longer present. */
  sweepFodder(seen: ReadonlySet<number>): void {
    for (const id of this.fodder.ids()) {
      if (!seen.has(id)) this.fodder.remove(id);
    }
  }

  syncGroundPresence(
    enemies: readonly EnemyState[],
    focusX: number,
    focusZ: number,
    elapsedSeconds: number,
  ): void {
    this.groundPresence.sync(enemies, focusX, focusZ, elapsedSeconds);
  }

  createPickup(p: PickupState): PickupRig {
    const rig = this.factory.createPickupRig(p.kind, this.scene);
    this.pickupRigs.set(p.id, rig);
    return rig;
  }

  createShell(sh: ShellState): ShellRig {
    const rig = this.factory.createShellRig(sh, this.scene);
    this.shellRigs.set(sh.id, rig);
    return rig;
  }

  reset(): void {
    for (const rig of this.enemyRigs.values()) {
      this.disposeRig(rig);
      this.scene.remove(rig.group);
      this.scene.remove(rig.telegraph);
    }
    this.enemyRigs.clear();
    this.fodder.reset();
    this.groundPresence.reset();
    for (const rig of this.pickupRigs.values()) this.scene.remove(rig.group);
    this.pickupRigs.clear();
    for (const rig of this.shellRigs.values()) this.scene.remove(rig.group);
    this.shellRigs.clear();
    this.truckRig.visible = false;
    this.truckMarker.visible = false;
    this.shieldMesh.visible = false;
  }

  dispose(): void {
    this.reset();
    this.groundPresence.dispose();
  }

  removeEnemy(id: number): void {
    const rig = this.enemyRigs.get(id);
    if (rig) {
      this.disposeRig(rig);
      this.scene.remove(rig.group);
      this.scene.remove(rig.telegraph);
      this.enemyRigs.delete(id);
    }
  }

  /** Release animation/materials for one rig (removal, purge, reset). */
  private disposeRig(rig: EnemyRig): void {
    if (rig.animation) {
      rig.animation.dispose();
      rig.animation = null;
      animationTelemetry.liveSkinnedRoots = Math.max(0, animationTelemetry.liveSkinnedRoots - 1);
    }
    if (rig.modelVariant === 'far' || rig.modelVariant === 'aggregate') {
      animationTelemetry.liveRigidFarRoots = Math.max(0, animationTelemetry.liveRigidFarRoots - 1);
    }
    disposeOwnedMaterials(rig.model);
  }

  /**
   * Far-tier presentation records — the seam a future instanced horde
   * renderer consumes. Far enemies have no individual animated hierarchy.
   */
  farRecords(): FarEnemyPresentationRecord[] {
    const out: FarEnemyPresentationRecord[] = [];
    for (const [enemyId, rig] of this.enemyRigs) {
      if (rig.currentLod !== 'far' && rig.currentLod !== 'aggregate') continue;
      out.push({
        enemyId,
        presentationProfileId: rig.presentationProfileId,
        x: rig.group.position.x,
        y: rig.group.position.y,
        z: rig.group.position.z,
        yaw: rig.group.rotation.y,
        phase: rig.phaseSeed,
        flash: Math.max(0, ...rig.materials.map((m) => m.emissiveIntensity - 1.4)),
      });
    }
    return out;
  }

  removePickup(id: number): void {
    const rig = this.pickupRigs.get(id);
    if (rig) {
      this.scene.remove(rig.group);
      this.pickupRigs.delete(id);
    }
  }

  removeShell(id: number): void {
    const rig = this.shellRigs.get(id);
    if (rig) {
      this.scene.remove(rig.group);
      this.shellRigs.delete(id);
    }
  }
}

export const FODDER_CAPACITY = 512;
export const GROUND_PRESENCE_CAPACITY = 512;
