import type { MatchState } from '../../shared/types';
import type { ProgressionInputFrame } from '../input';
import { RewardRevealDirector } from './rewardRevealDirector';
import { RewardRevealView, type ProgressionRole } from './rewardRevealView';
import { rewardTickTimes } from './rewardReelAnimator';

export interface RewardSoundDetail {
  rarity?: string;
  progress?: number;
}

export interface ProgressionOverlayCallbacks {
  selectUpgrade(cardIndex: number): void;
  acknowledgeRelic(): void;
  relicInfo?: (relicId: string) => { label: string; description: string; iconId?: string; iconUrl?: string | null } | null;
  rewardSound?: (name: 'levelImpact' | 'tick' | 'cardLock' | 'focus' | 'confirm' | 'relicLock' | 'exit', detail?: RewardSoundDetail) => void;
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
  private lastTickIndex = 0;
  private lastLockedCards = 0;
  private lastRelicFinalVisible = false;

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
      this.lastTickIndex = 0;
      this.lastLockedCards = 0;
      this.lastRelicFinalVisible = this.timeline.finalVisible;
      if (active.kind === 'upgrade') {
        this.view.renderUpgrade(active, role);
        this.cb.rewardSound?.('levelImpact');
      } else {
        this.view.renderRelic(active, role);
      }
    }
    if (active.kind === 'upgrade') {
      this.emitReelTick('upgrade');
      if (this.timeline.lockedCards > this.lastLockedCards) {
        const offer = active.singlePlayerOffer ?? (role === 'driver' ? active.driverOffer : active.gunnerOffer) ?? [];
        for (let index = this.lastLockedCards; index < this.timeline.lockedCards; index++) {
          const rarity = offer[index]?.rarity;
          if (rarity === 'legendary') this.cb.duckLegendary?.();
          this.cb.rewardSound?.('cardLock', { rarity });
        }
        this.lastLockedCards = this.timeline.lockedCards;
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
      if (this.timeline.startedNow) this.view.startEntrance(this.timeline.key);
    } else {
      this.emitReelTick('relic');
      this.view.showRelic(this.timeline);
      this.view.updateRelic(active, role, this.timeline);
      if (!this.lastRelicFinalVisible && this.timeline.finalVisible) this.triggerRelicImpact(active);
      this.lastRelicFinalVisible = this.timeline.finalVisible;
      if (this.timeline.startedNow) this.view.startEntrance(this.timeline.key);
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
    this.cb.rewardSound?.('confirm', { rarity: (active.singlePlayerOffer ?? active.driverOffer ?? active.gunnerOffer)?.[index]?.rarity });
    this.cb.selectUpgrade(index);
  }

  private continueRelic(): void {
    const active = this.latestState?.teamProgression.activeSelection;
    if (!active || active.kind !== 'relic' || this.localRelicAckSent) return;
    if (!this.timeline.continueArmed) {
      if (this.director.fastForwardRelic(this.nowMs)) {
        this.timeline = this.director.sync(active, this.nowMs);
        this.view.updateRelic(active, this.latestRole, this.timeline);
        this.triggerRelicImpact(active);
        this.lastRelicFinalVisible = true;
      }
      return;
    }
    this.localRelicAckSent = true;
    this.exitUntilMs = this.nowMs + 220;
    this.cb.rewardSound?.('exit');
    this.cb.acknowledgeRelic();
  }

  private emitReelTick(kind: 'upgrade' | 'relic'): void {
    const times = rewardTickTimes(kind);
    let newest = -1;
    while (this.lastTickIndex < times.length && this.timeline.elapsedMs >= times[this.lastTickIndex]!) {
      newest = this.lastTickIndex;
      this.lastTickIndex++;
    }
    if (newest >= 0) this.cb.rewardSound?.('tick', { progress: newest / Math.max(1, times.length - 1) });
  }

  private triggerRelicImpact(selection: NonNullable<MatchState['teamProgression']['activeSelection']>): void {
    const rarity = selection.relicResult?.rarity ?? 'common';
    this.view.impactRelic(selection);
    if (rarity === 'legendary') this.cb.duckLegendary?.();
    this.cb.rewardSound?.('relicLock', { rarity });
  }

  updateDebug(text: string): void {
    this.view.updateDebug(text);
  }

  dispose(): void {
    this.view.dispose();
  }
}
