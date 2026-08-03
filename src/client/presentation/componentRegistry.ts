import { z } from 'zod';
import type { UiNodeInput } from '../../shared/presentation/schemas';

/**
 * UI component registry with inspector metadata (the future editor reads
 * `inspector` to build property panels). Adding a component = schema +
 * factory + inspector + tests; no central switch statement.
 */
export interface UiComponentInstance {
  readonly id: string;
  readonly element: HTMLElement;
  mount(parent: HTMLElement): void;
  update?(context: Record<string, unknown>): void;
  handleEvent?(event: PresentationRuntimeEvent): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

export interface PresentationRuntimeEvent {
  type: string;
  label?: string;
  value?: number;
  kind?: string;
}

export interface ComponentInspectorField {
  path: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  options?: string[];
}

export interface ComponentInspectorDescriptor {
  label: string;
  fields: ComponentInspectorField[];
}

export interface UiComponentRegistration<TDefinition = unknown> {
  type: string;
  schema: z.ZodType<TDefinition>;
  create(definition: UiNodeInput, services: UiComponentServices): UiComponentInstance;
  inspector: ComponentInspectorDescriptor;
}

export interface UiComponentServices {
  /** Look up an instance by node id (e.g. read an input's value). */
  node(id: string): UiComponentInstance | undefined;
  addPopup(text: string, kind: string): void;
}

export class UiComponentRegistry {
  private readonly registrations = new Map<string, UiComponentRegistration>();

  register<T>(registration: UiComponentRegistration<T>): void {
    if (this.registrations.has(registration.type)) {
      throw new Error(`UI component already registered: ${registration.type}`);
    }
    this.registrations.set(registration.type, registration);
  }

  get(type: string): UiComponentRegistration | undefined {
    return this.registrations.get(type);
  }

  has(type: string): boolean {
    return this.registrations.has(type);
  }

  types(): string[] {
    return [...this.registrations.keys()].sort();
  }

  inspectorFor(type: string): ComponentInspectorDescriptor | undefined {
    return this.registrations.get(type)?.inspector;
  }
}
