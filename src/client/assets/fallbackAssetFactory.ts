import * as THREE from 'three';
import type { AudioSpec, UiTheme, VfxSpec } from './types';

/**
 * Registered procedural fallback behavior. Every required semantic id gets a
 * generated low-poly fallback; custom GLBs replace them when the manifest
 * provides files. This is the only hardcoded presentation allowed.
 */
export class FallbackAssetFactory {
  readonly models = new Map<string, () => THREE.Object3D>();
  readonly vfx = new Map<string, () => VfxSpec>();
  readonly ui = new Map<string, () => UiTheme>();
  readonly audio = new Map<string, () => AudioSpec>();

  constructor() {
    this.registerModels();
    this.registerVfx();
    this.registerUi();
    this.registerAudio();
  }

  model(id: string): THREE.Object3D {
    const factory = this.models.get(id);
    if (!factory) throw new Error(`no fallback model registered for '${id}'`);
    return factory();
  }

  hasModel(id: string): boolean {
    return this.models.has(id);
  }

  vfxSpec(id: string): VfxSpec {
    const factory = this.vfx.get(id);
    if (!factory) throw new Error(`no fallback vfx registered for '${id}'`);
    return factory();
  }

  uiTheme(id: string): UiTheme {
    const factory = this.ui.get(id);
    if (!factory) throw new Error(`no fallback ui registered for '${id}'`);
    return factory();
  }

  audioSpec(id: string): AudioSpec {
    const factory = this.audio.get(id);
    if (!factory) throw new Error(`no fallback audio registered for '${id}'`);
    return factory();
  }

  private registerModels(): void {
    const steel = (color = 0x9aa3ad, rough = 0.55, metal = 0.55) =>
      new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, flatShading: true });
    const paint = (color: number) =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.38, metalness: 0.25, flatShading: true });
    const emissive = (color: number, intensity = 1) =>
      new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x23282e, roughness: 0.8, flatShading: true });
    const box = (w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    };
    const cyl = (rt: number, rb: number, h: number, mat: THREE.Material, seg = 12, x = 0, y = 0, z = 0): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    };
    const group = (children: THREE.Object3D[]): THREE.Group => {
      const g = new THREE.Group();
      for (const c of children) g.add(c);
      return g;
    };

    const buildTankChassis = (): THREE.Object3D => {
      const root = new THREE.Group();
      const bodyMat = paint(0x3c8f8f);
      const trackMat = dark;
      root.add(box(2.3, 0.7, 3.4, bodyMat, 0, 0.85, 0));
      root.add(box(2.5, 0.55, 3.6, trackMat, 0, 0.38, 0));
      root.add(box(2.1, 0.42, 2.0, trackMat, 0, 0.75, -0.7));
      root.add(box(0.35, 0.24, 1.5, dark, -1.28, 0.78, 0));
      root.add(box(0.35, 0.24, 1.5, dark, 1.28, 0.78, 0));
      root.add(cyl(0.22, 0.24, 0.28, dark, 10, -0.5, 1.42, 0.5));
      root.add(box(1.6, 0.18, 1.1, dark, 0, 1.18, 0.4));
      root.add(box(0.9, 0.14, 0.5, paint(0x2b6f74), 0, 1.32, -0.2));
      root.add(box(2.0, 0.2, 0.5, paint(0xffd27a), 0, 0.72, 1.78));
      return root;
    };
    const buildTankTurret = (): THREE.Object3D => {
      const root = new THREE.Group();
      const mat = paint(0x315f6e);
      root.add(box(1.5, 0.55, 1.7, mat, 0, 0.65, 0));
      root.add(box(1.1, 0.3, 1.9, paint(0x274f5c), 0, 0.95, 0.1));
      root.add(cyl(0.18, 0.2, 0.2, dark, 8, 0, 1.12, -0.4));
      root.add(box(0.5, 0.22, 0.5, dark, -0.55, 0.82, 0.35));
      root.add(box(0.5, 0.22, 0.5, dark, 0.55, 0.82, 0.35));
      return root;
    };
    const buildTankBarrel = (): THREE.Object3D => {
      const root = new THREE.Group();
      root.add(cyl(0.11, 0.14, 2.8, dark, 10, 0, 0.72, 1.4));
      root.add(box(0.42, 0.34, 0.7, paint(0x1f2c33), 0, 0.62, 0.15));
      root.add(cyl(0.18, 0.2, 0.5, dark, 10, 0, 0.78, 2.75));
      return root;
    };
    const buildScrapBug = (): THREE.Object3D => {
      const root = new THREE.Group();
      root.add(box(1.0, 0.7, 1.1, paint(0x8a4b2f), 0, 0.7, 0));
      root.add(box(0.8, 0.35, 0.9, paint(0x6e3a24), 0, 1.05, 0.1));
      root.add(cyl(0.14, 0.14, 0.12, emissive(0xff2d2d, 2), 8, 0, 1.28, 0.45));
      root.add(cyl(0.32, 0.32, 0.18, dark, 10, -0.45, 0.32, 0.45));
      root.add(cyl(0.32, 0.32, 0.18, dark, 10, 0.45, 0.32, 0.45));
      root.add(cyl(0.32, 0.32, 0.18, dark, 10, -0.45, 0.32, -0.45));
      root.add(cyl(0.32, 0.32, 0.18, dark, 10, 0.45, 0.32, -0.45));
      root.add(box(0.3, 0.2, 0.2, emissive(0xff5a2a, 0.8), -0.55, 0.9, -0.35));
      return root;
    };
    const buildRammer = (): THREE.Object3D => {
      const root = new THREE.Group();
      root.add(box(1.8, 0.6, 2.4, paint(0x9c2f2f), 0, 0.7, 0));
      root.add(box(1.6, 0.35, 0.9, paint(0x7a2424), 0, 1.0, 1.0));
      root.add(box(0.2, 0.3, 1.8, steel(0xcfd6dd, 0.3, 0.8), 0, 0.45, 0.4));
      root.add(box(0.5, 0.3, 0.3, emissive(0xffb020, 1.6), -0.8, 1.0, 0.3));
      root.add(box(0.5, 0.3, 0.3, emissive(0xffb020, 1.6), 0.8, 1.0, 0.3));
      root.add(cyl(0.34, 0.34, 0.2, dark, 10, -0.75, 0.34, -0.8));
      root.add(cyl(0.34, 0.34, 0.2, dark, 10, 0.75, 0.34, -0.8));
      root.add(cyl(0.34, 0.34, 0.2, dark, 10, -0.75, 0.34, 0.8));
      root.add(cyl(0.34, 0.34, 0.2, dark, 10, 0.75, 0.34, 0.8));
      return root;
    };
    const buildGunTower = (): THREE.Object3D => {
      const root = new THREE.Group();
      root.add(cyl(0.9, 1.1, 0.5, paint(0x4d5560), 10, 0, 0.25, 0));
      root.add(cyl(0.55, 0.7, 1.8, paint(0x3c444e), 10, 0, 1.2, 0));
      const head = new THREE.Group();
      head.add(box(1.1, 0.55, 1.0, paint(0x6d7682), 0, 2.15, 0));
      head.add(cyl(0.11, 0.11, 1.6, dark, 8, 0, 2.2, 0.9));
      head.add(box(0.22, 0.24, 0.24, emissive(0xff3b3b, 2), 0, 2.5, 0.2));
      head.position.y = 1.55;
      head.name = 'towerHead';
      root.add(head);
      return root;
    };
    const buildLootTruck = (): THREE.Object3D => {
      const root = new THREE.Group();
      root.add(box(2.2, 0.9, 4.4, paint(0x8a7a2f), 0, 1.05, 0));
      root.add(box(1.9, 1.6, 2.8, paint(0xb3a43c), 0, 2.1, -0.6));
      root.add(box(1.6, 0.5, 0.5, emissive(0xffd94d, 1.4), 0, 2.5, 0.7));
      root.add(cyl(0.42, 0.42, 0.3, dark, 10, -0.85, 0.45, 1.45));
      root.add(cyl(0.42, 0.42, 0.3, dark, 10, 0.85, 0.45, 1.45));
      root.add(cyl(0.42, 0.42, 0.3, dark, 10, -0.85, 0.45, -1.45));
      root.add(cyl(0.42, 0.42, 0.3, dark, 10, 0.85, 0.45, -1.45));
      root.add(box(0.25, 0.4, 0.25, emissive(0xff5a2a, 1.8), -1.05, 1.6, -2.1));
      root.add(box(0.25, 0.4, 0.25, emissive(0xff5a2a, 1.8), 1.05, 1.6, -2.1));
      return root;
    };
    const buildPickup = (kind: 'normal' | 'heavy' | 'jackpot'): THREE.Object3D => {
      const root = new THREE.Group();
      const color = kind === 'jackpot' ? 0xffd94d : kind === 'heavy' ? 0x7de05a : 0x4ddb6e;
      const mat = emissive(color, kind === 'jackpot' ? 2.4 : 1.7);
      const size = kind === 'normal' ? 0.24 : kind === 'heavy' ? 0.34 : 0.42;
      root.add(new THREE.Mesh(new THREE.OctahedronGeometry(size), mat));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(size * 1.45, 0.035, 6, 16), emissive(color, 1.0));
      ring.rotation.x = Math.PI / 2;
      root.add(ring);
      if (kind === 'jackpot') {
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.18, 3.4, 8, 1, true), emissive(0xfff2b0, 2));
        beam.position.y = 1.7;
        root.add(beam);
      }
      return root;
    };
    const buildBarrelProp = (): THREE.Object3D => {
      const root = new THREE.Group();
      const mat = paint(0xc0392b);
      root.add(cyl(0.42, 0.42, 1.05, mat, 12, 0, 0.52, 0));
      root.add(cyl(0.44, 0.44, 0.12, steel(0x8d99a3, 0.4, 0.7), 12, 0, 1.04, 0));
      root.add(box(0.1, 0.9, 0.1, dark, 0, 0.55, 0.4));
      return root;
    };
    const buildBarrier = (): THREE.Object3D => {
      const root = new THREE.Group();
      root.add(box(2.0, 0.9, 0.32, paint(0xb3863a), 0, 0.45, 0));
      root.add(box(0.3, 1.0, 0.3, dark, -0.7, 0.45, 0));
      root.add(box(0.3, 1.0, 0.3, dark, 0.7, 0.45, 0));
      return root;
    };
    const buildTireStack = (): THREE.Object3D => {
      const root = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0x17181b, roughness: 0.95, flatShading: true });
      for (let i = 0; i < 3; i++) {
        const tire = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.28, 8, 18), mat);
        tire.rotation.x = Math.PI / 2;
        tire.position.y = 0.5 + i * 0.95;
        root.add(tire);
      }
      return root;
    };
    const buildContainer = (): THREE.Object3D => {
      const root = new THREE.Group();
      root.add(box(2.4, 2.4, 5.8, paint(0x6b5633), 0, 1.2, 0));
      root.add(box(2.5, 0.18, 5.9, paint(0x8a7046), 0, 2.42, 0));
      root.add(box(0.1, 1.0, 0.1, dark, 1.21, 1.2, 2.9));
      return root;
    };
    const buildRamp = (): THREE.Object3D => {
      const geo = new THREE.BufferGeometry();
      const v = new Float32Array([
        -0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5,
        -0.5, 1, 0.5, 0.5, 1, 0.5,
      ]);
      geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
      geo.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 3, 5, 4, 0, 1, 5, 0, 5, 4, 1, 2, 5, 2, 3, 5]);
      geo.computeVertexNormals();
      const mat = paint(0x7c8a99);
      const slopeMat = new THREE.MeshStandardMaterial({ color: 0x96a7b8, roughness: 0.7, flatShading: true });
      const g = new THREE.Group();
      const mesh = new THREE.Mesh(geo, mat);
      const slope = new THREE.Mesh(geo, slopeMat);
      slope.scale.set(0.99, 0.99, 0.99);
      slope.position.y = 0.005;
      g.add(mesh);
      g.add(slope);
      return g;
    };
    const buildFactory = (): THREE.Object3D => {
      const root = new THREE.Group();
      root.add(box(5, 6, 4, paint(0x57504a), 0, 3, 0));
      root.add(box(2, 7, 2, paint(0x4a443f), 2.5, 3.5, 0));
      root.add(cyl(0.4, 0.5, 5, dark, 10, -2.2, 4.5, 1.2));
      root.add(box(1.2, 1.6, 0.2, emissive(0xffb020, 0.7), 1.8, 1.6, 2.02));
      return root;
    };

    const modelIds: Array<[string, () => THREE.Object3D]> = [
      ['playerTank.chassis', buildTankChassis],
      ['playerTank.turret', buildTankTurret],
      ['playerTank.barrel', buildTankBarrel],
      ['enemy.scrapBug', buildScrapBug],
      ['enemy.rammer', buildRammer],
      ['enemy.gunTower', buildGunTower],
      ['enemy.lootTruck', buildLootTruck],
      ['pickup.normalScrap', () => buildPickup('normal')],
      ['pickup.heavyScrap', () => buildPickup('heavy')],
      ['pickup.jackpotScrap', () => buildPickup('jackpot')],
      ['prop.explosiveBarrel', buildBarrelProp],
      ['prop.barrier', buildBarrier],
      ['prop.tire', buildTireStack],
      ['prop.container', buildContainer],
      ['arena.ramp', buildRamp],
      ['arena.factory', buildFactory],
    ];
    for (const [id, factory] of modelIds) this.models.set(id, factory);
    void group;
  }

  private registerVfx(): void {
    const mkVfx = (color: number, size: number, life: number, count: number, speed: number, gravity = 0): VfxSpec =>
      ({ color, size, life, count, speed, gravity });
    const entries: Array<[string, VfxSpec]> = [
      ['vfx.machineGunMuzzle', mkVfx(0xffe08a, 0.16, 0.05, 8, 3)],
      ['vfx.cannonMuzzle', mkVfx(0xffb347, 0.5, 0.1, 26, 8)],
      ['vfx.cannonImpact', mkVfx(0xff9d45, 0.5, 0.5, 40, 11, 12)],
      ['vfx.enemyDeath', mkVfx(0xff5540, 0.5, 0.55, 34, 9, 10)],
      ['vfx.scrapPickup', mkVfx(0x6fe86f, 0.3, 0.35, 18, 6, 6)],
      ['vfx.jackpot', mkVfx(0xffe98a, 0.9, 1.0, 80, 14, 8)],
    ];
    for (const [id, spec] of entries) this.vfx.set(id, () => ({ ...spec }));
  }

  private registerUi(): void {
    this.ui.set('ui.driverTheme', () => ({
      name: 'DRIVER',
      primary: '#35d7e8',
      accent: '#9ff3ff',
      secondary: '#1c7d8a',
      panel: 'rgba(8,22,26,0.82)',
      highlight: '#eaffff',
      css: { '--role': '#35d7e8', '--role-soft': '#9ff3ff' },
    }));
    this.ui.set('ui.gunnerTheme', () => ({
      name: 'GUNNER',
      primary: '#ffa23b',
      accent: '#ffd08a',
      secondary: '#a85f12',
      panel: 'rgba(30,16,6,0.82)',
      highlight: '#fff2dc',
      css: { '--role': '#ffa23b', '--role-soft': '#ffd08a' },
    }));
  }

  private registerAudio(): void {
    const mkAudio = (kind: string, desc: string): AudioSpec => ({ kind, desc });
    const audioIds: Array<[string, string]> = [
      ['audio.engine', 'engineLoop'], ['audio.boost', 'boost'], ['audio.drift', 'drift'],
      ['audio.collision', 'collision'], ['audio.machineGun', 'machineGun'], ['audio.cannon', 'cannon'],
      ['audio.enemyHit', 'enemyHit'], ['audio.enemyDeath', 'enemyDeath'], ['audio.scrapPickup', 'scrapPickup'],
      ['audio.rammerTelegraph', 'rammerTelegraph'], ['audio.towerFire', 'towerFire'], ['audio.truckSiren', 'truckSiren'],
      ['audio.brace', 'brace'], ['audio.wipeout', 'wipeout'], ['audio.jackpotCharge', 'jackpotCharge'],
      ['audio.jackpotRelease', 'jackpotRelease'], ['audio.ui', 'ui'], ['audio.results', 'results'], ['audio.music', 'music'],
    ];
    for (const [id, kind] of audioIds) this.audio.set(id, () => mkAudio(kind, id));
  }
}
