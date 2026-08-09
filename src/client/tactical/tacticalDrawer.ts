import type { ArenaWorld } from '../../shared/sim/arenaWorld';
import type { MatchState, Role, TankState } from '../../shared/types';
import { MiniMapRenderer } from './miniMapRenderer';
import { presentLevelUpgradeSummary, type TacticalStatGroup } from './statPresentation';

export class TacticalDrawer {
  private readonly root = document.createElement('aside');
  private readonly levelLabel: HTMLSpanElement;
  private readonly upgradeCount: HTMLSpanElement;
  private readonly rows: HTMLDivElement;
  private readonly map = document.createElement('canvas');
  private readonly miniMap: MiniMapRenderer;
  private openState = false;
  private summarySignature = '';
  private lastYaw = 0;

  constructor(private readonly container: HTMLElement, world: ArenaWorld) {
    this.root.id = 'tactical-drawer';
    this.root.className = 'tactical-drawer';
    this.root.setAttribute('aria-hidden', 'true');
    this.root.innerHTML = `
      <div class="tactical-drawer__panel">
        <div class="tactical-drawer__accent"></div>
        <header class="tactical-drawer__header">
          <div><span class="tactical-drawer__eyebrow">COMBAT INTELLIGENCE</span><h2>TACTICAL</h2></div>
          <div class="tactical-drawer__meta"><span data-tactical-level>LEVEL 1</span><kbd>TAB // CLOSE</kbd></div>
        </header>
        <section class="tactical-drawer__map-wrap"><div class="tactical-drawer__section-title"><span>AREA MAP</span><span>NORTH-UP</span></div></section>
        <section class="tactical-drawer__modifiers">
          <div class="tactical-drawer__section-title"><span>LEVEL-UP MODIFIERS</span><span data-tactical-count>0 EFFECTS</span></div>
          <div class="tactical-drawer__rows"></div>
        </section>
      </div>
      <div class="tactical-drawer__nub" aria-hidden="true">
        <span class="tactical-drawer__nub-accent"></span>
        <span class="tactical-drawer__nub-map">MAP</span>
        <kbd>TAB</kbd>
        <span class="tactical-drawer__nub-chevron"></span>
      </div>`;
    this.levelLabel = this.root.querySelector('[data-tactical-level]') as HTMLSpanElement;
    this.upgradeCount = this.root.querySelector('[data-tactical-count]') as HTMLSpanElement;
    this.rows = this.root.querySelector('.tactical-drawer__rows') as HTMLDivElement;
    this.map.id = 'tactical-minimap';
    this.map.className = 'tactical-minimap';
    this.map.setAttribute('aria-label', 'North-up tactical minimap');
    this.root.querySelector('.tactical-drawer__map-wrap')!.appendChild(this.map);
    container.appendChild(this.root);
    this.miniMap = new MiniMapRenderer(this.map, world);
  }

  isOpen(): boolean { return this.openState; }

  toggle(): void { this.setOpen(!this.openState); }

  close(): void { this.setOpen(false); }

  rebuild(world: ArenaWorld): void { this.miniMap.rebuild(world); }

  update(state: MatchState, tank: Pick<TankState, 'x' | 'z' | 'yaw'> | null, role: Role | 'single'): void {
    this.levelLabel.textContent = `LEVEL ${state.teamProgression.level}`;
    this.root.dataset.role = role;
    if (!this.openState || !tank) return;
    this.lastYaw = tank.yaw;
    this.rebuildRows(state);
    this.miniMap.render({ tank, enemies: state.enemies, chests: state.chests });
  }

  diagnostics(): { open: boolean; chassisYaw: number; renderedEffects: number } {
    return {
      open: this.openState,
      chassisYaw: this.lastYaw,
      renderedEffects: Number(this.root.dataset.effectCount ?? 0),
    };
  }

  dispose(): void {
    this.setOpen(false);
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
    const rows = presentLevelUpgradeSummary(summary);
    const effectCount = rows.reduce((total, row) => total + row.effectCount, 0);
    this.root.dataset.effectCount = String(effectCount);
    this.upgradeCount.textContent = `${effectCount} ${effectCount === 1 ? 'EFFECT' : 'EFFECTS'}`;
    this.rows.replaceChildren();
    if (rows.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'tactical-drawer__empty';
      empty.textContent = 'NO LEVEL-UP MODIFIERS YET';
      this.rows.appendChild(empty);
      return;
    }
    let currentGroup: TacticalStatGroup | null = null;
    for (const row of rows) {
      if (row.group !== currentGroup) {
        currentGroup = row.group;
        const group = document.createElement('h3');
        group.textContent = currentGroup;
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
}
