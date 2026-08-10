import type { UpgradeRarity } from '../../shared/content/schemas/progression';
import type { MatchState } from '../../shared/types';

export interface DebugRelicEntry {
  id: string;
  label: string;
  rarity: UpgradeRarity;
  role: 'driver' | 'gunner' | 'crew';
  maximumStacks: number | null;
}

export interface DebugUpgradeEntry {
  id: string;
  label: string;
  role: 'driver' | 'gunner';
  statIds: string[];
}

export interface ProgressionDebugCatalog {
  available: boolean;
  message?: string;
  relics: DebugRelicEntry[];
  upgrades: DebugUpgradeEntry[];
}

export interface ProgressionDebugActionResult {
  accepted: boolean;
  message: string;
}

export interface ProgressionDebugControls {
  catalog(): ProgressionDebugCatalog;
  addRelic(relicId: string): ProgressionDebugActionResult;
  addUpgrade(categoryId: string, rarity: UpgradeRarity): ProgressionDebugActionResult;
  mapgen?: {
    visible(): boolean;
    setVisible(visible: boolean): void;
  };
}

type DebugTab = 'relics' | 'upgrades';

/** Interactive loadout editor rendered in the tactical minimap slot. */
export class ProgressionDebugPanel {
  readonly element = document.createElement('div');
  private readonly tabs: HTMLDivElement;
  private readonly search: HTMLInputElement;
  private readonly rarity: HTMLSelectElement;
  private readonly list: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private readonly mapgenToggle: HTMLButtonElement | null;
  private tab: DebugTab = 'relics';
  private lastState: MatchState | null = null;
  private signature = '';

  constructor(private readonly controls: ProgressionDebugControls) {
    this.element.id = 'tactical-progression-debug';
    this.element.className = 'tactical-debug';
    this.element.innerHTML = `
      <div class="tactical-debug__toolbar">
        <div class="tactical-debug__tabs" role="tablist" aria-label="Debug item type"></div>
        ${controls.mapgen ? '<button class="tactical-debug__mapgen" type="button"></button>' : ''}
        <select class="tactical-debug__rarity" aria-label="Upgrade rarity">
          <option value="common">COMMON</option>
          <option value="rare">RARE</option>
          <option value="epic">EPIC</option>
          <option value="legendary">LEGENDARY</option>
        </select>
      </div>
      <input class="tactical-debug__search" type="search" autocomplete="off" placeholder="FILTER LOADOUT…" aria-label="Filter debug loadout">
      <div class="tactical-debug__list"></div>
      <div class="tactical-debug__status" role="status" aria-live="polite"></div>`;
    this.tabs = this.element.querySelector('.tactical-debug__tabs') as HTMLDivElement;
    this.search = this.element.querySelector('.tactical-debug__search') as HTMLInputElement;
    this.rarity = this.element.querySelector('.tactical-debug__rarity') as HTMLSelectElement;
    this.list = this.element.querySelector('.tactical-debug__list') as HTMLDivElement;
    this.status = this.element.querySelector('.tactical-debug__status') as HTMLDivElement;
    this.mapgenToggle = this.element.querySelector('.tactical-debug__mapgen');
    this.tabs.append(this.makeTab('relics', 'RELICS'), this.makeTab('upgrades', 'UPGRADES'));
    this.search.addEventListener('input', () => this.invalidate());
    this.rarity.addEventListener('change', () => this.invalidate());
    this.list.addEventListener('click', this.onListClick);
    this.mapgenToggle?.addEventListener('click', this.onMapgenToggle);
    this.applyTabState();
    this.updateMapgenToggle();
  }

  update(state: MatchState): void {
    this.lastState = state;
    const catalog = this.controls.catalog();
    const counts = this.tab === 'relics'
      ? state.teamProgression.relicStacks
      : Object.fromEntries(state.teamProgression.levelUpgradeSummary.map((row) => [row.statId, row.effectCount]));
    const signature = JSON.stringify({
      tab: this.tab,
      query: this.search.value.trim().toLowerCase(),
      rarity: this.rarity.value,
      available: catalog.available,
      message: catalog.message,
      mapgenVisible: this.controls.mapgen?.visible(),
      ids: this.tab === 'relics'
        ? catalog.relics.map((entry) => [entry.id, entry.label, entry.maximumStacks])
        : catalog.upgrades.map((entry) => [entry.id, entry.label, entry.statIds]),
      counts,
    });
    if (signature === this.signature) return;
    this.signature = signature;
    this.render(catalog, state);
  }

  dispose(): void {
    this.list.removeEventListener('click', this.onListClick);
    this.mapgenToggle?.removeEventListener('click', this.onMapgenToggle);
    this.element.remove();
  }

  private makeTab(tab: DebugTab, label: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'tab');
    button.dataset.debugTab = tab;
    button.textContent = label;
    button.addEventListener('click', () => {
      this.tab = tab;
      this.applyTabState();
      this.invalidate();
    });
    return button;
  }

  private applyTabState(): void {
    for (const button of this.tabs.querySelectorAll<HTMLButtonElement>('button')) {
      const selected = button.dataset.debugTab === this.tab;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-selected', String(selected));
    }
    this.rarity.hidden = this.tab !== 'upgrades';
  }

  private render(catalog: ProgressionDebugCatalog, state: MatchState): void {
    this.updateMapgenToggle();
    this.element.classList.toggle('is-disabled', !catalog.available);
    const query = this.search.value.trim().toLowerCase();
    const entries = this.tab === 'relics'
      ? catalog.relics.filter((entry) => `${entry.label} ${entry.id} ${entry.rarity} ${entry.role}`.toLowerCase().includes(query))
      : catalog.upgrades.filter((entry) => `${entry.label} ${entry.id} ${entry.role} ${entry.statIds.join(' ')}`.toLowerCase().includes(query));
    this.list.replaceChildren();
    if (!catalog.available) {
      const empty = document.createElement('p');
      empty.className = 'tactical-debug__empty';
      empty.textContent = catalog.message ?? 'Start a single-player run to edit the loadout.';
      this.list.appendChild(empty);
      return;
    }
    if (entries.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'tactical-debug__empty';
      empty.textContent = 'NO MATCHES';
      this.list.appendChild(empty);
      return;
    }
    for (const entry of entries) {
      this.list.appendChild(this.tab === 'relics'
        ? this.renderRelic(entry as DebugRelicEntry, state)
        : this.renderUpgrade(entry as DebugUpgradeEntry, state));
    }
  }

  private renderRelic(entry: DebugRelicEntry, state: MatchState): HTMLElement {
    const count = state.teamProgression.relicStacks[entry.id] ?? 0;
    const atMaximum = entry.maximumStacks !== null && count >= entry.maximumStacks;
    return this.makeRow(
      entry.id,
      entry.label,
      `${entry.rarity} · ${entry.role}`,
      `×${count}`,
      'ADD',
      atMaximum,
    );
  }

  private renderUpgrade(entry: DebugUpgradeEntry, state: MatchState): HTMLElement {
    const count = entry.statIds.reduce((maximum, statId) => {
      const row = state.teamProgression.levelUpgradeSummary.find((candidate) => candidate.statId === statId);
      return Math.max(maximum, row?.effectCount ?? 0);
    }, 0);
    return this.makeRow(
      entry.id,
      entry.label,
      `${entry.role} · ${entry.statIds.join(' / ')}`,
      `×${count}`,
      '+',
      false,
    );
  }

  private makeRow(
    id: string,
    label: string,
    detail: string,
    count: string,
    action: string,
    disabled: boolean,
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'tactical-debug-row';
    const copy = document.createElement('span');
    copy.className = 'tactical-debug-row__copy';
    const name = document.createElement('strong');
    name.textContent = label;
    const meta = document.createElement('small');
    meta.textContent = detail;
    copy.append(name, meta);
    const value = document.createElement('span');
    value.className = 'tactical-debug-row__count';
    value.textContent = count;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.debugAction = this.tab === 'relics' ? 'relic' : 'upgrade';
    button.dataset.debugId = id;
    button.textContent = disabled ? 'MAX' : action;
    button.disabled = disabled;
    button.setAttribute('aria-label', `${action} ${label}`);
    row.append(copy, value, button);
    return row;
  }

  private readonly onListClick = (event: Event): void => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-debug-action]');
    if (!button || button.disabled) return;
    const id = button.dataset.debugId;
    if (!id) return;
    const result = button.dataset.debugAction === 'relic'
      ? this.controls.addRelic(id)
      : this.controls.addUpgrade(id, this.rarity.value as UpgradeRarity);
    this.status.textContent = result.message;
    this.status.classList.toggle('is-error', !result.accepted);
    this.invalidate();
    if (this.lastState) this.update(this.lastState);
  };

  private readonly onMapgenToggle = (): void => {
    const mapgen = this.controls.mapgen;
    if (!mapgen) return;
    mapgen.setVisible(!mapgen.visible());
    this.updateMapgenToggle();
    this.invalidate();
  };

  private updateMapgenToggle(): void {
    if (!this.mapgenToggle || !this.controls.mapgen) return;
    const visible = this.controls.mapgen.visible();
    this.mapgenToggle.textContent = `MAPGEN: ${visible ? 'ON' : 'OFF'}`;
    this.mapgenToggle.setAttribute('aria-pressed', String(visible));
    this.mapgenToggle.setAttribute(
      'aria-label',
      visible ? 'Disable map-generation debug overlay' : 'Enable map-generation debug overlay',
    );
  }

  private invalidate(): void {
    this.signature = '';
    if (this.lastState) this.update(this.lastState);
  }
}
