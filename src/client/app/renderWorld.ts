import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ArenaView } from '../arenaView';
import { VfxSystem } from '../vfx';
import type { AssetService } from '../assets';
import type { TpsCameraController } from '../tpsCamera';
import type { ArenaWorld } from '../../shared/sim/arenaWorld';

/**
 * RenderWorld owns the renderer, scene graph, post-processing passes, arena
 * view, and pooled VFX. It exposes quality knobs and renders the active
 * camera (or a PIP camera via viewport/scissor).
 */
export class RenderWorld {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  arena: ArenaView;
  readonly vfx: VfxSystem;
  composer: EffectComposer | null = null;
  bloom: UnrealBloomPass | null = null;
  private renderPass: RenderPass | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly assets: AssetService,
    world: ArenaWorld,
  ) {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.domElement.id = 'game-canvas';
    container.appendChild(this.renderer.domElement);
    this.setupScene();
    this.arena = new ArenaView(assets, world);
    this.scene.add(this.arena.group);
    this.vfx = new VfxSystem(this.scene);
    this.setupPost();
    window.addEventListener('resize', this.onResize);
  }

  private setupScene(): void {
    this.scene.background = new THREE.Color(0x3d4c56);
    this.scene.fog = new THREE.Fog(0x3d4c56, 100, 150);
    const hemi = new THREE.HemisphereLight(0xffe9c8, 0x3b3f45, 0.85);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffd9a0, 1.9);
    sun.position.set(26, 34, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -50;
    sun.shadow.camera.right = 50;
    sun.shadow.camera.top = 50;
    sun.shadow.camera.bottom = -50;
    sun.shadow.camera.far = 120;
    sun.shadow.bias = -0.0006;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0x7fb4c4, 0.5);
    fill.position.set(-20, 16, -24);
    this.scene.add(fill);
    const stars = new THREE.Points(
      new THREE.BufferGeometry().setFromPoints(
        Array.from({ length: 90 }, () => new THREE.Vector3((Math.random() - 0.5) * 240, 60 + Math.random() * 90, (Math.random() - 0.5) * 240)),
      ),
      new THREE.PointsMaterial({ color: 0x9fb6c4, size: 0.7, transparent: true, opacity: 0.5, fog: false }),
    );
    this.scene.add(stars);
  }

  private setupPost(): void {
    try {
      const size = new THREE.Vector2();
      this.renderer.getSize(size);
      this.composer = new EffectComposer(this.renderer);
      this.renderPass = new RenderPass(this.scene, new THREE.PerspectiveCamera());
      this.composer.addPass(this.renderPass);
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.55, 0.65, 0.82);
      this.composer.addPass(this.bloom);
    } catch {
      this.composer = null;
      this.renderPass = null;
    }
  }

  setCamera(camera: THREE.PerspectiveCamera): void {
    if (this.renderPass) this.renderPass.camera = camera;
  }

  /** Phase 3: swap the arena view (rematch / reconnect / practice reroll). */
  rebuildArena(world: ArenaWorld): void {
    this.arena.dispose();
    this.scene.remove(this.arena.group);
    this.arena = new ArenaView(this.assets, world);
    this.scene.add(this.arena.group);
  }

  render(camera: THREE.PerspectiveCamera): void {
    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, camera);
    }
  }

  /** Render the scene from an alternate camera into the PIP viewport. */
  renderWithCamera(camera: THREE.PerspectiveCamera, px: number, py: number, pw: number, ph: number): void {
    this.renderer.setViewport(px, py, pw, ph);
    this.renderer.setScissor(px, py, pw, ph);
    this.renderer.setScissorTest(true);
    this.renderer.render(this.scene, camera);
  }

  resetViewport(w: number, h: number): void {
    this.renderer.setViewport(0, 0, w, h);
    this.renderer.setScissorTest(false);
  }

  setPixelRatio(ratio: number): void {
    this.renderer.setPixelRatio(ratio);
  }

  setShadows(enabled: boolean): void {
    this.renderer.shadowMap.enabled = enabled;
    this.renderer.shadowMap.autoUpdate = enabled;
  }

  setBloomStrength(strength: number): void {
    if (this.bloom) this.bloom.strength = strength;
  }

  composerPassCount(): number {
    return this.composer?.passes.length ?? 0;
  }

  private onResize = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    if (this.composer) this.composer.setSize(w, h);
  };

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
