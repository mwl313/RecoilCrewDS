import type { SceneDefinition, UiNodeInput } from '../../shared/presentation/schemas';
import { attachActionBindings, type SceneActionRegistry } from './actionRegistry';
import type { UiComponentInstance, UiComponentServices } from './componentRegistry';
import type { UiComponentRegistry } from './componentRegistry';
import { compileNodeBindings, createUiComponent } from './uiComponents';

export interface SceneRuntimeServices {
  actions: SceneActionRegistry;
  registry: UiComponentRegistry;
  addPopup?(text: string, kind: string): void;
}

/**
 * SceneRuntime: builds a component tree from a validated scene document,
 * caches binding handles, applies safe actions, plays enter/exit
 * transitions, and disposes every node/listener on unload.
 */
export class SceneRuntime {
  private readonly instances = new Map<string, UiComponentInstance>();
  private readonly bindingJobs: Array<{ apply(ctx: Record<string, unknown>, el: HTMLElement): void; el: HTMLElement }> = [];
  private readonly itemJobs: Array<{ apply(ctx: Record<string, unknown>, el: HTMLElement): void; el: HTMLElement }> = [];
  private context: Record<string, unknown> = {};
  private rootInstance: UiComponentInstance | null = null;
  private scene: SceneDefinition | null = null;

  constructor(
    private readonly services: SceneRuntimeServices,
    private readonly container: HTMLElement,
  ) {}

  get element(): HTMLElement | null {
    return this.rootInstance?.element ?? null;
  }

  get sceneId(): string | null {
    return this.scene?.id ?? null;
  }

  async load(scene: SceneDefinition, context: Record<string, unknown> = {}): Promise<void> {
    this.unload();
    this.scene = scene;
    this.context = { ...context };
    const services: UiComponentServices = {
      node: (id) => this.instances.get(id),
      addPopup: (text, kind) => this.services.addPopup?.(text, kind),
    };
    this.rootInstance = this.buildNode(scene.root, undefined, services);
    if (this.rootInstance) {
      this.rootInstance.mount(this.container);
      this.applyAll();
      this.playTransition('enter', scene.enterTransition?.durationMs ?? 0);
    }
  }

  private buildNode(
    node: UiNodeInput,
    resolveItem: (() => unknown) | undefined,
    services: UiComponentServices,
    inRepeater = false,
  ): UiComponentInstance | null {
    const instance = createUiComponent(node, services);
    this.instances.set(node.id, instance);
    const appliers = compileNodeBindings(node, instance.element);
    for (const applier of appliers) {
      const job = { apply: applier.apply, el: instance.element };
      if (inRepeater) this.itemJobs.push(job);
      else this.bindingJobs.push(job);
    }
    const actions = node.actions ?? [];
    if (actions.length > 0) {
      attachActionBindings(instance.element, actions, this.services.actions, this, resolveItem);
    }
    const props = (node.props ?? {}) as { enterAction?: string };
    if (node.type === 'input' && props.enterAction) {
      instance.element.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.services.actions.execute(props.enterAction!, undefined, this);
      });
    }
    if (node.type === 'repeater') {
      const originalUpdate = instance.update;
      instance.update = (context) => {
        originalUpdate?.(context);
        this.buildRepeaterItems(node, instance, context, services);
      };
    }
    if (node.type !== 'repeater') {
      for (const child of node.children ?? []) {
        const childInstance = this.buildNode(child, undefined, services, inRepeater);
        childInstance?.mount(instance.element);
      }
    }
    return instance;
  }

  private buildRepeaterItems(
    node: UiNodeInput,
    repeater: UiComponentInstance,
    context: Record<string, unknown>,
    services: UiComponentServices,
  ): void {
    const template = node.children?.[0];
    if (!template) return;
    const list = (context[(node.props as { listSource?: string }).listSource ?? ''] ?? []) as Array<Record<string, unknown>>;
    const signature = `${list.length}:${list.map((i) => String(i.id ?? i.label ?? i.value)).join(',')}`;
    if (repeater.element.dataset.repeaterSig === signature) return;
    repeater.element.dataset.repeaterSig = signature;
    repeater.element.textContent = '';
    for (const item of list) {
      const itemInstance = this.buildNode(template, () => item, services, true);
      if (!itemInstance) continue;
      itemInstance.element.dataset.repeaterItem = '1';
      const itemCtx = { ...context, item };
      itemInstance.update?.(itemCtx);
      for (const job of this.itemJobs) {
        if (itemInstance.element.contains(job.el)) job.apply(itemCtx, job.el);
      }
      itemInstance.mount(repeater.element);
    }
  }

  setContext(patch: Record<string, unknown>): void {
    Object.assign(this.context, patch);
    this.applyAll();
  }

  update(patch: Record<string, unknown>): void {
    this.setContext(patch);
  }

  private applyAll(): void {
    for (const job of this.bindingJobs) job.apply(this.context, job.el);
    for (const instance of this.instances.values()) instance.update?.(this.context);
  }

  dispatch(event: { type: string; label?: string; value?: number; kind?: string }): void {
    for (const instance of this.instances.values()) instance.handleEvent?.(event);
  }

  getNode(id: string): UiComponentInstance | undefined {
    return this.instances.get(id);
  }

  private playTransition(kind: 'enter' | 'exit', durationMs: number): void {
    if (!this.rootInstance) return;
    const element = this.rootInstance.element;
    element.classList.remove('scene-enter', 'scene-exit');
    void element.offsetWidth;
    element.classList.add(kind === 'enter' ? 'scene-enter' : 'scene-exit');
    if (durationMs > 0) {
      setTimeout(() => element.classList.remove('scene-enter', 'scene-exit'), durationMs + 40);
    }
  }

  unload(): void {
    if (this.rootInstance) this.playTransition('exit', this.scene?.exitTransition?.durationMs ?? 0);
    for (const instance of this.instances.values()) instance.dispose();
    this.instances.clear();
    this.bindingJobs.length = 0;
    this.itemJobs.length = 0;
    this.rootInstance = null;
    this.scene = null;
  }

  dispose(): void {
    this.unload();
  }
}
