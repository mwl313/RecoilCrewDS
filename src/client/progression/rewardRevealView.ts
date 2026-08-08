import type { MatchState } from '../../shared/types';
import type { ProgressionSelectionState, UpgradeCard } from '../../shared/progression/progressionTypes';
import type { RewardTimelineSnapshot } from './rewardRevealDirector';
import { RewardFxLayer } from './rewardFxLayer';
import { buildRewardReelSymbols, rewardReelFrame, type RewardReelSymbol } from './rewardReelAnimator';
import { formatUpgradeEffect } from '../../shared/presentation/statPresentation';

export type ProgressionRole = 'driver' | 'gunner' | 'single';

export interface RewardRevealViewCallbacks {
  chooseUpgrade(index: number): void;
  continueRelic(): void;
  relicInfo?(relicId: string): { label: string; description: string; iconId?: string; iconUrl?: string | null } | null;
}

export class RewardRevealView {
  readonly root: HTMLElement;
  readonly selectionHost: HTMLElement;
  readonly relicHost: HTMLElement;
  readonly debugHost: HTMLElement;
  readonly fx: RewardFxLayer;
  private cardButtons: HTMLButtonElement[] = [];
  private cardReels: HTMLElement[] = [];
  private cardSymbols: RewardReelSymbol[][] = [];
  private lastCardCellIndices: number[] = [];
  private selectionTitle: HTMLElement | null = null;
  private fuse: HTMLElement | null = null;
  private peerStatus: HTMLElement | null = null;
  private continuePrompt: HTMLButtonElement | null = null;
  private relicReel: HTMLElement | null = null;
  private relicPlate: HTMLElement | null = null;
  private relicOutline: HTMLElement | null = null;
  private relicSymbols: RewardReelSymbol[] = [];
  private lastRelicCellIndex = -1;
  private lastLockedCount = 0;
  private rewardIdentity = '';

  constructor(container: HTMLElement, private readonly cb: RewardRevealViewCallbacks) {
    const reducedMotion = typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const reducedFlash = reducedMotion || new URLSearchParams(globalThis.location?.search ?? '').has('reducedFlash');
    this.fx = new RewardFxLayer(reducedFlash);
    this.root = document.createElement('div');
    this.root.id = 'progression-overlay';
    this.root.className = 'reward-overlay';
    this.root.classList.toggle('reward-overlay--reduced-flash', reducedFlash);
    this.root.hidden = true;
    const scrim = element('div', 'reward-scrim');
    this.selectionHost = document.createElement('section');
    this.selectionHost.id = 'progression-selection-layer';
    this.selectionHost.className = 'reward-layer reward-layer--upgrade';
    this.selectionHost.hidden = true;
    this.relicHost = document.createElement('section');
    this.relicHost.id = 'progression-relic-layer';
    this.relicHost.className = 'reward-layer reward-layer--relic';
    this.relicHost.hidden = true;
    this.relicHost.addEventListener('click', (event) => {
      if (!(event.target instanceof HTMLButtonElement)) this.cb.continueRelic();
    });
    this.debugHost = document.createElement('pre');
    this.debugHost.id = 'progression-debug-layer';
    this.debugHost.className = 'reward-debug';
    this.debugHost.hidden = !new URLSearchParams(globalThis.location?.search ?? '').has('progressionDebug');
    this.root.append(scrim, this.fx.element, this.selectionHost, this.relicHost);
    container.append(this.root, this.debugHost);
  }

  renderUpgrade(selection: ProgressionSelectionState, role: ProgressionRole): void {
    const offer = selection.singlePlayerOffer ?? (role === 'driver' ? selection.driverOffer : selection.gunnerOffer) ?? [];
    this.selectionHost.replaceChildren();
    this.cardButtons = [];
    this.cardReels = [];
    this.cardSymbols = [];
    this.lastCardCellIndices = [];
    this.lastLockedCount = 0;
    this.rewardIdentity = selection.offerId;
    const stage = element('div', 'reward-stage reward-stage--upgrade');
    const kicker = element('div', 'reward-kicker', 'FIELD UPGRADE AVAILABLE');
    this.selectionTitle = element('h2', 'reward-title', 'LEVEL UP');
    const level = element('div', 'reward-level-number', `LEVEL ${selection.level}`);
    const bank = element('div', 'reward-card-bank');
    offer.forEach((card, index) => bank.appendChild(this.buildCard(card, index, selection.offerId)));
    this.peerStatus = role === 'single' ? null : element('div', 'reward-peer-status');
    this.fuse = element('div', 'reward-auto-fuse');
    this.fuse.dataset['progressionTimer'] = 'true';
    stage.append(kicker, this.selectionTitle, level, bank);
    if (this.peerStatus) stage.appendChild(this.peerStatus);
    stage.appendChild(this.fuse);
    this.selectionHost.appendChild(stage);
  }

  private buildCard(card: UpgradeCard, index: number, identity: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'reward-card';
    button.dataset['resultRarity'] = card.rarity;
    button.dataset['index'] = String(index);
    button.setAttribute('aria-label', `${index + 1}: ${humanize(card.categoryId)}, ${card.rarity}`);
    const hotkey = element('span', 'reward-card__hotkey', String(index + 1));
    const reelWindow = element('div', 'reward-card__reel-window');
    reelWindow.setAttribute('aria-hidden', 'true');
    const reelTrack = element('div', 'reward-card__reel-track');
    const symbols = buildRewardReelSymbols(identity, index, 'upgrade');
    this.cardSymbols.push(symbols);
    this.lastCardCellIndices.push(-1);
    button.dataset['rarity'] = symbols[0]?.rarity ?? 'common';
    for (const symbol of symbols) {
      const cell = element('div', 'reward-card__symbol');
      cell.dataset['rarity'] = symbol.rarity;
      cell.append(element('span', 'reward-card__symbol-glyph', symbol.glyph), element('span', '', symbol.label));
      reelTrack.appendChild(cell);
    }
    const finalSymbol = element('div', 'reward-card__lock-symbol');
    finalSymbol.append(element('span', 'reward-card__symbol-glyph', glyphFor(card.categoryId)), element('span', '', 'LOCKED'));
    reelWindow.append(reelTrack, finalSymbol);
    this.cardReels.push(reelTrack);
    const content = element('div', 'reward-card__content');
    content.append(
      element('div', 'reward-card__rarity', card.rarity.toUpperCase()),
      element('div', 'reward-card__name', humanize(card.categoryId)),
      element('div', 'reward-card__effect', formatEffects(card)),
      element('div', 'reward-card__focus-rail', '// SELECT'),
    );
    button.append(hotkey, reelWindow, content);
    button.addEventListener('mouseenter', () => this.focusCard(index));
    button.addEventListener('focus', () => this.focusCard(index));
    button.addEventListener('click', () => this.cb.chooseUpgrade(index));
    this.cardButtons.push(button);
    return button;
  }

  updateUpgrade(selection: ProgressionSelectionState, role: ProgressionRole, timeline: RewardTimelineSnapshot, nowMs: number): void {
    this.selectionHost.dataset['phase'] = timeline.state;
    this.selectionHost.hidden = false;
    this.relicHost.hidden = true;
    for (let index = 0; index < this.cardButtons.length; index++) {
      const locked = index < timeline.lockedCards;
      const card = this.cardButtons[index]!;
      card.classList.toggle('reward-card--locked', locked);
      const frame = rewardReelFrame(timeline.elapsedMs, index, 'upgrade');
      this.cardReels[index]?.style.setProperty('--reward-reel-y', `${frame.translateY}px`);
      this.cardReels[index]?.style.setProperty('--reward-reel-velocity', String(frame.velocity));
      if (locked) {
        card.dataset['rarity'] = card.dataset['resultRarity'] ?? 'common';
      } else if (frame.visibleCellIndex !== this.lastCardCellIndices[index]) {
        card.dataset['rarity'] = this.cardSymbols[index]?.[frame.visibleCellIndex]?.rarity ?? 'common';
        this.lastCardCellIndices[index] = frame.visibleCellIndex;
      }
    }
    for (let index = this.lastLockedCount; index < timeline.lockedCards; index++) {
      const card = this.cardButtons[index];
      if (!card) continue;
      restartClass(card, 'reward-card--lock-hit');
      const rarity = card.dataset['rarity'] ?? 'common';
      this.fx.burst(rarity, shardCount(rarity), `${this.rewardIdentity}:card:${index}`, card, index === 2 ? 'final-card' : 'card');
    }
    this.lastLockedCount = timeline.lockedCards;
    const selected = localSelection(selection, role);
    if (selected !== undefined) {
      this.selectionTitle!.textContent = 'LOCKED IN';
      this.markSelected(selected);
    } else {
      this.selectionTitle!.textContent = 'LEVEL UP';
    }
    if (this.fuse && selection.expiresAtWallMs !== undefined) {
      const remaining = Math.max(0, selection.expiresAtWallMs - nowMs);
      const total = Math.max(1, selection.expiresAtWallMs - (selection.offerStartedAtWallMs ?? nowMs));
      this.fuse.style.setProperty('--reward-fuse', String(remaining / total));
      this.fuse.textContent = remaining <= 3_000 ? `AUTO ${Math.ceil(remaining / 1_000)}` : '';
    }
    if (this.peerStatus) {
      const me = role === 'driver' ? selection.driverSelection : selection.gunnerSelection;
      const peerRole = role === 'driver' ? 'GUNNER' : 'DRIVER';
      const peer = role === 'driver' ? selection.gunnerSelection : selection.driverSelection;
      this.peerStatus.replaceChildren(
        statusLine('YOU', me !== undefined ? 'READY' : 'CHOOSING...'),
        statusLine(peerRole, peer !== undefined ? 'READY' : 'CHOOSING...'),
      );
      if (me !== undefined && peer !== undefined) this.peerStatus.appendChild(element('strong', 'reward-crew-ready', 'CREW READY'));
    }
  }

  renderRelic(selection: ProgressionSelectionState, role: ProgressionRole): void {
    const result = selection.relicResult!;
    const info = this.cb.relicInfo?.(result.relicId) ?? null;
    this.rewardIdentity = `relic:${result.acquisitionSequence}`;
    this.relicHost.replaceChildren();
    this.relicHost.removeAttribute('data-rarity');
    const stage = element('div', 'reward-stage reward-stage--relic');
    const signal = element('div', 'reward-kicker reward-relic__signal', 'RELIC SIGNAL ACQUIRED');
    this.relicPlate = element('article', 'reward-relic');
    this.relicSymbols = buildRewardReelSymbols(this.rewardIdentity, 0, 'relic');
    this.lastRelicCellIndex = -1;
    this.relicPlate.dataset['rarity'] = this.relicSymbols[0]?.rarity ?? 'common';
    this.relicHost.dataset['rarity'] = this.relicPlate.dataset['rarity'];
    this.relicOutline = element('div', 'reward-relic__roulette-outline');
    const reelWindow = element('div', 'reward-relic__reel-window');
    this.relicReel = element('div', 'reward-relic__reel-track');
    for (const symbol of this.relicSymbols) {
      const cell = element('div', 'reward-relic__symbol');
      cell.dataset['rarity'] = symbol.rarity;
      cell.append(element('span', 'reward-relic__symbol-glyph', symbol.glyph), element('span', '', symbol.label));
      this.relicReel.appendChild(cell);
    }
    reelWindow.appendChild(this.relicReel);
    const final = element('div', 'reward-relic__final');
    const icon = element('div', 'reward-relic__icon');
    if (info?.iconUrl) {
      const image = document.createElement('img');
      image.src = info.iconUrl;
      image.alt = '';
      icon.appendChild(image);
    } else {
      icon.textContent = 'RC';
      icon.classList.add('reward-relic__icon--fallback');
    }
    final.append(
      element('div', 'reward-relic__rarity', result.rarity.toUpperCase()),
      icon,
      element('h2', 'reward-relic__name', info?.label ?? 'UNIDENTIFIED RELIC'),
      element('p', 'reward-relic__description', info?.description ?? ''),
      element('div', `reward-relic__stack${result.stackCountAfter > 1 ? ' reward-relic__stack--up' : ''}`, result.stackCountAfter > 1
        ? `STACK UP  ×${result.stackCountAfter - 1} → ×${result.stackCountAfter}`
        : `STACK ×${result.stackCountAfter}`),
    );
    this.continuePrompt = document.createElement('button');
    this.continuePrompt.type = 'button';
    this.continuePrompt.className = 'reward-continue';
    this.continuePrompt.textContent = 'INPUT TO FAST-FORWARD';
    this.continuePrompt.addEventListener('click', () => this.cb.continueRelic());
    this.relicPlate.append(this.relicOutline, reelWindow, final, this.continuePrompt);
    stage.append(signal, this.relicPlate);
    if (role !== 'single') stage.appendChild(element('div', 'reward-peer-status reward-peer-status--relic'));
    this.relicHost.appendChild(stage);
  }

  updateRelic(selection: ProgressionSelectionState, role: ProgressionRole, timeline: RewardTimelineSnapshot): void {
    this.relicHost.dataset['phase'] = timeline.state;
    this.relicHost.hidden = false;
    this.selectionHost.hidden = true;
    const frame = rewardReelFrame(timeline.elapsedMs, 0, 'relic');
    this.relicReel?.style.setProperty('--reward-reel-y', `${frame.translateY}px`);
    this.relicReel?.style.setProperty('--reward-reel-velocity', String(frame.velocity));
    if (timeline.finalVisible) {
      const finalRarity = selection.relicResult?.rarity ?? 'common';
      this.relicPlate?.setAttribute('data-rarity', finalRarity);
      this.relicHost.dataset['rarity'] = finalRarity;
    } else if (frame.visibleCellIndex !== this.lastRelicCellIndex) {
      const spinningRarity = this.relicSymbols[frame.visibleCellIndex]?.rarity ?? 'common';
      this.relicPlate?.setAttribute('data-rarity', spinningRarity);
      this.relicHost.dataset['rarity'] = spinningRarity;
      if (this.relicOutline) restartClass(this.relicOutline, 'reward-relic__roulette-outline--flash');
      this.lastRelicCellIndex = frame.visibleCellIndex;
    }
    this.continuePrompt?.setAttribute('aria-disabled', String(!timeline.continueArmed));
    if (this.continuePrompt) this.continuePrompt.textContent = timeline.continueArmed
      ? 'CLICK / SPACE TO CONTINUE'
      : 'INPUT TO FAST-FORWARD';
    const peer = this.relicHost.querySelector<HTMLElement>('.reward-peer-status--relic');
    if (peer && role !== 'single') {
      const mine = role === 'driver' ? selection.driverRelicAcknowledged : selection.gunnerRelicAcknowledged;
      const theirs = role === 'driver' ? selection.gunnerRelicAcknowledged : selection.driverRelicAcknowledged;
      peer.replaceChildren(
        statusLine('YOU', mine ? 'READY' : 'VIEWING'),
        statusLine('PARTNER', theirs ? 'READY' : 'VIEWING'),
      );
      if (mine && theirs) peer.appendChild(element('strong', 'reward-crew-ready', 'CREW READY'));
    }
  }

  startEntrance(identity: string): void {
    restartClass(this.root, 'reward-overlay--edge-impact');
    const host = this.root.dataset['kind'] === 'relic' ? this.relicHost : this.selectionHost;
    const stage = host.querySelector<HTMLElement>('.reward-stage');
    if (stage) restartClass(stage, 'reward-stage--enter');
    this.fx.enter(identity);
  }

  impactRelic(selection: ProgressionSelectionState): void {
    const rarity = selection.relicResult?.rarity ?? 'common';
    if (this.relicPlate) restartClass(this.relicPlate, 'reward-relic--lock-hit');
    this.fx.burst(rarity, shardCount(rarity, true), this.rewardIdentity, this.relicPlate ?? undefined, 'relic');
  }

  impactUpgradeSelection(index: number, rarity: string): void {
    const card = this.cardButtons[index];
    if (!card) return;
    this.fx.burst(rarity, shardCount(rarity) + 6, `${this.rewardIdentity}:manual:${index}`, card, 'final-card');
  }

  shake(intensity: number): void {
    this.root.style.setProperty('--reward-shake', `${Math.max(2, Math.round(intensity * 18))}px`);
    restartClass(this.root, 'reward-overlay--shake');
  }

  showUpgrade(timeline: RewardTimelineSnapshot): void {
    this.root.hidden = false;
    this.root.dataset['kind'] = 'upgrade';
    this.root.dataset['phase'] = timeline.state;
  }

  showRelic(timeline: RewardTimelineSnapshot): void {
    this.root.hidden = false;
    this.root.dataset['kind'] = 'relic';
    this.root.dataset['phase'] = timeline.state;
  }

  hide(): void {
    this.root.hidden = true;
    this.root.classList.remove('reward-overlay--edge-impact');
    this.root.classList.remove('reward-overlay--shake');
    this.selectionHost.hidden = true;
    this.relicHost.hidden = true;
    this.fx.clear();
  }

  focusCard(index: number): void {
    this.cardButtons.forEach((button, cardIndex) => button.classList.toggle('reward-card--focused', cardIndex === index));
  }

  markSelected(index: number): void {
    this.cardButtons.forEach((button, cardIndex) => {
      button.disabled = true;
      button.classList.toggle('reward-card--selected', cardIndex === index);
      button.classList.toggle('reward-card--rejected', cardIndex !== index);
    });
  }

  updateDebug(text: string): void {
    if (!this.debugHost.hidden) this.debugHost.textContent = text;
  }

  dispose(): void {
    this.root.remove();
    this.debugHost.remove();
  }
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function restartClass(node: HTMLElement, className: string): void {
  node.classList.remove(className);
  void node.offsetWidth;
  node.classList.add(className);
}

function statusLine(label: string, status: string): HTMLElement {
  const line = element('span', 'reward-peer-status__line');
  line.append(element('b', '', `${label} // `), document.createTextNode(status));
  return line;
}

function localSelection(selection: ProgressionSelectionState, role: ProgressionRole): number | undefined {
  return role === 'single'
    ? selection.singlePlayerSelection
    : role === 'driver'
      ? selection.driverSelection
      : selection.gunnerSelection;
}

function humanize(id: string): string {
  return id.split('.').at(-1)!.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toUpperCase();
}

function glyphFor(id: string): string {
  if (/damage|cannon|mg/i.test(id)) return '✦';
  if (/dash|speed|jump/i.test(id)) return '⬢';
  if (/integrity|armor|shield/i.test(id)) return '▣';
  return '◈';
}

function formatEffects(card: UpgradeCard): string {
  return card.rolledEffects.map(formatUpgradeEffect).join('\n');
}

function shardCount(rarity: string, relic = false): number {
  const boost = relic ? 4 : 0;
  if (rarity === 'legendary') return 24 + boost;
  if (rarity === 'epic') return 16 + boost;
  if (rarity === 'rare') return 10 + boost;
  return 6 + boost;
}
