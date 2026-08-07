import type { MatchState } from '../../shared/types';
import type { ProgressionInputFrame } from '../input';
import { RewardRevealDirector } from './rewardRevealDirector';
import { RewardRevealView, type ProgressionRole } from './rewardRevealView';

export interface ProgressionOverlayCallbacks {
  selectUpgrade(cardIndex: number): void;
  acknowledgeRelic(): void;
  relicInfo?: (relicId: string) => { label: string; description: string; iconId?: string; iconUrl?: string | null } | null;
  rewardSound?: (name: 'levelImpact' | 'tick' | 'cardLock' | 'focus' | 'confirm' | 'relicLock' | 'exit', rarity?: string) => void;
  duckLegendary?: () => void;
}

/** Compatibility shell around the presentation-only director and DOM view. */
export class ProgressionOverlay {
  private readonly director = new RewardRevealDirector(
    typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  private readonly view: RewardRevealView;
  private latestState: MatchState | null = null;
  private latestRole: ProgressionRole = 'single';
  private timeline = this.director.sync(null, 0);
  private highlightedIndex = 1;
  private virtualSelectionX = 0.5;
  private localSelectionSent = false;
  private localRelicAckSent = false;
  private exitUntilMs = 0;
  private nowMs = 0;
  private lastTickBucket = -1;
  private lastLockedCards = 0;

  constructor(container: HTMLElement, private readonly cb: ProgressionOverlayCallbacks) {
    this.view = new RewardRevealView(container, {
      chooseUpgrade: (index) => this.chooseUpgrade(index),
      continueRelic: () => this.continueRelic(),
      relicInfo: cb.relicInfo,
    });
  }

  update(state: MatchState, role: ProgressionRole, nowMs: number): void {
    this.latestState = state;
    this.latestRole = role;
    this.nowMs = nowMs;
    const selection = state.teamProgression.activeSelection;
    const active = selection && !selection.resolved && (
      (selection.kind === 'upgrade' && state.matchFlow === 'upgradeSelection') ||
      (selection.kind === 'relic' && state.matchFlow === 'relicSelection')
    ) ? selection : null;
    this.timeline = this.director.sync(active, nowMs);
    if (!active) {
      if (nowMs >= this.exitUntilMs) this.view.hide();
      return;
    }
    if (this.timeline.startedNow) {
      this.highlightedIndex = 1;
      this.virtualSelectionX = 0.5;
      this.localSelectionSent = false;
      this.localRelicAckSent = false;
      this.lastTickBucket = -1;
      this.lastLockedCards = 0;
      if (active.kind === 'upgrade') {
        this.view.renderUpgrade(active, role);
        this.cb.rewardSound?.('levelImpact');
      } else {
        this.view.renderRelic(active, role);
      }
    }
    if (active.kind === 'upgrade') {
      if (this.timeline.state === 'spinning') {
        const bucket = Math.floor(this.timeline.elapsedMs / 58);
        if (bucket !== this.lastTickBucket) {
          this.lastTickBucket = bucket;
          this.cb.rewardSound?.('tick');
        }
      }
      if (this.timeline.lockedCards > this.lastLockedCards) {
        this.lastLockedCards = this.timeline.lockedCards;
        const offer = active.singlePlayerOffer ?? (role === 'driver' ? active.driverOffer : active.gunnerOffer) ?? [];
        this.cb.rewardSound?.('cardLock', offer[this.timeline.lockedCards - 1]?.rarity);
      }
      const localSelected = role === 'single'
        ? active.singlePlayerSelection
        : role === 'driver'
          ? active.driverSelection
          : active.gunnerSelection;
      if (localSelected !== undefined) {
        const waiting = role !== 'single' && (
          active.driverSelection === undefined || active.gunnerSelection === undefined
        );
        this.director.markConfirmed(waiting);
        this.timeline = this.director.sync(active, nowMs);
      }
      this.view.showUpgrade(this.timeline);
      this.view.updateUpgrade(active, role, this.timeline, nowMs);
      this.view.focusCard(this.highlightedIndex);
    } else {
      this.view.showRelic(this.timeline);
      this.view.updateRelic(active, role, this.timeline);
      if (this.timeline.startedNow && this.timeline.finalVisible) this.cb.rewardSound?.('relicLock', active.relicResult?.rarity);
    }
  }

  handleInput(input: ProgressionInputFrame): void {
    const active = this.latestState?.teamProgression.activeSelection;
    if (!active || active.resolved) return;
    if (active.kind === 'upgrade') {
      let confirm = false;
      for (const action of input.actions) {
        if (action.kind === 'direct') {
          this.setFocus(action.index);
          // Number keys are direct selection shortcuts, even during the
          // presentation build-up.
          this.chooseUpgrade(action.index);
          return;
        }
        if (action.kind === 'move') this.setFocus((this.highlightedIndex + action.direction + 3) % 3);
        if (action.kind === 'confirm') confirm = true;
      }
      if (input.dx !== 0) {
        this.virtualSelectionX = Math.max(0, Math.min(1, this.virtualSelectionX + input.dx * 0.0025));
        const zone = Math.min(2, Math.floor(this.virtualSelectionX * 3));
        const boundaryDistance = Math.abs(this.virtualSelectionX * 3 - Math.round(this.virtualSelectionX * 3));
        if (zone === this.highlightedIndex || boundaryDistance > 0.055) this.setFocus(zone);
      }
      if (confirm && this.timeline.state === 'selectable') this.chooseUpgrade(this.highlightedIndex);
      return;
    }
    if (!input.actions.some((action) => action.kind === 'confirm')) return;
    this.continueRelic();
  }

  private setFocus(index: number): void {
    const next = Math.max(0, Math.min(2, index));
    if (next === this.highlightedIndex) return;
    this.highlightedIndex = next;
    this.virtualSelectionX = (next + 0.5) / 3;
    this.view.focusCard(next);
    this.cb.rewardSound?.('focus');
  }

  private chooseUpgrade(index: number): void {
    if (this.localSelectionSent) return;
    const active = this.latestState?.teamProgression.activeSelection;
    if (!active || active.kind !== 'upgrade') return;
    this.localSelectionSent = true;
    this.exitUntilMs = this.nowMs + 280;
    this.director.markConfirmed(this.latestRole !== 'single');
    this.view.markSelected(index);
    this.cb.rewardSound?.('confirm', (active.singlePlayerOffer ?? active.driverOffer ?? active.gunnerOffer)?.[index]?.rarity);
    this.cb.selectUpgrade(index);
  }

  private continueRelic(): void {
    const active = this.latestState?.teamProgression.activeSelection;
    if (!active || active.kind !== 'relic' || this.localRelicAckSent) return;
    if (!this.timeline.continueArmed) {
      if (this.director.fastForwardRelic(this.nowMs)) {
        this.timeline = this.director.sync(active, this.nowMs);
        this.view.updateRelic(active, this.latestRole, this.timeline);
        this.view.fx.burst(active.relicResult?.rarity ?? 'common', active.relicResult?.rarity === 'legendary' ? 24 : 14);
        this.cb.rewardSound?.('relicLock', active.relicResult?.rarity);
        if (active.relicResult?.rarity === 'legendary') this.cb.duckLegendary?.();
      }
      return;
    }
    this.localRelicAckSent = true;
    this.exitUntilMs = this.nowMs + 220;
    this.cb.rewardSound?.('exit');
    this.cb.acknowledgeRelic();
  }

  updateDebug(text: string): void {
    this.view.updateDebug(text);
  }

  dispose(): void {
    this.view.dispose();
  }
}
