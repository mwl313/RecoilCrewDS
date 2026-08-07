import type { ProgressionSelectionState } from '../../shared/progression/progressionTypes';

export type RewardPresentationState =
  | 'hidden'
  | 'intro'
  | 'spinning'
  | 'decelerating'
  | 'revealed'
  | 'selectable'
  | 'confirmed'
  | 'waitingForPeer'
  | 'awaitingContinue'
  | 'exiting';

export interface RewardTimelineSnapshot {
  key: string;
  kind: 'upgrade' | 'relic';
  state: RewardPresentationState;
  elapsedMs: number;
  lockedCards: number;
  finalVisible: boolean;
  continueArmed: boolean;
  startedNow: boolean;
}

const UPGRADE_SELECTABLE_MS = 1_100;
const RELIC_FINAL_MS = 1_480;
const RELIC_CONTINUE_MS = 1_750;
const FAST_FORWARD_ARM_MS = 250;

/**
 * Presentation-only timeline. It never chooses or mutates a reward; the
 * authoritative selection/result is supplied on every sync.
 */
export class RewardRevealDirector {
  private key = '';
  private kind: 'upgrade' | 'relic' = 'upgrade';
  private startedAtMs = 0;
  private fastForwardedAtMs: number | null = null;
  private forcedState: RewardPresentationState | null = null;

  constructor(private readonly reducedMotion = false) {}

  sync(selection: ProgressionSelectionState | null, nowMs: number): RewardTimelineSnapshot {
    if (!selection) {
      this.key = '';
      this.forcedState = null;
      return hiddenSnapshot();
    }
    const key = selection.kind === 'upgrade'
      ? `upgrade:${selection.offerId}`
      : `relic:${selection.relicResult?.acquisitionSequence ?? selection.offerId}`;
    const startedNow = key !== this.key;
    if (startedNow) {
      this.key = key;
      this.kind = selection.kind;
      this.fastForwardedAtMs = null;
      this.forcedState = null;
      // Relic reveal start is authoritative, which makes reconnect skip an
      // already elapsed roulette. Upgrade offers enter when first observed.
      this.startedAtMs = selection.kind === 'relic'
        ? selection.revealStartedAtWallMs ?? nowMs
        : nowMs;
    }
    const elapsedMs = Math.max(0, nowMs - this.startedAtMs);
    const state = this.forcedState ?? (this.kind === 'upgrade'
      ? upgradeState(elapsedMs, this.reducedMotion)
      : relicState(elapsedMs, this.fastForwardedAtMs, nowMs, this.reducedMotion));
    return {
      key,
      kind: this.kind,
      state,
      elapsedMs,
      lockedCards: this.kind === 'upgrade' ? lockedCardCount(elapsedMs, this.reducedMotion) : 0,
      finalVisible: this.kind === 'relic' && (this.reducedMotion || elapsedMs >= RELIC_FINAL_MS || this.fastForwardedAtMs !== null),
      continueArmed: this.kind === 'relic' && (
        elapsedMs >= (this.reducedMotion ? 300 : RELIC_CONTINUE_MS) ||
        (this.fastForwardedAtMs !== null && nowMs - this.fastForwardedAtMs >= FAST_FORWARD_ARM_MS)
      ),
      startedNow,
    };
  }

  fastForwardRelic(nowMs: number): boolean {
    if (this.kind !== 'relic' || !this.key || this.fastForwardedAtMs !== null) return false;
    this.fastForwardedAtMs = nowMs;
    return true;
  }

  markConfirmed(waitingForPeer: boolean): void {
    this.forcedState = waitingForPeer ? 'waitingForPeer' : 'confirmed';
  }

  clearForcedState(): void {
    this.forcedState = null;
  }
}

function upgradeState(elapsedMs: number, reducedMotion: boolean): RewardPresentationState {
  if (reducedMotion) return elapsedMs < 300 ? 'intro' : 'selectable';
  if (elapsedMs < 300) return 'intro';
  if (elapsedMs < 720) return 'spinning';
  if (elapsedMs < UPGRADE_SELECTABLE_MS) return 'decelerating';
  return 'selectable';
}

function relicState(elapsedMs: number, fastForwardedAtMs: number | null, nowMs: number, reducedMotion: boolean): RewardPresentationState {
  if (fastForwardedAtMs !== null) {
    return nowMs - fastForwardedAtMs >= FAST_FORWARD_ARM_MS ? 'awaitingContinue' : 'revealed';
  }
  if (reducedMotion) return elapsedMs < 300 ? 'revealed' : 'awaitingContinue';
  if (elapsedMs < 760) return 'intro';
  if (elapsedMs < 1_320) return 'spinning';
  if (elapsedMs < RELIC_FINAL_MS) return 'decelerating';
  if (elapsedMs < RELIC_CONTINUE_MS) return 'revealed';
  return 'awaitingContinue';
}

function lockedCardCount(elapsedMs: number, reducedMotion: boolean): number {
  if (reducedMotion) return elapsedMs >= 300 ? 3 : 0;
  if (elapsedMs < 720) return 0;
  if (elapsedMs < 850) return 1;
  if (elapsedMs < 980) return 2;
  return 3;
}

function hiddenSnapshot(): RewardTimelineSnapshot {
  return {
    key: '', kind: 'upgrade', state: 'hidden', elapsedMs: 0, lockedCards: 0,
    finalVisible: false, continueArmed: false, startedNow: false,
  };
}
