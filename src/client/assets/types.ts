import * as THREE from 'three';

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
  muzzleLocal: THREE.Vector3;
  turretPivot: THREE.Vector3;
}
