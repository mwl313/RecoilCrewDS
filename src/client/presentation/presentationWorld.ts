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
  private readonly pointerCleanups: Array<() => void> = [];
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
    // Keep the presentation layer BEHIND the scene's DOM content: the
    // parent screen establishes a stacking context (see styles.css
    // `.screen { isolation: isolate }`), so z-index -1 paints above the
    // screen background but below panels/buttons. Without this, the opaque
    // scene background covers the UI (buttons stay clickable because the
    // canvas has pointer-events: none — the "invisible menu" bug).
    this.renderer.domElement.style.zIndex = '-1';
    this.renderer.domElement.id = 'presentation-canvas';
    container.appendChild(this.renderer.domElement);

    const env = definition.environment ?? {};
    if (env.transparentBackground) {
      // The canvas can then move presentation objects without dragging a
      // viewport-sized color block across the stationary CSS backdrop.
      this.scene.background = null;
      this.renderer.setClearColor(0x000000, 0);
    } else {
      this.scene.background =
        typeof env.background === 'number' ? new THREE.Color(env.background) : new THREE.Color(env.background ?? '#0b1216');
    }
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
    let dragRotation: {
      dragging: boolean;
      pointerId: number;
      lastX: number;
      offset: number;
      regionStart: number;
      sensitivity: number;
    } | null = null;
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
      } else if (component.type === 'dragRotate') {
        dragRotation = {
          dragging: false,
          pointerId: -1,
          lastX: 0,
          offset: 0,
          regionStart: Math.min(0.9, Math.max(0.1, Number(props.regionStart ?? 0.5))),
          sensitivity: Number(props.sensitivity ?? 0.008),
        };
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
    if (dragRotation) this.attachDragRotation(dragRotation);
    if (rotateSpeed !== 0 || floatAmplitude !== 0 || dragRotation) {
      const baseY = group.position.y;
      const baseRot = group.rotation.y;
      let automaticRotation = 0;
      this.animators.push({
        update: (dt) => {
          if (rotateSpeed !== 0 && !dragRotation?.dragging) automaticRotation += rotateSpeed * dt;
          group.rotation.y = baseRot + automaticRotation + (dragRotation?.offset ?? 0);
          if (floatAmplitude !== 0) group.position.y = baseY + Math.sin(this.elapsed * floatSpeed) * floatAmplitude;
        },
      });
    }
    parent.add(group);
    this.disposables.push(group);
    // Children mount beneath this entity's group so transforms compose.
    for (const child of entity.children ?? []) this.buildEntity(child, group);
  }

  private elapsed = 0;

  private attachDragRotation(controller: {
    dragging: boolean;
    pointerId: number;
    lastX: number;
    offset: number;
    regionStart: number;
    sensitivity: number;
  }): void {
    const isInteractive = (target: EventTarget | null): boolean =>
      target instanceof Element && Boolean(target.closest('button, input, textarea, select, a, [role="button"]'));
    const isInDragRegion = (event: PointerEvent): boolean => {
      const rect = this.container.getBoundingClientRect();
      return event.clientX >= rect.left + rect.width * controller.regionStart;
    };
    const setReady = (ready: boolean): void => {
      this.container.classList.toggle('tank-drag-ready', ready && !controller.dragging);
    };
    const finish = (event: PointerEvent): void => {
      if (!controller.dragging || event.pointerId !== controller.pointerId) return;
      controller.dragging = false;
      controller.pointerId = -1;
      this.container.classList.remove('tank-drag-active');
      setReady(isInDragRegion(event));
      if (this.container.hasPointerCapture?.(event.pointerId)) this.container.releasePointerCapture(event.pointerId);
    };
    const onPointerDown = (event: PointerEvent): void => {
      if (event.button !== 0 || isInteractive(event.target) || !isInDragRegion(event)) return;
      controller.dragging = true;
      controller.pointerId = event.pointerId;
      controller.lastX = event.clientX;
      this.container.classList.remove('tank-drag-ready');
      this.container.classList.add('tank-drag-active');
      this.container.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    };
    const onPointerMove = (event: PointerEvent): void => {
      if (controller.dragging && event.pointerId === controller.pointerId) {
        controller.offset += (event.clientX - controller.lastX) * controller.sensitivity;
        controller.lastX = event.clientX;
        event.preventDefault();
        return;
      }
      setReady(!isInteractive(event.target) && isInDragRegion(event));
    };
    const onPointerLeave = (): void => {
      if (!controller.dragging) setReady(false);
    };

    this.container.addEventListener('pointerdown', onPointerDown);
    this.container.addEventListener('pointermove', onPointerMove);
    this.container.addEventListener('pointerup', finish);
    this.container.addEventListener('pointercancel', finish);
    this.container.addEventListener('pointerleave', onPointerLeave);
    this.pointerCleanups.push(() => {
      this.container.removeEventListener('pointerdown', onPointerDown);
      this.container.removeEventListener('pointermove', onPointerMove);
      this.container.removeEventListener('pointerup', finish);
      this.container.removeEventListener('pointercancel', finish);
      this.container.removeEventListener('pointerleave', onPointerLeave);
      this.container.classList.remove('tank-drag-ready', 'tank-drag-active');
    });
  }

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
    for (const cleanup of this.pointerCleanups.splice(0)) cleanup();
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
