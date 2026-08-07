import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ArenaView } from '../arenaView';
import { VfxSystem } from '../vfx';
import type { AssetService } from '../assets';
import type { TpsCameraController } from '../tpsCamera';
import type { ArenaWorld } from '../../shared/sim/arenaWorld';
import { SkyEnvironment } from '../environment/skyEnvironment';
import { VisualWorldApron, type ApronQuality } from '../environment/visualWorldApron';

/**
 * RenderWorld owns the renderer, scene graph, post-processing passes, arena
 * view, and pooled VFX. It exposes quality knobs and renders the active
 * camera.
 */
export class RenderWorld {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  arena: ArenaView;
  readonly vfx: VfxSystem;
  composer: EffectComposer | null = null;
  bloom: UnrealBloomPass | null = null;
  /** Number of world renders performed (PIP-removal render spy). */
  renderCount = 0;
  private readonly renderSubmitMs: number[] = [];
  private readonly frameIntervalMs: number[] = [];
  private lastRenderAt = 0;
  private renderPass: RenderPass | null = null;
  private readonly sky: SkyEnvironment;
  private apron: VisualWorldApron;

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
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.domElement.id = 'game-canvas';
    container.appendChild(this.renderer.domElement);
    this.setupScene();
    this.sky = new SkyEnvironment(this.scene);
    this.arena = new ArenaView(assets, world);
    this.scene.add(this.arena.group);
    this.apron = new VisualWorldApron(this.scene, assets, world);
    this.vfx = new VfxSystem(this.scene);
    this.setupPost();
    window.addEventListener('resize', this.onResize);
  }

  private setupScene(): void {
    // Clear gameplay silhouettes first, then blend the presentation-only
    // apron into a warm daylight horizon well beyond authoritative bounds.
    this.scene.fog = new THREE.Fog(0x9eb7b4, 145, 410);
    const hemi = new THREE.HemisphereLight(0xeaf7ff, 0x7d7768, 1.55);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffdfad, 1.42);
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
    const fill = new THREE.DirectionalLight(0xa9d9e6, 0.72);
    fill.position.set(-20, 16, -24);
    this.scene.add(fill);
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

  /** Phase 3: swap the arena view (rematch / reconnect / Single Player reroll). */
  rebuildArena(world: ArenaWorld): void {
    const apronQuality = this.apron.diagnostics().quality;
    this.apron.dispose(this.scene);
    this.arena.dispose();
    this.scene.remove(this.arena.group);
    this.arena = new ArenaView(this.assets, world);
    this.scene.add(this.arena.group);
    this.apron = new VisualWorldApron(this.scene, this.assets, world);
    this.apron.setQuality(apronQuality);
  }

  render(camera: THREE.PerspectiveCamera): void {
    this.renderCount++;
    const startedAt = performance.now();
    if (this.lastRenderAt > 0) pushBounded(this.frameIntervalMs, startedAt - this.lastRenderAt);
    this.lastRenderAt = startedAt;
    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, camera);
    }
    pushBounded(this.renderSubmitMs, performance.now() - startedAt);
  }

  /** Test/quality diagnostics without changing normal rendering behavior. */
  qualityDiagnostics(): {
    frameIntervalP50Ms: number;
    frameIntervalP95Ms: number;
    frameIntervalP99Ms: number;
    renderSubmitP50Ms: number;
    renderSubmitP95Ms: number;
    estimatedSceneDrawCalls: number;
    estimatedSceneTriangles: number;
    geometries: number;
    textures: number;
    skySource: 'procedural' | 'authored';
    apron: ReturnType<VisualWorldApron['diagnostics']>;
  } {
    let estimatedSceneDrawCalls = 0;
    let estimatedSceneTriangles = 0;
    this.scene.traverseVisible((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const geometry = mesh.geometry as THREE.BufferGeometry;
      const indexCount = geometry.index?.count ?? geometry.getAttribute('position')?.count ?? 0;
      const materialCalls = Array.isArray(mesh.material)
        ? Math.max(1, geometry.groups.length || mesh.material.length)
        : 1;
      const instances = (mesh as THREE.InstancedMesh).isInstancedMesh
        ? Math.max(0, (mesh as THREE.InstancedMesh).count)
        : 1;
      estimatedSceneDrawCalls += materialCalls;
      estimatedSceneTriangles += Math.floor(indexCount / 3) * instances;
    });
    return {
      frameIntervalP50Ms: samplePercentile(this.frameIntervalMs, 0.5),
      frameIntervalP95Ms: samplePercentile(this.frameIntervalMs, 0.95),
      frameIntervalP99Ms: samplePercentile(this.frameIntervalMs, 0.99),
      renderSubmitP50Ms: samplePercentile(this.renderSubmitMs, 0.5),
      renderSubmitP95Ms: samplePercentile(this.renderSubmitMs, 0.95),
      estimatedSceneDrawCalls,
      estimatedSceneTriangles,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
      skySource: this.sky.source,
      apron: this.apron.diagnostics(),
    };
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

  setApronQuality(quality: ApronQuality): void {
    this.apron.setQuality(quality);
  }

  setApronEnabled(enabled: boolean): void {
    this.apron.setEnabled(enabled);
  }

  resetQualityDiagnostics(): void {
    this.renderSubmitMs.length = 0;
    this.frameIntervalMs.length = 0;
    this.lastRenderAt = 0;
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
    this.apron.dispose(this.scene);
    this.sky.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}

function pushBounded(values: number[], value: number, maximum = 240): void {
  values.push(value);
  if (values.length > maximum) values.shift();
}

function samplePercentile(values: readonly number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))].toFixed(3));
}
