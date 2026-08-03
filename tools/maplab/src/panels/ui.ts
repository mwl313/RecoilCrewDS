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
  onApplyToGame(): void;
  onSaveAsNewProfile(): void;
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
        .maplab-ui {
          position:absolute; inset:0; display:grid;
          grid-template-rows:auto 1fr 190px;
          grid-template-columns:320px 1fr 340px;
          font:12px/1.45 system-ui, 'Segoe UI', sans-serif; color:#cfe8ee;
          background:#0d151a;
          --tp-base-background-color:#101a20;
          --tp-base-shadow-color:rgba(0,0,0,.35);
          --tp-button-background-color:#1c2c35;
          --tp-button-background-color-active:#2b4652;
          --tp-button-background-color-hover:#253944;
          --tp-button-foreground-color:#d7edf3;
          --tp-container-background-color:#0f191f;
          --tp-container-background-color-active:#16242c;
          --tp-container-foreground-color:#d7edf3;
          --tp-groove-foreground-color:#2a3f4a;
          --tp-input-background-color:#0b1318;
          --tp-input-background-color-active:#15232b;
          --tp-input-foreground-color:#d7edf3;
          --tp-label-foreground-color:#a9c9d3;
          --tp-blade-foreground-color:#d7edf3;
          --tp-focus-shadow-color:rgba(86,205,235,.35);
          --tp-font-size:11px;
          --tp-blade-value-width:52%;
        }
        .maplab-toolbar {
          grid-column:1/4; display:flex; gap:8px; align-items:center; flex-wrap:wrap;
          padding:8px 12px;
          background:linear-gradient(180deg,#18252d,#142028);
          border-bottom:1px solid #22333d; position:relative; z-index:2;
        }
        .maplab-toolbar input, .maplab-toolbar select, .maplab-toolbar button {
          background:#0d171d; color:#d7edf3; border:1px solid #2a3f4a; border-radius:6px;
          padding:5px 9px; font:inherit; outline:none;
          transition:background .12s, border-color .12s, box-shadow .12s;
        }
        .maplab-toolbar button:hover { background:#1b2c35; border-color:#3c5664; }
        .maplab-toolbar button:active { transform:translateY(1px); }
        .maplab-toolbar input:focus, .maplab-toolbar select:focus, .maplab-toolbar button:focus-visible {
          border-color:#56cdeb; box-shadow:0 0 0 2px rgba(86,205,235,.2);
        }
        .maplab-sep { width:1px; height:22px; background:#2a3f4a; margin:0 2px; }
        .maplab-toolbar label { display:flex; align-items:center; gap:4px; color:#a9c9d3; }
        .maplab-left {
          grid-column:1; overflow:auto; border-right:1px solid #22333d;
          padding:10px 10px 16px; background:#101a20;
        }
        .maplab-center { grid-column:2; position:relative; overflow:hidden; background:#0b1216; }
        #maplab-canvas { position:absolute; inset:0; }
        .maplab-right {
          grid-column:3; overflow:auto; border-left:1px solid #22333d;
          padding:10px 12px; background:#101a20;
        }
        .maplab-bottom {
          grid-column:1/4; display:grid; grid-template-columns:1.1fr 1fr .9fr; gap:12px;
          border-top:1px solid #22333d; padding:8px 12px; overflow:auto; background:#0e181e;
        }
        .maplab-panel-title {
          font-size:10px; font-weight:700; letter-spacing:.14em; text-transform:uppercase;
          color:#7fc9d8; margin:12px 0 6px;
        }
        .maplab-panel-title:first-child { margin-top:2px; }
        .maplab-status-pass, .maplab-status-fail {
          display:inline-block; padding:3px 12px; border-radius:999px; font-weight:700; font-size:12px;
        }
        .maplab-status-pass { background:rgba(77,219,110,.14); color:#4ddb6e; }
        .maplab-status-fail { background:rgba(255,90,74,.14); color:#ff5a4a; }
        .maplab-issue {
          cursor:pointer; padding:4px 8px; border-radius:6px; margin:2px 0;
          border-left:3px solid transparent; transition:background .12s;
        }
        .maplab-issue:hover { background:#1a2a33; }
        .maplab-issue[data-severity='error'] { border-left-color:#ff5a4a; }
        .maplab-issue[data-severity='warning'] { border-left-color:#ffb84a; }
        .maplab-layer-row {
          display:flex; gap:7px; align-items:center; padding:2px 6px; border-radius:5px;
          cursor:pointer; transition:background .12s;
        }
        .maplab-layer-row:hover { background:#1a2a33; }
        .maplab-layer-row input { accent-color:#56cdeb; }
        .maplab-metrics {
          font:11px/1.55 ui-monospace, Consolas, 'Cascadia Mono', monospace;
          color:#9fc4cf; white-space:pre-wrap; background:#0b1318;
          border:1px solid #1c2d36; border-radius:6px; padding:8px;
        }
        .maplab-log {
          font:11px/1.5 ui-monospace, Consolas, monospace;
          color:#8fb4bf; white-space:pre-wrap; max-height:130px; overflow:auto;
          background:#0b1318; border:1px solid #1c2d36; border-radius:6px; padding:6px 8px;
        }
        textarea {
          width:100%; box-sizing:border-box; background:#0b1318; color:#d7edf3;
          border:1px solid #2a3f4a; border-radius:6px; font:11px/1.4 ui-monospace, monospace;
          padding:6px; outline:none;
        }
        textarea:focus { border-color:#56cdeb; box-shadow:0 0 0 2px rgba(86,205,235,.18); }
        .maplab-left::-webkit-scrollbar, .maplab-right::-webkit-scrollbar,
        .maplab-bottom::-webkit-scrollbar, .maplab-log::-webkit-scrollbar,
        .maplab-metrics::-webkit-scrollbar { width:9px; height:9px; }
        .maplab-left::-webkit-scrollbar-thumb, .maplab-right::-webkit-scrollbar-thumb,
        .maplab-bottom::-webkit-scrollbar-thumb, .maplab-log::-webkit-scrollbar-thumb,
        .maplab-metrics::-webkit-scrollbar-thumb { background:#2a3f4a; border-radius:5px; }
        .maplab-left::-webkit-scrollbar-thumb:hover, .maplab-right::-webkit-scrollbar-thumb:hover {
          background:#3c5664;
        }
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
    const sep = (): HTMLElement => el('span', 'maplab-sep');
    const profile = el('select', '') as HTMLSelectElement;
    for (const id of ['map.arena400Primary', 'map.fallbackLegacy']) {
      const option = el('option', '', id);
      profile.appendChild(option);
    }
    profile.value = this.state.sourceProfileId;
    profile.addEventListener('change', () => this.callbacks.onProfileChange(profile.value));
    profile.title = 'Which map profile to generate from.';

    const mode = el('select', '') as HTMLSelectElement;
    mode.innerHTML = '<option value="production">Production</option><option value="exactCandidate">Exact Candidate</option>';
    mode.value = this.state.mode;
    mode.addEventListener('change', () => this.callbacks.onModeChange(mode.value as 'production' | 'exactCandidate'));
    mode.title = 'Production = same flow as a real match. Exact Candidate = rebuild one specific attempt.';

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
    regenerate.title = 'Generate the map again with the current settings.';
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
    reset.title = 'Put every setting back to the saved profile.';

    const exportProfile = el('button', '', 'Export Profile');
    exportProfile.addEventListener('click', () => this.callbacks.onExportProfile());
    exportProfile.title = 'Download a profile bundle you can apply to the game with the CLI.';
    const exportArena = el('button', '', 'Export Arena');
    exportArena.addEventListener('click', () => this.callbacks.onExportArena());
    exportArena.title = 'Download the generated arena (heightfield, layout, checksum).';
    const exportValidation = el('button', '', 'Export Validation');
    exportValidation.addEventListener('click', () => this.callbacks.onExportValidation());
    exportValidation.title = 'Download the validation report for this arena.';
    const applyToGame = el('button', '', 'Apply to Game');
    applyToGame.addEventListener('click', () => this.callbacks.onApplyToGame());
    applyToGame.title = 'Save this working profile over the current map profile in content/ (needs npm run maplab:apply-server).';
    const saveAsNew = el('button', '', 'Save as New Profile');
    saveAsNew.addEventListener('click', () => this.callbacks.onSaveAsNewProfile());
    saveAsNew.title = 'Save the working profile as a brand-new map profile and point the game mode at it (needs npm run maplab:apply-server).';

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

    bar.append(profile, mode, sep(), label('Room', room), label('Match', matchIndex), label('Ver', version),
      sep(), prev, next, random, sep(), regenerate, label('Auto', auto), sep(),
      undo, redo, reset, sep(), exportProfile, exportArena, exportValidation,
      applyToGame, saveAsNew, sep(), exactBox);

    const fit = el('button', '', 'Fit Map');
    fit.addEventListener('click', () => (window as unknown as { __maplabFit?: () => void }).__maplabFit?.());
    fit.title = 'Center the camera on the whole map.';
    const orbit = el('button', '', '3D');
    orbit.addEventListener('click', () => this.callbacks.onCameraMode('orbit3d'));
    orbit.title = 'Free 3D orbit camera.';
    const top = el('button', '', 'Top Down');
    top.addEventListener('click', () => this.callbacks.onCameraMode('topDown'));
    top.title = 'Straight-down map view.';
    bar.append(fit, orbit, top);
  }

  private buildParameters(): void {
    this.descriptors = buildParameterRegistry(this.state.workingBundle);
    const groups: Record<string, FolderApi> = {};
    const subfolders = new Map<string, FolderApi>();
    const folderFor = (descriptor: ParameterDescriptor): FolderApi => {
      const root = groups[descriptor.group];
      if (!descriptor.subgroup) return root;
      const key = `${descriptor.group}/${descriptor.subgroup}`;
      let sub = subfolders.get(key);
      if (!sub) {
        sub = root.addFolder({ title: descriptor.subgroup, expanded: EXPANDED_SUBGROUPS.has(descriptor.subgroup) });
        subfolders.set(key, sub);
      }
      return sub;
    };
    const attachTooltip = (binding: unknown, description: string | undefined): void => {
      if (!description) return;
      const row = (binding as { element?: HTMLElement }).element;
      if (row) {
        row.title = description;
        row.style.cursor = 'help';
      }
    };
    for (const folder of ['basic', 'terrain', 'routes', 'objects', 'validation'] as const) {
      groups[folder] = this.pane.addFolder({ title: folder.toUpperCase(), expanded: folder === 'basic' });
    }
    for (const descriptor of this.descriptors) {
      if (descriptor.macro) {
        this.macroState.terrainDrama = 1;
        const binding = folderFor(descriptor).addBinding(this.macroState, 'terrainDrama', {
          label: descriptor.label,
          min: descriptor.min,
          max: descriptor.max,
          step: descriptor.step,
        });
        attachTooltip(binding, descriptor.description);
        binding.on('change', (ev) => this.callbacks.onMacroChange(ev.value as number));
        continue;
      }
      if (descriptor.type === 'text' && Array.isArray(getPath(this.state.workingBundle, descriptor.path))) {
        const proxy = { value: (getPath(this.state.workingBundle, descriptor.path) as string[]).join(', ') };
        const binding = folderFor(descriptor).addBinding(proxy, 'value', { label: descriptor.label });
        attachTooltip(binding, descriptor.description);
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
      const initial = getPath(target, descriptor.path);
      if (initial === undefined) continue; // optional field not present in this bundle
      // Tweakpane binds a single property key, so nested JSON paths go
      // through a per-binding proxy; changes write back via the path.
      const proxy = { value: initial };
      try {
        const binding = folderFor(descriptor).addBinding(proxy, 'value', options);
        attachTooltip(binding, descriptor.description);
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
      row.dataset.severity = issue.severity;
      row.title = issue.message;
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

/** Sub-folders that start expanded so the most-used settings are visible. */
const EXPANDED_SUBGROUPS = new Set(['Ground Level', 'Roads', 'Master Switches', 'Height Rules']);

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
