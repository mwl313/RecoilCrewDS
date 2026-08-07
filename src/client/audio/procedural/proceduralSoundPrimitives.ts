import type { SeededVariation } from './proceduralSoundTypes';

export interface PrimitiveRuntime {
  ctx: AudioContext;
  destination: AudioNode;
  noiseBuffer: AudioBuffer;
  variation: SeededVariation;
  registerCleanup(cleanup: () => void): void;
}

export interface TonePrimitiveOptions {
  at: number;
  frequencyStart: number;
  frequencyEnd?: number;
  duration: number;
  gain: number;
  type?: OscillatorType;
}

export interface NoisePrimitiveOptions {
  at: number;
  frequencyStart: number;
  frequencyEnd?: number;
  duration: number;
  gain: number;
  type?: BiquadFilterType;
  q?: number;
}

function safeStop(source: AudioScheduledSourceNode): void {
  try {
    source.stop();
  } catch {
    // Already stopped by its scheduled envelope.
  }
}

function scheduleFrequency(param: AudioParam, start: number, end: number, at: number, duration: number): void {
  const from = Math.max(1, start);
  const to = Math.max(1, end);
  param.setValueAtTime(from, at);
  param.exponentialRampToValueAtTime(to, at + Math.max(0.001, duration));
}

function scheduleGain(param: AudioParam, gain: number, at: number, duration: number): void {
  param.setValueAtTime(Math.max(0.0001, gain), at);
  param.exponentialRampToValueAtTime(0.0001, at + Math.max(0.001, duration));
}

export function createProceduralNoiseBuffer(ctx: AudioContext, seconds = 2): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // Stable noise bed: audible identity variation comes from seeded offsets and filters.
  let state = 0x51f15e5d;
  for (let i = 0; i < data.length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    data[i] = ((state >>> 0) / 0x8000_0000) - 1;
  }
  return buffer;
}

export function thump(runtime: PrimitiveRuntime, options: TonePrimitiveOptions): void {
  const { ctx, destination, variation } = runtime;
  const oscillator = ctx.createOscillator();
  const level = ctx.createGain();
  oscillator.type = options.type ?? 'sine';
  scheduleFrequency(
    oscillator.frequency,
    options.frequencyStart * variation.pitch,
    (options.frequencyEnd ?? options.frequencyStart * 0.42) * variation.pitch,
    options.at,
    options.duration,
  );
  scheduleGain(level.gain, options.gain * variation.gain, options.at, options.duration);
  oscillator.connect(level).connect(destination);
  oscillator.start(options.at);
  oscillator.stop(options.at + options.duration + 0.025);
  runtime.registerCleanup(() => {
    safeStop(oscillator);
    oscillator.disconnect();
    level.disconnect();
  });
}

export function crack(runtime: PrimitiveRuntime, options: NoisePrimitiveOptions): void {
  const { ctx, destination, noiseBuffer, variation } = runtime;
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const level = ctx.createGain();
  source.buffer = noiseBuffer;
  filter.type = options.type ?? 'bandpass';
  filter.Q.value = options.q ?? 0.9;
  scheduleFrequency(
    filter.frequency,
    options.frequencyStart * variation.filter,
    (options.frequencyEnd ?? options.frequencyStart) * variation.filter,
    options.at,
    options.duration,
  );
  scheduleGain(level.gain, options.gain * variation.gain, options.at, options.duration);
  source.connect(filter).connect(level).connect(destination);
  const maxOffset = Math.max(0, noiseBuffer.duration - options.duration - 0.03);
  source.start(options.at, variation.noiseOffset * maxOffset, options.duration + 0.02);
  runtime.registerCleanup(() => {
    safeStop(source);
    source.disconnect();
    filter.disconnect();
    level.disconnect();
  });
}

export function chirp(runtime: PrimitiveRuntime, options: TonePrimitiveOptions & { filterFrequency?: number }): void {
  const { ctx, destination, variation } = runtime;
  const oscillator = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const level = ctx.createGain();
  oscillator.type = options.type ?? 'sawtooth';
  scheduleFrequency(
    oscillator.frequency,
    options.frequencyStart * variation.pitch,
    (options.frequencyEnd ?? options.frequencyStart) * variation.pitch,
    options.at,
    options.duration,
  );
  filter.type = 'bandpass';
  filter.frequency.value = (options.filterFrequency ?? Math.max(options.frequencyStart, options.frequencyEnd ?? 0)) * variation.filter;
  filter.Q.value = 0.75;
  scheduleGain(level.gain, options.gain * variation.gain, options.at, options.duration);
  oscillator.connect(filter).connect(level).connect(destination);
  oscillator.start(options.at);
  oscillator.stop(options.at + options.duration + 0.025);
  runtime.registerCleanup(() => {
    safeStop(oscillator);
    oscillator.disconnect();
    filter.disconnect();
    level.disconnect();
  });
}

export function metal(runtime: PrimitiveRuntime, options: {
  at: number;
  duration: number;
  gain: number;
  frequencies?: readonly number[];
}): void {
  const frequencies = options.frequencies ?? [410, 690, 1_070, 1_610];
  frequencies.forEach((frequency, index) => {
    const duration = options.duration * (1 - index * 0.11);
    chirp(runtime, {
      at: options.at + index * 0.004,
      frequencyStart: frequency * (1 + index * 0.003),
      frequencyEnd: frequency * (0.82 - index * 0.025),
      duration,
      gain: options.gain / Math.sqrt(frequencies.length),
      type: index % 2 === 0 ? 'triangle' : 'sine',
      filterFrequency: frequency,
    });
  });
}

export function air(runtime: PrimitiveRuntime, options: NoisePrimitiveOptions): void {
  crack(runtime, { ...options, type: options.type ?? 'lowpass', q: options.q ?? 0.7 });
}

export function rumble(runtime: PrimitiveRuntime, options: {
  at: number;
  duration: number;
  gain: number;
  frequencyStart?: number;
  frequencyEnd?: number;
}): void {
  thump(runtime, {
    at: options.at,
    frequencyStart: options.frequencyStart ?? 68,
    frequencyEnd: options.frequencyEnd ?? 34,
    duration: options.duration,
    gain: options.gain * 0.7,
  });
  air(runtime, {
    at: options.at,
    frequencyStart: 420,
    frequencyEnd: 90,
    duration: options.duration,
    gain: options.gain * 0.42,
    type: 'lowpass',
  });
}

export function pulse(runtime: PrimitiveRuntime, options: TonePrimitiveOptions): void {
  chirp(runtime, { ...options, type: options.type ?? 'square' });
}

export function ring(runtime: PrimitiveRuntime, options: {
  at: number;
  duration: number;
  gain: number;
  frequencies?: readonly number[];
}): void {
  metal(runtime, {
    ...options,
    frequencies: options.frequencies ?? [470, 815, 1_265],
  });
}
