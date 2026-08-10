import { z } from 'zod';
import type { UiNodeInput } from '../../shared/presentation/schemas';
import { compileBindingApplier, getPath } from './bindingRuntime';
import type { UiComponentInstance, UiComponentRegistration, UiComponentServices } from './componentRegistry';
import type { UiComponentRegistry } from './componentRegistry';

function el(tag: string, cls = '', text = ''): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function applyLayout(node: UiNodeInput, element: HTMLElement): void {
  const layout = node.layout;
  if (!layout) return;
  const set = (prop: string, value: number | string | undefined): void => {
    if (value === undefined) return;
    element.style.setProperty(prop, typeof value === 'number' ? `${value}px` : value);
  };
  set('left', layout.x);
  set('top', layout.y);
  set('width', layout.width);
  set('height', layout.height);
  set('zIndex', layout.zIndex);
  if (layout.gap !== undefined) element.style.gap = `${layout.gap}px`;
  if (layout.kind === 'horizontal') {
    element.style.display = 'flex';
    element.style.flexDirection = 'row';
    if (layout.align) element.style.alignItems = layout.align;
    if (layout.justify) element.style.justifyContent = layout.justify === 'spaceBetween' ? 'space-between' : layout.justify;
  } else if (layout.kind === 'vertical') {
    element.style.display = 'flex';
    element.style.flexDirection = 'column';
    if (layout.align) element.style.alignItems = layout.align;
    if (layout.justify) element.style.justifyContent = layout.justify === 'spaceBetween' ? 'space-between' : layout.justify;
  } else if (layout.kind === 'grid') {
    element.style.display = 'grid';
    if (layout.columns) element.style.gridTemplateColumns = `repeat(${layout.columns}, 1fr)`;
    if (layout.rows) element.style.gridTemplateRows = `repeat(${layout.rows}, 1fr)`;
  } else if (layout.kind === 'overlay') {
    element.style.position = 'absolute';
  } else if (layout.kind === 'absolute') {
    element.style.position = 'absolute';
  }
}

function applyStyle(node: UiNodeInput, element: HTMLElement): void {
  const s = node.style;
  if (!s) return;
  const set = (prop: string, value: string | number | undefined): void => {
    if (value !== undefined) element.style.setProperty(prop, String(value));
  };
  set('background', s.background);
  set('color', s.color);
  set('padding', s.padding);
  set('margin', s.margin);
  set('border-radius', s.radius);
  set('box-shadow', s.shadow);
  set('font-family', s.font);
  set('font-size', s.fontSize);
  set('font-weight', s.fontWeight);
  set('letter-spacing', s.letterSpacing);
  set('opacity', s.opacity);
  set('border', s.border);
  set('min-width', s.minWidth);
  set('min-height', s.minHeight);
  set('max-width', s.maxWidth);
  set('max-height', s.maxHeight);
  set('text-align', s.textAlign);
  set('text-transform', s.textTransform);
  set('position', s.position);
  set('cursor', s.cursor);
}

interface BaseOptions {
  tag?: string;
  className?: string;
}

function base(node: UiNodeInput, services: UiComponentServices, options: BaseOptions = {}): UiComponentInstance {
  const element = el(options.tag ?? 'div', node.class ?? options.className ?? '');
  element.id = node.id;
  if (node.appearance?.tone) element.dataset.uiTone = node.appearance.tone;
  if (node.appearance?.emphasis) element.dataset.uiEmphasis = node.appearance.emphasis;
  if (node.appearance?.density) element.dataset.uiDensity = node.appearance.density;
  if (node.appearance?.shape) element.dataset.uiShape = node.appearance.shape;
  applyLayout(node, element);
  applyStyle(node, element);
  if (node.text !== undefined && !('tag' in options)) element.textContent = node.text;
  const instance: UiComponentInstance = {
    id: node.id,
    element,
    mount(parent) {
      parent.appendChild(element);
    },
    setVisible(visible) {
      element.classList.toggle('hidden', !visible);
    },
    dispose() {
      element.remove();
    },
  };
  void services;
  return instance;
}

const factories: Record<string, (node: UiNodeInput, services: UiComponentServices) => UiComponentInstance> = {
  container: (n, s) => base(n, s),
  panel: (n, s) => base(n, s),
  horizontal: (n, s) => base(n, s),
  vertical: (n, s) => base(n, s),
  grid: (n, s) => base(n, s),
  spacer: (n, s) => base(n, s),
  conditional: (n, s) => base(n, s),
  repeater: (n, s) => base(n, s),
};

function textFactory(node: UiNodeInput, services: UiComponentServices): UiComponentInstance {
  const props = (node.props ?? {}) as { tag?: string };
  const instance = base(node, services, { tag: props.tag ?? 'div' });
  if (node.text !== undefined) instance.element.textContent = node.text;
  return instance;
}

function buttonFactory(node: UiNodeInput, services: UiComponentServices): UiComponentInstance {
  const props = (node.props ?? {}) as { dataAct?: string; title?: string };
  const instance = base(node, services, { tag: 'button' });
  const button = instance.element as HTMLButtonElement;
  if (node.class) button.className = node.class;
  if (props.dataAct) button.dataset.act = props.dataAct;
  if (props.title) button.title = props.title;
  if (node.text !== undefined) button.textContent = node.text;
  return instance;
}

function inputFactory(node: UiNodeInput, services: UiComponentServices): UiComponentInstance {
  const props = (node.props ?? {}) as {
    maxlength?: number;
    placeholder?: string;
    autocomplete?: string;
    spellcheck?: boolean;
    enterAction?: string;
    mode?: 'roomcode' | 'text';
  };
  const instance = base(node, services, { tag: 'input' });
  const input = instance.element as HTMLInputElement;
  if (props.maxlength) input.maxLength = props.maxlength;
  if (props.placeholder) input.placeholder = props.placeholder;
  if (props.autocomplete) input.setAttribute('autocomplete', props.autocomplete);
  if (props.spellcheck !== undefined) input.spellcheck = props.spellcheck;
  input.addEventListener('input', () => {
    if (props.mode === 'text') {
      input.value = input.value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, props.maxlength ?? 20);
    } else {
      input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, props.maxlength ?? 6);
    }
  });
  void props.enterAction;
  return instance;
}

function segmentedControlFactory(node: UiNodeInput, services: UiComponentServices): UiComponentInstance {
  const props = (node.props ?? {}) as {
    valueSource?: string;
    options?: Array<{ value: string; text: string; textKey?: string }>;
  };
  const instance = base(node, services);
  instance.element.setAttribute('role', 'radiogroup');
  const buttons = (props.options ?? []).map((option) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ui-segmented__option';
    button.dataset.value = option.value;
    button.setAttribute('role', 'radio');
    button.addEventListener('click', () => {
      instance.element.dataset.value = option.value;
      instance.element.dispatchEvent(new Event('change'));
    });
    instance.element.appendChild(button);
    return { button, option };
  });
  instance.update = (context) => {
    const selected = String(getPath(context, props.valueSource ?? '') ?? instance.element.dataset.value ?? '');
    instance.element.dataset.value = selected;
    for (const { button, option } of buttons) {
      const active = selected === option.value;
      button.classList.toggle('selected', active);
      button.setAttribute('aria-checked', String(active));
      button.tabIndex = active ? 0 : -1;
      button.textContent = option.textKey
        ? services.localize?.(option.textKey, undefined, option.text) ?? option.text
        : option.text;
    }
  };
  instance.element.addEventListener('keydown', (event) => {
    if (!(event instanceof KeyboardEvent) || !['ArrowLeft', 'ArrowRight'].includes(event.key) || buttons.length < 2) return;
    event.preventDefault();
    const current = buttons.findIndex(({ option }) => option.value === instance.element.dataset.value);
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const next = buttons[(current + direction + buttons.length) % buttons.length]!;
    next.button.click();
    next.button.focus();
  });
  return instance;
}

function rangeFactory(node: UiNodeInput, services: UiComponentServices): UiComponentInstance {
  const props = (node.props ?? {}) as { min?: number; max?: number; step?: number };
  const instance = base(node, services, { tag: 'input' });
  const input = instance.element as HTMLInputElement;
  input.type = 'range';
  input.min = String(props.min ?? 0);
  input.max = String(props.max ?? 100);
  input.step = String(props.step ?? 1);
  return instance;
}

function progressBarFactory(node: UiNodeInput, services: UiComponentServices): UiComponentInstance {
  const props = (node.props ?? {}) as { valueSource: string; maxSource: string; direction?: 'horizontal' | 'vertical' };
  const instance = base(node, services);
  instance.update = (context) => {
    const value = Number(getPath(context, props.valueSource) ?? 0);
    const max = Number(getPath(context, props.maxSource) ?? 1);
    const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
    if (props.direction === 'vertical') {
      instance.element.style.height = `${ratio * 100}%`;
    } else {
      instance.element.style.width = `${ratio * 100}%`;
    }
  };
  return instance;
}

function arcMeterFactory(node: UiNodeInput, services: UiComponentServices): UiComponentInstance {
  const props = (node.props ?? {}) as { valueSource: string };
  const instance = base(node, services);
  instance.update = (context) => {
    const ratio = Math.max(0, Math.min(1, Number(getPath(context, props.valueSource) ?? 0)));
    const deg = 360 * (1 - ratio);
    instance.element.style.background = `conic-gradient(from 0deg, rgba(255,162,59,0.95) ${deg}deg, rgba(255,255,255,0.12) ${deg}deg)`;
  };
  return instance;
}

function popupLayerFactory(node: UiNodeInput, services: UiComponentServices): UiComponentInstance {
  const instance = base(node, services);
  instance.handleEvent = (event) => {
    if (event.type === 'floatText') {
      const p = el('div', `float ${event.kind ?? 'score'}`, event.label ?? '');
      p.style.left = `${50 + (Math.random() - 0.5) * 24}%`;
      p.style.top = `${34 + (Math.random() - 0.5) * 16}%`;
      instance.element.appendChild(p);
      setTimeout(() => p.remove(), 1400);
    }
  };
  return instance;
}

function imageFactory(node: UiNodeInput, services: UiComponentServices): UiComponentInstance {
  const instance = base(node, services, { tag: 'img' });
  const img = instance.element as HTMLImageElement;
  img.alt = node.id;
  const url = services.resolveAssetUrl?.(node.assetId ?? '') ?? null;
  if (url) img.src = url;
  return instance;
}

factories.text = textFactory;
factories.statText = textFactory;
factories.roleChip = textFactory;
factories.objectiveMarker = textFactory;
factories.button = buttonFactory;
factories.pauseButton = buttonFactory;
factories.input = inputFactory;
factories.segmentedControl = segmentedControlFactory;
factories.range = rangeFactory;
factories.progressBar = progressBarFactory;
factories.arcMeter = arcMeterFactory;
factories.connectionIndicator = (n, s) => base(n, s, { tag: 'span' });
factories.crosshair = (n, s) => base(n, s);
factories.popupLayer = popupLayerFactory;
factories.image = imageFactory;

export function createUiComponent(
  node: UiNodeInput,
  services: UiComponentServices,
  registry?: UiComponentRegistry,
): UiComponentInstance {
  const registration = registry?.get(node.type);
  if (registration) return registration.create(node, services);
  const factory = factories[node.type];
  return factory ? factory(node, services) : base(node, services);
}

/** Component-specific property schemas (inspector/editor contract). */
const componentSchemas: Record<string, z.ZodType> = {
  container: z.object({}).strict(),
  panel: z.object({}).strict(),
  horizontal: z.object({}).strict(),
  vertical: z.object({}).strict(),
  grid: z.object({ columns: z.number().optional(), rows: z.number().optional() }).strict(),
  spacer: z.object({}).strict(),
  conditional: z.object({}).strict(),
  repeater: z.object({ listSource: z.string().optional() }).strict(),
  text: z.object({ tag: z.string().optional() }).strict(),
  statText: z.object({}).strict(),
  roleChip: z.object({}).strict(),
  objectiveMarker: z.object({}).strict(),
  button: z.object({ dataAct: z.string().optional(), title: z.string().optional() }).strict(),
  pauseButton: z.object({ title: z.string().optional() }).strict(),
  input: z
    .object({
      maxlength: z.number().optional(),
      placeholder: z.string().optional(),
      autocomplete: z.string().optional(),
      spellcheck: z.boolean().optional(),
      enterAction: z.string().optional(),
      mode: z.enum(['roomcode', 'text']).optional(),
    })
    .strict(),
  segmentedControl: z.object({
    valueSource: z.string().optional(),
    options: z.array(z.object({ value: z.string(), text: z.string(), textKey: z.string().optional() }).strict()).min(2).optional(),
  }).strict(),
  range: z.object({ min: z.number().optional(), max: z.number().optional(), step: z.number().optional() }).strict(),
  progressBar: z.object({ valueSource: z.string().optional(), maxSource: z.string().optional() }).strict(),
  arcMeter: z.object({ valueSource: z.string().optional() }).strict(),
  connectionIndicator: z.object({}).strict(),
  crosshair: z.object({}).strict(),
  popupLayer: z.object({}).strict(),
  image: z.object({ alt: z.string().optional() }).strict(),
};

export function registerDefaultUiComponents(registry: UiComponentRegistry): void {
  for (const type of Object.keys(factories)) {
    const factory = factories[type];
    const registration: UiComponentRegistration = {
      type,
      schema: componentSchemas[type] ?? z.record(z.string(), z.unknown()),
      create: (def: UiNodeInput, services: UiComponentServices) => factory(def, services),
      inspector: inspectorFor(type),
    };
    registry.register(registration);
  }
}

function inspectorFor(type: string): UiComponentRegistration['inspector'] {
  const common = [
    { path: 'id', label: 'Node id', type: 'string' as const },
    { path: 'text', label: 'Text', type: 'string' as const },
    { path: 'visible', label: 'Visible', type: 'boolean' as const },
  ];
  switch (type) {
    case 'button':
      return { label: 'Button', fields: [...common, { path: 'class', label: 'Class', type: 'string' as const }] };
    case 'input':
      return { label: 'Input', fields: [{ path: 'id', label: 'Node id', type: 'string' as const }] };
    case 'progressBar':
      return { label: 'Progress Bar', fields: [{ path: 'id', label: 'Node id', type: 'string' as const }] };
    case 'arcMeter':
      return { label: 'Arc Meter', fields: [{ path: 'id', label: 'Node id', type: 'string' as const }] };
    default:
      return { label: type, fields: common };
  }
}

export function compileNodeBindings(
  node: UiNodeInput,
  element: HTMLElement,
  localize?: (key: string, params?: Record<string, string | number>, fallback?: string) => string,
): Array<{ apply(ctx: Record<string, unknown>, el: HTMLElement): void }> {
  return (node.bindings ?? []).map((b) => compileBindingApplier(b, element, localize));
}
