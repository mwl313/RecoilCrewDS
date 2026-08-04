import type { MatchState } from '../../shared/types';

export interface ProgressionOverlayCallbacks {
  selectUpgrade(cardIndex: number): void;
  skipRelicPresentation(): void;
}

/**
 * Level-up roulette / relic toast overlay. Presentation only: the result is
 * decided by authority and arrives through the replicated MatchState.
 */
export class ProgressionOverlay {
  private readonly host: HTMLElement;
  private readonly debug: HTMLElement;
  private lastRelicKey = '';
  private relicToastUntil = 0;
  private lastRenderKey = '';

  constructor(container: HTMLElement, private readonly cb: ProgressionOverlayCallbacks) {
    this.host = document.createElement('div');
    this.host.id = 'progression-overlay';
    this.host.style.cssText =
      'position:fixed;inset:0;display:none;place-items:center;z-index:200;' +
      'background:rgba(5,10,14,0.72);font:14px/1.4 system-ui,sans-serif;color:#d7edf3;';
    this.debug = document.createElement('pre');
    this.debug.style.cssText =
      'position:fixed;left:8px;bottom:8px;z-index:60;font:10px/1.4 ui-monospace,monospace;' +
      'color:#7fd0dd;background:rgba(10,18,22,0.75);padding:6px 8px;border:1px solid #22333d;' +
      'white-space:pre;pointer-events:none;';
    container.appendChild(this.host);
    container.appendChild(this.debug);
  }

  update(state: MatchState, myRole: 'driver' | 'gunner' | 'single', nowMs: number): void {
    const selection = state.teamProgression.activeSelection;
    if (state.matchFlow === 'upgradeSelection' && selection && !selection.resolved) {
      const key =
        `${state.matchFlow}|${selection.offerId}|` +
        `${selection.driverSelection ?? '-'}|${selection.gunnerSelection ?? '-'}|${selection.singlePlayerSelection ?? '-'}`;
      if (key === this.lastRenderKey) {
        this.host.style.display = 'grid';
      } else {
        this.lastRenderKey = key;
        this.renderSelection(selection, myRole, nowMs);
      }
    } else {
      this.lastRenderKey = '';
      this.host.style.display = 'none';
      this.host.textContent = '';
    }

    const relic = state.teamProgression.lastRelicResult;
    if (relic) {
      const key = `${relic.relicId}:${relic.duplicateConverted}`;
      if (key !== this.lastRelicKey) {
        this.lastRelicKey = key;
        this.relicToastUntil = nowMs + 2600;
      }
    }
    if (nowMs < this.relicToastUntil && relic) {
      const toast = document.createElement('div');
      toast.style.cssText =
        'position:fixed;top:18%;left:50%;transform:translateX(-50%);z-index:55;' +
        'padding:12px 22px;border:2px solid #ffc94d;border-radius:10px;' +
        'background:rgba(24,30,20,0.96);font-weight:700;color:#ffe9a8;';
      toast.textContent = relic.duplicateConverted
        ? `${relic.relicId} DUPLICATE → +${relic.replacementXp} XP`
        : `${relic.relicId} (${relic.rarity.toUpperCase()}) ×${relic.stackCountAfter}`;
      this.host.appendChild(toast);
    }
  }

  updateDebug(text: string): void {
    this.debug.textContent = text;
  }

  private renderSelection(
    selection: NonNullable<MatchState['teamProgression']['activeSelection']>,
    myRole: 'driver' | 'gunner' | 'single',
    nowMs: number,
  ): void {
    const offer = selection.singlePlayerOffer ?? (myRole === 'driver' ? selection.driverOffer : selection.gunnerOffer);
    this.host.textContent = '';
    const panel = document.createElement('div');
    panel.style.cssText = 'text-align:center;max-width:760px;';
    const title = document.createElement('h2');
    title.textContent = `LEVEL ${selection.level} — CHOOSE AN UPGRADE`;
    title.style.cssText = 'margin:0 0 4px;letter-spacing:.08em;color:#ffe9a8;';
    panel.appendChild(title);
    const timer = document.createElement('div');
    const remaining = Math.max(0, selection.expiresAtWallMs - nowMs);
    timer.textContent = `timeout ${Math.ceil(remaining / 1000)}s`;
    timer.style.cssText = 'margin-bottom:12px;color:#9fc4cf;';
    panel.appendChild(timer);
    const cards = document.createElement('div');
    cards.style.cssText = 'display:flex;gap:12px;justify-content:center;';
    const rarityColor: Record<string, string> = {
      common: '#9aa3ad',
      rare: '#4db8ff',
      epic: '#c06bff',
      legendary: '#ffc94d',
    };
    (offer ?? []).forEach((card, index) => {
      const btn = document.createElement('button');
      const color = rarityColor[card.rarity] ?? '#9aa3ad';
      btn.style.cssText =
        `width:220px;padding:16px 12px;border:2px solid ${color};border-radius:10px;` +
        'background:rgba(18,28,34,0.95);color:#eaf6f9;cursor:pointer;text-align:left;';
      const rarity = document.createElement('div');
      rarity.textContent = card.rarity.toUpperCase();
      rarity.style.cssText = `color:${color};font-weight:700;letter-spacing:.1em;margin-bottom:8px;`;
      const label = document.createElement('div');
      label.textContent = card.categoryId;
      label.style.cssText = 'font-weight:700;margin-bottom:6px;';
      const effects = document.createElement('div');
      effects.style.cssText = 'font-size:12px;color:#9fc4cf;white-space:pre;';
      effects.textContent = card.rolledEffects
        .map((e) =>
          e.operation === 'multiply' ? `${e.statId} ×${e.value.toFixed(2)}` : `${e.statId} +${e.value}`,
        )
        .join('\n');
      btn.appendChild(rarity);
      btn.appendChild(label);
      btn.appendChild(effects);
      btn.addEventListener('click', () => this.cb.selectUpgrade(index));
      cards.appendChild(btn);
    });
    panel.appendChild(cards);
    const ready = document.createElement('div');
    const driverReady = selection.driverSelection !== undefined;
    const gunnerReady = selection.gunnerSelection !== undefined;
    ready.textContent = selection.singlePlayerOffer
      ? 'Single Player — pick one card'
      : `Driver ${driverReady ? 'READY ✓' : 'waiting…'} · Gunner ${gunnerReady ? 'READY ✓' : 'waiting…'}`;
    ready.style.cssText = 'margin-top:14px;color:#7fc9d8;';
    panel.appendChild(ready);
    this.host.appendChild(panel);
  }

  dispose(): void {
    this.host.remove();
    this.debug.remove();
  }
}
