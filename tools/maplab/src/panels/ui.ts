import { Pane } from 'tweakpane';
import type { FolderApi } from '@tweakpane/core';
import type { MapValidationIssue } from '@app/shared/mapgen/validationIssues';
import type { MapGenerationBundle } from '@app/shared/mapgen/profiles';
import type { MapLabState } from '../mapLabState';
import { getPath, deepCloneBundle } from '../mapLabState';
import {
  buildParameterRegistry,
  type ParameterDescriptor,
} from '../parameters/parameterRegistry';

export interface MapLabUICallbacks {
  onRegenerate(immediate?: boolean): void;
  onParamChange(descriptor: ParameterDescriptor, value: unknown): void;
  onMacroChange(factor: number): void;
  onRawJsonApply(json: string, section: string): string | null;
  onUndo(): void;
  onRedo(): void;
  onReset(): void;
  onResetSection(section: string): void;
  onExportProfile(): void;
  onExportArena(): void;
  onExportValidation(): void;
  onFocusIssue(issue: MapValidationIssue): void;
  onLayerToggle(id: string, visible: boolean): void;
  onModeChange(mode: 'production' | 'exactCandidate'): void;
  onCameraMode(mode: 'orbit3d' | 'topDown'): void;
  onProfileChange(profileId: string): void;
  onSeedFieldChange(path: string, value: string | number): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

/**
 * Map Lab DOM/Tweakpane UI. Tweakpane is a view/controller only; MapLabState
 * and the working bundle remain the source of truth.
 */
export class MapLabUI {
  readonly root: HTMLElement;
  private pane: Pane;
  private readonly layersBox: HTMLElement;
  private readonly issueList: HTMLElement;
  private readonly metricsBox: HTMLElement;
  private readonly logBox: HTMLElement;
  private readonly statusBox: HTMLElement;
  private readonly paneHost: HTMLElement;
  private layersPanel!: HTMLElement;
  private readonly seedBase: HTMLInputElement;
  private readonly seedCandidate: HTMLInputElement;
  private readonly seedAttempt: HTMLInputElement;
  private readonly rawJson: HTMLTextAreaElement;
  private readonly diffBox: HTMLTextAreaElement;
  private readonly macroState = { terrainDrama: 1 };
  private descriptors: ParameterDescriptor[] = [];
  private registry = new Map<string, unknown>();

  constructor(
    container: HTMLElement,
    private readonly state: MapLabState,
    private readonly callbacks: MapLabUICallbacks,
    layerIds: string[],
  ) {
    this.root = el('div', 'maplab-ui');
    container.appendChild(this.root);
    this.root.innerHTML = `
      <style>
        .maplab-ui { position:absolute; inset:0; display:grid; grid-template-rows:auto 1fr 160px;
          grid-template-columns:300px 1fr 320px; font:12px/1.4 system-ui; color:#cfe8ee;
          background:#101820; }
        .maplab-toolbar { grid-column:1/4; display:flex; gap:8px; align-items:center; padding:6px 10px;
          background:#17232b; border-bottom:1px solid #2a3a44; flex-wrap:wrap; position:relative; z-index:2; }
        .maplab-toolbar input, .maplab-toolbar select, .maplab-toolbar button { background:#0d151b; color:#cfe8ee;
          border:1px solid #33454f; padding:4px 8px; border-radius:4px; }
        .maplab-toolbar button:hover { background:#1b2a33; }
        .maplab-left { grid-column:1; overflow:auto; border-right:1px solid #2a3a44; padding:8px; }
        .maplab-center { grid-column:2; position:relative; overflow:hidden; }
        #maplab-canvas { position:absolute; inset:0; }
        .maplab-right { grid-column:3; overflow:auto; border-left:1px solid #2a3a44; padding:8px; }
        .maplab-bottom { grid-column:1/4; display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px;
          border-top:1px solid #2a3a44; padding:6px 10px; overflow:auto; }
        .maplab-panel-title { font-weight:700; color:#9ff3ff; margin:6px 0 4px; }
        .maplab-status-pass { color:#4ddb6e; font-weight:700; }
        .maplab-status-fail { color:#ff5a4a; font-weight:700; }
        .maplab-issue { cursor:pointer; padding:2px 4px; border-radius:3px; }
        .maplab-issue:hover { background:#1b2a33; }
        .maplab-layer-row { display:flex; gap:6px; align-items:center; padding:1px 0; }
        .maplab-log { font:11px monospace; color:#8fb4bf; white-space:pre-wrap; max-height:120px; overflow:auto; }
        textarea { width:100%; box-sizing:border-box; background:#0d151b; color:#cfe8ee; border:1px solid #33454f;
          border-radius:4px; font:11px monospace; }
      </style>
      <div class="maplab-toolbar"></div>
      <div class="maplab-left"><div id="maplab-pane-host"></div></div>
      <div class="maplab-center"></div>
      <div class="maplab-right"></div>
      <div class="maplab-bottom"></div>
    `;

    this.paneHost = this.root.querySelector('#maplab-pane-host') as HTMLElement;
    this.pane = new Pane({ container: this.paneHost });
    this.layersBox = el('div', 'maplab-layers');
    this.issueList = el('div', 'maplab-issues');
    this.metricsBox = el('div', 'maplab-metrics');
    this.logBox = el('div', 'maplab-log');
    this.statusBox = el('div', 'maplab-status');
    this.seedBase = el('input', '');
    this.seedBase.type = 'text';
    this.seedBase.readOnly = true;
    this.seedCandidate = el('input', '');
    this.seedCandidate.type = 'text';
    this.seedAttempt = el('input', '');
    this.seedAttempt.type = 'number';
    this.rawJson = el('textarea', '');
    this.rawJson.rows = 12;
    this.diffBox = el('textarea', '');
    this.diffBox.rows = 6;
    this.diffBox.readOnly = true;

    this.buildToolbar();
    this.buildParameters();
    this.buildRight();
    this.buildBottom(layerIds);
  }

  private buildToolbar(): void {
    const bar = this.root.querySelector('.maplab-toolbar')!;
    const profile = el('select', '') as HTMLSelectElement;
    for (const id of ['map.arena400Primary', 'map.fallbackLegacy']) {
      const option = el('option', '', id);
      profile.appendChild(option);
    }
    profile.value = this.state.sourceProfileId;
    profile.addEventListener('change', () => this.callbacks.onProfileChange(profile.value));

    const mode = el('select', '') as HTMLSelectElement;
    mode.innerHTML = '<option value="production">Production</option><option value="exactCandidate">Exact Candidate</option>';
    mode.value = this.state.mode;
    mode.addEventListener('change', () => this.callbacks.onModeChange(mode.value as 'production' | 'exactCandidate'));

    const room = el('input', '') as HTMLInputElement;
    room.value = this.state.roomCode;
    room.style.width = '90px';
    room.addEventListener('change', () => this.callbacks.onSeedFieldChange('roomCode', room.value));

    const matchIndex = el('input', '') as HTMLInputElement;
    matchIndex.type = 'number';
    matchIndex.value = String(this.state.matchIndex);
    matchIndex.style.width = '56px';
    matchIndex.addEventListener('change', () => this.callbacks.onSeedFieldChange('matchIndex', Number(matchIndex.value)));

    const version = el('input', '') as HTMLInputElement;
    version.type = 'number';
    version.value = String(this.state.generatorVersion);
    version.style.width = '56px';
    version.addEventListener('change', () => this.callbacks.onSeedFieldChange('generatorVersion', Number(version.value)));

    const prev = el('button', '', '◀');
    prev.title = 'Previous seed (matchIndex - 1)';
    prev.addEventListener('click', () => this.callbacks.onSeedFieldChange('matchIndex', Math.max(0, this.state.matchIndex - 1)));
    const next = el('button', '', '▶');
    next.title = 'Next seed (matchIndex + 1)';
    next.addEventListener('click', () => this.callbacks.onSeedFieldChange('matchIndex', this.state.matchIndex + 1));
    const random = el('button', '', 'Random');
    random.addEventListener('click', () => this.callbacks.onSeedFieldChange('roomCode', randomCode()));

    const regenerate = el('button', '', 'Regenerate');
    regenerate.addEventListener('click', () => this.callbacks.onRegenerate(true));
    const auto = el('input', '') as HTMLInputElement;
    auto.type = 'checkbox';
    auto.checked = this.state.autoRegenerate;
    auto.addEventListener('change', () => {
      this.state.autoRegenerate = auto.checked;
      if (auto.checked) this.callbacks.onRegenerate(true);
    });

    const undo = el('button', '', 'Undo');
    undo.addEventListener('click', () => this.callbacks.onUndo());
    const redo = el('button', '', 'Redo');
    redo.addEventListener('click', () => this.callbacks.onRedo());
    const reset = el('button', '', 'Reset');
    reset.addEventListener('click', () => this.callbacks.onReset());

    const exportProfile = el('button', '', 'Export Profile');
    exportProfile.addEventListener('click', () => this.callbacks.onExportProfile());
    const exportArena = el('button', '', 'Export Arena');
    exportArena.addEventListener('click', () => this.callbacks.onExportArena());
    const exportValidation = el('button', '', 'Export Validation');
    exportValidation.addEventListener('click', () => this.callbacks.onExportValidation());

    const exactBox = el('span', '');
    exactBox.style.display = 'flex';
    exactBox.style.gap = '6px';
    exactBox.append(
      label('Base', this.seedBase),
      label('Candidate', this.seedCandidate),
      label('Attempt', this.seedAttempt),
    );
    this.seedAttempt.addEventListener('change', () => this.callbacks.onSeedFieldChange('exactAttempt', Number(this.seedAttempt.value || 0)));
    this.seedCandidate.addEventListener('change', () => this.callbacks.onSeedFieldChange('exactCandidateSeed', Number(this.seedCandidate.value || 0)));

    bar.append(profile, mode, label('Room', room), label('Match', matchIndex), label('Ver', version),
      prev, next, random, regenerate, label('Auto', auto), undo, redo, reset,
      exportProfile, exportArena, exportValidation, exactBox);

    const fit = el('button', '', 'Fit Map');
    fit.addEventListener('click', () => (window as unknown as { __maplabFit?: () => void }).__maplabFit?.());
    const orbit = el('button', '', '3D');
    orbit.addEventListener('click', () => this.callbacks.onCameraMode('orbit3d'));
    const top = el('button', '', 'Top Down');
    top.addEventListener('click', () => this.callbacks.onCameraMode('topDown'));
    bar.append(fit, orbit, top);
  }

  private buildParameters(): void {
    this.descriptors = buildParameterRegistry(this.state.workingBundle);
    const groups: Record<string, FolderApi> = {};
    for (const folder of ['basic', 'terrain', 'routes', 'objects', 'validation'] as const) {
      groups[folder] = this.pane.addFolder({ title: folder.toUpperCase(), expanded: folder === 'basic' });
    }
    for (const descriptor of this.descriptors) {
      if (descriptor.macro) {
        this.macroState.terrainDrama = 1;
        const binding = groups[descriptor.group].addBinding(this.macroState, 'terrainDrama', {
          label: descriptor.label,
          min: descriptor.min,
          max: descriptor.max,
          step: descriptor.step,
        });
        binding.on('change', (ev) => this.callbacks.onMacroChange(ev.value as number));
        continue;
      }
      if (descriptor.type === 'text' && Array.isArray(getPath(this.state.workingBundle, descriptor.path))) {
        const proxy = { value: (getPath(this.state.workingBundle, descriptor.path) as string[]).join(', ') };
        const binding = groups[descriptor.group].addBinding(proxy, 'value', { label: descriptor.label });
        binding.on('change', (ev) => {
          const value = String(ev.value)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          this.callbacks.onParamChange(descriptor, value);
        });
        this.registry.set(descriptor.path, proxy);
        continue;
      }
      const options: Record<string, unknown> = { label: descriptor.label };
      if (descriptor.min !== undefined) options.min = descriptor.min;
      if (descriptor.max !== undefined) options.max = descriptor.max;
      if (descriptor.step !== undefined) options.step = descriptor.step;
      if (descriptor.type === 'select' && descriptor.options) options.options = descriptor.options;
      if (descriptor.type === 'readonly') options.readonly = true;
      const target = this.state.workingBundle as unknown as Record<string, unknown>;
      try {
        const binding = groups[descriptor.group].addBinding(target, descriptor.path, options);
        binding.on('change', (ev) => this.callbacks.onParamChange(descriptor, ev.value));
        this.registry.set(descriptor.path, binding);
      } catch {
        // Path not present in the working bundle (e.g. optional field).
      }
    }

    // Raw JSON editor.
    const left = this.root.querySelector('.maplab-left')!;
    const jsonTitle = el('div', 'maplab-panel-title', 'ADVANCED JSON');
    const applyJson = el('button', '', 'Apply JSON');
    applyJson.addEventListener('click', () => {
      const error = this.callbacks.onRawJsonApply(this.rawJson.value, this.rawJson.dataset.section ?? '');
      if (error) this.log(`JSON error: ${error}`);
    });
    const resetSection = el('button', '', 'Reset Section');
    resetSection.addEventListener('click', () => this.callbacks.onResetSection(this.rawJson.dataset.section ?? ''));
    const sectionSelect = el('select', '') as HTMLSelectElement;
    for (const section of ['map', 'terrainProfile', 'validationProfile', 'furnitureSet', 'densityProfile', 'landmarks']) {
      sectionSelect.appendChild(el('option', '', section));
    }
    sectionSelect.addEventListener('change', () => {
      this.rawJson.value = JSON.stringify(getPath(this.state.workingBundle, sectionSelect.value), null, 2) ?? '';
      this.rawJson.dataset.section = sectionSelect.value;
    });
    left.append(jsonTitle, sectionSelect, this.rawJson, applyJson, resetSection);
  }

  private buildRight(): void {
    const right = this.root.querySelector('.maplab-right')!;
    right.append(
      el('div', 'maplab-panel-title', 'VALIDATION'),
      this.statusBox,
      el('div', 'maplab-panel-title', 'ISSUES (click to focus)'),
      this.issueList,
      el('div', 'maplab-panel-title', 'METRICS'),
      this.metricsBox,
      el('div', 'maplab-panel-title', 'LOGS'),
      this.logBox,
    );
  }

  private buildBottom(layerIds: string[]): void {
    const bottom = this.root.querySelector('.maplab-bottom')!;
    this.layersPanel = el('div', '');
    this.buildLayerRows(layerIds);
    const historyPanel = el('div', '');
    historyPanel.appendChild(el('div', 'maplab-panel-title', 'HISTORY / DIFF'));
    historyPanel.appendChild(el('div', 'maplab-log', 'Undo/Redo tracked in the toolbar.'));
    historyPanel.appendChild(this.diffBox);
    const logPanel = el('div', '');
    logPanel.appendChild(el('div', 'maplab-panel-title', 'DRAFT'));
    logPanel.appendChild(el('div', 'maplab-log', 'Working state auto-saves to localStorage (draft:v1).'));
    bottom.append(this.layersPanel, historyPanel, logPanel);
  }

  /** (Re)build the layer rows when the viewport layer set becomes available. */
  setLayerIds(layerIds: string[]): void {
    this.buildLayerRows(layerIds);
  }

  private buildLayerRows(layerIds: string[]): void {
    this.layersPanel.textContent = '';
    this.layersPanel.appendChild(el('div', 'maplab-panel-title', 'LAYERS (no regeneration)'));
    for (const id of layerIds) {
      const row = el('label', 'maplab-layer-row');
      const checkbox = el('input', '') as HTMLInputElement;
      checkbox.type = 'checkbox';
      checkbox.checked = this.state.layers[id] ?? defaultVisibility(id);
      checkbox.addEventListener('change', () => this.callbacks.onLayerToggle(id, checkbox.checked));
      row.append(checkbox, document.createTextNode(id));
      this.layersPanel.appendChild(row);
    }
  }

  /** Recreate the Tweakpane tree (after undo/redo/reset/profile switch). */
  rebuildParameters(): void {
    this.pane.dispose();
    this.paneHost.innerHTML = '';
    this.pane = new Pane({ container: this.paneHost });
    this.buildParameters();
  }

  updateSeeds(base: number | undefined, candidate: number | undefined, attempt: number | undefined): void {
    this.seedBase.value = base === undefined ? '' : String(base);
    this.seedCandidate.value = candidate === undefined ? '' : String(candidate);
    this.seedAttempt.value = attempt === undefined ? '' : String(attempt);
  }

  updateValidation(ok: boolean, issues: MapValidationIssue[], metrics: string[]): void {
    this.statusBox.textContent = ok ? 'PASS' : 'FAIL';
    this.statusBox.className = ok ? 'maplab-status-pass' : 'maplab-status-fail';
    this.issueList.textContent = '';
    for (const issue of issues) {
      const row = el('div', 'maplab-issue', `[${issue.severity}] ${issue.category}: ${issue.message}`);
      row.addEventListener('click', () => this.callbacks.onFocusIssue(issue));
      this.issueList.appendChild(row);
    }
    this.metricsBox.textContent = metrics.join('\n');
  }

  updateDiff(source: MapGenerationBundle): void {
    this.diffBox.value =
      JSON.stringify(source, null, 1) === JSON.stringify(this.state.workingBundle, null, 1)
        ? 'no changes'
        : `SOURCE → WORKING\n${diffSummary(source, this.state.workingBundle)}`;
  }

  updateLayersVisibility(visible: Record<string, boolean>): void {
    const rows = this.layersPanel.querySelectorAll('.maplab-layer-row input') as NodeListOf<HTMLInputElement>;
    rows.forEach((checkbox) => {
      const id = checkbox.parentElement?.textContent ?? '';
      if (id && visible[id] !== undefined) checkbox.checked = visible[id];
    });
  }

  log(message: string): void {
    this.logBox.textContent = `${new Date().toISOString().slice(11, 19)} ${message}\n${this.logBox.textContent}`.slice(0, 4000);
  }

  bindFit(fn: () => void): void {
    (window as unknown as { __maplabFit?: () => void }).__maplabFit = fn;
  }
}

function label(text: string, control: HTMLElement): HTMLElement {
  const wrap = el('label', '');
  wrap.style.display = 'flex';
  wrap.style.alignItems = 'center';
  wrap.style.gap = '4px';
  wrap.append(document.createTextNode(text), control);
  return wrap;
}

function randomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

function defaultVisibility(id: string): boolean {
  const defaults: Record<string, boolean> = {
    terrain: true,
    features: true,
    routeNodes: true,
    routeEdges: true,
    spawns: true,
    gates: true,
    recovery: true,
    ramps: true,
    landings: true,
    furniture: true,
    colliders: true,
    validationErrors: true,
  };
  return defaults[id] ?? false;
}

function diffSummary(source: MapGenerationBundle, working: MapGenerationBundle): string {
  const changes: string[] = [];
  const walk = (a: unknown, b: unknown, path: string): void => {
    if (typeof a !== typeof b) {
      changes.push(`${path}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
      return;
    }
    if (a && b && typeof a === 'object' && !Array.isArray(a)) {
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const k of keys) walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], path ? `${path}.${k}` : k);
      return;
    }
    if (Array.isArray(a) && Array.isArray(b) && JSON.stringify(a) !== JSON.stringify(b)) {
      changes.push(`${path}: array changed`);
      return;
    }
    if (a !== b) changes.push(`${path}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
  };
  walk(source, working, '');
  return changes.slice(0, 40).join('\n');
}

export { deepCloneBundle };
