import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow/latin-700.css';
import '@fontsource/barlow-condensed/latin-700-italic.css';
import '@fontsource/barlow-condensed/latin-800-italic.css';
import '@fontsource/barlow-condensed/latin-900-italic.css';
import '@app/client/styles.css';
import '@app/client/ui/index.css';
import './styles.css';
import {
  PRESENTATION_ASSET_CATALOG,
  PRESENTATION_HUDS,
  PRESENTATION_SCENES,
  PRESENTATION_THEMES,
} from '@app/generated/presentationContent.generated';
import { SceneActionRegistry } from '@app/client/presentation/actionRegistry';
import { UiComponentRegistry } from '@app/client/presentation/componentRegistry';
import { registerDefaultUiComponents } from '@app/client/presentation/uiComponents';
import { SceneRuntime } from '@app/client/presentation/sceneRuntime';
import { HudRuntime } from '@app/client/presentation/hudRuntime';
import { PresentationWorld } from '@app/client/presentation/presentationWorld';
import { AssetService } from '@app/client/assets';
import { resolvableAssetIds } from '@app/shared/assetCatalog';

const STABLE = new URLSearchParams(location.search).has('stable');
const preview = document.getElementById('preview') as HTMLElement;
preview.classList.toggle('stable', STABLE);
const info = document.getElementById('info') as HTMLElement;
const controls = document.getElementById('controls') as HTMLElement;
const tabScene = document.getElementById('tab-scene') as HTMLButtonElement;
const tabHud = document.getElementById('tab-hud') as HTMLButtonElement;
const registry = new UiComponentRegistry();
registerDefaultUiComponents(registry);

let mode: 'scene' | 'hud' = 'scene';
let sceneId = Object.keys(PRESENTATION_SCENES)[0];
let hudId = Object.keys(PRESENTATION_HUDS)[0];
let stateId = '';
let role: 'driver' | 'gunner' = 'driver';
let themeId = 'theme.base';
let hybrid = true;
let world: PresentationWorld | null = null;
let runtime: SceneRuntime | null = null;
let hudRuntime: HudRuntime | null = null;
let assets: AssetService | null = null;

function container(): HTMLElement {
  return document.createElement('div');
}

function scenePreviewStates(): Array<{ id: string; label: string; context: Record<string, unknown> }> {
  return PRESENTATION_SCENES[sceneId].previewStates ?? [{ id: 'idle', label: 'Idle', context: {} }];
}

function hudPreviewStates() {
  const hud = PRESENTATION_HUDS[hudId];
  const own = hud.previewStates ?? [];
  if (hudId === 'hud.gameplay') {
    return own;
  }
  return own;
}

function rebuildScene(): void {
  world?.dispose();
  world = null;
  runtime?.dispose();
  runtime = null;
  preview.textContent = '';
  const scene = PRESENTATION_SCENES[sceneId];
  const host = container();
  host.className = 'screen';
  preview.appendChild(host);
  const actions = new SceneActionRegistry();
  actions.register('app.enter', () => undefined);
  actions.register('app.createCrew', () => undefined);
  actions.register('app.openJoin', () => undefined);
  actions.register('app.joinCrew', () => undefined);
  actions.register('app.ready', () => undefined);
  actions.register('app.startSinglePlayer', () => undefined);
  actions.register('app.restartSinglePlayer', () => undefined);
  actions.register('app.openHowTo', () => undefined);
  actions.register('app.back', () => undefined);
  actions.register('app.leave', () => undefined);
  actions.register('app.rematch', () => undefined);
  actions.register('app.retry', () => undefined);
  actions.register('app.resume', () => undefined);
  actions.register('app.pause', () => undefined);
  actions.register('app.returnToMenu', () => undefined);
  actions.register('app.copyRoomCode', () => undefined);
  runtime = new SceneRuntime(
    {
      actions,
      registry,
      resolveAssetUrl: (id) => assets?.assetUrl(id) ?? null,
    },
    host,
  );
  const state = scene.previewStates?.find((s) => s.id === stateId) ?? scene.previewStates?.[0];
  void runtime.load(scene, state?.context ?? {});
  if (scene.type === 'hybrid' && hybrid && assets) {
    world = new PresentationWorld(scene, host, assets, { lowQuality: STABLE });
    if (!STABLE) world.start();
  }
  renderDiagnostics();
}

function rebuildHud(): void {
  hudRuntime?.dispose();
  hudRuntime = null;
  preview.textContent = '';
  const host = container();
  host.id = 'hud-preview';
  preview.appendChild(host);
  const themeHost = host;
  hudRuntime = new HudRuntime(host, registry, themeHost);
  const hud = PRESENTATION_HUDS[hudId];
  const states = hud.previewStates ?? [];
  const state = states.find((s) => (role === 'gunner' ? s.id === 'gunner' : s.id === 'driver')) ?? states[0];
  if (state) hudRuntime.apply(state.context as never);
  hudRuntime.setVisible(true);
  hudRuntime.setTheme(role);
  renderDiagnostics();
}

function rebuild(): void {
  if (mode === 'scene') rebuildScene();
  else rebuildHud();
}

function buildControls(): void {
  controls.textContent = '';
  const addLabel = (text: string): HTMLElement => {
    const label = document.createElement('label');
    label.textContent = text;
    controls.appendChild(label);
    return label;
  };
  const sceneSel = document.createElement('select');
  for (const id of Object.keys(PRESENTATION_SCENES)) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = `${PRESENTATION_SCENES[id].label} (${id})`;
    sceneSel.appendChild(opt);
  }
  sceneSel.value = sceneId;
  sceneSel.addEventListener('change', () => {
    sceneId = sceneSel.value;
    stateId = '';
    updateStates();
    rebuild();
  });
  addLabel('Scene').appendChild(sceneSel);

  const stateSel = document.createElement('select');
  const updateStates = (): void => {
    stateSel.textContent = '';
    for (const s of scenePreviewStates()) {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.label;
      stateSel.appendChild(opt);
    }
    if (stateId) stateSel.value = stateId;
  };
  updateStates();
  stateSel.addEventListener('change', () => {
    stateId = stateSel.value;
    rebuild();
  });
  addLabel('Preview state').appendChild(stateSel);

  const hudSel = document.createElement('select');
  for (const id of Object.keys(PRESENTATION_HUDS)) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = id;
    hudSel.appendChild(opt);
  }
  hudSel.value = hudId;
  hudSel.addEventListener('change', () => {
    hudId = hudSel.value;
    rebuild();
  });
  addLabel('HUD').appendChild(hudSel);

  const roleSel = document.createElement('select');
  roleSel.innerHTML = '<option value="driver">Driver</option><option value="gunner">Gunner</option>';
  roleSel.value = role;
  roleSel.addEventListener('change', () => {
    role = roleSel.value as 'driver' | 'gunner';
    rebuild();
  });
  addLabel('Role').appendChild(roleSel);

  const themeSel = document.createElement('select');
  for (const id of Object.keys(PRESENTATION_THEMES)) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = id;
    themeSel.appendChild(opt);
  }
  themeSel.value = themeId;
  themeSel.addEventListener('change', () => {
    themeId = themeSel.value;
    rebuild();
  });
  addLabel('Theme').appendChild(themeSel);

  const hybridBox = document.createElement('input');
  hybridBox.type = 'checkbox';
  hybridBox.checked = hybrid;
  const hybridLabel = addLabel('Hybrid 3D');
  hybridLabel.appendChild(hybridBox);
  hybridBox.addEventListener('change', () => {
    hybrid = hybridBox.checked;
    rebuild();
  });

  const resTitle = document.createElement('h3');
  resTitle.textContent = 'RESOLUTION PRESETS';
  controls.appendChild(resTitle);
  for (const [w, h] of [[1280, 720], [1920, 1080], [375, 812]] as const) {
    const btn = document.createElement('button');
    btn.textContent = `${w}×${h}`;
    btn.addEventListener('click', () => {
      preview.style.width = `${w}px`;
      preview.style.height = `${h}px`;
      preview.style.margin = 'auto';
      world?.resize();
    });
    controls.appendChild(btn);
  }
}

function renderDiagnostics(): void {
  const lines: string[] = [];
  if (mode === 'scene') {
    const scene = PRESENTATION_SCENES[sceneId];
    lines.push(`scene: ${scene.id} (${scene.type})`);
    lines.push(`nodes: ${countNodes(scene.root)}`);
    const badBindings = collectBadBindings(scene.root, 'scene');
    if (badBindings.length === 0) lines.push('bindings: <span class="ok">ok</span>');
    else badBindings.forEach((b) => lines.push(`binding: <span class="bad">${b}</span>`));
  } else {
    const hud = PRESENTATION_HUDS[hudId];
    lines.push(`hud: ${hud.id} (${hud.role ?? 'shared'})`);
    lines.push(`nodes: ${countNodes(hud.root)}`);
    const badBindings = collectBadBindings(hud.root, 'hud');
    if (badBindings.length === 0) lines.push('bindings: <span class="ok">ok</span>');
    else badBindings.forEach((b) => lines.push(`binding: <span class="bad">${b}</span>`));
  }
  lines.push(`assets: ${resolvableAssetIds(PRESENTATION_ASSET_CATALOG).length} resolvable`);
  const unknownAssets = collectUnknownAssets(mode === 'scene' ? PRESENTATION_SCENES[sceneId].root : PRESENTATION_HUDS[hudId].root);
  if (unknownAssets.length === 0) lines.push('asset refs: <span class="ok">ok</span>');
  else unknownAssets.forEach((a) => lines.push(`asset: <span class="bad">${a}</span>`));
  if (runtime) lines.push(`hierarchy:\n${tree(runtime.element)}`);
  info.innerHTML = lines.join('\n');
}

function countNodes(node: { children?: unknown[] }): number {
  return 1 + (node.children ?? []).reduce((s, c) => s + countNodes(c as never), 0);
}

function collectBadBindings(node: { id: string; bindings?: Array<{ source: string }>; children?: unknown[] }, kind: 'scene' | 'hud'): string[] {
  const out: string[] = [];
  for (const b of node.bindings ?? []) {
    if (b.source.startsWith('item.')) continue;
    const allowed = kind === 'scene'
      ? ['code', 'status', 'copyLabel', 'copyDisabled', 'message', 'value', 'sub', 'score', 'title', 'grade', 'victory', 'defeat', 'outcomeHeading', 'outcomeKicker', 'outcomeCopy', 'outcomeState', 'stats', 'driverReady', 'gunnerReady', 'driverState', 'gunnerState', 'readyLabel', 'myRole', 'roomCode', 'myReady', 'modifiers', 'selectedModifier', 'rematchInfo', 'canLeave', 'crewMode', 'singleMode']
      : ['role', 'pointerLocked', 'prompt', 'promptSub', 'crosshairVisible'];
    if (!allowed.includes(b.source) && !b.source.startsWith('connection.') && !b.source.startsWith('match.') && !b.source.startsWith('tank.') && !b.source.startsWith('gunner.') && !b.source.startsWith('objective.') && !b.source.startsWith('pip.') && !b.source.startsWith('combo.') && !b.source.startsWith('session.')) {
      out.push(`${node.id}: ${b.source}`);
    }
  }
  for (const c of node.children ?? []) out.push(...collectBadBindings(c as never, kind));
  return out;
}

function collectUnknownAssets(node: { id: string; assetId?: string; children?: unknown[] }): string[] {
  const out: string[] = [];
  if (node.assetId && !resolvableAssetIds(PRESENTATION_ASSET_CATALOG).includes(node.assetId)) out.push(`${node.id}: ${node.assetId}`);
  for (const c of node.children ?? []) out.push(...collectUnknownAssets(c as never));
  return out;
}

function tree(element: HTMLElement | null): string {
  if (!element) return '(empty)';
  const out: string[] = [];
  const walk = (el: Element, depth: number): void => {
    out.push(`${'  '.repeat(depth)}${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.className && typeof el.className === 'string' ? `.${el.className.split(' ').join('.')}` : ''}`);
    for (const child of Array.from(el.children)) walk(child, depth + 1);
  };
  walk(element, 0);
  return out.join('\n');
}

tabScene.addEventListener('click', () => {
  mode = 'scene';
  tabScene.classList.add('active');
  tabHud.classList.remove('active');
  rebuild();
});
tabHud.addEventListener('click', () => {
  mode = 'hud';
  tabHud.classList.add('active');
  tabScene.classList.remove('active');
  rebuild();
});

buildControls();
void AssetService.load().then((a) => {
  assets = a;
  rebuild();
});
void rebuild();

window.addEventListener('resize', () => world?.resize());
