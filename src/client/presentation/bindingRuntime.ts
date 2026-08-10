import type { BindingDefinition } from '../../shared/presentation/schemas';

/**
 * Safe binding runtime.
 *
 * Bindings read from a typed projection/context object via pre-compiled
 * path accessors (no JSON traversal per frame, no expression evaluation).
 * Transforms are allowlisted in the schema.
 */
export type BindingContext = Record<string, unknown>;

export interface CompiledBinding {
  definition: BindingDefinition;
  read(context: BindingContext): unknown;
}

const pathCache = new Map<string, (ctx: BindingContext) => unknown>();

function compilePath(source: string): (ctx: BindingContext) => unknown {
  const cached = pathCache.get(source);
  if (cached) return cached;
  const parts = source.split('.');
  const accessor = (ctx: BindingContext): unknown => {
    let current: unknown = ctx;
    for (const part of parts) {
      if (current === null || typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  };
  pathCache.set(source, accessor);
  return accessor;
}

export function compileBinding(definition: BindingDefinition): CompiledBinding {
  const readPath = compilePath(definition.source);
  return {
    definition,
    read: (ctx) => readPath(ctx),
  };
}

export function getPath(context: BindingContext, path: string): unknown {
  return compilePath(path)(context);
}

function applyFormat(
  format: string | undefined,
  value: unknown,
  formatKey?: string,
  localize?: (key: string, params?: Record<string, string | number>, fallback?: string) => string,
): string {
  if (formatKey && localize) return localize(formatKey, { value: String(value ?? ''), 0: String(value ?? '') }, format);
  if (format === undefined) return String(value ?? '');
  return format.replace(/\{0\}/g, String(value ?? ''));
}

export function transformValue(
  transform: string | undefined,
  value: unknown,
  context: BindingContext,
  binding: BindingDefinition,
  localize?: (key: string, params?: Record<string, string | number>, fallback?: string) => string,
): unknown {
  if (transform === undefined) return value;
  switch (transform) {
    case 'number':
      return Number(value);
    case 'integer':
      return Math.round(Number(value));
    case 'time': {
      const s = Math.max(0, Math.round(Number(value)));
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }
    case 'percentage':
      return `${(Number(value) * 100).toFixed(0)}%`;
    case 'ratio': {
      const max = Number(getPath(context, binding.attribute ?? '') ?? 1);
      return max > 0 ? Number(value) / max : 0;
    }
    case 'booleanClass':
      return Boolean(value);
    case 'roleLabel': {
      const role = String(value ?? '');
      return role ? localize?.(`hud.role.${role}`, undefined, role.toUpperCase()) ?? role.toUpperCase() : '';
    }
    case 'connectionLabel':
      return localize?.(value ? 'hud.connection.online' : 'hud.connection.offline', undefined, value ? 'ONLINE' : 'OFFLINE') ?? (value ? 'ONLINE' : 'OFFLINE');
    default:
      return value;
  }
}

export interface BindingApplier {
  apply(context: BindingContext, element: HTMLElement): void;
}

export function compileBindingApplier(
  definition: BindingDefinition,
  element: HTMLElement,
  localize?: (key: string, params?: Record<string, string | number>, fallback?: string) => string,
): BindingApplier {
  const compiled = compileBinding(definition);
  const target = definition.target;
  const transform = definition.transform;
  const attribute = definition.attribute;
  let lastText = '';
  let lastVisible: boolean | null = null;
  let lastClass: string | null = null;
  let lastStyle: string | null = null;
  let lastAttribute: string | null = null;
  return {
    apply(context, el) {
      let raw = compiled.read(context);
      if (raw === undefined && definition.fallback !== undefined) raw = definition.fallback;
      const value = transformValue(transform, raw, context, definition, localize);
      switch (target) {
        case 'text': {
          const text = applyFormat(definition.format, value, definition.formatKey, localize);
          if (text !== lastText) {
            lastText = text;
            el.textContent = text;
          }
          break;
        }
        case 'value': {
          const input = el as HTMLInputElement;
          const text = applyFormat(definition.format, value, definition.formatKey, localize);
          if (typeof input.value === 'string' && text !== lastText) {
            lastText = text;
            input.value = text;
          } else if (text !== lastText) {
            lastText = text;
            el.textContent = text;
          }
          break;
        }
        case 'visible': {
          const visible = Boolean(value);
          if (visible !== lastVisible) {
            lastVisible = visible;
            el.classList.toggle('hidden', !visible);
          }
          break;
        }
        case 'class': {
          const cls = attribute ?? '';
          const invert = definition.fallback === true;
          const state = invert ? !Boolean(value) : Boolean(value);
          const key = `${cls}:${state}`;
          if (key !== lastClass) {
            lastClass = key;
            el.classList.toggle(cls, state);
          }
          break;
        }
        case 'style': {
          if (!attribute) break;
          const cssName = attribute.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
          const css = applyFormat(definition.format, value, definition.formatKey, localize);
          if (css !== lastStyle) {
            lastStyle = css;
            el.style.setProperty(cssName, css);
          }
          break;
        }
        case 'attribute': {
          if (!attribute) break;
          const text = applyFormat(definition.format, value, definition.formatKey, localize);
          if (text !== lastAttribute) {
            lastAttribute = text;
            el.setAttribute(attribute, text);
          }
          break;
        }
      }
    },
  };
}
