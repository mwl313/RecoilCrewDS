import * as THREE from 'three';
import type { EnemyState, PickupState, ShellState } from '../../shared/types';
import type { EntityViewFactory } from './entityViewFactory';

export interface EnemyRig {
  group: THREE.Group;
  model: THREE.Object3D;
  head?: THREE.Object3D;
  materials: THREE.MeshStandardMaterial[];
  telegraph: THREE.Group;
  telegraphMat: THREE.MeshBasicMaterial;
  deadT: number;
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
 * Tracks live entity views by id. Rematches and Practice swaps call reset(),
 * which removes every view from the scene and empties the maps — no growth
 * across rounds.
 */
export class EntityViewRegistry {
  readonly enemyRigs = new Map<number, EnemyRig>();
  readonly pickupRigs = new Map<number, PickupRig>();
  readonly shellRigs = new Map<number, ShellRig>();
  readonly barrelMeshes = new Map<number, THREE.Object3D>();
  truckRig: THREE.Group;
  truckMarker: THREE.Group;
  shieldMesh: THREE.Mesh;
  braceMesh: THREE.Group;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly factory: EntityViewFactory,
  ) {
    this.truckRig = new THREE.Group();
    this.truckMarker = factory.makeMarker(0xffd94d, 1.3, scene);
    this.truckMarker.visible = false;
    this.shieldMesh = new THREE.Mesh(
      new THREE.SphereGeometry(2.2, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0x5eeaff, transparent: true, opacity: 0.24, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.shieldMesh.visible = false;
    scene.add(this.shieldMesh);
    this.braceMesh = new THREE.Group();
    const braceMat = new THREE.MeshStandardMaterial({ color: 0xffc35a, roughness: 0.5, metalness: 0.4, flatShading: true });
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.24, 1.2), braceMat);
    b1.position.set(-1.35, 0.45, 0);
    const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.24, 1.2), braceMat);
    b2.position.set(1.35, 0.45, 0);
    this.braceMesh.add(b1, b2);
    this.braceMesh.visible = false;
    scene.add(this.braceMesh);
  }

  registerTruckRig(rig: THREE.Group, scene: THREE.Scene): void {
    this.truckRig = rig;
    scene.add(rig);
  }

  registerBarrel(id: number, mesh: THREE.Object3D): void {
    this.barrelMeshes.set(id, mesh);
  }

  createEnemy(e: EnemyState): EnemyRig {
    const rig = this.factory.createEnemyRig(e, this.scene);
    this.enemyRigs.set(e.id, rig);
    return rig;
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
      this.scene.remove(rig.group);
      this.scene.remove(rig.telegraph);
    }
    this.enemyRigs.clear();
    for (const rig of this.pickupRigs.values()) this.scene.remove(rig.group);
    this.pickupRigs.clear();
    for (const rig of this.shellRigs.values()) this.scene.remove(rig.group);
    this.shellRigs.clear();
    this.truckRig.visible = false;
    this.truckMarker.visible = false;
    this.shieldMesh.visible = false;
    this.braceMesh.visible = false;
  }

  removeEnemy(id: number): void {
    const rig = this.enemyRigs.get(id);
    if (rig) {
      this.scene.remove(rig.group);
      this.scene.remove(rig.telegraph);
      this.enemyRigs.delete(id);
    }
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
