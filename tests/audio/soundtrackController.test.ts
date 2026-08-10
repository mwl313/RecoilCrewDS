import { describe, expect, it } from 'vitest';
import {
  SOUNDTRACK_CONTEXT_PROFILES,
  SOUNDTRACK_TIMING,
  SoundtrackController,
} from '../../src/client/audio/soundtrackController';
import { SOUNDTRACK_TRACKS } from '../../src/client/audio/soundtrackManifest';
import {
  SOUNDTRACK_MUSIC_BUS_GAIN,
  WebAudioSoundtrackAutomation,
} from '../../src/client/audio/soundtrackWebAudio';
import { PHASE_ANNOUNCEMENT_DUCK } from '../../src/client/audio';
import type {
  SoundtrackAutomation,
  SoundtrackMediaElement,
  SoundtrackScheduler,
  SoundtrackTrack,
} from '../../src/client/audio/soundtrackTypes';

const TRACKS: readonly SoundtrackTrack[] = [
  { id: 'one', src: '/one.mp3', enabled: true },
  { id: 'two', src: '/two.mp3', enabled: true },
  { id: 'three', src: '/three.mp3', enabled: true },
  { id: 'four', src: '/four.mp3', enabled: true },
];

class FakeMedia implements SoundtrackMediaElement {
  src = '';
  preload = '';
  loop = true;
  currentTime = 0;
  duration = 180;
  paused = true;
  playCalls = 0;
  pauseCalls = 0;
  loadCalls = 0;
  rejectNextPlay = false;
  private endedListeners = new Set<() => void>();

  async play(): Promise<void> {
    this.playCalls++;
    if (this.rejectNextPlay) {
      this.rejectNextPlay = false;
      throw new DOMException('blocked', 'NotAllowedError');
    }
    this.paused = false;
  }

  pause(): void {
    this.pauseCalls++;
    this.paused = true;
  }

  load(): void {
    this.loadCalls++;
  }

  addEventListener(_type: 'ended', listener: () => void): void {
    this.endedListeners.add(listener);
  }

  removeEventListener(_type: 'ended', listener: () => void): void {
    this.endedListeners.delete(listener);
  }

  end(): void {
    this.paused = true;
    for (const listener of this.endedListeners) listener();
  }

  get listenerCount(): number {
    return this.endedListeners.size;
  }
}

class FakeAutomation implements SoundtrackAutomation {
  fades: Array<{ value: number; durationMs: number }> = [];
  contexts: Array<{ cutoffHz: number; gain: number; durationMs: number }> = [];
  ducks: Array<{ depth: number; attackMs: number; holdMs: number; releaseMs: number }> = [];

  setTrackFade(value: number, durationMs: number): void {
    this.fades.push({ value, durationMs });
  }

  setContext(cutoffHz: number, gain: number, durationMs: number): void {
    this.contexts.push({ cutoffHz, gain, durationMs });
  }

  duck(depth: number, attackMs: number, holdMs: number, releaseMs: number): void {
    this.ducks.push({ depth, attackMs, holdMs, releaseMs });
  }
}

class FakeScheduler implements SoundtrackScheduler {
  private nextHandle = 1;
  readonly timeouts = new Map<number, { callback: () => void; durationMs: number }>();
  readonly intervals = new Map<number, { callback: () => void; durationMs: number }>();

  setTimeout(callback: () => void, durationMs: number): number {
    const handle = this.nextHandle++;
    this.timeouts.set(handle, { callback, durationMs });
    return handle;
  }

  clearTimeout(handle: unknown): void {
    this.timeouts.delete(handle as number);
  }

  setInterval(callback: () => void, durationMs: number): number {
    const handle = this.nextHandle++;
    this.intervals.set(handle, { callback, durationMs });
    return handle;
  }

  clearInterval(handle: unknown): void {
    this.intervals.delete(handle as number);
  }

  runTimeout(durationMs: number): void {
    const match = [...this.timeouts].find(([, timer]) => timer.durationMs === durationMs);
    if (!match) throw new Error(`No timeout scheduled for ${durationMs} ms`);
    this.timeouts.delete(match[0]);
    match[1].callback();
  }
}

function setup(options: {
  tracks?: readonly SoundtrackTrack[];
  random?: () => number;
  beforePlay?: () => void | Promise<void>;
} = {}) {
  const media = new FakeMedia();
  const automation = new FakeAutomation();
  const scheduler = new FakeScheduler();
  const controller = new SoundtrackController({
    tracks: options.tracks ?? TRACKS,
    media,
    automation,
    scheduler,
    random: options.random ?? (() => 0),
    beforePlay: options.beforePlay,
  });
  return { controller, media, automation, scheduler };
}

async function flushPlayback(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('soundtrack manifest', () => {
  it('activates only BGM1 and BGM2, with no broken BGM3/BGM4 references', () => {
    expect(SOUNDTRACK_TRACKS.filter((track) => track.enabled).map((track) => track.id)).toEqual(['bgm1', 'bgm2']);
    expect(SOUNDTRACK_TRACKS.map((track) => track.src).join(' ')).not.toMatch(/BGM[34]/i);
  });
});

describe('SoundtrackController', () => {
  it('chooses one deterministic random starting index and preloads it', () => {
    const low = setup({ random: () => 0 });
    const high = setup({ random: () => 0.999 });
    expect(low.controller.debugState().currentTrackId).toBe('one');
    expect(high.controller.debugState().currentTrackId).toBe('four');
    expect(low.media.preload).toBe('auto');
    expect(low.media.loop).toBe(false);
    expect(low.media.loadCalls).toBe(1);
  });

  it('attempts title playback at 300 ms and fades in', async () => {
    const { controller, media, automation, scheduler } = setup();
    controller.start();
    expect(media.playCalls).toBe(0);
    scheduler.runTimeout(SOUNDTRACK_TIMING.startAttemptDelayMs);
    await flushPlayback();
    expect(media.playCalls).toBe(1);
    expect(automation.fades.at(-1)).toEqual({ value: 1, durationMs: SOUNDTRACK_TIMING.titleStartFadeInMs });
  });

  it('starts on an immediate user activation and cancels the delayed autoplay attempt', async () => {
    const { controller, media, scheduler } = setup();
    controller.start();

    await controller.onUserActivation();

    expect(media.playCalls).toBe(1);
    expect(media.paused).toBe(false);
    expect(scheduler.timeouts.size).toBe(0);
  });

  it('starts only once and never leaks a second polling interval', async () => {
    const { controller, scheduler } = setup();
    controller.start();
    controller.start();
    expect(scheduler.timeouts.size).toBe(1);
    expect(scheduler.intervals.size).toBe(1);
    scheduler.runTimeout(SOUNDTRACK_TIMING.startAttemptDelayMs);
    await flushPlayback();
    controller.start();
    expect(scheduler.timeouts.size).toBe(0);
    expect(scheduler.intervals.size).toBe(1);
  });

  it('keeps the selected track at zero after autoplay rejection and starts it on activation', async () => {
    const { controller, media, scheduler } = setup({ random: () => 0.7 });
    media.rejectNextPlay = true;
    controller.start();
    scheduler.runTimeout(SOUNDTRACK_TIMING.startAttemptDelayMs);
    await flushPlayback();
    expect(controller.debugState()).toMatchObject({
      currentTrackId: 'three',
      currentTime: 0,
      pendingAutoplayStart: true,
    });
    await controller.onUserActivation();
    expect(media.playCalls).toBe(2);
    expect(media.src).toBe('/three.mp3');
    expect(media.currentTime).toBe(0);
    expect(controller.debugState().pendingAutoplayStart).toBe(false);
  });

  it('preserves source and playback position across menu, lobby, pause, resume, and results', async () => {
    const { controller, media, automation, scheduler } = setup();
    controller.start();
    scheduler.runTimeout(SOUNDTRACK_TIMING.startAttemptDelayMs);
    await flushPlayback();
    media.currentTime = 42;
    controller.enterContext('menu');
    controller.enterContext('lobby');
    controller.enterContext('pause');
    await controller.enterMatch({ advance: false });
    controller.enterContext('results');
    expect(media.src).toBe('/one.mp3');
    expect(media.currentTime).toBe(42);
    expect(media.playCalls).toBe(1);
    expect(automation.contexts).toContainEqual({
      ...SOUNDTRACK_CONTEXT_PROFILES.pause,
      durationMs: SOUNDTRACK_TIMING.pauseContextMs,
    });
    expect(automation.contexts.at(-1)).toEqual({
      ...SOUNDTRACK_CONTEXT_PROFILES.results,
      durationMs: SOUNDTRACK_TIMING.resultsContextMs,
    });
  });

  it('fades to silent countdown and advances exactly once when a match activates', async () => {
    const { controller, media, automation, scheduler } = setup({ tracks: TRACKS.slice(0, 2), random: () => 0.9 });
    let silenceReached = false;
    const silence = controller.enterCountdown().then(() => { silenceReached = true; });
    void controller.enterCountdown();
    expect(controller.debugState()).toMatchObject({ currentTrackId: 'two', pendingMatchAdvance: true });
    expect(automation.fades.at(-1)).toEqual({ value: 0, durationMs: SOUNDTRACK_TIMING.matchStartFadeOutMs });
    expect(silenceReached).toBe(false);
    scheduler.runTimeout(SOUNDTRACK_TIMING.matchStartFadeOutMs);
    await silence;
    expect(silenceReached).toBe(true);
    expect(media.paused).toBe(true);
    await controller.enterMatch({ advance: true });
    await controller.enterMatch({ advance: true });
    expect(controller.debugState().currentTrackId).toBe('one');
    expect(media.currentTime).toBe(0);
    expect(media.playCalls).toBe(1);
    expect(automation.fades.at(-1)).toEqual({ value: 1, durationMs: SOUNDTRACK_TIMING.matchFadeInMs });
  });

  it('restores the same track when a countdown is cancelled before or after its fade completes', async () => {
    const early = setup();
    early.controller.start();
    early.scheduler.runTimeout(SOUNDTRACK_TIMING.startAttemptDelayMs);
    await flushPlayback();
    early.media.currentTime = 18;
    early.controller.enterCountdown();
    early.controller.enterContext('lobby');
    expect(early.media.src).toBe('/one.mp3');
    expect(early.media.currentTime).toBe(18);
    expect(early.automation.fades.at(-1)).toEqual({ value: 1, durationMs: SOUNDTRACK_TIMING.menuContextMs });

    const late = setup();
    late.controller.start();
    late.scheduler.runTimeout(SOUNDTRACK_TIMING.startAttemptDelayMs);
    await flushPlayback();
    late.media.currentTime = 25;
    late.controller.enterCountdown();
    late.scheduler.runTimeout(SOUNDTRACK_TIMING.matchStartFadeOutMs);
    late.controller.enterContext('lobby');
    await flushPlayback();
    expect(late.media.src).toBe('/one.mp3');
    expect(late.media.currentTime).toBe(25);
    expect(late.media.paused).toBe(false);
  });

  it('advances sequentially and wraps for arbitrary N-track pools', async () => {
    const { controller } = setup({ random: () => 0.3 });
    expect(controller.debugState().currentTrackId).toBe('two');
    for (const expected of ['three', 'four', 'one', 'two']) {
      controller.enterCountdown();
      await controller.enterMatch({ advance: true });
      expect(controller.debugState().currentTrackId).toBe(expected);
    }
  });

  it('naturally fades, advances, and inherits the current context', async () => {
    const { controller, media, automation, scheduler } = setup({ tracks: TRACKS.slice(0, 3) });
    controller.start();
    scheduler.runTimeout(SOUNDTRACK_TIMING.startAttemptDelayMs);
    await flushPlayback();
    controller.enterContext('pause');
    media.currentTime = media.duration - 1;
    controller.tickNaturalEnd();
    expect(controller.debugState().naturalEndPending).toBe(true);
    expect(automation.fades.at(-1)).toEqual({ value: 0, durationMs: SOUNDTRACK_TIMING.naturalFadeOutMs });
    scheduler.runTimeout(SOUNDTRACK_TIMING.naturalFadeOutMs + SOUNDTRACK_TIMING.naturalGapMs);
    await flushPlayback();
    expect(controller.debugState()).toMatchObject({ currentTrackId: 'two', currentContext: 'pause' });
    expect(automation.contexts.at(-1)?.cutoffHz).toBe(SOUNDTRACK_CONTEXT_PROFILES.pause.cutoffHz);
    expect(automation.fades.at(-1)).toEqual({ value: 1, durationMs: SOUNDTRACK_TIMING.naturalFadeInMs });
  });

  it('uses an independent duck stage that restores to unity in the Web Audio adapter contract', () => {
    const { controller, automation } = setup();
    controller.enterContext('pause');
    controller.duckForReward({ depth: 0.72, attackMs: 18, holdMs: 82, releaseMs: 520 });
    expect(automation.ducks).toEqual([{ depth: 0.72, attackMs: 18, holdMs: 82, releaseMs: 520 }]);
    expect(automation.contexts.at(-1)?.gain).toBe(SOUNDTRACK_CONTEXT_PROFILES.pause.gain);
  });

  it('uses a short phase-announcement duck without changing track or context', () => {
    const { controller, automation } = setup();
    const before = controller.debugState();
    controller.duckForReward(PHASE_ANNOUNCEMENT_DUCK);
    const after = controller.debugState();
    expect(automation.ducks).toEqual([PHASE_ANNOUNCEMENT_DUCK]);
    expect(after.currentTrackId).toBe(before.currentTrackId);
    expect(after.currentContext).toBe(before.currentContext);
    expect(PHASE_ANNOUNCEMENT_DUCK.depth).toBeGreaterThanOrEqual(0.15);
    expect(PHASE_ANNOUNCEMENT_DUCK.depth).toBeLessThanOrEqual(0.25);
    expect(PHASE_ANNOUNCEMENT_DUCK.releaseMs).toBeGreaterThanOrEqual(350);
    expect(PHASE_ANNOUNCEMENT_DUCK.releaseMs).toBeLessThanOrEqual(500);
  });

  it('is safe for zero and one active track', async () => {
    const empty = setup({ tracks: [] });
    empty.controller.start();
    empty.controller.enterCountdown();
    await empty.controller.enterMatch({ advance: true });
    expect(empty.controller.debugState().currentTrackId).toBeNull();
    expect(empty.media.playCalls).toBe(0);

    const single = setup({ tracks: TRACKS.slice(0, 1) });
    single.controller.enterCountdown();
    await single.controller.enterMatch({ advance: true });
    expect(single.controller.debugState().currentTrackId).toBe('one');
    expect(single.media.currentTime).toBe(0);
  });

  it('cancels timers, playback, and ended listeners on disposal', () => {
    const { controller, media, scheduler } = setup();
    controller.start();
    expect(media.listenerCount).toBe(1);
    controller.dispose();
    expect(controller.debugState().disposed).toBe(true);
    expect(media.listenerCount).toBe(0);
    expect(scheduler.timeouts.size).toBe(0);
    expect(scheduler.intervals.size).toBe(0);
    expect(media.paused).toBe(true);
  });
});

class FakeAudioParam {
  value: number;
  readonly calls: Array<{ kind: string; value?: number; time: number }> = [];

  constructor(value: number) {
    this.value = value;
  }

  cancelScheduledValues(time: number): void {
    this.calls.push({ kind: 'cancel', time });
  }

  setValueAtTime(value: number, time: number): void {
    this.value = value;
    this.calls.push({ kind: 'set', value, time });
  }

  linearRampToValueAtTime(value: number, time: number): void {
    this.value = value;
    this.calls.push({ kind: 'ramp', value, time });
  }
}

describe('WebAudioSoundtrackAutomation', () => {
  it('keeps fade, context, filter, and reward duck automation independent', () => {
    const fade = new FakeAudioParam(0);
    const cutoff = new FakeAudioParam(2_300);
    const context = new FakeAudioParam(0.72);
    const duck = new FakeAudioParam(1);
    const automation = new WebAudioSoundtrackAutomation(
      { currentTime: 10 } as AudioContext,
      { gain: fade } as unknown as GainNode,
      { frequency: cutoff } as unknown as BiquadFilterNode,
      { gain: context } as unknown as GainNode,
      { gain: duck } as unknown as GainNode,
    );

    automation.setTrackFade(1, 900);
    automation.setContext(1_600, 0.6, 280);
    automation.duck(0.72, 18, 82, 520);

    expect(fade.calls.at(-1)).toEqual({ kind: 'ramp', value: SOUNDTRACK_MUSIC_BUS_GAIN, time: 10.9 });
    expect(cutoff.calls.at(-1)).toEqual({ kind: 'ramp', value: 1_600, time: 10.28 });
    expect(context.calls.at(-1)).toEqual({ kind: 'ramp', value: 0.6, time: 10.28 });
    expect(duck.calls.at(-1)).toEqual({ kind: 'ramp', value: 1, time: 10.62 });
    expect(fade.value).toBe(SOUNDTRACK_MUSIC_BUS_GAIN);
    expect(context.value).toBe(0.6);
    expect(duck.value).toBe(1);
  });
});
