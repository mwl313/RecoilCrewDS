import * as THREE from 'three';
import type { TankRigDefinition } from '../../shared/content/schemas/tank';

export interface VfxSpec {
  color: number;
  size: number;
  life: number;
  count: number;
  speed: number;
  gravity: number;
}

export interface UiTheme {
  name: string;
  primary: string;
  accent: string;
  secondary: string;
  panel: string;
  highlight: string;
  css: Record<string, string>;
}

export interface AudioSpec {
  kind: string;
  desc: string;
}

export interface TankRig {
  chassis: THREE.Object3D;
  turret: THREE.Object3D;
  barrel: THREE.Object3D;
  /** The resolved data-driven rig this instance was built from. */
  rigDefinition: TankRigDefinition;
  muzzleLocal: THREE.Vector3;
  turretPivot: THREE.Vector3;
  barrelPivot: THREE.Vector3;
  aimPivotLocal: THREE.Vector3;
  cameraAnchorLocal: THREE.Vector3 | null;
  forwardAxis: THREE.Vector3 | null;
}
