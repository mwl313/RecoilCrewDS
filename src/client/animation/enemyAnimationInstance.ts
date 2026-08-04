import * as THREE from 'three';
import type { EnemyAnimationRole } from '../../shared/animation/animationRoles';

/** One animated presentation instance owned by an enemy rig. */
export interface EnemyAnimationInstance {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Map<EnemyAnimationRole, THREE.AnimationAction>;
  currentRole: EnemyAnimationRole | null;
  currentAction: THREE.AnimationAction | null;
  currentPriority: number;
  lastUpdateTime: number;
  phaseSeed: number;
  /** Death lock: no further transitions after death starts. */
  dead: boolean;
}

export function createAnimationInstance(
  root: THREE.Object3D,
  phaseSeed: number,
): EnemyAnimationInstance {
  return {
    root,
    mixer: new THREE.AnimationMixer(root),
    actions: new Map(),
    currentRole: null,
    currentAction: null,
    currentPriority: 0,
    lastUpdateTime: 0,
    phaseSeed,
    dead: false,
  };
}
