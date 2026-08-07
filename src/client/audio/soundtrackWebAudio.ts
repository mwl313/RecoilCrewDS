import type { SoundtrackAutomation } from './soundtrackTypes';

export const SOUNDTRACK_MUSIC_BUS_GAIN = 0.34;

export class DeferredSoundtrackAutomation implements SoundtrackAutomation {
  private target: SoundtrackAutomation | null = null;
  private fade = 0;
  private cutoffHz = 2_300;
  private contextGain = 0.72;

  bind(target: SoundtrackAutomation): void {
    this.target = target;
    target.setTrackFade(this.fade, 0);
    target.setContext(this.cutoffHz, this.contextGain, 0);
  }

  setTrackFade(value: number, durationMs: number): void {
    this.fade = value;
    this.target?.setTrackFade(value, durationMs);
  }

  setContext(cutoffHz: number, gain: number, durationMs: number): void {
    this.cutoffHz = cutoffHz;
    this.contextGain = gain;
    this.target?.setContext(cutoffHz, gain, durationMs);
  }

  duck(depth: number, attackMs: number, holdMs: number, releaseMs: number): void {
    this.target?.duck(depth, attackMs, holdMs, releaseMs);
  }
}

export class WebAudioSoundtrackAutomation implements SoundtrackAutomation {
  constructor(
    private readonly ctx: AudioContext,
    private readonly trackFadeGain: GainNode,
    private readonly lowPass: BiquadFilterNode,
    private readonly contextGain: GainNode,
    private readonly duckGain: GainNode,
  ) {}

  setTrackFade(value: number, durationMs: number): void {
    this.ramp(this.trackFadeGain.gain, value * SOUNDTRACK_MUSIC_BUS_GAIN, durationMs);
  }

  setContext(cutoffHz: number, gain: number, durationMs: number): void {
    this.ramp(this.lowPass.frequency, cutoffHz, durationMs);
    this.ramp(this.contextGain.gain, gain, durationMs);
  }

  duck(depth: number, attackMs: number, holdMs: number, releaseMs: number): void {
    const t = this.ctx.currentTime;
    const floor = Math.max(0, Math.min(1, 1 - depth));
    const param = this.duckGain.gain;
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
    param.linearRampToValueAtTime(floor, t + attackMs / 1_000);
    param.setValueAtTime(floor, t + (attackMs + holdMs) / 1_000);
    param.linearRampToValueAtTime(1, t + (attackMs + holdMs + releaseMs) / 1_000);
  }

  private ramp(param: AudioParam, value: number, durationMs: number): void {
    const t = this.ctx.currentTime;
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
    if (durationMs <= 0) param.setValueAtTime(value, t);
    else param.linearRampToValueAtTime(value, t + durationMs / 1_000);
  }
}
