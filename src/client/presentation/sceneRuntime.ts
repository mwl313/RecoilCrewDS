import type { SceneDefinition, UiNodeInput } from '../../shared/presentation/schemas';
import type { LocalizationService } from '../localization/localizationTypes';
import { attachActionBindings, type SceneActionRegistry } from './actionRegistry';
import type { UiComponentInstance, UiComponentServices } from './componentRegistry';
import type { UiComponentRegistry } from './componentRegistry';
import { compileNodeBindings, createUiComponent } from './uiComponents';

export interface SceneRuntimeServices {
  actions: SceneActionRegistry;
  registry: UiComponentRegistry;
  addPopup?(text: string, kind: string): void;
  resolveAssetUrl?(id: string): string | null;
  localization?: LocalizationService;
}

/**
 * SceneRuntime: builds a component tree from a validated scene document,
 * caches binding handles, applies safe actions, plays enter/exit
 * transitions, and disposes every node/listener on unload.
 */
export class SceneRuntime {
  private readonly instances = new Map<string, UiComponentInstance>();
  private readonly bindingJobs: Array<{ apply(ctx: Record<string, unknown>, el: HTMLElement): void; el: HTMLElement }> = [];
  private itemJobs: Array<{ apply(ctx: Record<string, unknown>, el: HTMLElement): void; el: HTMLElement; scope?: string }> = [];
  private readonly repeaterItems = new Map<string, UiComponentInstance[]>();
  private context: Record<string, unknown> = {};
  private rootInstance: UiComponentInstance | null = null;
  private scene: SceneDefinition | null = null;
  private transitionToken = 0;
  private readonly localizationJobs: Array<() => void> = [];
  private readonly unsubscribeLocalization: (() => void) | null;

  constructor(
    private readonly services: SceneRuntimeServices,
    private readonly container: HTMLElement,
  ) {
    this.unsubscribeLocalization = this.services.localization?.subscribe(() => this.applyAll()) ?? null;
  }

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
      resolveAssetUrl: (id) => this.services.resolveAssetUrl?.(id) ?? null,
      localize: (key, params, fallback) => this.services.localization?.t(key, params, fallback) ?? fallback ?? '',
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
    repeaterScope: string | undefined = undefined,
  ): UiComponentInstance | null {
    const instance = createUiComponent(node, services, this.services.registry);
    this.instances.set(node.id, instance);
    const appliers = compileNodeBindings(
      node,
      instance.element,
      (key, params, fallback) => this.services.localization?.t(key, params, fallback) ?? fallback ?? '',
    );
    for (const applier of appliers) {
      const job = { apply: applier.apply, el: instance.element };
      if (inRepeater) this.itemJobs.push({ ...job, scope: repeaterScope });
      else this.bindingJobs.push(job);
    }
    const actions = node.actions ?? [];
    if (actions.length > 0) {
      attachActionBindings(instance.element, actions, this.services.actions, this, resolveItem);
    }
    const applyLocalization = (): void => {
      const service = this.services.localization;
      if (!service) return;
      if (node.textKey) instance.element.textContent = service.t(node.textKey, undefined, node.text ?? '');
      if (node.placeholderKey && instance.element instanceof HTMLInputElement) {
        instance.element.placeholder = service.t(node.placeholderKey, undefined, String((node.props ?? {})['placeholder'] ?? ''));
      }
      if (node.titleKey) instance.element.title = service.t(node.titleKey, undefined, String((node.props ?? {})['title'] ?? ''));
      if (node.ariaLabelKey) instance.element.setAttribute('aria-label', service.t(node.ariaLabelKey));
    };
    if (node.textKey || node.placeholderKey || node.titleKey || node.ariaLabelKey) {
      this.localizationJobs.push(applyLocalization);
      applyLocalization();
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
        const childInstance = this.buildNode(child, undefined, services, inRepeater, repeaterScope);
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
    // Dispose the previous item subtree (instances, bindings, listeners)
    // before rebuilding. Template ids are scoped per item so no stale
    // instance can shadow a later `getNode()` lookup.
    for (const previous of this.repeaterItems.get(node.id) ?? []) {
      this.instances.delete(previous.id);
      previous.dispose();
    }
    this.repeaterItems.set(node.id, []);
    this.itemJobs = this.itemJobs.filter((job) => job.scope !== node.id);
    repeater.element.textContent = '';
    for (let index = 0; index < list.length; index++) {
      const item = list[index];
      const scopedTemplate: UiNodeInput = { ...template, id: `${template.id}::${index}` };
      const itemInstance = this.buildNode(scopedTemplate, () => item, services, true, node.id);
      if (!itemInstance) continue;
      itemInstance.element.dataset.repeaterItem = '1';
      this.repeaterItems.get(node.id)?.push(itemInstance);
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
    for (const job of this.localizationJobs) job();
    for (const job of this.bindingJobs) job.apply(this.context, job.el);
    for (const instance of this.instances.values()) instance.update?.(this.context);
  }

  dispatch(event: { type: string; label?: string; value?: number; kind?: string }): void {
    for (const instance of this.instances.values()) instance.handleEvent?.(event);
  }

  getNode(id: string): UiComponentInstance | undefined {
    return this.instances.get(id);
  }

  /** Replay the scene enter transition (scenes are cached between shows). */
  enter(): void {
    const element = this.rootInstance?.element;
    if (!element) return;
    this.transitionToken++;
    element.classList.remove('hidden');
    this.playTransition('enter', this.scene?.enterTransition?.durationMs ?? 0);
  }

  /** Play the exit transition, then hide (scenes stay cached). */
  leave(): void {
    const element = this.rootInstance?.element;
    if (!element) return;
    const token = ++this.transitionToken;
    const durationMs = this.scene?.exitTransition?.durationMs ?? 0;
    if (durationMs <= 0) {
      element.classList.add('hidden');
      return;
    }
    element.classList.remove('scene-enter');
    element.classList.add('scene-exit');
    window.setTimeout(() => {
      if (token === this.transitionToken) element.classList.add('hidden');
    }, durationMs + 40);
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
    this.transitionToken++;
    for (const instance of this.instances.values()) instance.dispose();
    this.instances.clear();
    this.bindingJobs.length = 0;
    this.localizationJobs.length = 0;
    this.itemJobs.length = 0;
    this.repeaterItems.clear();
    this.rootInstance = null;
    this.scene = null;
  }

  dispose(): void {
    this.unload();
    this.unsubscribeLocalization?.();
  }
}
