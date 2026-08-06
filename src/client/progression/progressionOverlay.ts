import type { MatchState } from '../../shared/types';
import type { ProgressionSelectionState } from '../../shared/progression/progressionTypes';

export interface ProgressionOverlayCallbacks {
  selectUpgrade(cardIndex: number): void;
  skipRelicPresentation(): void;
  /** Content labels/descriptions when available; raw ids are the fallback. */
  relicInfo?: (relicId: string) => { label: string; description: string } | null;
}

/**
 * Retained presentation layers for progression:
 *   progression-overlay
 *   ├── progression-selection-layer (level-up roulette)
 *   ├── progression-relic-layer     (relic reveal / acquisition toast)
 *   └── progression-debug-layer     (fixed bottom-left, independent)
 *
 * Hiding one layer never hides another, the timeout text updates every
 * frame without rebuilding cards, and relic presentation keys off the
 * authoritative acquisition sequence so repeated stacks display again.
 */
export class ProgressionOverlay {
  private readonly root: HTMLElement;
  private readonly selectionHost: HTMLElement;
  private readonly relicHost: HTMLElement;
  private readonly debugHost: HTMLElement;
  private activeOfferId = '';
  private timerElement: HTMLElement | null = null;
  private readyElement: HTMLElement | null = null;
  private cardButtons: HTMLButtonElement[] = [];
  private relicTimerElement: HTMLElement | null = null;
  private lastRelicKey = '';
  private relicToastUntil = 0;
  private selectionVisible = false;
  private relicVisible = false;
  private readonly debugEnabled = new URLSearchParams(globalThis.location?.search ?? '').has('progressionDebug');

  constructor(container: HTMLElement, private readonly cb: ProgressionOverlayCallbacks) {
    this.root = document.createElement('div');
    this.root.id = 'progression-overlay';
    this.root.style.cssText =
      'position:fixed;inset:0;display:none;z-index:200;pointer-events:none;' +
      'font:14px/1.4 system-ui,sans-serif;color:#d7edf3;';

    this.selectionHost = document.createElement('div');
    this.selectionHost.id = 'progression-selection-layer';
    this.selectionHost.style.cssText =
      'position:absolute;inset:0;display:none;place-items:center;pointer-events:auto;' +
      'background:rgba(5,10,14,0.72);';

    this.relicHost = document.createElement('div');
    this.relicHost.id = 'progression-relic-layer';
    this.relicHost.style.cssText =
      'position:absolute;inset:0;display:none;place-items:center;pointer-events:auto;' +
      'background:rgba(5,10,14,0.72);';

    this.debugHost = document.createElement('pre');
    this.debugHost.id = 'progression-debug-layer';
    this.debugHost.style.cssText =
      `display:${this.debugEnabled ? 'block' : 'none'};position:fixed;left:8px;bottom:8px;z-index:60;font:10px/1.4 ui-monospace,monospace;` +
      'color:#7fd0dd;background:rgba(10,18,22,0.75);padding:6px 8px;border:1px solid #22333d;' +
      'white-space:pre;pointer-events:none;';

    this.root.appendChild(this.selectionHost);
    this.root.appendChild(this.relicHost);
    container.appendChild(this.root);
    container.appendChild(this.debugHost);
  }

  update(state: MatchState, myRole: 'driver' | 'gunner' | 'single', nowMs: number): void {
    const selection = state.teamProgression.activeSelection;
    const upgradeActive =
      state.matchFlow === 'upgradeSelection' &&
      selection?.kind === 'upgrade' &&
      !selection.resolved;
    const relicActive =
      state.matchFlow === 'relicSelection' &&
      selection?.kind === 'relic' &&
      !selection.resolved;

    if (upgradeActive) {
      this.updateSelection(selection, myRole, nowMs);
      this.selectionVisible = true;
    } else {
      this.selectionVisible = false;
      this.selectionHost.style.display = 'none';
    }
    this.updateRelic(state, nowMs);

    this.root.style.display = this.selectionVisible || this.relicVisible ? 'block' : 'none';
  }

  updateDebug(text: string): void {
    if (this.debugEnabled) this.debugHost.textContent = text;
  }

  // ------------------------------------------------------------ selection
  private updateSelection(
    selection: NonNullable<MatchState['teamProgression']['activeSelection']>,
    myRole: 'driver' | 'gunner' | 'single',
    nowMs: number,
  ): void {
    if (selection.offerId !== this.activeOfferId) {
      this.activeOfferId = selection.offerId;
      this.renderSelection(selection, myRole, nowMs);
    }
    this.selectionHost.style.display = 'grid';
    if (this.timerElement) {
      const remaining = Math.max(0, selection.expiresAtWallMs - nowMs);
      this.timerElement.textContent = `timeout ${Math.ceil(remaining / 1000)}s`;
    }
    if (this.readyElement) {
      const driverReady = selection.driverSelection !== undefined;
      const gunnerReady = selection.gunnerSelection !== undefined;
      this.readyElement.textContent = selection.singlePlayerOffer
        ? 'Single Player — pick one card'
        : `Driver ${driverReady ? 'READY ✓' : 'waiting…'} · Gunner ${gunnerReady ? 'READY ✓' : 'waiting…'}`;
    }
    const localSelected =
      myRole === 'single'
        ? selection.singlePlayerSelection !== undefined
        : myRole === 'driver'
          ? selection.driverSelection !== undefined
          : selection.gunnerSelection !== undefined;
    for (const button of this.cardButtons) button.disabled = localSelected;
  }

  private renderSelection(
    selection: NonNullable<MatchState['teamProgression']['activeSelection']>,
    myRole: 'driver' | 'gunner' | 'single',
    nowMs: number,
  ): void {
    const offer = selection.singlePlayerOffer ?? (myRole === 'driver' ? selection.driverOffer : selection.gunnerOffer);
    this.selectionHost.textContent = '';
    this.cardButtons = [];
    const panel = document.createElement('div');
    panel.style.cssText = 'text-align:center;max-width:760px;';
    const title = document.createElement('h2');
    title.textContent = `LEVEL ${selection.level} — CHOOSE AN UPGRADE`;
    title.style.cssText = 'margin:0 0 4px;letter-spacing:.08em;color:#ffe9a8;';
    panel.appendChild(title);
    this.timerElement = document.createElement('div');
    this.timerElement.dataset['progressionTimer'] = 'true';
    this.timerElement.style.cssText = 'margin-bottom:12px;color:#9fc4cf;';
    panel.appendChild(this.timerElement);
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
      btn.className = 'progression-card';
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
      this.cardButtons.push(btn);
      cards.appendChild(btn);
    });
    panel.appendChild(cards);
    this.readyElement = document.createElement('div');
    this.readyElement.style.cssText = 'margin-top:14px;color:#7fc9d8;';
    panel.appendChild(this.readyElement);
    this.selectionHost.appendChild(panel);
    this.updateSelection(selection, myRole, nowMs);
  }

  // ---------------------------------------------------------------- relic
  private updateRelic(state: MatchState, nowMs: number): void {
    const selection = state.teamProgression.activeSelection;
    const reveal = state.matchFlow === 'relicSelection' && selection?.kind === 'relic' && !selection.resolved ? selection : null;
    if (reveal) {
      const result = reveal.relicResult!;
      const key = `reveal:${result.acquisitionSequence}`;
      if (key !== this.lastRelicKey) {
        this.lastRelicKey = key;
        this.renderRelicReveal(reveal);
      }
      this.relicHost.style.display = 'grid';
      if (this.relicTimerElement) {
        const remaining = Math.max(0, (reveal.revealDeadlineWallMs ?? reveal.expiresAtWallMs) - nowMs);
        this.relicTimerElement.textContent = `auto-complete ${Math.ceil(remaining / 1000)}s`;
      }
      this.relicVisible = true;
      return;
    }

    const relic = state.teamProgression.lastRelicResult;
    if (relic) {
      const key = `toast:${relic.acquisitionSequence ?? `${relic.relicId}:${relic.stackCountAfter}:${relic.duplicateConverted}`}`;
      if (key !== this.lastRelicKey) {
        this.lastRelicKey = key;
        this.relicToastUntil = nowMs + 2600;
        this.renderRelicToast(relic);
      }
      if (nowMs < this.relicToastUntil) {
        this.relicHost.style.display = 'grid';
        this.relicVisible = true;
        return;
      }
    }
    this.relicVisible = false;
    this.relicHost.style.display = 'none';
  }

  private renderRelicReveal(selection: NonNullable<ProgressionSelectionState>): void {
    const result = selection.relicResult!;
    this.relicHost.textContent = '';
    this.relicTimerElement = null;
    const panel = document.createElement('div');
    panel.style.cssText =
      'text-align:center;max-width:520px;padding:26px 34px;border:2px solid #c06bff;' +
      'border-radius:14px;background:rgba(20,16,30,0.96);';
    const title = document.createElement('h2');
    title.textContent = 'RELIC ACQUIRED';
    title.style.cssText = 'margin:0 0 12px;letter-spacing:.14em;color:#ffc94d;';
    panel.appendChild(title);
    const info = this.cb.relicInfo?.(result.relicId) ?? null;
    const name = document.createElement('div');
    name.textContent = info?.label ?? result.relicId;
    name.style.cssText = 'font-size:22px;font-weight:700;color:#ffe9a8;margin-bottom:6px;';
    panel.appendChild(name);
    const rarity = document.createElement('div');
    rarity.textContent = result.rarity.toUpperCase();
    rarity.style.cssText = 'color:#c06bff;font-weight:700;letter-spacing:.1em;margin-bottom:10px;';
    panel.appendChild(rarity);
    if (info?.description) {
      const desc = document.createElement('div');
      desc.textContent = info.description;
      desc.style.cssText = 'color:#9fc4cf;margin-bottom:10px;';
      panel.appendChild(desc);
    }
    const stack = document.createElement('div');
    stack.textContent = result.duplicateConverted
      ? `DUPLICATE → +${result.replacementXp} XP`
      : `Stack ×${result.stackCountAfter}`;
    stack.style.cssText = 'color:#7fd0dd;margin-bottom:14px;font-weight:700;';
    panel.appendChild(stack);
    const skip = document.createElement('button');
    skip.dataset['act'] = 'skip-relic';
    skip.textContent = 'SKIP';
    skip.style.cssText =
      'padding:8px 22px;border:1px solid #4db8ff;border-radius:8px;background:rgba(24,42,54,0.9);' +
      'color:#bfe9ff;cursor:pointer;font-weight:700;';
    skip.addEventListener('click', () => this.cb.skipRelicPresentation());
    panel.appendChild(skip);
    this.relicTimerElement = document.createElement('div');
    this.relicTimerElement.dataset['relicTimer'] = 'true';
    this.relicTimerElement.style.cssText = 'margin-top:12px;color:#7fc9d8;font-size:12px;';
    panel.appendChild(this.relicTimerElement);
    this.relicHost.appendChild(panel);
  }

  private renderRelicToast(result: NonNullable<MatchState['teamProgression']['lastRelicResult']>): void {
    this.relicHost.textContent = '';
    this.relicTimerElement = null;
    const toast = document.createElement('div');
    toast.style.cssText =
      'position:absolute;top:18%;left:50%;transform:translateX(-50%);' +
      'padding:12px 22px;border:2px solid #ffc94d;border-radius:10px;' +
      'background:rgba(24,30,20,0.96);font-weight:700;color:#ffe9a8;';
    const info = this.cb.relicInfo?.(result.relicId) ?? null;
    toast.textContent = result.duplicateConverted
      ? `${info?.label ?? result.relicId} DUPLICATE → +${result.replacementXp} XP`
      : `${info?.label ?? result.relicId} (${result.rarity.toUpperCase()}) ×${result.stackCountAfter}`;
    this.relicHost.appendChild(toast);
  }

  dispose(): void {
    this.root.remove();
    this.debugHost.remove();
    this.selectionHost.remove();
    this.relicHost.remove();
  }
}
