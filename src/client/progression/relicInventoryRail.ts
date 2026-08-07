import type { MatchState } from '../../shared/types';
import type { UpgradeRarity } from '../../shared/content/schemas/progression';

export interface RelicRailItemInfo {
  label: string;
  rarity: UpgradeRarity;
  iconId: string;
  iconUrl: string | null;
}

interface RailCell {
  root: HTMLElement;
  count: HTMLElement;
  stack: number;
}

/** Persistent, incrementally updated right-side owned-relic HUD rail. */
export class RelicInventoryRail {
  private readonly root: HTMLElement;
  private readonly cells = new Map<string, RailCell>();

  constructor(
    container: HTMLElement,
    private readonly infoFor: (relicId: string) => RelicRailItemInfo | null,
  ) {
    this.root = document.createElement('aside');
    this.root.id = 'relic-inventory-rail';
    this.root.setAttribute('aria-label', 'Owned relics');
    container.appendChild(this.root);
  }

  update(state: MatchState): void {
    const stacks = state.teamProgression.relicStacks;
    const order = state.teamProgression.relicAcquisitionOrder ?? Object.keys(stacks);
    const live = new Set(order.filter((relicId) => (stacks[relicId] ?? 0) > 0));
    for (const [relicId, cell] of this.cells) {
      if (live.has(relicId)) continue;
      cell.root.remove();
      this.cells.delete(relicId);
    }
    for (const relicId of order) {
      const stack = stacks[relicId] ?? 0;
      if (stack <= 0) continue;
      const existing = this.cells.get(relicId);
      if (!existing) {
        const created = this.createCell(relicId, stack);
        if (created) this.cells.set(relicId, created);
      } else if (existing.stack !== stack) {
        existing.stack = stack;
        existing.count.textContent = stack >= 2 ? `×${stack}` : '';
        existing.root.classList.remove('relic-rail-cell--stacked');
        void existing.root.offsetWidth;
        existing.root.classList.add('relic-rail-cell--stacked');
      }
    }
    this.root.hidden = this.cells.size === 0;
    this.updateGeometry();
  }

  dispose(): void {
    this.cells.clear();
    this.root.remove();
  }

  private createCell(relicId: string, stack: number): RailCell | null {
    const info = this.infoFor(relicId);
    if (!info) return null;
    const root = document.createElement('div');
    root.className = `relic-rail-cell relic-rail-cell--${info.rarity}`;
    root.title = `${info.label}${stack >= 2 ? ` ×${stack}` : ''}`;
    root.setAttribute('aria-label', root.title);
    const icon = document.createElement('span');
    icon.className = 'relic-rail-icon';
    if (info.iconUrl) {
      const image = document.createElement('img');
      image.src = info.iconUrl;
      image.alt = '';
      image.decoding = 'async';
      icon.appendChild(image);
    } else {
      icon.classList.add('relic-rail-icon--fallback');
      icon.dataset['iconAvailable'] = 'false';
    }
    const count = document.createElement('span');
    count.className = 'relic-rail-count';
    count.textContent = stack >= 2 ? `×${stack}` : '';
    root.append(icon, count);
    this.root.appendChild(root);
    return { root, count, stack };
  }

  private updateGeometry(): void {
    const topCluster = document.getElementById('hud-right');
    const bottomCluster = document.getElementById('hud-role-actions') ?? document.getElementById('hud-bottom');
    const top = Math.max(112, (topCluster?.getBoundingClientRect().bottom ?? 88) + 12);
    const bottom = Math.max(96, window.innerHeight - (bottomCluster?.getBoundingClientRect().top ?? window.innerHeight - 92) + 12);
    this.root.style.top = `${Math.round(top)}px`;
    this.root.style.bottom = `${Math.round(bottom)}px`;
  }
}
