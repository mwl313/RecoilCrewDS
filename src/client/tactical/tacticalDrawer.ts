import type { ArenaWorld } from '../../shared/sim/arenaWorld';
import type { MatchState, Role, TankState } from '../../shared/types';
import { MiniMapRenderer } from './miniMapRenderer';
import { presentLevelUpgradeSummary, type TacticalStatGroup } from './statPresentation';
import type { AggregateSectorRecord } from '../enemies/aggregateSectorRenderer';
import { localization } from '../localization/localizationService';
import type { LocalizationService } from '../localization/localizationTypes';
import { ProgressionDebugPanel, type ProgressionDebugControls } from './progressionDebugPanel';

export interface TacticalDrawerFrame {
  state: MatchState;
  tank: Pick<TankState, 'x' | 'z' | 'yaw'> | null;
  role: Role | 'single';
  sectors: readonly AggregateSectorRecord[];
}

export class TacticalDrawer {
  private readonly root = document.createElement('aside');
  private readonly levelLabel: HTMLSpanElement;
  private readonly upgradeCount: HTMLSpanElement;
  private readonly rows: HTMLDivElement;
  private readonly map: HTMLCanvasElement | null;
  private readonly miniMap: MiniMapRenderer | null;
  private readonly debugPanel: ProgressionDebugPanel | null;
  private openState = false;
  private summarySignature = '';
  private lastYaw = 0;
  private lastRenderedSectorCount = 0;
  private lastFrame: TacticalDrawerFrame | null = null;
  private readonly unsubscribeLocalization: () => void;

  constructor(
    private readonly container: HTMLElement,
    world: ArenaWorld,
    private readonly i18n: LocalizationService = localization,
    debugControls?: ProgressionDebugControls,
  ) {
    this.root.id = 'tactical-drawer';
    this.root.className = 'tactical-drawer';
    this.root.setAttribute('aria-hidden', 'true');
    this.root.innerHTML = `
      <div class="tactical-drawer__panel">
        <div class="tactical-drawer__accent"></div>
        <header class="tactical-drawer__header">
          <div><span class="tactical-drawer__eyebrow" data-i18n="ui.tactical.eyebrow"></span><h2 data-i18n="ui.tactical.title"></h2></div>
          <div class="tactical-drawer__meta"><span data-tactical-level></span><kbd data-i18n="ui.tactical.close"></kbd></div>
        </header>
        <section class="tactical-drawer__map-wrap"><div class="tactical-drawer__section-title"><span ${debugControls ? '' : 'data-i18n="ui.tactical.areaMap"'}>${debugControls ? 'DEBUG LOADOUT' : ''}</span><span ${debugControls ? '' : 'data-i18n="ui.tactical.northUp"'}>${debugControls ? 'SINGLE PLAYER' : ''}</span></div></section>
        <section class="tactical-drawer__modifiers">
          <div class="tactical-drawer__section-title"><span data-i18n="ui.tactical.modifiers"></span><span data-tactical-count></span></div>
          <div class="tactical-drawer__rows"></div>
        </section>
      </div>
      <div class="tactical-drawer__nub" aria-hidden="true">
        <span class="tactical-drawer__nub-accent"></span>
        <span class="tactical-drawer__nub-map" data-i18n="ui.tactical.map"></span>
        <kbd>TAB</kbd>
        <span class="tactical-drawer__nub-chevron"></span>
      </div>`;
    this.levelLabel = this.root.querySelector('[data-tactical-level]') as HTMLSpanElement;
    this.upgradeCount = this.root.querySelector('[data-tactical-count]') as HTMLSpanElement;
    this.rows = this.root.querySelector('.tactical-drawer__rows') as HTMLDivElement;
    this.map = debugControls ? null : document.createElement('canvas');
    this.miniMap = this.map ? new MiniMapRenderer(this.map, world) : null;
    this.debugPanel = debugControls ? new ProgressionDebugPanel(debugControls) : null;
    if (this.map) {
      this.map.id = 'tactical-minimap';
      this.map.className = 'tactical-minimap';
    }
    this.applyStaticLocalization();
    const mapWrap = this.root.querySelector('.tactical-drawer__map-wrap')!;
    if (this.map) mapWrap.appendChild(this.map);
    if (this.debugPanel) mapWrap.appendChild(this.debugPanel.element);
    container.appendChild(this.root);
    this.unsubscribeLocalization = this.i18n.subscribe(() => {
      this.summarySignature = '';
      this.applyStaticLocalization();
      if (this.lastFrame) this.update(this.lastFrame);
    });
  }

  isOpen(): boolean { return this.openState; }

  toggle(): void { this.setOpen(!this.openState); }

  close(): void { this.setOpen(false); }

  rebuild(world: ArenaWorld): void { this.miniMap?.rebuild(world); }

  isDebugMode(): boolean { return this.debugPanel !== null; }

  update({ state, tank, role, sectors }: TacticalDrawerFrame): void {
    this.lastFrame = { state, tank, role, sectors };
    this.levelLabel.textContent = this.i18n.t('ui.tactical.level', { level: state.teamProgression.level }, `LEVEL ${state.teamProgression.level}`);
    this.root.dataset.role = role;
    if (!this.openState || !tank) return;
    this.lastYaw = tank.yaw;
    this.lastRenderedSectorCount = sectors.length;
    this.rebuildRows(state);
    this.miniMap?.render({ tank, enemies: state.enemies, chests: state.chests, sectors });
    this.debugPanel?.update(state);
  }

  diagnostics(): { open: boolean; chassisYaw: number; renderedEffects: number; renderedSectors: number } {
    return {
      open: this.openState,
      chassisYaw: this.lastYaw,
      renderedEffects: Number(this.root.dataset.effectCount ?? 0),
      renderedSectors: this.lastRenderedSectorCount,
    };
  }

  dispose(): void {
    this.setOpen(false);
    this.unsubscribeLocalization();
    this.debugPanel?.dispose();
    this.root.remove();
  }

  private setOpen(open: boolean): void {
    if (this.openState === open) return;
    this.openState = open;
    this.root.classList.toggle('is-open', open);
    this.root.setAttribute('aria-hidden', String(!open));
    this.container.querySelector('.app-root')?.classList.toggle('tactical-open', open);
  }

  private rebuildRows(state: MatchState): void {
    const summary = state.teamProgression.levelUpgradeSummary ?? [];
    const signature = JSON.stringify(summary);
    if (signature === this.summarySignature) return;
    this.summarySignature = signature;
    const rows = presentLevelUpgradeSummary(summary, this.i18n);
    const effectCount = rows.reduce((total, row) => total + row.effectCount, 0);
    this.root.dataset.effectCount = String(effectCount);
    this.upgradeCount.textContent = this.i18n.t(
      effectCount === 1 ? 'ui.tactical.effect' : 'ui.tactical.effects',
      { count: effectCount },
      `${effectCount} ${effectCount === 1 ? 'EFFECT' : 'EFFECTS'}`,
    );
    this.rows.replaceChildren();
    if (rows.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'tactical-drawer__empty';
      empty.textContent = this.i18n.t('ui.tactical.empty', {}, 'NO LEVEL-UP MODIFIERS YET');
      this.rows.appendChild(empty);
      return;
    }
    let currentGroup: TacticalStatGroup | null = null;
    for (const row of rows) {
      if (row.group !== currentGroup) {
        currentGroup = row.group;
        const group = document.createElement('h3');
        group.textContent = this.i18n.t(`upgrade.group.${currentGroup}`, {}, currentGroup);
        this.rows.appendChild(group);
      }
      const item = document.createElement('div');
      item.className = 'tactical-stat-row';
      item.innerHTML = `<span class="tactical-stat-row__label"></span><strong></strong><small></small>`;
      (item.querySelector('.tactical-stat-row__label') as HTMLElement).textContent = row.label;
      (item.querySelector('strong') as HTMLElement).textContent = row.primary;
      (item.querySelector('small') as HTMLElement).textContent = row.secondary;
      this.rows.appendChild(item);
    }
  }

  private applyStaticLocalization(): void {
    for (const node of this.root.querySelectorAll<HTMLElement>('[data-i18n]')) {
      const key = node.dataset.i18n;
      if (key) node.textContent = this.i18n.t(key);
    }
    this.map?.setAttribute('aria-label', this.i18n.t('ui.tactical.mapAria', {}, 'North-up tactical minimap'));
  }
}
