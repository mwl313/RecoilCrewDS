import { MapLabUI } from './panels/ui';
import { MapLabViewport } from './rendering/viewport';
import { MapLabGenerator } from './workerClient';
import { deserializeArena, type MapLabGenerateRequest } from './generatorAdapter';
import {
  createMapLabState,
  deepCloneBundle,
  loadDraft,
  saveDraft,
  setPath,
  type MapLabState,
} from './mapLabState';
import {
  GENERATED_MAP_PROFILES,
  MAP_PROFILE_SOURCE_HASH,
} from '@app/generated/mapProfiles.generated';
import { createGeneratedArenaWorld } from '@app/shared/sim/arenaWorld';
import { issuesFromValidationReports, type MapValidationIssue } from '@app/shared/mapgen/validationIssues';
import type { ArenaMetadata } from '@app/shared/mapgen/arenaSession';
import type { GeneratedArena } from '@app/shared/mapgen/generator';
import type { ArenaWorld } from '@app/shared/sim/arenaWorld';
import { HistoryStore } from './history/historyStore';
import { writeParameter, type ParameterDescriptor } from './parameters/parameterRegistry';
import {
  buildArenaExport,
  buildProfileBundleExport,
  buildValidationExport,
  downloadJson,
  type ProfileBundleExport,
} from './io/export';

const GENERATOR_VERSION = 1;
const APPLY_HELPER_URL = 'http://127.0.0.1:5181/';

class MapLabApp {
  private readonly state: MapLabState;
  private readonly viewport: MapLabViewport;
  private readonly generator: MapLabGenerator;
  private readonly ui: MapLabUI;
  private readonly history: HistoryStore;
  private regenerateTimer: ReturnType<typeof setTimeout> | null = null;
  private draftTimer: ReturnType<typeof setTimeout> | null = null;
  private historyTimer: ReturnType<typeof setTimeout> | null = null;
  private latestRequestId = 0;
  private latestArena: GeneratedArena | null = null;
  private generationMs = 0;
  private lastValidationOk = false;
  private readonly onWorkingChangedRef: () => void;

  constructor() {
    const appEl = document.getElementById('app') as HTMLElement;
    const draft = loadDraft();
    this.state =
      draft && draft.fingerprint === MAP_PROFILE_SOURCE_HASH
        ? draft.state
        : createMapLabState();
    if (draft && draft.fingerprint !== MAP_PROFILE_SOURCE_HASH) {
      console.warn('[maplab] draft restored from a different source fingerprint');
    }
    this.history = new HistoryStore(this.state.workingBundle);
    this.onWorkingChangedRef = () => this.onWorkingChanged();

    this.ui = new MapLabUI(appEl, this.state, this.makeCallbacks(), []);
    const centerEl = this.ui.root.querySelector('.maplab-center') as HTMLElement;
    const viewportEl = document.createElement('div');
    viewportEl.id = 'maplab-viewport';
    viewportEl.style.position = 'absolute';
    viewportEl.style.inset = '0';
    centerEl.appendChild(viewportEl);
    this.viewport = new MapLabViewport(viewportEl);
    this.generator = new MapLabGenerator();
    this.ui.setLayerIds(this.viewport.layers.ids());
    this.ui.log(`worker: ${this.generator.usesWorker ? 'active' : 'main-thread fallback'}`);
    this.ui.updateDiff(GENERATED_MAP_PROFILES[this.state.sourceProfileId]);
    this.ui.bindFit(() => this.viewport.fitMap());
    this.restoreLayerVisibility();
    (window as unknown as { __maplab?: unknown }).__maplab = {
      setObjectsEnabled: (enabled: boolean) => {
        this.state.workingBundle.furnitureSet.objectPlacement.enabled = enabled;
        this.onWorkingChangedRef();
      },
      state: () => this.state,
      arenaChecksum: () => this.latestArena?.heightfield.checksum() ?? null,
      applyHelperAvailable: async () => {
        try {
          const res = await fetch(APPLY_HELPER_URL, { method: 'OPTIONS' });
          return res.status === 204 || res.status === 200;
        } catch {
          return false;
        }
      },
    };
    void this.regenerate();
  }

  private restoreLayerVisibility(): void {
    for (const id of this.viewport.layers.ids()) {
      const visible = this.state.layers[id] ?? this.viewport.layers.get(id)!.defaultVisible;
      this.state.layers[id] = visible;
      this.viewport.setLayerVisible(id, visible);
    }
    this.ui.updateLayersVisibility(this.state.layers);
  }

  private makeCallbacks() {
    return {
      onRegenerate: (immediate?: boolean) => this.scheduleRegenerate(immediate),
      onParamChange: (descriptor: ParameterDescriptor, value: unknown) => {
        try {
          writeParameter(this.state.workingBundle, descriptor, value);
          this.onWorkingChanged();
        } catch (error) {
          this.ui.log(`param error: ${(error as Error).message}`);
        }
      },
      onMacroChange: (factor: number) => {
        const source = GENERATED_MAP_PROFILES[this.state.sourceProfileId];
        const working = this.state.workingBundle.terrainProfile.features;
        const base = source.terrainProfile.features;
        for (const key of Object.keys(base) as Array<keyof typeof base>) {
          const target = working[key];
          if (base[key].height) target.height = { min: r1(base[key].height!.min * factor), max: r1(base[key].height!.max * factor) };
          if (base[key].depth) target.depth = { min: r1(base[key].depth!.min * factor), max: r1(base[key].depth!.max * factor) };
        }
        this.onWorkingChanged();
      },
      onRawJsonApply: (json: string, section: string): string | null => {
        if (!section) return 'select a section first';
        try {
          const parsed = JSON.parse(json);
          if (!parsed || typeof parsed !== 'object' || typeof (parsed as { id?: unknown }).id !== 'string') {
            return 'JSON must be an object with an id string';
          }
          setPath(this.state.workingBundle as unknown as Record<string, unknown>, section, parsed);
          this.onWorkingChanged();
          return null;
        } catch (error) {
          return (error as Error).message;
        }
      },
      onUndo: () => {
        const restored = this.history.undo(this.state.workingBundle);
        if (restored) this.applyBundle(restored);
      },
      onRedo: () => {
        const restored = this.history.redo(this.state.workingBundle);
        if (restored) this.applyBundle(restored);
      },
      onReset: () => {
        this.applyBundle(deepCloneBundle(GENERATED_MAP_PROFILES[this.state.sourceProfileId]));
        this.history.reset(this.state.workingBundle);
      },
      onResetSection: (section: string) => {
        if (!section) return;
        const value = (GENERATED_MAP_PROFILES[this.state.sourceProfileId] as unknown as Record<string, unknown>)[section];
        if (value === undefined) return;
        setPath(this.state.workingBundle as unknown as Record<string, unknown>, section, deepCloneBundle(value));
        this.onWorkingChanged();
      },
      onExportProfile: () => {
        downloadJson(
          `maplab-profile-${this.state.sourceProfileId}.json`,
          buildProfileBundleExport(this.state.sourceProfileId, this.state.workingBundle),
        );
      },
      onExportArena: () => {
        if (!this.latestArena || !this.state.latestMetadata) return;
        downloadJson(
          `maplab-arena-${this.state.sourceProfileId}.json`,
          buildArenaExport(this.latestArena, this.state.latestMetadata, this.generationMs, issuesFor(this.latestArena)),
        );
      },
      onExportValidation: () => {
        if (!this.latestArena || !this.state.latestMetadata) return;
        downloadJson(
          `maplab-validation-${this.state.sourceProfileId}.json`,
          buildValidationExport(this.state.latestMetadata, this.latestArena, issuesFor(this.latestArena), this.generationMs),
        );
      },
      onApplyToGame: () => void this.applyToGame(),
      onSaveAsNewProfile: () => void this.saveAsNewProfile(),
      onFocusIssue: (issue: MapValidationIssue) => {
        this.state.selectedIssueId = issue.id;
        this.viewport.focusIssue(issue);
      },
      onLayerToggle: (id: string, visible: boolean) => {
        this.state.layers[id] = visible;
        this.viewport.setLayerVisible(id, visible);
        this.saveDraftSoon();
      },
      onModeChange: (mode: 'production' | 'exactCandidate') => {
        this.state.mode = mode;
        this.scheduleRegenerate(true);
      },
      onCameraMode: (mode: 'orbit3d' | 'topDown') => {
        this.state.cameraMode = mode;
        this.viewport.setCameraMode(mode);
      },
      onProfileChange: (profileId: string) => {
        const source = GENERATED_MAP_PROFILES[profileId];
        if (!source) return;
        this.state.sourceProfileId = profileId;
        this.applyBundle(deepCloneBundle(source));
        this.history.reset(this.state.workingBundle);
        this.scheduleRegenerate(true);
      },
      onSeedFieldChange: (path: string, value: string | number) => {
        if (path === 'roomCode') this.state.roomCode = String(value).toUpperCase();
        else if (path === 'matchIndex') this.state.matchIndex = Math.max(0, Math.floor(Number(value)));
        else if (path === 'generatorVersion') this.state.generatorVersion = Math.max(1, Math.floor(Number(value)));
        else if (path === 'exactAttempt') this.state.exactAttempt = Math.max(0, Math.floor(Number(value)));
        else if (path === 'exactCandidateSeed') this.state.exactCandidateSeed = Number(value);
        this.scheduleRegenerate(true);
      },
    };
  }

  private onWorkingChanged(): void {
    this.state.dirty = true;
    this.ui.updateDiff(GENERATED_MAP_PROFILES[this.state.sourceProfileId]);
    this.saveDraftSoon();
    if (this.historyTimer) clearTimeout(this.historyTimer);
    this.historyTimer = setTimeout(() => this.history.push(this.state.workingBundle), 200);
    if (this.state.autoRegenerate) this.scheduleRegenerate();
  }

  private applyBundle(bundle: typeof this.state.workingBundle): void {
    Object.assign(this.state.workingBundle, deepCloneBundle(bundle));
    this.state.dirty = true;
    this.ui.rebuildParameters();
    this.ui.updateDiff(GENERATED_MAP_PROFILES[this.state.sourceProfileId]);
    this.saveDraftSoon();
    this.scheduleRegenerate(true);
  }

  private scheduleRegenerate(immediate?: boolean): void {
    if (this.regenerateTimer) clearTimeout(this.regenerateTimer);
    if (immediate) {
      void this.regenerate();
      return;
    }
    this.regenerateTimer = setTimeout(() => void this.regenerate(), 300);
  }

  private async regenerate(): Promise<void> {
    const requestId = ++this.latestRequestId;
    const request: MapLabGenerateRequest = {
      requestId,
      mode: this.state.mode,
      roomCode: this.state.roomCode,
      matchIndex: this.state.matchIndex,
      generatorVersion: this.state.generatorVersion,
      workingBundle: deepCloneBundle(this.state.workingBundle),
      fallbackBundle: deepCloneBundle(this.state.fallbackBundle),
      exactBaseSeed: this.state.exactBaseSeed,
      exactCandidateSeed: this.state.exactCandidateSeed,
      exactAttempt: this.state.exactAttempt,
    };
    this.ui.log(`generating (${this.state.mode}, match ${this.state.matchIndex})…`);
    const result = await this.generator.generate(request);
    if (result.requestId !== this.latestRequestId) return; // stale result dropped
    if (!result.ok || !result.arena) {
      this.ui.log(`generation failed: ${result.error ?? 'unknown'}`);
      this.ui.updateValidation(false, [], ['generation failed']);
      return;
    }
    const arena = deserializeArena(result.arena.arena);
    this.latestArena = arena;
    this.lastValidationOk = arena.validation.ok;
    this.generationMs = result.generationMs ?? 0;
    this.state.latestMetadata = result.arena.metadata;
    this.state.exactBaseSeed = result.arena.metadata.arenaBaseSeed;
    this.state.exactCandidateSeed = result.arena.metadata.arenaCandidateSeed;
    this.state.exactAttempt = result.arena.metadata.arenaAttempt;
    const world = createGeneratedArenaWorld(arena, result.arena.metadata);
    this.viewport.setArena(arena, world);
    this.restoreLayerVisibility();
    this.ui.updateSeeds(
      result.arena.metadata.arenaBaseSeed,
      result.arena.metadata.arenaCandidateSeed,
      result.arena.metadata.arenaAttempt,
    );
    const issues = issuesFromValidationReports(arena);
    const layout = arena.layout;
    const metrics = [
      `mode: ${this.state.mode}`,
      `attempt: ${result.arena.metadata.arenaAttempt}`,
      `fallback: ${result.arena.metadata.arenaFallbackUsed}`,
      `checksum: ${result.arena.metadata.arenaChecksum}`,
      `generation: ${this.generationMs.toFixed(1)}ms`,
      `height: ${arena.heightfield.minHeight().toFixed(2)}..${arena.heightfield.maxHeight().toFixed(2)}`,
      `max slope: ${arena.heightfield.maxSlope().toFixed(3)}`,
      ...(layout
        ? [
            `routes: ${layout.graph.edges.length} edges / ${layout.graph.loops} loops`,
            `spawns: ${layout.spawns.length} · gates: ${layout.gates.length} · recovery: ${layout.recovery.length}`,
            `ramps: ${layout.ramps.length} · objects: ${layout.objects.length}`,
            `colliders: ${layout.objects.filter((o) => o.collider).length}`,
            ...layout.placementMetrics.map(
              (m) =>
                `${m.kind}: req ${m.requested} placed ${m.placed} rendered ${m.rendered} colliders ${m.colliders} rejected ${m.rejected}`,
            ),
          ]
        : []),
    ];
    this.ui.updateValidation(arena.validation.ok, issues, metrics);
    this.ui.log(`generated ok (${this.generationMs.toFixed(1)}ms), issues: ${issues.length}`);
  }

  private saveDraftSoon(): void {
    if (this.draftTimer) clearTimeout(this.draftTimer);
    this.draftTimer = setTimeout(() => {
      saveDraft(this.state);
      this.ui.log('draft saved');
    }, 800);
  }

  private async applyToGame(): Promise<void> {
    await this.regenerate();
    if (!this.lastValidationOk) {
      this.ui.log('cannot apply: the generated map is not valid (PASS required)');
      return;
    }
    const exportBundle = buildProfileBundleExport(this.state.sourceProfileId, this.state.workingBundle);
    const applied = await this.postApply({ kind: 'apply', bundle: exportBundle, overwrite: true });
    if (!applied) this.fallbackApply(exportBundle);
  }

  private async saveAsNewProfile(): Promise<void> {
    await this.regenerate();
    if (!this.lastValidationOk) {
      this.ui.log('cannot apply: the generated map is not valid (PASS required)');
      return;
    }
    const suggested = `map.lab${Math.floor(Math.random() * 9000 + 1000)}`;
    const raw = window.prompt('New profile id (must start with "map."):', suggested);
    const id = (raw ?? '').trim();
    if (!/^map\.[A-Za-z0-9_.-]+$/.test(id)) {
      this.ui.log('invalid profile id — use something like map.lab1234');
      return;
    }
    if (id === this.state.sourceProfileId) {
      this.ui.log(`${id} already exists — use Apply to Game to overwrite it`);
      return;
    }
    const exportBundle = buildProfileBundleExport(this.state.sourceProfileId, this.state.workingBundle);
    exportBundle.bundles.map.id = id;
    const applied = await this.postApply({ kind: 'apply', bundle: exportBundle, overwrite: false, onlyMap: true, setModeMapProfile: true });
    if (!applied) this.fallbackApply(exportBundle, true);
  }

  private async postApply(payload: unknown): Promise<boolean> {
    try {
      const res = await fetch(APPLY_HELPER_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = (await res.json()) as { ok: boolean; error?: string; changed?: string[]; hash?: string };
      if (result.ok) {
        this.ui.log(`applied — changed files:\n${(result.changed ?? []).join('\n')}`);
        this.ui.log('the game will use the new content after npm run build && npm run server');
        return true;
      }
      this.ui.log(`apply rejected: ${result.error ?? 'unknown error'}`);
      return false;
    } catch {
      this.ui.log('apply helper not reachable — start it with: npm run maplab:apply-server');
      return false;
    }
  }

  private fallbackApply(exportBundle: ProfileBundleExport, isNew = false): void {
    const id = exportBundle.bundles.map.id;
    downloadJson(`maplab-profile-${id}.json`, exportBundle);
    this.ui.log(
      `downloaded maplab-profile-${id}.json instead; apply it with:\n` +
        `  npm run maplab:apply -- maplab-profile-${id}.json${isNew ? '' : ' --overwrite'}`,
    );
    if (isNew) {
      this.ui.log(
        `then point the game at it: set "mapProfileId": "${id}" in content/modes/*.json and run npm run generate:map-profiles`,
      );
    }
  }
}

function r1(v: number): number {
  return Math.round(v * 10) / 10;
}

function issuesFor(arena: GeneratedArena): MapValidationIssue[] {
  return issuesFromValidationReports(arena);
}

declare global {
  interface Window {
    __maplab?: {
      setObjectsEnabled(enabled: boolean): void;
      state(): MapLabState;
      arenaChecksum(): number | null;
      applyHelperAvailable(): Promise<boolean>;
    };
  }
}

void new MapLabApp();
