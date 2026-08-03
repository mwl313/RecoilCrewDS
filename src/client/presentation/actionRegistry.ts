import type { ActionBindingDefinition } from '../../shared/presentation/schemas';
import type { SceneRuntime } from './sceneRuntime';

export type SceneActionHandler = (
  payload: unknown,
  runtime: SceneRuntime | undefined,
) => void | Promise<void>;

/**
 * Allowlisted scene actions. Scene JSON may only reference ids registered
 * here (the schema enforces the id set; the registry provides the code).
 */
export class SceneActionRegistry {
  private readonly actions = new Map<string, SceneActionHandler>();

  register(id: string, handler: SceneActionHandler): void {
    if (this.actions.has(id)) throw new Error(`action already registered: ${id}`);
    this.actions.set(id, handler);
  }

  has(id: string): boolean {
    return this.actions.has(id);
  }

  execute(id: string, payload?: unknown, runtime?: SceneRuntime): void {
    const handler = this.actions.get(id);
    if (!handler) throw new Error(`unknown scene action: ${id}`);
    void handler(payload, runtime);
  }
}

/** Attach action bindings to an element (no per-frame listener allocation). */
export function attachActionBindings(
  element: HTMLElement,
  bindings: ActionBindingDefinition[],
  registry: SceneActionRegistry,
  runtime: SceneRuntime,
  resolveItem?: () => unknown,
): void {
  for (const binding of bindings) {
    const listener = (event: Event): void => {
      event.preventDefault();
      let payload = binding.payload;
      if (payload && typeof payload === 'object' && (payload as { __itemId?: boolean }).__itemId) {
        const item = resolveItem ? resolveItem() : undefined;
        payload = item ? (item as { id?: string }).id : undefined;
      }
      registry.execute(binding.action, payload, runtime);
    };
    element.addEventListener(binding.event, listener);
  }
}
