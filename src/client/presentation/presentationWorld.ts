import * as THREE from 'three';
import type { SceneDefinition, SceneEntityDefinition } from '../../shared/presentation/schemas';
import type { AssetService } from '../assets';

/**
 * Lightweight presentation-only Three.js scene host.
 *
 * Renderer decision (documented): a separate presentation renderer is used
 * for hybrid scenes and disposed when the scene is left. Gameplay keeps its
 * own renderer, and the two never run at the same time — the presentation
 * world is torn down before gameplay starts, so there is never a second
 * persistent expensive renderer.
 */
export class PresentationWorld {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private readonly animators: Array<{ update(dt: number): void }> = [];
  /** Scene-owned objects (lights). Model clones stay owned by AssetService. */
  private readonly disposables: Array<THREE.Object3D | THREE.Material | THREE.BufferGeometry | THREE.Texture> = [];
  private readonly warnedReserved = new Set<string>();
  private raf = 0;
  private lastT = 0;
  private readonly container: HTMLElement;
  private readonly lowQuality: boolean;

  constructor(
    private readonly definition: SceneDefinition,
    container: HTMLElement,
    private readonly assets: AssetService,
    options: { lowQuality?: boolean } = {},
  ) {
    this.container = container;
    this.lowQuality = options.lowQuality ?? false;
    this.renderer = new THREE.WebGLRenderer({ antialias: !this.lowQuality, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.lowQuality ? 1 : 1.5));
    this.renderer.domElement.style.position = 'absolute';
    this.renderer.domElement.style.inset = '0';
    this.renderer.domElement.style.pointerEvents = 'none';
    this.renderer.domElement.id = 'presentation-canvas';
    container.appendChild(this.renderer.domElement);

    const env = definition.environment ?? {};
    this.scene.background =
      typeof env.background === 'number' ? new THREE.Color(env.background) : new THREE.Color(env.background ?? '#0b1216');
    if (env.fog) this.scene.fog = new THREE.Fog(new THREE.Color(env.fog.color), env.fog.near, env.fog.far);
    for (const light of env.lights ?? []) this.addLight(light);

    this.camera = new THREE.PerspectiveCamera(55, container.clientWidth / Math.max(1, container.clientHeight), 0.1, 400);
    const cam = definition.cameras?.[0];
    this.camera.position.set(cam?.position?.[0] ?? 0, cam?.position?.[1] ?? 1.2, cam?.position?.[2] ?? 5.5);
    this.camera.lookAt(0, 0, 0);

    for (const entity of definition.entities ?? []) this.buildEntity(entity, this.scene);
    this.resize();
  }

  private addLight(light: { type: string; color?: string | number; intensity?: number; position?: [number, number, number]; direction?: [number, number, number]; groundColor?: string | number; distance?: number }): void {
    let obj: THREE.Light | null = null;
    if (light.type === 'hemisphere') {
      obj = new THREE.HemisphereLight(
        new THREE.Color(light.color ?? '#ffffff'),
        new THREE.Color(light.groundColor ?? '#000000'),
        light.intensity ?? 0.8,
      );
    } else if (light.type === 'directional') {
      const d = new THREE.DirectionalLight(new THREE.Color(light.color ?? '#ffffff'), light.intensity ?? 1);
      d.position.set(...(light.direction ?? [0, 1, 0]));
      obj = d;
    } else if (light.type === 'point') {
      const p = new THREE.PointLight(new THREE.Color(light.color ?? '#ffffff'), light.intensity ?? 1, light.distance);
      p.position.set(...(light.position ?? [0, 1, 0]));
      obj = p;
    }
    if (obj) {
      this.scene.add(obj);
      this.disposables.push(obj);
    }
  }

  private buildEntity(entity: SceneEntityDefinition, parent: THREE.Object3D): void {
    const group = new THREE.Group();
    const t = entity.transform ?? {};
    group.position.set(t.position?.[0] ?? 0, t.position?.[1] ?? 0, t.position?.[2] ?? 0);
    group.rotation.set(t.rotation?.[0] ?? 0, t.rotation?.[1] ?? 0, t.rotation?.[2] ?? 0);
    group.scale.set(t.scale?.[0] ?? 1, t.scale?.[1] ?? 1, t.scale?.[2] ?? 1);

    let lookAtTarget: [number, number, number] | null = null;
    let rotateSpeed = 0;
    let floatAmplitude = 0;
    let floatSpeed = 0;
    for (const component of entity.components) {
      const props = component.props ?? {};
      if (component.type === 'model') {
        const model = this.resolveModel(String(props.assetId ?? ''));
        group.add(model);
      } else if (component.type === 'rotateAnimation') {
        rotateSpeed = Number(props.speed ?? 0);
      } else if (component.type === 'floatAnimation') {
        floatAmplitude = Number(props.amplitude ?? 0);
        floatSpeed = Number(props.speed ?? 1);
      } else if (component.type === 'camera') {
        // Scene camera entity: keep the definition camera (simple pass).
      } else if (component.type === 'lookAt') {
        lookAtTarget = Array.isArray(props.target)
          ? (props.target.slice(0, 3) as [number, number, number])
          : null;
      } else if (
        component.type === 'postProcessPreset' ||
        component.type === 'audioSource' ||
        component.type === 'particleEmitter' ||
        component.type === 'billboard'
      ) {
        if (!this.warnedReserved.has(component.type)) {
          console.warn(`[presentation] component '${component.type}' is reserved/unsupported; not rendered`);
          this.warnedReserved.add(component.type);
        }
      }
    }
    if (lookAtTarget) {
      const target = new THREE.Vector3(...lookAtTarget);
      group.lookAt(target);
    }
    if (rotateSpeed !== 0 || floatAmplitude !== 0) {
      const baseY = group.position.y;
      const baseRot = group.rotation.y;
      this.animators.push({
        update: (dt) => {
          if (rotateSpeed !== 0) group.rotation.y = baseRot + rotateSpeed * this.elapsed;
          if (floatAmplitude !== 0) group.position.y = baseY + Math.sin(this.elapsed * floatSpeed) * floatAmplitude;
          void dt;
        },
      });
    }
    parent.add(group);
    this.disposables.push(group);
    // Children mount beneath this entity's group so transforms compose.
    for (const child of entity.children ?? []) this.buildEntity(child, group);
  }

  private elapsed = 0;

  private resolveModel(assetId: string): THREE.Object3D {
    // Project custom assets resolve through the catalog (file → registered
    // fallbackAssetId → procedural fallback). No hardcoded asset ids here.
    return this.assets.model(assetId);
  }

  update(dt: number): void {
    this.elapsed += dt;
    for (const animator of this.animators) animator.update(dt);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  resize(): void {
    const w = this.container.clientWidth || 800;
    const h = this.container.clientHeight || 600;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  start(): void {
    this.lastT = performance.now();
    const loop = (now: number): void => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - this.lastT) / 1000);
      this.lastT = now;
      this.update(dt);
      this.render();
    };
    this.raf = requestAnimationFrame(loop);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    // Ownership rule (Refractor 02 audit P0-2): models are cloned from
    // AssetService cached prototypes, so their geometry/materials are shared
    // with gameplay and MUST NOT be disposed here. Only release the
    // renderer and scene-owned resources; the clone itself is dropped when
    // the scene graph is garbage collected.
    this.scene.clear();
    this.disposables.length = 0;
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.animators.length = 0;
    this.warnedReserved.clear();
  }
}

/** Factory used by the flow (returns null to disable 3D backgrounds). */
export type PresentationWorldFactory = (scene: SceneDefinition, container: HTMLElement) => PresentationWorld | null;
