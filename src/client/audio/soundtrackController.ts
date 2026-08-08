import type {
  SoundtrackAutomation,
  SoundtrackContext,
  SoundtrackDebugState,
  SoundtrackMediaElement,
  SoundtrackScheduler,
  SoundtrackTrack,
} from './soundtrackTypes';

export const SOUNDTRACK_TIMING = {
  startAttemptDelayMs: 300,
  titleStartFadeInMs: 1_000,
  naturalFadeOutMs: 1_250,
  naturalFadeInMs: 1_250,
  naturalGapMs: 150,
  matchStartFadeOutMs: 650,
  matchFadeInMs: 900,
  resultsContextMs: 600,
  pauseContextMs: 280,
  resumeContextMs: 320,
  menuContextMs: 350,
  naturalEndPollMs: 100,
} as const;

export const SOUNDTRACK_CONTEXT_PROFILES = {
  title: { cutoffHz: 2_300, gain: 0.72 },
  menu: { cutoffHz: 2_300, gain: 0.72 },
  lobby: { cutoffHz: 2_300, gain: 0.72 },
  countdown: { cutoffHz: 2_300, gain: 0 },
  match: { cutoffHz: 20_000, gain: 1 },
  pause: { cutoffHz: 1_600, gain: 0.6 },
  results: { cutoffHz: 2_300, gain: 0.7 },
} as const satisfies Record<SoundtrackContext, { cutoffHz: number; gain: number }>;

const defaultScheduler: SoundtrackScheduler = {
  setTimeout: (callback, durationMs) => globalThis.setTimeout(callback, durationMs),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  setInterval: (callback, durationMs) => globalThis.setInterval(callback, durationMs),
  clearInterval: (handle) => globalThis.clearInterval(handle as ReturnType<typeof setInterval>),
};

export interface SoundtrackControllerOptions {
  tracks: readonly SoundtrackTrack[];
  media: SoundtrackMediaElement;
  automation: SoundtrackAutomation;
  random?: () => number;
  scheduler?: SoundtrackScheduler;
  beforePlay?: () => void | Promise<void>;
}

/** Owns playlist identity and scene-aware long-form media transitions. */
export class SoundtrackController {
  readonly activeTracks: readonly SoundtrackTrack[];

  private readonly media: SoundtrackMediaElement;
  private readonly automation: SoundtrackAutomation;
  private readonly scheduler: SoundtrackScheduler;
  private readonly beforePlay: () => void | Promise<void>;
  private readonly transitionTimers = new Set<unknown>();
  private currentIndex = -1;
  private currentContext: SoundtrackContext = 'title';
  private startupTimer: unknown = null;
  private pollTimer: unknown = null;
  private transitionGeneration = 0;
  private pendingAutoplayStart = false;
  private pendingMatchAdvance = false;
  private naturalEndPending = false;
  private hasPlayedCurrent = false;
  private started = false;
  private disposed = false;

  private readonly onEnded = (): void => {
    if (this.disposed || this.currentContext === 'countdown' || this.naturalEndPending) return;
    this.beginNaturalTransition(true);
  };

  constructor(options: SoundtrackControllerOptions) {
    this.activeTracks = options.tracks.filter((track) => track.enabled);
    this.media = options.media;
    this.automation = options.automation;
    this.scheduler = options.scheduler ?? defaultScheduler;
    this.beforePlay = options.beforePlay ?? (() => undefined);
    this.media.preload = 'auto';
    this.media.loop = false;
    this.media.addEventListener('ended', this.onEnded);

    if (this.activeTracks.length > 0) {
      const random = options.random ?? Math.random;
      const sample = Math.max(0, Math.min(0.999_999_999, random()));
      this.currentIndex = Math.floor(sample * this.activeTracks.length);
      this.loadCurrentTrack();
    }
    this.applyContext('title', 0);
  }

  start(): void {
    if (this.disposed || this.started || this.activeTracks.length === 0) return;
    this.started = true;
    this.startupTimer = this.scheduler.setTimeout(() => {
      this.startupTimer = null;
      if (this.disposed || this.currentContext === 'countdown') return;
      void this.playCurrent({ fadeInMs: SOUNDTRACK_TIMING.titleStartFadeInMs, resetToStart: true });
    }, SOUNDTRACK_TIMING.startAttemptDelayMs);
    this.pollTimer = this.scheduler.setInterval(
      () => this.tickNaturalEnd(),
      SOUNDTRACK_TIMING.naturalEndPollMs,
    );
  }

  async onUserActivation(): Promise<void> {
    if (this.disposed || this.currentContext === 'countdown') return;
    if (!this.pendingAutoplayStart && this.hasPlayedCurrent) return;
    if (this.startupTimer !== null) {
      this.scheduler.clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }
    await this.playCurrent({
      fadeInMs: this.currentContext === 'match'
        ? SOUNDTRACK_TIMING.matchFadeInMs
        : SOUNDTRACK_TIMING.titleStartFadeInMs,
      resetToStart: !this.hasPlayedCurrent,
    });
  }

  enterContext(context: Exclude<SoundtrackContext, 'countdown' | 'match'>): void {
    if (this.disposed) return;
    const wasCountdown = this.currentContext === 'countdown';
    this.transitionGeneration++;
    this.naturalEndPending = false;
    this.pendingMatchAdvance = false;
    this.currentContext = context;
    this.applyContext(context, this.contextTransitionMs(context));
    if (wasCountdown) {
      if (this.media.paused || !this.hasPlayedCurrent) {
        void this.playCurrent({
          fadeInMs: SOUNDTRACK_TIMING.menuContextMs,
          resetToStart: !this.hasPlayedCurrent,
        });
      } else {
        this.automation.setTrackFade(1, SOUNDTRACK_TIMING.menuContextMs);
      }
    }
  }

  enterCountdown(): Promise<void> {
    if (this.disposed || this.currentContext === 'countdown') return Promise.resolve();
    const token = ++this.transitionGeneration;
    this.currentContext = 'countdown';
    this.pendingMatchAdvance = true;
    this.pendingAutoplayStart = false;
    this.naturalEndPending = false;
    this.applyContext('countdown', SOUNDTRACK_TIMING.matchStartFadeOutMs);
    this.automation.setTrackFade(0, SOUNDTRACK_TIMING.matchStartFadeOutMs);
    return new Promise((resolve) => {
      this.scheduleTransition(() => {
        if (this.isCurrent(token) && this.currentContext === 'countdown') this.media.pause();
        resolve();
      }, SOUNDTRACK_TIMING.matchStartFadeOutMs);
    });
  }

  async enterMatch(options: { advance: boolean }): Promise<void> {
    if (this.disposed) return;
    const shouldAdvance = options.advance && this.pendingMatchAdvance;
    this.transitionGeneration++;
    this.pendingMatchAdvance = false;
    this.naturalEndPending = false;
    this.currentContext = 'match';
    this.applyContext('match', SOUNDTRACK_TIMING.resumeContextMs);
    if (shouldAdvance) {
      this.advanceIndex();
      this.loadCurrentTrack();
      this.hasPlayedCurrent = false;
      await this.playCurrent({ fadeInMs: SOUNDTRACK_TIMING.matchFadeInMs, resetToStart: true });
      return;
    }
    if (this.media.paused) {
      await this.playCurrent({ fadeInMs: SOUNDTRACK_TIMING.resumeContextMs, resetToStart: false });
    }
  }

  duckForReward(options: { depth: number; attackMs: number; holdMs: number; releaseMs: number }): void {
    if (this.disposed) return;
    this.automation.duck(
      Math.max(0, Math.min(1, options.depth)),
      options.attackMs,
      options.holdMs,
      options.releaseMs,
    );
  }

  debugState(): SoundtrackDebugState {
    const track = this.currentTrack();
    return {
      activeTrackCount: this.activeTracks.length,
      currentContext: this.currentContext,
      currentIndex: this.currentIndex,
      currentTrackId: track?.id ?? null,
      currentSrc: track?.src ?? null,
      currentTime: this.media.currentTime,
      mediaPaused: this.media.paused,
      pendingAutoplayStart: this.pendingAutoplayStart,
      pendingMatchAdvance: this.pendingMatchAdvance,
      naturalEndPending: this.naturalEndPending,
      disposed: this.disposed,
    };
  }

  /** Public for deterministic tests; production uses the 100 ms poll. */
  tickNaturalEnd(): void {
    if (
      this.disposed ||
      this.naturalEndPending ||
      this.currentContext === 'countdown' ||
      this.media.paused ||
      !Number.isFinite(this.media.duration) ||
      this.media.duration <= 0
    ) return;
    const remainingMs = (this.media.duration - this.media.currentTime) * 1_000;
    if (remainingMs <= SOUNDTRACK_TIMING.naturalFadeOutMs) this.beginNaturalTransition(false);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.transitionGeneration++;
    if (this.startupTimer !== null) this.scheduler.clearTimeout(this.startupTimer);
    if (this.pollTimer !== null) this.scheduler.clearInterval(this.pollTimer);
    for (const timer of this.transitionTimers) this.scheduler.clearTimeout(timer);
    this.transitionTimers.clear();
    this.media.removeEventListener('ended', this.onEnded);
    this.media.pause();
  }

  private beginNaturalTransition(alreadyEnded: boolean): void {
    if (this.activeTracks.length === 0 || this.naturalEndPending) return;
    const token = ++this.transitionGeneration;
    this.naturalEndPending = true;
    this.automation.setTrackFade(0, alreadyEnded ? 0 : SOUNDTRACK_TIMING.naturalFadeOutMs);
    const delay = (alreadyEnded ? 0 : SOUNDTRACK_TIMING.naturalFadeOutMs) + SOUNDTRACK_TIMING.naturalGapMs;
    this.scheduleTransition(() => {
      if (!this.isCurrent(token)) return;
      this.media.pause();
      this.advanceIndex();
      this.loadCurrentTrack();
      this.hasPlayedCurrent = false;
      this.naturalEndPending = false;
      void this.playCurrent({ fadeInMs: SOUNDTRACK_TIMING.naturalFadeInMs, resetToStart: true });
    }, delay);
  }

  private async playCurrent(options: { fadeInMs: number; resetToStart: boolean }): Promise<void> {
    if (this.disposed || this.activeTracks.length === 0 || this.inCountdown()) return;
    const token = this.transitionGeneration;
    if (options.resetToStart) this.media.currentTime = 0;
    this.automation.setTrackFade(0, 0);
    try {
      const preparation = this.beforePlay();
      if (preparation) await preparation;
      if (!this.isCurrent(token) || this.inCountdown()) return;
      await this.media.play();
      if (!this.isCurrent(token) || this.inCountdown()) return;
      this.pendingAutoplayStart = false;
      this.hasPlayedCurrent = true;
      this.automation.setTrackFade(1, options.fadeInMs);
    } catch {
      if (!this.isCurrent(token)) return;
      this.pendingAutoplayStart = true;
      if (!this.hasPlayedCurrent) this.media.currentTime = 0;
    }
  }

  private currentTrack(): SoundtrackTrack | null {
    return this.currentIndex >= 0 ? this.activeTracks[this.currentIndex] ?? null : null;
  }

  private advanceIndex(): void {
    if (this.activeTracks.length === 0) return;
    this.currentIndex = (this.currentIndex + 1) % this.activeTracks.length;
  }

  private loadCurrentTrack(): void {
    const track = this.currentTrack();
    if (!track) return;
    this.media.pause();
    this.media.src = track.src;
    this.media.currentTime = 0;
    this.media.load();
  }

  private applyContext(context: SoundtrackContext, durationMs: number): void {
    const profile = SOUNDTRACK_CONTEXT_PROFILES[context];
    this.automation.setContext(profile.cutoffHz, profile.gain, durationMs);
  }

  private contextTransitionMs(context: SoundtrackContext): number {
    if (context === 'pause') return SOUNDTRACK_TIMING.pauseContextMs;
    if (context === 'results') return SOUNDTRACK_TIMING.resultsContextMs;
    return SOUNDTRACK_TIMING.menuContextMs;
  }

  private scheduleTransition(callback: () => void, durationMs: number): void {
    let timer: unknown;
    timer = this.scheduler.setTimeout(() => {
      this.transitionTimers.delete(timer);
      callback();
    }, durationMs);
    this.transitionTimers.add(timer);
  }

  private isCurrent(token: number): boolean {
    return !this.disposed && token === this.transitionGeneration;
  }

  private inCountdown(): boolean {
    return this.currentContext === 'countdown';
  }
}
