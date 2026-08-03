import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { GeneratedArena } from '@app/shared/mapgen/generator';
import type { ArenaWorld } from '@app/shared/sim/arenaWorld';
import {
  buildCliffWallChunks,
  buildTerrainChunks,
  cliffWallMaterial,
  updateChunkLod,
} from '@app/client/map-debug/terrainMesh';
import {
  MapLabLayerManager,
  registerDefaultLayers,
  type MapLabRenderContext,
} from '@app/client/map-debug';
import type { MapValidationIssue } from '@app/shared/mapgen/validationIssues';

/**
 * Map Lab viewport: Three.js scene with OrbitControls (perspective) and an
 * orthographic top-down camera, chunked terrain from the authoritative
 * heightfield, and the shared debug layers. Old resources are disposed on
 * every rebuild (no scene growth).
 */
export class MapLabViewport {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  private readonly layersContainer = new THREE.Group();
  readonly layers: MapLabLayerManager;
  private readonly perspective: THREE.PerspectiveCamera;
  private readonly ortho: THREE.OrthographicCamera;
  private readonly controls: OrbitControls;
  private readonly terrainGroup = new THREE.Group();
  private readonly cliffGroup = new THREE.Group();
  private terrainChunks: ReturnType<typeof buildTerrainChunks> = [];
  private terrainMaterial: THREE.Material | null = null;
  private cliffMaterial: THREE.Material | null = null;
  private arena: GeneratedArena | null = null;
  private raf = 0;
  private cameraMode: 'orbit3d' | 'topDown' = 'orbit3d';

  constructor(container: HTMLElement) {
    const w = container.clientWidth || 800;
    const h = container.clientHeight || 600;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.id = 'maplab-canvas';
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x22303a);
    this.scene.fog = new THREE.Fog(0x22303a, 150, 420);
    const hemi = new THREE.HemisphereLight(0xffe9c8, 0x3b3f45, 0.9);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffd9a0, 1.6);
    sun.position.set(120, 220, 90);
    this.scene.add(sun);

    this.perspective = new THREE.PerspectiveCamera(60, w / h, 0.1, 1600);
    this.perspective.position.set(0, 300, 300);
    this.ortho = new THREE.OrthographicCamera(-200, 200, 200, -200, 0.1, 1600);
    this.ortho.position.set(0, 500, 0);
    this.ortho.lookAt(0, 0, 0);
    this.controls = new OrbitControls(this.perspective, this.renderer.domElement);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    this.scene.add(this.layersContainer);
    this.scene.add(this.terrainGroup);
    this.scene.add(this.cliffGroup);
    this.layers = new MapLabLayerManager(this.layersContainer);
    registerDefaultLayers(this.layers);
    window.addEventListener('resize', this.resize);
    this.loop();
  }

  setArena(arena: GeneratedArena, world: ArenaWorld): void {
    this.arena = arena;
    // Dispose previous terrain.
    for (const c of this.terrainChunks) {
      this.terrainGroup.remove(c.mesh);
      c.full.dispose();
      c.half.dispose();
    }
    this.terrainChunks.length = 0;
    this.terrainMaterial?.dispose();
    const hf = arena.heightfield;
    this.terrainMaterial = new THREE.MeshStandardMaterial({
      color: 0xb9a77d,
      roughness: 0.95,
      metalness: 0.02,
      flatShading: true,
    });
    this.terrainChunks = buildTerrainChunks(hf, hf.widthMeters / 2, this.terrainMaterial);
    for (const c of this.terrainChunks) this.terrainGroup.add(c.mesh);
    // Cliff walls from authoritative edge segments (disposed on rebuild).
    for (const child of [...this.cliffGroup.children]) {
      this.cliffGroup.remove(child);
      (child as THREE.Mesh).geometry?.dispose();
    }
    this.cliffMaterial?.dispose();
    this.cliffMaterial = null;
    if (arena.cliffEdges.length > 0) {
      this.cliffMaterial = cliffWallMaterial(arena.terrainProfile.cliffMaterialId);
      const wallGeos = buildCliffWallChunks(hf, arena.cliffEdges, -arena.widthMeters / 2, -arena.depthMeters / 2);
      for (const geo of wallGeos) {
        if (geo.attributes.position.count === 0) {
          geo.dispose();
          continue;
        }
        const mesh = new THREE.Mesh(geo, this.cliffMaterial);
        mesh.frustumCulled = true;
        this.cliffGroup.add(mesh);
      }
    }

    const ctx: MapLabRenderContext = {
      arena,
      world,
      toWorldX: (x) => x - arena.widthMeters / 2,
      toWorldZ: (z) => z - arena.depthMeters / 2,
    };
    this.layers.setContext(ctx);
  }

  setCameraMode(mode: 'orbit3d' | 'topDown'): void {
    if (mode === this.cameraMode) return;
    this.cameraMode = mode;
    const target = this.controls.target.clone();
    if (mode === 'topDown') {
      this.ortho.position.set(target.x, 520, target.z);
      this.ortho.lookAt(target);
      this.ortho.zoom = 1;
      this.ortho.updateProjectionMatrix();
    } else {
      this.perspective.position.set(target.x + 260, target.y + 280, target.z + 260);
      this.perspective.lookAt(target);
    }
  }

  fitMap(): void {
    this.controls.target.set(0, 0, 0);
    this.perspective.position.set(0, 320, 320);
    this.controls.update();
  }

  focusIssue(issue: MapValidationIssue): void {
    if (issue.layerId) this.layers.setVisible(issue.layerId, true);
    this.layers.focus(issue.entityId ?? issue.id, issue.layerId);
    if (issue.position) {
      this.setCameraMode('orbit3d');
      this.controls.target.set(issue.position.x, issue.position.y + 2, issue.position.z);
      this.perspective.position.set(issue.position.x + 40, issue.position.y + 50, issue.position.z + 40);
      this.controls.update();
    }
  }

  setLayerVisible(id: string, visible: boolean): void {
    this.layers.setVisible(id, visible);
  }

  resize(): void {
    const w = this.renderer.domElement.clientWidth || 800;
    const h = this.renderer.domElement.clientHeight || 600;
    this.renderer.setSize(w, h);
    this.perspective.aspect = w / h;
    this.perspective.updateProjectionMatrix();
    const half = Math.max(180, Math.min(260, 200 * (h / 600)));
    this.ortho.left = -half;
    this.ortho.right = half;
    this.ortho.top = half;
    this.ortho.bottom = -half;
    this.ortho.updateProjectionMatrix();
  }

  renderFrame(): void {
    const camera = this.cameraMode === 'topDown' ? this.ortho : this.perspective;
    if (this.cameraMode === 'orbit3d') this.controls.update();
    if (this.arena) {
      updateChunkLod(this.terrainChunks, camera.position);
    }
    this.renderer.render(this.scene, camera);
  }

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    this.renderFrame();
  };

  dispose(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    this.layers.dispose();
    for (const c of this.terrainChunks) {
      this.terrainGroup.remove(c.mesh);
      c.full.dispose();
      c.half.dispose();
    }
    this.terrainChunks.length = 0;
    this.terrainMaterial?.dispose();
    for (const child of [...this.cliffGroup.children]) {
      this.cliffGroup.remove(child);
      (child as THREE.Mesh).geometry?.dispose();
    }
    this.cliffMaterial?.dispose();
    this.controls.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}
