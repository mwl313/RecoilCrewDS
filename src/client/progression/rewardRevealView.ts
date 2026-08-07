import type { MatchState } from '../../shared/types';
import type { ProgressionSelectionState, UpgradeCard } from '../../shared/progression/progressionTypes';
import type { RewardTimelineSnapshot } from './rewardRevealDirector';
import { RewardFxLayer } from './rewardFxLayer';

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
  readonly fx = new RewardFxLayer();
  private cardButtons: HTMLButtonElement[] = [];
  private selectionTitle: HTMLElement | null = null;
  private fuse: HTMLElement | null = null;
  private peerStatus: HTMLElement | null = null;
  private continuePrompt: HTMLButtonElement | null = null;
  private relicStack: HTMLElement | null = null;
  private lastLockedCount = 0;

  constructor(container: HTMLElement, private readonly cb: RewardRevealViewCallbacks) {
    this.root = document.createElement('div');
    this.root.id = 'progression-overlay';
    this.root.className = 'reward-overlay';
    this.root.hidden = true;
    const scrim = document.createElement('div');
    scrim.className = 'reward-scrim';
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
    this.lastLockedCount = 0;
    const stage = document.createElement('div');
    stage.className = 'reward-stage reward-stage--upgrade';
    const kicker = element('div', 'reward-kicker', 'FIELD UPGRADE AVAILABLE');
    this.selectionTitle = element('h2', 'reward-title', 'LEVEL UP');
    const level = element('div', 'reward-level-number', String(selection.level));
    const bank = document.createElement('div');
    bank.className = 'reward-card-bank';
    offer.forEach((card, index) => bank.appendChild(this.buildCard(card, index)));
    this.peerStatus = role === 'single' ? null : element('div', 'reward-peer-status');
    this.fuse = document.createElement('div');
    this.fuse.className = 'reward-auto-fuse';
    this.fuse.dataset['progressionTimer'] = 'true';
    stage.append(kicker, this.selectionTitle, level, bank);
    if (this.peerStatus) stage.appendChild(this.peerStatus);
    stage.appendChild(this.fuse);
    this.selectionHost.appendChild(stage);
  }

  private buildCard(card: UpgradeCard, index: number): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'reward-card';
    button.dataset['rarity'] = card.rarity;
    button.dataset['index'] = String(index);
    button.setAttribute('aria-label', `${index + 1}: ${humanize(card.categoryId)}, ${card.rarity}`);
    const hotkey = element('span', 'reward-card__hotkey', String(index + 1));
    const reel = document.createElement('div');
    reel.className = 'reward-card__reel';
    reel.setAttribute('aria-hidden', 'true');
    reel.append(
      element('span', 'reward-card__reel-cell', 'DMG // ARMOR // MOBILITY'),
      element('span', 'reward-card__reel-cell', 'OUTPUT // CONTROL // CREW'),
      element('span', 'reward-card__reel-cell', 'SYSTEM // CALIBRATING'),
    );
    const content = document.createElement('div');
    content.className = 'reward-card__content';
    content.append(
      element('div', 'reward-card__rarity', card.rarity.toUpperCase()),
      element('div', 'reward-card__icon', glyphFor(card.categoryId)),
      element('div', 'reward-card__name', humanize(card.categoryId)),
      element('div', 'reward-card__effect', formatEffects(card)),
      element('div', 'reward-card__focus-rail', '// SELECT'),
    );
    button.append(hotkey, reel, content);
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
      this.cardButtons[index].classList.toggle('reward-card--locked', index < timeline.lockedCards);
    }
    if (timeline.lockedCards > this.lastLockedCount) {
      const rarity = this.cardButtons[timeline.lockedCards - 1]?.dataset['rarity'] ?? 'common';
      this.fx.burst(rarity, shardCount(rarity));
    }
    this.lastLockedCount = timeline.lockedCards;
    const selected = localSelection(selection, role);
    if (selected !== undefined) {
      this.selectionTitle!.textContent = 'LOCKED IN';
      this.markSelected(selected);
    } else {
      this.selectionTitle!.textContent = timeline.state === 'selectable' ? 'CHOOSE UPGRADE' : 'LEVEL UP';
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
    this.relicHost.replaceChildren();
    this.relicHost.dataset['rarity'] = result.rarity;
    const stage = document.createElement('div');
    stage.className = 'reward-stage reward-stage--relic';
    const signal = element('div', 'reward-kicker reward-relic__signal', 'RELIC SIGNAL ACQUIRED');
    const plate = document.createElement('article');
    plate.className = 'reward-relic';
    plate.dataset['rarity'] = result.rarity;
    const reel = element('div', 'reward-relic__reel', 'RELIC // ???');
    const icon = document.createElement('div');
    icon.className = 'reward-relic__icon';
    if (info?.iconUrl) {
      const image = document.createElement('img');
      image.src = info.iconUrl;
      image.alt = '';
      icon.appendChild(image);
    } else {
      icon.textContent = 'RC';
      icon.classList.add('reward-relic__icon--fallback');
    }
    const final = document.createElement('div');
    final.className = 'reward-relic__final';
    final.append(
      element('div', 'reward-relic__rarity', result.rarity.toUpperCase()),
      icon,
      element('h2', 'reward-relic__name', info?.label ?? 'UNIDENTIFIED RELIC'),
      element('p', 'reward-relic__description', info?.description ?? ''),
    );
    this.relicStack = element('div', 'reward-relic__stack', result.stackCountAfter > 1
      ? `STACK UP  ×${result.stackCountAfter - 1} → ×${result.stackCountAfter}`
      : `STACK ×${result.stackCountAfter}`);
    final.appendChild(this.relicStack);
    this.continuePrompt = document.createElement('button');
    this.continuePrompt.type = 'button';
    this.continuePrompt.className = 'reward-continue';
    this.continuePrompt.textContent = 'CLICK / SPACE TO CONTINUE';
    this.continuePrompt.addEventListener('click', () => this.cb.continueRelic());
    plate.append(reel, final, this.continuePrompt);
    stage.append(signal, plate);
    if (role !== 'single') stage.appendChild(element('div', 'reward-peer-status reward-peer-status--relic'));
    this.relicHost.appendChild(stage);
  }

  updateRelic(selection: ProgressionSelectionState, role: ProgressionRole, timeline: RewardTimelineSnapshot): void {
    this.relicHost.dataset['phase'] = timeline.state;
    this.relicHost.hidden = false;
    this.selectionHost.hidden = true;
    this.continuePrompt?.setAttribute('aria-disabled', String(!timeline.continueArmed));
    if (this.continuePrompt) {
      this.continuePrompt.textContent = timeline.continueArmed ? 'CLICK / SPACE TO CONTINUE' : 'RELIC LOCKING // INPUT TO FAST-FORWARD';
    }
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
  if (/damage|cannon|mg/i.test(id)) return 'DMG';
  if (/dash|speed|jump/i.test(id)) return 'MOV';
  if (/integrity|armor|shield/i.test(id)) return 'ARM';
  return 'SYS';
}

function formatEffects(card: UpgradeCard): string {
  return card.rolledEffects.map((effect) => {
    const label = humanize(effect.statId);
    if (effect.operation === 'multiply') return `${label}  +${Math.round((effect.value - 1) * 100)}%`;
    return `${label}  +${effect.value}`;
  }).join('\n');
}

function shardCount(rarity: string): number {
  if (rarity === 'legendary') return 24;
  if (rarity === 'epic') return 16;
  if (rarity === 'rare') return 10;
  return 6;
}
